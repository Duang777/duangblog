---
author: Duang
pubDatetime: 2026-08-05T15:20:00+08:00
title: MySQL 深度教学（二）：InnoDB 存储引擎核心原理
featured: true
draft: false
tags:
  - MySQL
description: 从 Buffer Pool 到 B+Tree：把 InnoDB 内存、磁盘和索引骨架摸清楚。
---

> **系列进度（共 10 篇）**
> ① 整体架构与一条 SQL 的旅程 ✅　② InnoDB 存储引擎核心原理（本篇）　③ 索引深度解析与高性能索引设计　④ 事务与 MVCC 多版本并发控制　⑤ 锁机制全解　⑥ 日志系统：Redo / Undo / Binlog 三件套　⑦ SQL 优化与执行计划（EXPLAIN）　⑧ 查询性能调优实战　⑨ 高可用与复制架构　⑩ 备份恢复、分库分表与运维实战

## 写在前面：本篇要解决什么问题

第一篇我们站在全局，看清了一条 SQL 如何穿过连接层、服务层、存储引擎层。从本篇开始，我们正式钻进存储引擎层，而且只讲 InnoDB——因为从 MySQL 5.5 起它就是默认引擎，后面要讲的索引、事务、锁、日志、崩溃恢复，全都是发生在 InnoDB 内部的事。如果不先把它吃透，后面那些专题你只会背结论，遇到真实的性能问题仍然不知道根因在哪一层。

读完本篇，你应该能在脑海里画出 InnoDB 的完整骨架：哪些东西常驻内存、哪些落在磁盘、数据以什么物理结构组织、一次按主键查一行到底在页里怎么二分定位；并且知道怎么用几条命令亲眼看到 Buffer Pool 命中率、脏页比例、索引树高度这些真实指标，而不是停留在概念层面。这是后面所有深度内容真正的地基。

## 一、InnoDB 整体视图：内存 + 磁盘

InnoDB 的设计目标可以概括为一句话：用内存换性能，用日志保安全。这句话拆开就是两条主线：第一，磁盘比内存慢几个数量级，所以它把最常被访问的数据页放进内存（Buffer Pool）来加速读，并把写先攒在内存里再批量落盘；第二，内存是易失的，一旦进程崩溃或断电，内存里没落盘的数据会丢，所以它用 redo / undo 等日志保证即使崩溃也能恢复、能回滚。整个 InnoDB 可以分成两大部分：

- **内存结构**：Buffer Pool（缓冲池）、Change Buffer（写缓冲）、Log Buffer（日志缓冲）、Adaptive Hash Index（自适应哈希索引）。
- **磁盘结构**：表空间（Tablespace）、段（Segment）、区（Extent）、页（Page）、行（Row），以及 redo / undo 日志文件。

为了对号入座，下面这张表把每个核心组件归了类，并标了它主要解决什么：

| 组件 | 位置 | 主要职责 |
|-|-|-|
| Buffer Pool | 内存 | 缓存数据页和索引页，几乎所有读写都先经过它 |
| Change Buffer | 内存（部分持久化） | 缓存对非唯一二级索引的改动，延后合并以减少随机读 |
| Log Buffer | 内存 | redo 日志落盘前的缓冲，聚合零散写提升吞吐 |
| Adaptive Hash Index | 内存 | 为热点等值查询自动建哈希索引，加速定位 |
| 表空间 / 段 / 区 / 页 / 行 | 磁盘 | 数据的物理组织层级，页是 I/O 最小单位 |

### 1.1 怎么用一条命令看 InnoDB 全貌

学习 InnoDB 最怕纸上谈兵。其实有一个命令能一次性把 Buffer Pool、脏页、日志、事务、锁等运行时状态都打出来：

```sql
SHOW ENGINE INNODB STATUS\G
```

输出很长，分多个段，和本篇相关的几段是：

- **BUFFER POOL AND MEMORY**：告诉你 Buffer Pool 总大小、空闲页、数据库页、脏页数量。
- **LOG**：当前 redo 日志序列号（LSN）、刷盘情况。
- **INSERT BUFFER AND ADAPTIVE HASH**：Change Buffer 和自适应哈希索引的合并统计。
- **ROW OPERATIONS**：增删改查每秒操作数。

后面讲到对应组件时，我们会反复回到这条命令的输出上，看真实数字。建议你现在就开一个 MySQL 客户端敲一下，把输出留着对照。

## 二、内存结构（上）：Buffer Pool 缓冲池

Buffer Pool 是 InnoDB 内存里最大、最重要的一块，默认值在 5.7 是 128MB，在生产专用机上通常会调到几个 GB 甚至更高。几乎所有读写都先和它打交道——读先找它，写也先改它。理解它就理解了 InnoDB 为什么快。

### 2.1 它是什么，为什么必须有

磁盘随机 I/O 比内存访问慢几万倍。如果每次读一行都要去磁盘取，数据库根本扛不住并发。Buffer Pool 就是一块专门缓存数据页（也包括索引页）的内存区域：InnoDB 默认以 16KB 为一个页（Page）单位管理数据，页是内存与磁盘交换的最小单位。读数据时，先去 Buffer Pool 找；命中就直接返回（这叫缓存命中），没命中才去磁盘把整个页读进来再返回。写数据时，也是先改 Buffer Pool 里的页（此时该页变成脏页，因为内存版本比磁盘新），再由后台线程慢慢刷回磁盘。

这里有个关键点：Buffer Pool 缓存的是"页"而不是"行"。即使你只改了一行的一个字段，InnoDB 也要把整页读进内存、改完、标记脏页，最后整页刷回。所以一行多大、一页能装多少行，直接影响缓存利用率——这也是后面行格式、页结构要讲的内容。

### 2.2 关键参数

| 参数 | 含义 | 建议 |
|-|-|-|
| `innodb_buffer_pool_size` | 缓冲池总大小，InnoDB 最重要的调优参数 | 专用库常设为物理内存的 60%\~80%，但要给操作系统和其他进程留余量 |
| `innodb_buffer_pool_instances` | 缓冲池分几个独立实例，每个实例有自己的锁和 LRU | 大内存（如 > 1GB）时设为多个，减少内部锁竞争；MySQL 8.0 在 size≥1GB 时默认 8 个 |
| `innodb_buffer_pool_chunk_size` | 在线调整 size 时的分配块大小，必须是 chunk 的整数倍 | 一般保持默认，调 size 时注意要能整除，否则会被对齐 |
| `innodb_old_blocks_time` | 页在 old 区停留多久后才算"热"，可晋升 young 区 | 默认 1000 毫秒，防止全表扫描污染热点 |
| `innodb_max_dirty_pages_pct` | 脏页占 Buffer Pool 比例的上限，超了就强制刷盘 | 默认 90%（8.0 之前 75%），越低越平稳但写放大越多 |

### 2.3 一个反直觉的细节：LRU 不是你想的那样

朴素的 LRU（最近最少使用）算法有个致命问题：一次全表扫描或逻辑备份会把大量只访问一次的页塞进缓冲池，把真正的热点数据挤出去，等会儿业务再查就全 miss 了。InnoDB 改良了 LRU：把缓冲池逻辑上分成 young 区（约 5/8，热点）和 old 区（约 3/8，冷数据）。新读进来的页先放在 old 区头部；只有当它在 old 区停留超过 `innodb_old_blocks_time`（默认 1 秒）后再次被访问，才会晋升到 young 区。这样全表扫描的页几乎马上就被淘汰，不会污染热点。这个点面试和调优都常考，务必记住。

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    Buffer Pool 不是朴素 LRU：新页进 old 区，停留够久再被访问才进 young，防全表扫描污染热点。
  </div>
</details>

### 2.4 三张链表：free / LRU / flush

光知道 young/old 还不够，Buffer Pool 内部实际用三条链表管理页，理解它们才真正懂"内存页怎么流动"：

- **free 链表**：记录所有空闲的、还没装数据的页框。数据库启动后 Buffer Pool 是一堆空页，都挂在 free 上。需要读一个新页进内存时，就从 free 摘一个页框来用；当 free 空了，就得从 LRU 里淘汰最久未用的页。
- **LRU 链表**：就是 2.3 说的 young/old 分区链表，管理"正在被使用"的页及其冷热。淘汰发生在这一链表的尾部。
- **flush 链表**：所有"脏页"挂在上面，按最早被修改的顺序（约对应 redo LSN 顺序）排队，等待后台线程刷盘。刷盘后从 flush 摘掉，页框若空闲则回到 free。

三者的关系串起来是：页从 free 被取出→装入数据后挂到 LRU→被修改后同时挂到 flush（既是 LRU 里的热页，又是待刷脏页）→刷盘后从 flush 摘掉→若不再被引用则回到 free。这个闭环就是 Buffer Pool 的运转核心。

### 2.5 命中率与脏页比例：怎么亲手观测

调 Buffer Pool 不能拍脑袋，要看两个硬指标。下面这条命令能列出所有 Innodb_buffer_pool 开头的计数器：

```sql
SHOW GLOBAL STATUS LIKE 'Innodb_buffer_pool%';
```

几个关键字段含义：

- `Innodb_buffer_pool_read_requests`：从 Buffer Pool 读页的逻辑请求总数（包含命中）。
- `Innodb_buffer_pool_reads`：请求没命中、必须去磁盘读的次数（这个值越小越好）。
- `Innodb_buffer_pool_wait_free`：因为找不到空闲页而等待的次数，持续大于 0 说明 Buffer Pool 太小或刷盘跟不上。
- `Innodb_buffer_pool_pages_dirty` / `..._pages_total`：当前脏页数和总页数，两者相除即脏页比例。

命中率用下面这个式子算（request 包含了 reads，所以 reads 越多命中率越低）：

```text
命中率 = 1 - (Innodb_buffer_pool_reads / Innodb_buffer_pool_read_requests)
```

正常生产环境命中率应在 99% 以上。如果掉到 95% 以下，基本说明 Buffer Pool 偏小、或出现了大量全表扫描把热点挤掉了。脏页比例则建议控制在 `innodb_max_dirty_pages_pct` 之内，否则后台刷盘压力会突然增大，造成周期性抖动。

### 2.6 脏页什么时候刷回磁盘

脏页不会无限在内存里攒着，InnoDB 有几条刷盘触发路径，理解它们能解释很多"为什么半夜突然慢一下"的现象：

- **后台定期刷**：主线程按一定节奏把 flush 链表上的老脏页刷掉，保持脏页比例在阈值内。
- **脏页比例超限**：当脏页比例超过 `innodb_max_dirty_pages_pct`，会加速刷盘（sharp checkpoint），把比例压回去。
- **redo 空间压力**：redo 日志是循环写的，如果脏页对应的 redo 马上要被覆盖，就必须先把那些脏页刷盘，否则崩溃就恢复不回来了。这是最容易引发突发卡顿的来源。
- **Buffer Pool 不够用**：LRU 尾部淘汰页时，如果是脏页，必须先刷盘才能复用页框。

常见坑：有人为了"写入快"把 `innodb_max_dirty_pages_pct` 调得很高，结果平时很顺，但一旦触发 sharp checkpoint，瞬间大量刷盘把 I/O 打满，业务抖一下。调这个参数要在"平时平滑"和"突发抖动"之间取平衡。

## 三、内存结构（中）：Change Buffer 写缓冲

Change Buffer 是 InnoDB 用来减少随机读、提升写性能的关键设计，它本质上是一块"延迟合并"的缓冲区。

### 3.1 它解决什么痛点

当我们要更新一条记录，如果这条记录所在的二级索引页不在 Buffer Pool 里，朴素做法就得先把那个页从磁盘读进来，再改。但读磁盘是随机 I/O，很慢。Change Buffer 的做法是：先不读盘，把这个改动（insert / update / delete 对二级索引的变更）记到 Change Buffer 里（在内存中，且会持久化到系统表空间，保证崩溃后还能恢复）。等以后这个索引页因为别的原因（比如被查询命中）被读进 Buffer Pool 时，再把 Change Buffer 里的改动合并（merge）进去。一句话：把"为改而读"的多次随机读，攒成一次合并，极大减少写入时的磁盘读。

### 3.2 一个重要限制：只对非唯一二级索引有效

Change Buffer 只对**非唯一二级索引** 有效。原因很直接：唯一索引（UNIQUE）每次插入或更新都必须立刻校验"这个键值是否已经存在"，这步校验必然要把对应页读进内存，既然页都已经读进来了，就谈不上"先不读盘攒着"了，所以唯一索引用不了 Change Buffer。这带来一个实战启示：在高频写入、且写入前不需要即时唯一性校验的场景，盲目给每个字段都加唯一索引，反而会因为绕过了 Change Buffer 而拖累写入性能。是否要唯一约束，应权衡业务正确性与写入吞吐。

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    Change Buffer 只对非唯一二级索引有效：唯一索引要当场查重，页已经进内存，没法“先攒着”。
  </div>
</details>

### 3.3 合并时机与怎么观测

Change Buffer 里的改动会在以下情况被合并进真正的索引页：

- 对应的二级索引页被读进 Buffer Pool（最常见）；
- 后台线程定期把较老的 Change Buffer 项主动 merge；
- 实例正常关闭（某些情况）或崩溃恢复阶段。

想看 Change Buffer 当前占用和合并情况，可以回到 `SHOW ENGINE INNODB STATUS` 的 **INSERT BUFFER AND ADAPTIVE HASH** 段，里面 `size` 表示当前 Change Buffer 中的项数量，`merges` 累计合并次数。也可以用下面的变量看总占用上限：

```sql
SHOW VARIABLES LIKE 'innodb_change_buffering';
SHOW VARIABLES LIKE 'innodb_change_buffer_max_size';
```

`innodb_change_buffering` 控制哪些写操作进 Change Buffer（默认 all），`innodb_change_buffer_max_size` 限制它最多占 Buffer Pool 的百分比（默认 25%）。如果你的业务是纯读取或频繁唯一索引写入，设这个值过小甚至关闭（设为 none）反而更合理。

## 四、内存结构（下）：Log Buffer 与自适应哈希索引

- **Log Buffer（日志缓冲）**：redo log 在写盘之前的缓冲，由 `innodb_log_buffer_size` 控制（默认 16MB）。事务产生的 redo 记录先写在这里，再按刷盘策略批量写到 redo 文件。它的存在是为了把大量零散的日志写聚合成顺序写，提升事务提交吞吐。关于 redo 何时刷盘（`innodb_flush_log_at_trx_commit`）我们留到第⑥篇日志系统细讲。
- **Adaptive Hash Index（自适应哈希索引，AHI）**：当某些等值查询被频繁访问，InnoDB 会自动在内存里为这些热点页建立哈希索引，把 B+Tree 的查找从 O(log n) 降到接近 O(1)。它只针对等值查询、自动维护、可用 `innodb_adaptive_hash_index` 开关控制（默认开）。

关于 AHI 有个容易被忽略的反面：在高并发写入、且访问模式不固定的场景，AHI 的维护本身会引入一把全局的 AHI 锁争用，反而成为瓶颈。业内不少高并发写入的基准测试会把 AHI 关掉来获得更平稳的吞吐。所以"自适应"不等于"永远该开"，是否关闭要看你的负载画像。

## 五、磁盘结构：表空间、段、区、页、行

内存之上，InnoDB 在磁盘上把数据层层组织。理解这个层级，对你建立"数据到底存哪儿"的认知至关重要，也为看懂后面的页结构、行溢出打底。

### 5.1 层级关系

表空间（Tablespace）> 段（Segment）> 区（Extent）> 页（Page）> 行（Row）。具体说：一个表的数据和索引属于若干段（比如聚簇索引是一个段、每个二级索引各是一个段）；段由若干个区组成；一个区固定 1MB，正好包含 64 个 16KB 的页；页是磁盘 I/O 和内存交换的最小单位；行就是真正的一条例记录。区之所以固定 1MB、页固定 16KB，是为了让一次磁盘读取就能拿到连续的一大片数据，减少寻道。

### 5.2 表空间的几种形态

| 类型 | 说明 |
|-|-|
| 系统表空间 `ibdata1` | 存放数据字典、系统元数据、Change Buffer、Doublewrite Buffer，以及未开启独立表空间时的用户数据 |
| 独立表空间 `*.ibd` | 开启 `innodb_file_per_table`（5.6.6 之后默认开）后，每张表一个 .ibd 文件，便于单表管理与空间回收 |
| 通用表空间 | 用 `CREATE TABLESPACE` 显式创建的共享表空间，可把多张表放进同一个文件，介于独立和共享之间 |
| undo 表空间 | 专门存放 undo 日志，用于回滚和 MVCC，8.0 起默认独立为 `undo_001` / `undo_002` |
| 临时表空间 | 存放临时表数据，8.0 起会话临时表有独立的 `ibtmp1` |

### 5.3 页的物理结构：一个 16KB 的页里装了什么

前面反复说"页是最小 I/O 单位"，那一个 16KB 的页内部到底怎么排布？理解它，才能理解"页内二分定位"和"行溢出"。一个数据页（以索引页为例）大致由以下部分组成，顺序从页头到页尾：

| 组成部分 | 大致大小 | 作用 |
|-|-|-|
| File Header（文件头） | 38 字节 | 页的通用信息：所属表空间、页号、前后页指针（组成双向链表） |
| Page Header（页头） | 56 字节 | 页类型、记录数、页目录槽数、空闲空间位置等 |
| Infimum / Supremum 记录 | 26 字节 | 两个虚拟边界记录，分别为最小和最大，所有真实记录都在它们之间 |
| User Records（用户记录） | 实际数据，变长 | 真正的一行行记录，紧凑排列 |
| Free Space（空闲空间） | 剩余可用 | 新记录从这里分配空间 |
| Page Directory（页目录） | 变长 | 槽（slot）数组，记录分组边界，用于页内二分查找 |
| File Trailer（文件尾） | 8 字节 | 校验和，检测页是否写断裂损坏 |

注意页与页之间靠 File Header 里的指针连成双向链表，而同一页内所有记录则通过"记录头里的下一记录指针"连成单向链表。这构成了"页间双链、页内单链"的存储骨架——后面 6.4 节的页内定位正是基于这个骨架。

### 5.4 行格式与 Compact 行记录布局

InnoDB 支持多种行格式，最常用的是 **Dynamic**（MySQL 5.7+ 默认）和 **Compact**（5.6 默认、5.7 仍支持）。理解 Compact 的布局，能帮你明白"为什么主键要短""变长字段怎么存""隐藏列是什么"。一条 Compact 行记录从前往后依次是：

- **变长字段长度列表**：每个 VARCHAR / VARBINARY 等变长列，在此记录实际占用字节数（逆序存放）。定长字段不在这列表里。
- **NULL 标志位**：用位图标记哪些列是 NULL，为 NULL 的列后面就不再存数据，省空间。
- **记录头信息（5 字节）**：含删除标记（行删除是打标而不是立刻搬移）、下一记录指针、记录类型等。
- **隐藏列（事务与 MVCC 的关键）**：`DB_TRX_ID`（6 字节，最后修改该行的事务 ID）、`DB_ROLL_PTR`（7 字节，回滚指针，指向 undo 里的旧版本）、`DB_ROW_ID`（6 字节，当表没有显式主键且无可用的非空唯一索引时由 InnoDB 隐式生成）。
- **真实列数据**：各列实际值，按表定义顺序排。

这里重点强调两个常被忽视的点：第一，`DB_TRX_ID` 和 `DB_ROLL_PTR` 这两列对每个表都默默存在，是 MVCC 多版本和事务回滚的物理基础（第④篇会用到）；第二，主键越短，聚簇索引的每个非叶子节点能放更多条目、树越矮，所以"主键用自增 BIGINT 而非长字符串"不是风格问题，是性能问题。

### 5.5 行溢出：大字段怎么塞进 16KB 页

一页只有 16KB，可 VARCHAR(65535)、TEXT、BLOB 这些字段理论上能远超一页。Dynamic 行格式的处理方式是：当某列数据太长、整行放不下一页时，会把溢出的部分放到单独的溢出页，原页只保留 20 字节的指针指向它。这保证了页不会因为一个大字段就被撑爆，进而让一页能放更多行、B+Tree 更矮、缓存命中率更高。代价是：如果查询必须读取那个大字段，就可能要多一次溢出页的 I/O。下面这条命令可以确认当前行格式，以及把表显式改成 Dynamic：

```sql
SHOW TABLE STATUS LIKE 'user'\G
ALTER TABLE user ROW_FORMAT = DYNAMIC;
```

## 六、核心中的核心：B+Tree 索引结构

这是本篇最重要的一节。InnoDB 的索引（无论聚簇还是二级）底层都是 B+Tree，理解了它，索引为什么快、为什么"SELECT \* 走二级索引更慢"、为什么 UUID 主键会拖慢写入，全部迎刃而解。

### 6.1 为什么是 B+Tree，而不是别的

数据库最大的瓶颈是磁盘 I/O，所以索引结构的首要目标是：树尽量矮（减少寻址次数）、范围查询快、磁盘利用率高。下面这张对比表把常见结构的短板说清楚：

| 结构 | 问题 |
|-|-|
| 二叉搜索树 / 红黑树 | 每个节点只存一个键，树太高；百万数据树高几十层，每次查询要几十次磁盘 I/O，不可接受 |
| B-Tree | 非叶子节点也存数据，扇出小、树偏高；且范围查询需要中序遍历，不连续 |
| 哈希索引 | 等值查询快，但完全不支持范围查询和排序，适用性窄（Memory 引擎常用，InnoDB 的 AHI 是另一回事） |
| **B+Tree** | 非叶子节点只存键+指针，扇出巨大、树很矮（三层可存千万级）；叶子节点存数据且用双向链表串联，范围查询极快 |

在 InnoDB 里，一个 16KB 的页，假设每行约 1KB，一个叶子页能放约 16 行；非叶子节点存主键+指针（一条记录约十几字节），一页能放上千个条目。算下来，三层 B+Tree 完全能容纳几千万行的表，而查询只要 3 次 I/O 左右。这就是它成为标配的根本原因。

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    为何用 B+Tree：非叶只存键+指针、扇出大、树矮；叶子有序串联，范围查快。
  </div>
</details>

### 6.2 聚簇索引（Clustered Index）：数据即索引

InnoDB 的表本身就是按主键建的一棵 B+Tree，这叫**聚簇索引**。它的叶子节点存的不是指针，而是**整行数据**。也就是说，数据行的物理存储顺序就是主键顺序。由于一个表只能有一种物理排序，一张表**有且只有一个** 聚簇索引。

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    聚簇索引：叶子存整行，一张表有且只有一个；主键越短越顺序，树越矮、写入越稳。
  </div>
</details>

主键的选择直接影响这棵树的形态：

- **自增 BIGINT 主键**：新行永远插在树的"最右"叶子页，几乎不触发页分裂，顺序写友好，树紧凑。
- **UUID / 雪花 ID 这类随机主键**：新主键值随机散布，插入点随机落在各叶子页，频繁导致页分裂、页合并，产生大量碎片和额外 I/O，写入性能明显劣于自增主键。这是选型时极易踩的坑。

如果建表时显式指定了主键，就用它；如果没有主键，InnoDB 会选第一个非空唯一索引；如果连这个也没有，它会隐式生成一个 6 字节的 `row_id` 作为聚簇索引（也就是 5.4 提到的 DB_ROW_ID）。所以建议每张表都显式定义有意义且紧凑的主键，避免隐式 row_id 带来的不可控。

### 6.3 二级索引（Secondary Index）：叶子存主键

除了聚簇索引，你建的其它索引都是二级索引。二级索引的 B+Tree 叶子节点不存整行，而是存**主键值**。当用二级索引查到目标后，还要拿主键回聚簇索引再查一次，把整行取出来——这个动作叫**回表**。回表意味着多一次 B+Tree 查找，是很多慢查询的根源，也是第③篇讲"覆盖索引"要消灭的对象。

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    二级索引叶子存主键，不是整行；`SELECT *` 常要回表。能画清“二级索引 → 主键 → 聚簇索引”。
  </div>
</details>

```sql
-- name 上建了二级索引，查 * 需要回表
SELECT * FROM user WHERE name = '张三';
-- 如果只查主键或索引覆盖的列，则可避免回表
SELECT id, name FROM user WHERE name = '张三';
```

### 6.4 页内定位：一次"按主键查一行"到底怎么找

当 B+Tree 把搜索范围缩小到某一个 16KB 的页后，页内是如何精准找到那条记录的？回到 5.3 讲的页目录（Page Directory）：它把页内的记录分成若干组，每组最后一条记录的位置（槽 slot）被记录在一个数组里，每个槽指向一条记录。页目录的每组通常包含 4\~8 条记录。查找时：

1. 在页目录上做二分查找，定位到记录所在的组（利用槽指向的边界记录）；
2. 在组内沿记录间的单向链表线性扫描，找到精确记录。

所以"按主键查一行"的真实代价 = B+Tree 从根到叶的几次页访问（每次可能命中 Buffer Pool）+ 页内二分 + 小范围线性扫。这整套机制，就是 InnoDB 查询快的根本。

### 6.5 两棵树长什么样：一个具体例子

光说概念还是抽象，用一个具体的 user 表把两棵索引树画出来就清楚了。建表如下，id 是主键（聚簇索引），name 上建了二级索引：

```sql
CREATE TABLE user (
  id   BIGINT PRIMARY KEY,
  name VARCHAR(50),
  age  INT,
  KEY idx_name (name)
) ENGINE=InnoDB;
```

两棵树的叶子节点内容分别是：

- **聚簇索引（按 id 排序）**：叶子页直接放整行，例如 `(1, 张三, 20)`、`(2, 李四, 25)`、`(3, 王五, 30)`……行本身就按 id 顺序排。
- **二级索引 idx_name（按 name 排序）**：叶子页放 `(name, id)`，例如 `(张三, 1)`、`(李四, 2)`、`(王五, 3)`……注意这里没有 age，age 只能回表拿。

所以当执行 `SELECT * FROM user WHERE name='张三'`：先在 idx_name 树找到 `(张三, 1)`，拿到主键 1，再去聚簇索引树找 id=1 的那一行，取出完整记录。这就是回表的完整链路。而如果执行 `SELECT id, name FROM user WHERE name='张三'`，idx_name 的叶子已经包含了 id 和 name，不需要回表——这叫"索引覆盖"，第③篇会展开讲为什么它快。

### 6.6 索引树高度怎么亲手测

你不用去 dump 文件，MySQL 自带一张统计表能直接看到每个索引的 B+Tree 高度（btr_height，注意这个高度不含叶子层，所以真实层数 = btr_height + 1）：

```sql
SELECT index_name, stat_name, stat_value
FROM mysql.innodb_index_stats
WHERE table_name = 'user' AND stat_name = 'n_diff_pfx01' OR stat_name = 'btr_height';
```

多数业务表的聚簇索引高度是 3 或 4，对应 4\~5 层。层数越少，一次点查要访问的页越少、越快。这也反过来说明：行长越大、主键越宽，每层能放的条目越少，树就越高，查询越慢——再一次印证了"主键要短、行要瘦"的优化原则。

## 七、两个保安全的设计：Doublewrite 与写入链路

### 7.1 Doublewrite Buffer（双写缓冲）

脏页刷回磁盘时，一次写 16KB 在操作系统层面未必是原子的：可能写了 4KB 就断电，导致一页只有一半被写完，变成"写断裂页（partial page）"。这种损坏的页连 redo log 都救不了，因为 redo 记录的是"对某页的某个偏移做修改"，前提是页本身完整。Doublewrite 的解法：脏页先顺序写进 Doublewrite Buffer（在系统表空间，连续两块各 1MB），写成功后再往真正的数据文件写。崩溃恢复时，若发现数据文件页损坏，就从 Doublewrite Buffer 里取完整副本覆盖。它用一点点顺序写开销，换来了页级完整性保障。想知道它是否开启，敲：

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    半写坏页 redo 救不了；Doublewrite 先写完整副本再写数据页，换页级完整性。
  </div>
</details>

```sql
SHOW VARIABLES LIKE 'innodb_doublewrite';
```

注意：用支持原子写和校验的存储（如某些 SSD / 文件系统）时，Doublewrite 的开销才显得"多余"，但默认开着几乎总是更安全，除非你很清楚底层存储能保证 16KB 原子写。

### 7.2 内存到磁盘的写入链路（小结）

把前面所有组件串起来，一次 UPDATE 语句发生时，数据在 InnoDB 内部是这样流动的：

1. 改 Buffer Pool 中对应的页（页变脏，挂进 flush 链表）；
2. 写 redo 记录到 Log Buffer，事务提交时按策略刷到 redo 文件；
3. 对二级索引的改动，若目标页不在内存，先进 Change Buffer 延后合并；
4. 脏页由后台线程经 Doublewrite Buffer 安全刷回 .ibd 数据文件；
5. 若崩溃，靠 redo 重放 + undo 回滚把数据恢复到一致状态（第④⑥篇展开）。

这套链路里还有一个常被问到的点：刷盘到底是 write 还是 fsync？InnoDB 通过 `innodb_flush_method`（默认 fsync，常见还有 O_DIRECT）控制数据文件和日志文件的打开与刷盘方式，它决定了是否绕过操作系统页缓存。这部分偏运维，记住"默认 fsync 最稳，O_DIRECT 在专用机上有性能优势但要配合好 I/O 子系统"即可，深入调优时再回头细究。

## 八、本章小结与下篇预告

本篇应当掌握的核心：

1. InnoDB = 内存（Buffer Pool / Change Buffer / Log Buffer / AHI）+ 磁盘（表空间 / 段 / 区 / 页 / 行）；内存换性能、日志保安全是两条主线。
2. Buffer Pool 用改良 LRU（young/old 分区）防全表扫描污染，内部靠 free / LRU / flush 三链表管理页；命中率靠 `Innodb_buffer_pool_reads / read_requests` 计算，正常应在 99% 以上；脏页由后台线程、比例超限、redo 压力等多条路径刷盘。
3. Change Buffer 只对非唯一二级索引有效，把"为改而读"攒成一次合并；AHI 加速等值查询但高并发写入场景可能成为锁瓶颈。
4. 一个 16KB 页由文件头、页头、Infimum/Supremum、用户记录、空闲空间、页目录、文件尾组成；行记录含变长长度列表、NULL 位图、记录头、隐藏列（DB_TRX_ID / DB_ROLL_PTR / DB_ROW_ID）和真实列数据。
5. 索引底层是 B+Tree；聚簇索引叶子存整行（数据即索引），二级索引叶子存主键、需回表；页内靠页目录二分定位；Doublewrite 防止写断裂页损坏。

**下一篇（③ 索引深度解析与高性能索引设计）** 我们将在 B+Tree 地基上，讲透：覆盖索引、最左前缀原则、索引下推（ICP）、索引选择性、联合索引字段顺序、哪些写法会让索引失效、以及 EXPLAIN 里怎么看索引使用情况。那是把"索引怎么建才快"彻底讲明白的一篇。

## 九、自测与思考

- 为什么 Buffer Pool 要用改良 LRU（young/old 分区），朴素 LRU 在全表扫描时会出什么问题？
- free / LRU / flush 三张链表各自管什么？一个页从磁盘读入到刷盘再被复用，在这三张链表间怎么流动？
- Change Buffer 为什么对唯一索引无效？这对"该不该加唯一索引"有什么启示？
- 聚簇索引和二级索引的叶子节点分别存什么？为什么"SELECT \* 走二级索引"往往比"走聚簇索引"更慢？用 6.5 的 user 表画出回表链路。
- 一张没有显式主键的 InnoDB 表，InnoDB 会怎么处理？为什么建议每张表都显式定义紧凑主键？
- Doublewrite Buffer 解决的是哪一类故障？如果不用它，redo log 为什么救不了损坏的页？页的哪一部分（File Trailer）能帮助检测这种损坏？

## 附：本篇常用观察命令

下面这些命令贯穿本篇，建议在你自己的 MySQL 上逐条敲一遍，把输出和上面的讲解对照着看，比只读文字印象深得多：

```sql
-- 1. InnoDB 运行时全貌（重点看 BUFFER POOL / LOG / INSERT BUFFER 段）
SHOW ENGINE INNODB STATUS\G

-- 2. Buffer Pool 命中率与脏页相关计数器
SHOW GLOBAL STATUS LIKE 'Innodb_buffer_pool%';

-- 3. 关键内存参数
SHOW VARIABLES LIKE 'innodb_buffer_pool%';
SHOW VARIABLES LIKE 'innodb_change_buffer%';
SHOW VARIABLES LIKE 'innodb_doublewrite';

-- 4. 索引树高度与区分度统计
SELECT index_name, stat_name, stat_value
FROM mysql.innodb_index_stats
WHERE table_name = 'user';

-- 5. 表行格式与引擎信息
SHOW TABLE STATUS LIKE 'user'\G;
```
