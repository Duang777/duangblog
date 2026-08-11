---
author: Duang
pubDatetime: 2026-08-11T14:00:00+08:00
title: MySQL 深度教学（五）：锁机制全解（行锁、间隙锁、死锁与排查）
featured: true
draft: false
tags:
  - MySQL
description: 行锁为什么加在索引上、间隙锁怎么防幻读、Next-Key Lock 锁的是哪个区间、两阶段锁协议怎么决定锁的释放时机、死锁是怎么形成的、以及怎么用 performance_schema 真实观测到一把锁。
---

> **系列进度（共 10 篇）**
> ① 整体架构与一条 SQL 的旅程 ✅　② InnoDB 存储引擎核心原理 ✅　③ 索引深度解析与高性能索引设计 ✅　④ 事务与 MVCC 多版本并发控制 ✅　⑤ 锁机制全解（本篇）　⑥ 日志系统：Redo / Undo / Binlog 三件套　⑦ SQL 优化与执行计划（EXPLAIN）　⑧ 查询性能调优实战　⑨ 高可用与复制架构　⑩ 备份恢复、分库分表与运维实战

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-lock-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">锁瓶</span>
  </div>
  <p class="duang-whisper-body">MVCC 把读放走了，写的门还得有人守。这瓶身上挂着一把锁，旁边两把小钥匙——谁先排队、谁锁哪一格、谁死等谁，门里都有数。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

## 开篇：有了 MVCC，为什么还要锁

上一篇（四）我们把事务和 MVCC 拆完了。MVCC 用"多版本"让快照读不加锁、写不阻塞读，听起来已经很完美。但第④篇结尾也点明了一个事实：MVCC 解决的是"读一致"，而当前读和写写冲突终究要靠锁来仲裁。一个关键事实是：**MVCC 管"读"，锁管"写"和"当前读的互斥"**。

设想两个事务同时给同一个账户加钱，都用 MVCC 读旧值再写新值，如果中间没有任何锁，第二次写就可能覆盖第一次写，造成"更新丢失"。再比如你在 RR 下用 SELECT ... FOR UPDATE 想锁住一批数据防止别人插入，这也需要锁。所以 MVCC 和锁是互补的：读多用 MVCC，写和当前读用锁，二者合起来才构成 InnoDB 完整的并发控制。

这正是第④篇结尾留给我们的待解问题：MVCC 让快照读实现了无锁并发，但当前读和写写冲突终究要靠锁来仲裁。当时那篇的收尾已经把本篇要讲透的几个点列了出来，这里直接把它们变成"本篇要回答的问题"：

- 行锁、间隙锁、临键锁（Next-Key Lock）三者到底怎么配合，RR 下 UPDATE 一个范围为什么会把间隙也锁住；
- 死锁是怎么形成的，又如何检测和避免；
- 锁按粒度与模式怎么分（S / X、表锁 / 行锁、MDL、意向锁），两阶段锁协议又怎么决定锁的释放时机；
- 怎么用 performance_schema 真实观测到一把锁、并在死锁发生时抓到现场。

<section class="article-embed-note">
  <p class="article-embed-note-title">图解：InnoDB 锁全景 · 两个维度撑起一张锁地图</p>
  <p class="article-embed-note-lead">按粒度分全局 / 表 / 行，按模式分 S / X；再叠 MDL、意向锁、自增锁、间隙锁、插入意向锁五类"特殊用途锁"，就是本篇要拆的全部。</p>
  <figure class="btree-scene">
    <svg class="btree-svg" viewBox="0 0 760 420" role="img" aria-label="InnoDB 锁全景图">
      <g data-btree-stage="title">
        <text class="btree-label" x="380" y="28" text-anchor="middle">InnoDB 锁全景 · 粒度 × 模式 + 特殊用途</text>
      </g>
      <g data-btree-stage="cluster">
        <rect class="btree-node is-root" x="30" y="60" width="210" height="100" rx="10" />
        <text class="btree-mono" x="135" y="90" text-anchor="middle">按粒度</text>
        <text class="btree-sub" x="135" y="115" text-anchor="middle">全局锁 FTWRL</text>
        <text class="btree-sub" x="135" y="132" text-anchor="middle">表锁 / 意向锁 / MDL</text>
        <text class="btree-sub" x="135" y="149" text-anchor="middle">行锁（加在索引上）</text>
        <rect class="btree-node is-root" x="275" y="60" width="210" height="100" rx="10" />
        <text class="btree-mono" x="380" y="90" text-anchor="middle">按模式</text>
        <text class="btree-sub" x="380" y="115" text-anchor="middle">S 共享 · 读锁</text>
        <text class="btree-sub" x="380" y="132" text-anchor="middle">X 排他 · 写锁</text>
        <text class="btree-sub" x="380" y="149" text-anchor="middle">S-S 兼容，其余冲突</text>
        <rect class="btree-node is-root" x="520" y="60" width="210" height="100" rx="10" />
        <text class="btree-mono" x="625" y="90" text-anchor="middle">特殊用途</text>
        <text class="btree-sub" x="625" y="115" text-anchor="middle">MDL · 自增锁</text>
        <text class="btree-sub" x="625" y="132" text-anchor="middle">间隙锁 · 临键锁</text>
        <text class="btree-sub" x="625" y="149" text-anchor="middle">插入意向锁</text>
        <path class="btree-ink" d="M135 160 V200 H380" />
        <path class="btree-ink" d="M380 160 V200" />
        <path class="btree-ink" d="M625 160 V200 H380" />
        <text class="btree-caption" x="380" y="220" text-anchor="middle">↓ 三类合起来才是完整锁地图</text>
        <rect class="btree-node is-cluster-leaf" x="30" y="250" width="700" height="140" rx="8" />
        <text class="btree-mono" x="135" y="278" text-anchor="middle">行锁主力</text>
        <text class="btree-sub" x="135" y="300" text-anchor="middle">Record Lock</text>
        <text class="btree-sub" x="135" y="318" text-anchor="middle">Gap Lock</text>
        <text class="btree-sub" x="135" y="336" text-anchor="middle">Next-Key Lock</text>
        <text class="btree-caption" x="135" y="362" text-anchor="middle">第二节 · 锁在索引上</text>
        <text class="btree-mono" x="380" y="278" text-anchor="middle">表级辅助</text>
        <text class="btree-sub" x="380" y="300" text-anchor="middle">IS / IX 意向锁</text>
        <text class="btree-sub" x="380" y="318" text-anchor="middle">MDL 元数据锁</text>
        <text class="btree-sub" x="380" y="336" text-anchor="middle">AUTO-INC 自增锁</text>
        <text class="btree-caption" x="380" y="362" text-anchor="middle">1.3 / 1.4 / 七</text>
        <text class="btree-mono" x="625" y="278" text-anchor="middle">死锁核心</text>
        <text class="btree-sub" x="625" y="300" text-anchor="middle">间隙锁 + 插入意向锁</text>
        <text class="btree-sub" x="625" y="318" text-anchor="middle">两阶段锁协议</text>
        <text class="btree-sub" x="625" y="336" text-anchor="middle">Wait-For Graph</text>
        <text class="btree-caption" x="625" y="362" text-anchor="middle">五 / 六 / 九</text>
      </g>
    </svg>
  </figure>
</section>

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    MVCC 管"读"，锁管"写"——这两个不是二选一，是互补。快照读走 MVCC 无锁版本链；当前读（FOR UPDATE / LOCK IN SHARE MODE）和写写冲突才落到锁上。
  </div>
</details>

## 一、锁的两个分类维度

很多人一谈锁就晕，是因为混淆了维度。锁可以从两个互相垂直的维度去看，再叠加几种"特殊用途锁"，就构成了 InnoDB 完整的锁全景。

### 1.1 按锁定粒度

| 粒度 | 说明 |
|-|-|
| **全局锁** | 锁整个数据库实例，命令是 FLUSH TABLES WITH READ LOCK（FTWRL）。加锁后整库只读，数据更新、DDL、事务提交全被阻塞。常用于全库逻辑备份，但因为会让业务停摆，生产一般改用 --single-transaction 的一致性快照备份来绕开它。 |
| **表锁** | 锁整张表。MyISAM 默认用表锁；InnoDB 也有表级锁（如意向锁、DDL 的 MDL、显式 LOCK TABLES），但日常写走行锁。表锁并发低，InnoDB 场景下应尽量避免手动 LOCK TABLES。 |
| **行锁** | 锁索引上的某条记录，粒度最细、并发最高。InnoDB 的主力锁，也是本篇重点。注意：行锁加在索引项上，不是物理数据行上（这点第二节展开）。 |

### 1.2 按锁定模式（S / X）

从互斥性看，行锁分为共享锁和排他锁，这是理解一切锁冲突的基础：

| 模式 | 含义与加锁方式 |
|-|-|
| **共享锁 S（Shared，读锁）** | 多个事务可同时持有同一行的 S 锁，互不冲突。SELECT ... LOCK IN SHARE MODE 或 MySQL 8.0 的 SELECT ... FOR SHARE 加 S 锁。 |
| **排他锁 X（Exclusive，写锁）** | 独占读写。一个事务持有 X 锁后，其他事务不能再对该行加任何类型的锁（S 或 X 都不行），直到释放。UPDATE / DELETE / INSERT 会自动加 X 锁；SELECT ... FOR UPDATE 显式加 X 锁。 |

兼容关系只有一条：S 和 S 兼容，其余 S-X、X-X、X-S 全部冲突。这意味着"读读"可以并发，"读写""写写"必须串行。

### 1.3 元数据锁 MDL（Metadata Lock）

这是面试高频、又最容易被忽略的一类锁。MDL 不需要显式使用，访问一个表时由 Server 层自动加上：对表做增删改查时加 MDL 读锁；对表做结构变更（ALTER / DROP 等 DDL）时加 MDL 写锁。读锁之间兼容，读写锁与写写锁互斥。

最大的坑在这里：**长事务不提交，会一直持有 MDL 读锁，导致后续的 DDL（加字段、建索引）被阻塞**；而 DDL 一旦在等 MDL 写锁，后面所有新的读写请求又会排队等这个 DDL，瞬间引发全表雪崩式阻塞。线上加字段卡死、连接数暴涨，十有八九是这个原因。

```
-- 查看当前哪些会话持有了 MDL、哪些在等（8.0+）
SELECT * FROM performance_schema.metadata_locks
WHERE OBJECT_TYPE = 'TABLE'
  AND LOCK_STATUS = 'PENDING';  -- PENDING 表示在等 MDL

```

排查思路：找到持有 MDL 读锁却长时间不提交的事务（结合 information_schema.innodb_trx 的 trx_started），把它 kill 掉，DDL 就能继续。

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    MDL 雪崩的典型现场：一条慢 SELECT 持着 MDL 读锁不松，ALTER 等不到写锁，后面所有新查询又都排在 ALTER 后面——表瞬间"假死"。第一件事是 kill 掉那个长事务，不是重启数据库。
  </div>
</details>

### 1.4 意向锁 IS / IX

意向锁是表级锁，作用像一个"信号灯"，用来快速判断表内是否有行被锁定，避免为了检查行锁而逐行扫描。规则是：事务准备在某几行加 S 锁前，先在表上加 IS；准备加 X 锁前，先加 IX。意向锁由 InnoDB 自动维护，用户无法手动操作。

| 已持有 \ 请求 | IS | IX |
|-|-|-|
| IS | 兼容 | 兼容 |
| IX | 兼容 | 兼容 |

意向锁之间全部兼容（多个事务可以同时对一个表持有 IX），但它们与表级的 S / X 锁互斥。换言之，意向锁不阻塞行级操作，只阻塞"对整张表加锁"的企图，让表锁和行锁能高效共存。

## 二、行锁（Record Lock）：加在索引上，不是数据行上

这是理解行锁最核心、也最常被误解的一点：**InnoDB 的行锁是加在索引项上的，不是加在物理数据行上的**。这意味着 WHERE 条件必须能命中索引，行锁才生效；否则 InnoDB 只能全表扫描，给聚簇索引上每一行都加上锁，实际效果等同锁全表——并发环境下是灾难。

### 2.1 为什么无索引会锁全表

假设一张 user 表的 name 列没有索引，执行 UPDATE user SET age=20 WHERE name='duang'。因为 name 无法快速定位，存储引擎只能逐行扫描，对扫描到的每一行（包括最终不匹配的行）都加上 X 锁，直到事务提交才释放。线上一条"本意只改一行"的语句，可能把整张表锁住几十秒。

```
-- 验证：用 performance_schema.data_locks 看一条无索引 UPDATE 锁了多少行
-- 事务 A 执行（name 无索引）
BEGIN;
UPDATE user SET age=20 WHERE name='duang';

-- 另一个会话查看锁（8.0+）
SELECT engine_transaction_id, object_name, index_name, lock_type, lock_mode
FROM performance_schema.data_locks
WHERE object_name = 'user' AND lock_type = 'RECORD';
-- 结果会看到大量 RECORD 锁，index_name 多为 PRIMARY（全表扫描锁行）

```

常见坑：索引"看起来有"但失效了，锁照样退化成全表。函数包裹（WHERE YEAR(create_time)=2024）、隐式类型转换（WHERE phone=13800000000 而 phone 是 varchar）、前导通配符（LIKE '%abc'）都会让索引失效，行锁变表锁。这和第③篇讲的"索引失效"是同一个根因，只是后果从"慢"升级成"锁全表"。

<section class="article-embed-note">
  <p class="article-embed-note-title">图解：有索引锁一行 vs 无索引锁全表</p>
  <p class="article-embed-note-lead">同一条 UPDATE，走索引只锁命中的那一行；不走索引就只能逐行加 X 锁，整张表都被捏住。</p>
  <figure class="btree-scene">
    <svg class="btree-svg" viewBox="0 0 760 320" role="img" aria-label="有索引锁一行，无索引锁全表">
      <g data-btree-stage="title">
        <text class="btree-label" x="380" y="28" text-anchor="middle">WHERE id=5 走主键 vs WHERE name='duang' 无索引</text>
      </g>
      <g data-btree-stage="cluster">
        <rect class="btree-node is-root" x="30" y="60" width="340" height="230" rx="10" />
        <text class="btree-mono" x="200" y="88" text-anchor="middle">走主键 id=5</text>
        <rect class="btree-node is-cluster-leaf" x="50" y="110" width="60" height="40" rx="6" />
        <text class="btree-sub" x="80" y="135" text-anchor="middle">id=1</text>
        <rect class="btree-node is-cluster-leaf" x="120" y="110" width="60" height="40" rx="6" />
        <text class="btree-sub" x="150" y="135" text-anchor="middle">id=3</text>
        <rect class="btree-node is-root" x="190" y="110" width="60" height="40" rx="6" />
        <text class="btree-mono" x="220" y="135" text-anchor="middle">id=5</text>
        <rect class="btree-node is-cluster-leaf" x="260" y="110" width="60" height="40" rx="6" />
        <text class="btree-sub" x="290" y="135" text-anchor="middle">id=7</text>
        <rect class="btree-node is-cluster-leaf" x="50" y="170" width="60" height="40" rx="6" />
        <text class="btree-sub" x="80" y="195" text-anchor="middle">id=9</text>
        <rect class="btree-node is-cluster-leaf" x="120" y="170" width="60" height="40" rx="6" />
        <text class="btree-sub" x="150" y="195" text-anchor="middle">...</text>
        <text class="btree-caption" x="200" y="245" text-anchor="middle">只锁 id=5 这一行</text>
        <text class="btree-caption" x="200" y="265" text-anchor="middle">其他行照常读写</text>
        <rect class="btree-node is-root" x="390" y="60" width="340" height="230" rx="10" />
        <text class="btree-mono" x="560" y="88" text-anchor="middle">name 无索引 · 全表扫描</text>
        <rect class="btree-node is-root" x="410" y="110" width="60" height="40" rx="6" />
        <text class="btree-mono" x="440" y="135" text-anchor="middle">id=1</text>
        <rect class="btree-node is-root" x="480" y="110" width="60" height="40" rx="6" />
        <text class="btree-mono" x="510" y="135" text-anchor="middle">id=3</text>
        <rect class="btree-node is-root" x="550" y="110" width="60" height="40" rx="6" />
        <text class="btree-mono" x="580" y="135" text-anchor="middle">id=5</text>
        <rect class="btree-node is-root" x="620" y="110" width="60" height="40" rx="6" />
        <text class="btree-mono" x="650" y="135" text-anchor="middle">id=7</text>
        <rect class="btree-node is-root" x="410" y="170" width="60" height="40" rx="6" />
        <text class="btree-mono" x="440" y="195" text-anchor="middle">id=9</text>
        <rect class="btree-node is-root" x="480" y="170" width="60" height="40" rx="6" />
        <text class="btree-mono" x="510" y="195" text-anchor="middle">...</text>
        <text class="btree-caption" x="560" y="245" text-anchor="middle">每一行都加 X 锁</text>
        <text class="btree-caption" x="560" y="265" text-anchor="middle">等效锁全表</text>
      </g>
    </svg>
  </figure>
</section>

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    索引失效不只是变慢，是直接把锁范围从"一行"扩到"全表"。函数包裹、隐式类型转换、前导通配符——同一个根因，第③篇让你慢，第⑤篇让你锁死。
  </div>
</details>

### 2.2 S 与 X 的兼容

行级 S/X 锁的兼容规则前面 1.2 已经给过：S-S 兼容，其余冲突。特别要注意：一旦某行被加了 X 锁，其他事务的 SELECT ... FOR UPDATE（也要 X）和 SELECT ... LOCK IN SHARE MODE（要 S）都会被阻塞，直到持有者提交或回滚。

## 三、间隙锁（Gap Lock）：防插入，专治幻读

间隙锁锁住的是"索引记录之间的空隙"，而不是某条已存在的记录。它的唯一目的就是**阻止其他事务往这个空隙插入新数据**，从而防止当前读场景下的幻读。

### 3.1 关键特性

间隙锁只在可重复读（RR）及以上隔离级别生效；RC 级别没有间隙锁。还有一点反直觉但很重要：**间隙锁之间互相兼容，它只阻塞 INSERT**。也就是说，两个事务可以同时持有一个空隙的间隙锁，但谁要是想往这个空隙 INSERT，就会被阻塞。间隙锁不会阻塞对已有记录的 UPDATE / DELETE——它管的是"防新增"，不是"防修改"。

```
-- 示例：id 现有值 5, 10, 15
-- 事务 A
BEGIN;
SELECT * FROM t WHERE id BETWEEN 10 AND 15 FOR UPDATE;
-- 锁住记录 10、15，以及空隙 (10,15)

-- 事务 B（另一会话）
INSERT INTO t(id) VALUES (12);  -- 被阻塞！12 落在 (10,15) 间隙内
UPDATE t SET c=1 WHERE id=10;  -- 不被阻塞，已有记录可改

```

这里有个实战要点：如果业务能接受幻读（很多互联网场景用唯一约束或乐观锁兜底），把隔离级别降到 RC 可以彻底消除间隙锁，并发和死锁概率都会明显下降——这正是第④篇提到的"很多公司生产直接用 RC"的代价权衡。

<section class="article-embed-note">
  <p class="article-embed-note-title">图解：间隙锁锁的是"空" · 阻塞 INSERT，放行 UPDATE</p>
  <p class="article-embed-note-lead">id 现有 5 / 10 / 15。事务 A 用 FOR UPDATE 锁住 (10,15) 间隙，事务 B 想 INSERT 12 被卡住，但 UPDATE id=10 照常通过。</p>
  <figure class="btree-scene">
    <svg class="btree-svg" viewBox="0 0 760 360" role="img"aria-label="间隙锁只阻塞插入，不阻塞修改">
      <g data-btree-stage="title">
        <text class="btree-label" x="380" y="28" text-anchor="middle">间隙 (10, 15) · 锁空不锁实</text>
      </g>
      <g data-btree-stage="cluster">
        <rect class="btree-node is-cluster-leaf" x="40" y="60" width="80" height="50" rx="8" />
        <text class="btree-mono" x="80" y="90" text-anchor="middle">id=5</text>
        <rect class="btree-node is-sec-leaf" x="160" y="60" width="80" height="50" rx="8" />
        <text class="btree-mono" x="200" y="90" text-anchor="middle">id=10</text>
        <rect class="btree-badge" x="280" y="60" width="160" height="50" rx="8" />
        <text class="btree-badge-text" x="360" y="82" text-anchor="middle">间隙 (10,15)</text>
        <text class="btree-sub" x="360" y="100" text-anchor="middle">Gap Lock</text>
        <rect class="btree-node is-sec-leaf" x="460" y="60" width="80" height="50" rx="8" />
        <text class="btree-mono" x="500" y="90" text-anchor="middle">id=15</text>
        <rect class="btree-node is-cluster-leaf" x="580" y="60" width="80" height="50" rx="8" />
        <text class="btree-mono" x="620" y="90" text-anchor="middle">id=20</text>
        <path class="btree-ink" d="M360 110 V140" />
        <path class="btree-ink" d="M353 133 L360 140 L367 133" />
        <rect class="btree-node is-root" x="80" y="160" width="280" height="80" rx="8" />
        <text class="btree-mono" x="220" y="188" text-anchor="middle">事务 B · INSERT id=12</text>
        <text class="btree-sub" x="220" y="210" text-anchor="middle">落在 (10,15) 间隙内</text>
        <text class="btree-caption" x="220" y="228" text-anchor="middle">→ 被间隙锁阻塞</text>
        <rect class="btree-node is-cluster-leaf" x="400" y="160" width="280" height="80" rx="8" />
        <text class="btree-mono" x="540" y="188" text-anchor="middle">事务 B · UPDATE id=10</text>
        <text class="btree-sub" x="540" y="210" text-anchor="middle">已有记录，不在间隙内</text>
        <text class="btree-caption" x="540" y="228" text-anchor="middle">→ 放行</text>
        <rect class="btree-badge" x="40" y="270" width="680" height="60" rx="8" />
        <text class="btree-badge-text" x="380" y="295" text-anchor="middle">间隙锁之间互相兼容 · 两个事务可同时持有同一空隙</text>
        <text class="btree-sub" x="380" y="315" text-anchor="middle">只有 INSERT 想进来时才会被挡住</text>
      </g>
    </svg>
  </figure>
</section>

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    间隙锁最反直觉的一点：它锁的是"空"，不是"实"。两个事务能同时持有同一空隙的间隙锁，但谁要往里 INSERT 谁就被挡——这正是死锁章节里"间隙锁 + 插入意向锁"冲突的源头。
  </div>
</details>

## 四、Next-Key Lock（临键锁）：InnoDB 的默认行锁算法

Next-Key Lock = 记录锁 + 间隙锁，锁定一个"左开右闭"的区间 (prev, current]。它是 InnoDB 在 RR 隔离级别下的默认加锁算法，专门用来在当前读时同时防住"改已有行"和"插新行"，从而解决幻读。

### 4.1 降级规则（面试必背）

Next-Key Lock 并非永远锁一整段，它会按索引类型和查询方式降级：

| 查询类型 | 索引情况 | 实际加的锁 |
|-|-|-|
| 等值查询 = | 主键 / 唯一索引，且命中 | 退化为纯记录锁（只锁这一行，并发度最高） |
| 等值查询 = | 主键 / 唯一索引，未命中 | 间隙锁（锁住该值前后的空隙，防别人插入这个不存在的 ID） |
| 等值查询 = | 普通（非唯一）索引，命中或未命中 | Next-Key Lock，且会额外给"右侧第一个不满足条件的记录"加间隙锁 |
| 范围查询 > < BETWEEN | 任意索引 | 逐区间加 Next-Key Lock（锁住范围内所有行 + 所有间隙） |
| 无索引 | 全表扫描 | 对聚簇索引每一行加 Next-Key Lock，等效锁全表（灾难） |

```
-- 普通索引 idx_age 上 age=20 有两条记录，其余为 18, 25
-- 事务 A
BEGIN;
SELECT * FROM user WHERE age = 20 FOR UPDATE;
-- 加锁范围：(18,20] 和 (20,25] 两个 Next-Key 区间
-- 即锁住 age=20 的两行，以及 (18,20) 和 (20,25) 两个空隙

-- 事务 B
INSERT INTO user(age) VALUES (19);  -- 阻塞，落在 (18,20) 空隙
INSERT INTO user(age) VALUES (22);  -- 阻塞，落在 (20,25) 空隙

```

理解这个降级规则，才真正懂"为什么唯一索引等值更新不会加间隙锁、普通索引等值查询反而锁一大片"——这是第④篇 11.4 提到的 RR 防幻读机制在"当前读"一侧的具体落地。

<section class="article-embed-note">
  <p class="article-embed-note-title">图解：Next-Key Lock 降级规则 · 唯一索引等值命中只锁一行</p>
  <p class="article-embed-note-lead">主键等值命中退化为 Record Lock；普通索引等值会向右多锁一个间隙；范围查询逐区间锁；无索引直接锁全表。</p>
  <figure class="btree-scene">
    <svg class="btree-svg" viewBox="0 0 760 380" role="img" aria-label="Next-Key Lock 降级规则">
      <g data-btree-stage="title">
        <text class="btree-label" x="380" y="28" text-anchor="middle">同一张表 · 四种查询的锁范围对比</text>
      </g>
      <g data-btree-stage="cluster">
        <rect class="btree-node is-root" x="30" y="60" width="340" height="130" rx="10" />
        <text class="btree-mono" x="200" y="88" text-anchor="middle">主键等值命中 · WHERE id=5</text>
        <rect class="btree-node is-cluster-leaf" x="50" y="110" width="60" height="40" rx="6" />
        <text class="btree-sub" x="80" y="135" text-anchor="middle">id=3</text>
        <rect class="btree-node is-root" x="120" y="110" width="60" height="40" rx="6" />
        <text class="btree-mono" x="150" y="135" text-anchor="middle">id=5</text>
        <rect class="btree-node is-cluster-leaf" x="190" y="110" width="60" height="40" rx="6" />
        <text class="btree-sub" x="220" y="135" text-anchor="middle">id=7</text>
        <text class="btree-caption" x="200" y="172" text-anchor="middle">退化为 Record Lock · 只锁一行</text>
        <rect class="btree-node is-root" x="390" y="60" width="340" height="130" rx="10" />
        <text class="btree-mono" x="560" y="88" text-anchor="middle">普通索引等值 · WHERE age=20</text>
        <rect class="btree-node is-cluster-leaf" x="410" y="110" width="55" height="40" rx="6" />
        <text class="btree-sub" x="437" y="135" text-anchor="middle">18</text>
        <rect class="btree-node is-root" x="470" y="110" width="55" height="40" rx="6" />
        <text class="btree-mono" x="497" y="135" text-anchor="middle">20</text>
        <rect class="btree-node is-root" x="530" y="110" width="55" height="40" rx="6" />
        <text class="btree-mono" x="557" y="135" text-anchor="middle">20</text>
        <rect class="btree-node is-cluster-leaf" x="590" y="110" width="55" height="40" rx="6" />
        <text class="btree-sub" x="617" y="135" text-anchor="middle">25</text>
        <text class="btree-caption" x="560" y="172" text-anchor="middle">(18,20] + (20,25] · 锁两行 + 两空隙</text>
        <rect class="btree-node is-root" x="30" y="210" width="340" height="130" rx="10" />
        <text class="btree-mono" x="200" y="238" text-anchor="middle">范围查询 · id BETWEEN 5 AND 10</text>
        <rect class="btree-node is-cluster-leaf" x="50" y="260" width="55" height="40" rx="6" />
        <text class="btree-sub" x="77" y="285" text-anchor="middle">3</text>
        <rect class="btree-node is-root" x="110" y="260" width="55" height="40" rx="6" />
        <text class="btree-mono" x="137" y="285" text-anchor="middle">5</text>
        <rect class="btree-node is-root" x="170" y="260" width="55" height="40" rx="6" />
        <text class="btree-mono" x="197" y="285" text-anchor="middle">7</text>
        <rect class="btree-node is-root" x="230" y="260" width="55" height="40" rx="6" />
        <text class="btree-mono" x="257" y="285" text-anchor="middle">10</text>
        <rect class="btree-node is-cluster-leaf" x="290" y="260" width="55" height="40" rx="6" />
        <text class="btree-sub" x="317" y="285" text-anchor="middle">12</text>
        <text class="btree-caption" x="200" y="322" text-anchor="middle">(3,5]+(5,7]+(7,10]+(10,12] · 逐区间锁</text>
        <rect class="btree-node is-root" x="390" y="210" width="340" height="130" rx="10" />
        <text class="btree-mono" x="560" y="238" text-anchor="middle">无索引 · 全表扫描</text>
        <rect class="btree-node is-root" x="410" y="260" width="55" height="40" rx="6" />
        <text class="btree-mono" x="437" y="285" text-anchor="middle">r1</text>
        <rect class="btree-node is-root" x="470" y="260" width="55" height="40" rx="6" />
        <text class="btree-mono" x="497" y="285" text-anchor="middle">r2</text>
        <rect class="btree-node is-root" x="530" y="260" width="55" height="40" rx="6" />
        <text class="btree-mono" x="557" y="285" text-anchor="middle">r3</text>
        <rect class="btree-node is-root" x="590" y="260" width="55" height="40" rx="6" />
        <text class="btree-mono" x="617" y="285" text-anchor="middle">...</text>
        <rect class="btree-node is-root" x="650" y="260" width="55" height="40" rx="6" />
        <text class="btree-mono" x="677" y="285" text-anchor="middle">rN</text>
        <text class="btree-caption" x="560" y="322" text-anchor="middle">每一行都加 Next-Key · 等效锁全表</text>
      </g>
    </svg>
  </figure>
</section>

## 五、插入意向锁（Insert Intention Lock）

插入意向锁是一种特殊的间隙锁，在 INSERT 时自动加上。它的巧妙之处在于：**多个事务往同一个空隙的不同位置插入记录时，彼此不需要互相等待**。比如空隙 (10,15) 里，事务 A 想插 12、事务 B 想插 13，两者都持有"插入意向锁"且目标位置不同，可以并发进行，不会互相阻塞。

但它和"已存在的间隙锁"会冲突：如果事务 A 已经用 SELECT ... FOR UPDATE 锁住了 (10,15) 这个空隙（间隙锁），事务 B 的插入意向锁就会被 A 的间隙锁阻塞——这正是后面死锁章节的核心冲突来源。

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    插入意向锁是间隙锁的"反面"：间隙锁防插入，插入意向锁却让多个 INSERT 并发。两者一挡一冲，碰在一起就是死锁章节里最经典的"间隙锁 + 插入意向锁"环。
  </div>
</details>

## 六、两阶段锁协议（2PL）：锁什么时候释放

光知道"怎么加锁"还不够，工程上更要命的是"什么时候放锁"。InnoDB 遵循两阶段锁协议（Two-Phase Locking）：加锁阶段（事务执行中，按需逐步获取锁）和收缩阶段（提交或回滚时，一次性释放所有锁）。**也就是说，一把锁一旦加上，会一直持有到事务结束，中间不会提前释放**。

这个结论带来的关键实践是：**尽量把最可能引起锁冲突的写操作（尤其是 SELECT ... FOR UPDATE、UPDATE 热点行）放在事务的后面执行**，以此缩短排他锁的持有时间，减少别的会话被阻塞的窗口。一个典型反例是：先 SELECT ... FOR UPDATE 锁住一行做一堆远程调用（RPC / 发消息），再做本地更新——这段 RPC 耗时里锁一直握在手里，并发直接被打垮。

```
-- 反例：锁占用时间 = RPC耗时 + 本地更新，窗口太长
BEGIN;
SELECT * FROM account WHERE id=1 FOR UPDATE;  -- 早早加锁
CALL remote_risk_check(1);                  -- 长达几百毫秒的 RPC
UPDATE account SET balance=balance-100 WHERE id=1;
COMMIT;  -- 锁在这里才释放

-- 正例：先做完外部依赖，最后再加锁改数据
BEGIN;
SET @ok = remote_risk_check(1);               -- 先 RPC，不加锁
SELECT * FROM account WHERE id=1 FOR UPDATE;  -- 临近提交才加锁
UPDATE account SET balance=balance-100 WHERE id=1;
COMMIT;  -- 锁持有窗口极短

```

<section class="article-embed-note">
  <p class="article-embed-note-title">图解：两阶段锁协议 · 锁持有窗口的"长尾"与"短促"</p>
  <p class="article-embed-note-lead">反例：FOR UPDATE 后做 RPC，锁持有几百毫秒；正例：先做完 RPC 再 FOR UPDATE，锁只在最后一瞬握在手里。</p>
  <figure class="btree-scene">
    <svg class="btree-svg" viewBox="0 0 760 320" role="img" aria-label="两阶段锁协议 · 反例 vs 正例的持锁时长">
      <g data-btree-stage="title">
        <text class="btree-label" x="380" y="28" text-anchor="middle">同一组操作 · 持锁窗口从 RPC+更新 缩到 仅更新</text>
      </g>
      <g data-btree-stage="cluster">
        <rect class="btree-node is-root" x="30" y="60" width="700" height="100" rx="10" />
        <text class="btree-mono" x="380" y="88" text-anchor="middle">反例 · FOR UPDATE 后做 RPC</text>
        <rect class="btree-node is-cluster-leaf" x="50" y="105" width="120" height="40" rx="6" />
        <text class="btree-sub" x="110" y="130" text-anchor="middle">BEGIN</text>
        <rect class="btree-node is-root" x="180" y="105" width="180" height="40" rx="6" />
        <text class="btree-mono" x="270" y="130" text-anchor="middle">FOR UPDATE 加锁</text>
        <rect class="btree-node is-sec-leaf" x="370" y="105" width="180" height="40" rx="6" />
        <text class="btree-sub" x="460" y="130" text-anchor="middle">RPC · 几百 ms</text>
        <rect class="btree-node is-root" x="560" y="105" width="160" height="40" rx="6" />
        <text class="btree-mono" x="640" y="130" text-anchor="middle">UPDATE + COMMIT</text>
        <path class="btree-ink" d="M180 150 H720" stroke-dasharray="4 3" />
        <text class="btree-caption" x="450" y="172" text-anchor="middle">↑ 整段都持着 X 锁 · 几百毫秒</text>
        <rect class="btree-node is-root" x="30" y="200" width="700" height="100" rx="10" />
        <text class="btree-mono" x="380" y="228" text-anchor="middle">正例 · RPC 完了再 FOR UPDATE</text>
        <rect class="btree-node is-cluster-leaf" x="50" y="245" width="120" height="40" rx="6" />
        <text class="btree-sub" x="110" y="270" text-anchor="middle">BEGIN</text>
        <rect class="btree-node is-sec-leaf" x="180" y="245" width="180" height="40" rx="6" />
        <text class="btree-sub" x="270" y="270" text-anchor="middle">RPC · 不加锁</text>
        <rect class="btree-node is-root" x="370" y="245" width="180" height="40" rx="6" />
        <text class="btree-mono" x="460" y="270" text-anchor="middle">FOR UPDATE 加锁</text>
        <rect class="btree-node is-root" x="560" y="245" width="160" height="40" rx="6" />
        <text class="btree-mono" x="640" y="270" text-anchor="middle">UPDATE + COMMIT</text>
        <path class="btree-ink" d="M370 290 H720" stroke-dasharray="4 3" />
        <text class="btree-caption" x="545" y="312" text-anchor="middle">↑ 只在最后一段持锁 · 几毫秒</text>
      </g>
    </svg>
  </figure>
</section>

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    2PL 不是说"加锁和释放分两阶段"那么简单，工程含义是：锁一旦加上就握到 COMMIT。把热点行的 FOR UPDATE 挪到事务最后，RPC 走在加锁之前，这是把"持锁窗口"从几百毫秒压到几毫秒最直接的办法。
  </div>
</details>

## 七、自增锁（AUTO-INC Lock）

给列加了 AUTO_INCREMENT 后，插入时要分配递增的值，这个过程由自增锁保护。传统实现是语句级表锁：一条 INSERT 执行期间持有，执行完释放；对于 INSERT ... SELECT 这类"插入行数不确定的语句"仍用这种方式，会阻塞其他插入，保证自增值连续。

轻量级模式（innodb_autoinc_lock_mode=2，8.0 默认）改为：在生成本次插入需要的自增值时获取一下轻量级锁，生成完立刻释放，不等整条语句执行完。优点是不用锁表、插入并发更高，代价是"一个语句内分配的自增值可能不连续"（但业务通常不依赖连续性）。面试被问"自增主键会不会空洞"，答案就在这里：并发插入、事务回滚、轻量级模式，都会导致自增值出现空洞，这是正常现象。

## 八、锁兼容矩阵

把前面所有锁类型放进一张矩阵，能一眼看清谁和谁冲突。行级 S/X 的兼容前面讲过，这里补齐表级意向锁与行锁的关系：

| 已持有 \ 请求 | S（行） | X（行） | IS（表） | IX（表） |
|-|-|-|-|-|
| S（行） | 兼容 | 冲突 | 兼容 | 冲突 |
| X（行） | 冲突 | 冲突 | 冲突 | 冲突 |
| IS（表） | 兼容 | 冲突 | 兼容 | 兼容 |
| IX（表） | 冲突 | 冲突 | 兼容 | 兼容 |

特别注意间隙锁的兼容特例：**两个间隙锁之间永远兼容**（都只是防插入，互不排斥），但插入意向锁与已存在的间隙锁冲突。这条规则是理解下一节死锁的关键。

## 九、死锁：成因、检测与避免

死锁就是两个或多个事务互相等待对方释放锁，形成环路，谁都推进不下去。InnoDB 通过**等待图（Wait-For Graph）**实时检测环：一旦发现死锁，立刻回滚"代价较小"的事务（通常是修改行数少、undo 少的那个），抛出 1213 错误，让另一个事务继续。这与 lock_wait_timeout（默认 50 秒）的超时回滚不同——死锁检测是立即发生的。

### 9.1 死锁的四个必要条件

缺一不可：互斥（锁只能被一个事务持有）、请求与保持（持锁的同时请求新锁）、不可剥夺（锁只能由持有者自己释放）、循环等待（事务间形成等待环）。

### 9.2 可复现场景一：ABBA 顺序反转

```
-- 两个会话，以相反顺序更新两行
-- 会话 A                         会话 B
BEGIN;                          BEGIN;
UPDATE t SET c=1 WHERE id=1;     UPDATE t SET c=1 WHERE id=2;
UPDATE t SET c=1 WHERE id=2;     UPDATE t SET c=1 WHERE id=1;
-- A 等 B 释放 id=2，B 等 A 释放 id=1，环路 → 死锁，一方报 1213

```

### 9.3 可复现场景二：间隙锁 + 插入意向锁

```
-- 普通索引 idx_ct 上值 [10:00, 10:30, 11:00]
-- 会话 A                                             会话 B
BEGIN;                                              BEGIN;
SELECT * FROM o WHERE ct BETWEEN '10:00' AND '11:00'
  FOR UPDATE;  -- 锁住 (10:30,11:00) 等间隙         SELECT * FROM o WHERE ct BETWEEN '10:00' AND '11:00'
                                                    FOR UPDATE;  -- 同样锁住该间隙
INSERT INTO o(ct) VALUES ('10:45');  -- 请求插入意向锁，被 B 的间隙锁阻塞
                                        INSERT INTO o(ct) VALUES ('10:50');  -- 被 A 的间隙锁阻塞 → 互等 → 死锁

```

<section class="article-embed-note">
  <p class="article-embed-note-title">图解：ABBA 死锁形成过程 · 点播放看环是怎么闭上的</p>
  <p class="article-embed-note-lead">事务 A 先锁 id=1、事务 B 先锁 id=2，然后各自反过来要对方的锁，环路一闭就死锁。</p>
  <figure class="btree-scene" data-btree-demo="lock-deadlock">
    <svg class="btree-svg" viewBox="0 0 760 380" role="img" aria-label="ABBA 死锁形成过程">
      <g data-btree-stage="title">
        <text class="btree-label" x="380" y="30" text-anchor="middle">ABBA 顺序反转 · 死锁形成过程</text>
      </g>
      <g data-btree-stage="scene">
        <rect class="btree-node is-root" data-role="lock-1" x="60" y="60" width="180" height="70" rx="10" />
        <text class="btree-mono" x="150" y="88" text-anchor="middle">id=1 · X 锁</text>
        <text class="btree-sub" x="150" y="110" text-anchor="middle">事务 A 持有</text>
        <rect class="btree-node is-root" data-role="lock-2" x="520" y="60" width="180" height="70" rx="10" />
        <text class="btree-mono" x="610" y="88" text-anchor="middle">id=2 · X 锁</text>
        <text class="btree-sub" x="610" y="110" text-anchor="middle">事务 B 持有</text>
        <rect class="btree-node is-cluster-leaf" data-role="a-box" x="60" y="200" width="180" height="100" rx="10" />
        <text class="btree-mono" x="150" y="228" text-anchor="middle">事务 A</text>
        <text class="btree-sub" x="150" y="250" text-anchor="middle">UPDATE id=1 ✓</text>
        <text class="btree-sub" x="150" y="270" text-anchor="middle">UPDATE id=2 ...</text>
        <rect class="btree-node is-cluster-leaf" data-role="b-box" x="520" y="200" width="180" height="100" rx="10" />
        <text class="btree-mono" x="610" y="228" text-anchor="middle">事务 B</text>
        <text class="btree-sub" x="610" y="250" text-anchor="middle">UPDATE id=2 ✓</text>
        <text class="btree-sub" x="610" y="270" text-anchor="middle">UPDATE id=1 ...</text>
        <path class="btree-ink" d="M150 130 V200" />
        <path class="btree-ink" d="M143 193 L150 200 L157 193" />
        <path class="btree-ink" d="M610 130 V200" />
        <path class="btree-ink" d="M603 193 L610 200 L617 193" />
        <path class="btree-path" data-role="arrow-ab" d="M240 240 Q380 180 520 95" />
        <path class="btree-path" data-role="arrow-ba" d="M520 260 Q380 320 240 95" />
        <rect class="btree-badge" data-role="deadlock-label" x="180" y="330" width="400" height="40" rx="8" />
        <text class="btree-badge-text" x="380" y="355" text-anchor="middle">环路形成 → 死锁！回滚代价小的一方</text>
      </g>
    </svg>
  </figure>
</section>

<section class="article-embed-note">
  <p class="article-embed-note-title">图解：间隙锁 + 插入意向锁 死锁</p>
  <p class="article-embed-note-lead">两个间隙锁互相兼容，但各自的插入意向锁都被对方挡住，形成环。</p>
  <figure class="btree-scene">
    <svg class="btree-svg" viewBox="0 0 760 280" role="img" aria-label="间隙锁+插入意向锁死锁">
      <g data-btree-stage="title">
        <text class="btree-label" x="380" y="28" text-anchor="middle">间隙锁 + 插入意向锁 · 互挡成环</text>
      </g>
      <g data-btree-stage="cluster">
        <rect class="btree-node is-cluster-leaf" x="60" y="60" width="220" height="80" rx="8" />
        <text class="btree-mono" x="170" y="88" text-anchor="middle">事务 A</text>
        <text class="btree-sub" x="170" y="110" text-anchor="middle">持间隙 (10:30,11:00)</text>
        <text class="btree-sub" x="170" y="128" text-anchor="middle">想 INSERT 10:45</text>
        <rect class="btree-node is-cluster-leaf" x="480" y="60" width="220" height="80" rx="8" />
        <text class="btree-mono" x="590" y="88" text-anchor="middle">事务 B</text>
        <text class="btree-sub" x="590" y="110" text-anchor="middle">持间隙 (10:30,11:00)</text>
        <text class="btree-sub" x="590" y="128" text-anchor="middle">想 INSERT 10:50</text>
        <path class="btree-ink" d="M280 100 Q380 70 480 100" />
        <path class="btree-ink" d="M467 92 L480 100 L462 103" />
        <text class="btree-caption" x="380" y="68" text-anchor="middle">A 的插入意向锁被 B 的间隙锁挡住</text>
        <path class="btree-ink" d="M480 120 Q380 150 280 120" />
        <path class="btree-ink" d="M293 128 L280 120 L298 117" />
        <text class="btree-caption" x="380" y="158" text-anchor="middle">B 的插入意向锁被 A 的间隙锁挡住</text>
        <rect class="btree-badge" x="120" y="190" width="520" height="60" rx="8" />
        <text class="btree-badge-text" x="380" y="215" text-anchor="middle">间隙锁互相兼容 · 但插入意向锁与间隙锁冲突</text>
        <text class="btree-sub" x="380" y="237" text-anchor="middle">避免：降 RC 消除间隙锁，或缩小 FOR UPDATE 范围</text>
      </g>
    </svg>
  </figure>
</section>

### 9.4 怎么避免死锁

工程上不是"消灭死锁"，而是"降低概率 + 兜底重试"：

- **统一加锁顺序**：多行更新时，所有事务按固定顺序（如 ID 升序）获取锁，从根上打破循环等待。代码层对 ID 列表排序后再更新。
- **大事务拆小**：缩短持锁时间，减少冲突窗口；避免在事务里做 RPC、复杂计算。
- **合理加索引**：确保查询走索引，避免无索引导致锁全表、锁范围爆炸。
- **降低隔离级别**：非严格场景从 RR 降到 RC，消除间隙锁，死锁概率大幅下降（代价是不能防幻读，用唯一约束兜底）。
- **应用层重试**：捕获 1213 异常，加随机退避后重试；否则两个事务可能立刻以相同顺序再次竞争，连环死锁。

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    "避免死锁"不是让它永远不发生，是降低概率 + 兜底重试。1213 错误一定要在应用层捕获、随机退避后重试——否则两个事务立刻按相同顺序再次竞争，连环死锁。
  </div>
</details>

## 十、锁排查实战

理论和事故之间，差的就是"能亲手观测"。下面三件工具，是线上遇到锁等待、死锁时的标准排查路径。

### 10.1 performance_schema.data_locks（8.0+ 首选）

这是 8.0 引入的锁信息表，取代了老版本的 INNODB_LOCKS，能直接看到"谁持有了什么锁、锁在哪一行的哪个索引"。排查锁等待时，先看这张表比看任何文档都直观。

```
-- 查看当前所有 RECORD（行）锁，含事务 ID、表名、索引、锁模式
SELECT
  engine_transaction_id,
  object_name,
  index_name,
  lock_type,
  lock_mode,
  lock_status,        -- GRANTED 已持有 / WAITING 在等
  lock_data            -- 被锁的主键值（能看到具体锁了哪一行）
FROM performance_schema.data_locks
WHERE lock_type = 'RECORD';

-- 看谁在等、等谁：data_lock_waits 给出阻塞关系
SELECT
  requesting_engine_transaction_id   AS 等待方,
  blocking_engine_transaction_id      AS 阻塞方
FROM performance_schema.data_lock_waits;

```

lock_mode 常见值含义：S / X 是共享/排他记录锁；S,GAP / X,GAP 是间隙锁；X,REC_NOT_GAP 是纯记录锁（无间隙）；INSERT_INTENTION 是插入意向锁。看到 WAITING 状态且 lock_mode 带 GAP，基本就是被间隙锁挡住了。

### 10.2 SHOW ENGINE INNODB STATUS

看死锁现场，最经典的是输出里的 LATEST DETECTED DEADLOCK 段，它会把参与死锁的两个事务各自持有什么锁、在等什么锁、对应的 SQL 和索引都列出来。重点看三件事：哪个事务被回滚了（代价较小的那个）、两个事务各等的是什么锁（lock_mode X locks gap before rec insert intention waiting 表示在等插入意向锁）、涉及的索引（普通索引上的 Gap Lock 概率最高）。

```
-- 开启总死锁日志（生产环境建议常开，否则只保留最近一次）
SET GLOBAL innodb_print_all_deadlocks = ON;
SHOW ENGINE INNODB STATUS;  -- 关注 LATEST DETECTED DEADLOCK 段

```

## 十一、乐观锁 vs 悲观锁

前面讲的都是 InnoDB 内置的"悲观锁"（假设冲突会高，先加锁再操作）。业务层还有一种常用的"乐观锁"（假设冲突低，操作时不加锁，提交时再校验），面试常和数据库锁一起问。

| 维度 | 悲观锁 | 乐观锁 |
|-|-|-|
| 实现 | SELECT ... FOR UPDATE / LOCK IN SHARE MODE，由数据库加锁 | 版本号或 CAS：UPDATE t SET val=?, ver=ver+1 WHERE id=? AND ver=?，影响行数=1 即成功，0 则冲突重试 |
| 适用 | 写多读少、冲突频繁 | 读多写少、冲突概率低 |
| 代价 | 持锁期间阻塞他人，易锁等待 / 死锁 | 高冲突下大量重试，浪费 CPU |

```
-- 乐观锁典型写法：扣库存前比对版本号
UPDATE inventory
SET stock = stock - 1, version = version + 1
WHERE id = 100 AND version = 5;
-- 若返回影响行数 0，说明 version 已被别人改过，本次扣减失败，业务层重试

```

## 十二、综合案例：一条 UPDATE 到底加了哪些锁

把前面所有概念串起来。假设 user 表，主键 id，普通索引 idx_age，当前 age 值有 18、20、20、25。

```
-- 事务执行
BEGIN;
UPDATE user SET name='x' WHERE age = 20;

-- 用 data_locks 观测（8.0+）
SELECT index_name, lock_type, lock_mode, lock_data
FROM performance_schema.data_locks
WHERE object_name='user' AND engine_transaction_id = <本事务ID>;

```

预期加锁结果：因为 age 是**普通索引且等值查询**，按 4.1 规则走 Next-Key Lock——会对两条 age=20 的记录加 X 记录锁，并对它们前后的空隙加间隙锁，即锁住 (18,20] 和 (20,25] 两个区间。若换成主键等值命中（WHERE id=5），则退化为纯记录锁，只锁 id=5 这一行，并发度最高。这个案例直接说明了"为什么查询要尽量走唯一索引/主键"——锁范围能从"一片区间"缩到"一行"。

<section class="article-embed-note">
  <p class="article-embed-note-title">图解：一条 UPDATE 的锁范围 · 普通索引 vs 主键</p>
  <p class="article-embed-note-lead">同样"等值命中"，普通索引锁两个区间，主键只锁一行——这就是"为什么查询要尽量走唯一索引"的锁视角解释。</p>
  <figure class="btree-scene">
    <svg class="btree-svg" viewBox="0 0 760 320" role="img" aria-label="一条 UPDATE 的锁范围对比">
      <g data-btree-stage="title">
        <text class="btree-label" x="380" y="28" text-anchor="middle">UPDATE user SET name='x' WHERE age=20</text>
      </g>
      <g data-btree-stage="cluster">
        <rect class="btree-node is-root" x="30" y="60" width="700" height="110" rx="10" />
        <text class="btree-mono" x="380" y="88" text-anchor="middle">普通索引 idx_age · 走 Next-Key Lock</text>
        <rect class="btree-node is-cluster-leaf" x="60" y="110" width="80" height="40" rx="6" />
        <text class="btree-sub" x="100" y="135" text-anchor="middle">18</text>
        <rect class="btree-node is-root" x="170" y="110" width="80" height="40" rx="6" />
        <text class="btree-mono" x="210" y="135" text-anchor="middle">20</text>
        <rect class="btree-node is-root" x="280" y="110" width="80" height="40" rx="6" />
        <text class="btree-mono" x="320" y="135" text-anchor="middle">20</text>
        <rect class="btree-node is-cluster-leaf" x="390" y="110" width="80" height="40" rx="6" />
        <text class="btree-sub" x="430" y="135" text-anchor="middle">25</text>
        <rect class="btree-badge" x="500" y="110" width="210" height="40" rx="6" />
        <text class="btree-badge-text" x="605" y="135" text-anchor="middle">(18,20] + (20,25]</text>
        <text class="btree-caption" x="380" y="170" text-anchor="middle">两条记录 + 两个空隙都被锁</text>
        <rect class="btree-node is-root" x="30" y="200" width="700" height="110" rx="10" />
        <text class="btree-mono" x="380" y="228" text-anchor="middle">主键 id · WHERE id=5 命中</text>
        <rect class="btree-node is-cluster-leaf" x="60" y="250" width="80" height="40" rx="6" />
        <text class="btree-sub" x="100" y="275" text-anchor="middle">id=3</text>
        <rect class="btree-node is-root" x="170" y="250" width="80" height="40" rx="6" />
        <text class="btree-mono" x="210" y="275" text-anchor="middle">id=5</text>
        <rect class="btree-node is-cluster-leaf" x="280" y="250" width="80" height="40" rx="6" />
        <text class="btree-sub" x="320" y="275" text-anchor="middle">id=7</text>
        <rect class="btree-node is-cluster-leaf" x="390" y="250" width="80" height="40" rx="6" />
        <text class="btree-sub" x="430" y="275" text-anchor="middle">id=9</text>
        <rect class="btree-badge" x="500" y="250" width="210" height="40" rx="6" />
        <text class="btree-badge-text" x="605" y="275" text-anchor="middle">只锁 id=5 一行</text>
        <text class="btree-caption" x="380" y="310" text-anchor="middle">退化为 Record Lock · 并发度最高</text>
      </g>
    </svg>
  </figure>
</section>

## 十三、小结与下篇预告

本篇从"MVCC 管读、锁管写"这条主线出发，把 InnoDB 的锁全景拆了一遍：按粒度分全局/表/行锁，按模式分 S/X，再加上 MDL、意向锁、自增锁这几类特殊用途锁；行锁加在索引上（无索引则退化全表锁），间隙锁防插入、Next-Key Lock 在 RR 下既锁行又锁空隙；两阶段锁协议决定了锁要到事务结束才释放，所以写冲突操作要后置；死锁靠等待图检测并回滚代价小的一方，避免手段是统一顺序、拆小事务、降 RC、应用重试；排查用 data_locks + SHOW ENGINE INNODB STATUS。

下一篇（六）我们进入日志系统：前面反复提到的 Redo Log、Undo Log、Binlog，到底各自负责什么、为什么写、怎么配合完成崩溃恢复和主从复制。尤其是 Redo 和 Binlog 的"两阶段提交"——那是 MySQL 数据不丢、主从一致的真正命门，我们下篇翻过去。

## 十四、面试高频考点清单

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    下面 10 个是后端岗真实常问、且容易追问的锁相关考点（多源面经交叉验证）。建议结合本篇正文理解，而不是死记结论。
  </div>
</details>

**1. InnoDB 行锁为什么依赖索引？**

行锁加在索引项上，不是物理数据行上。WHERE 必须能命中索引，才能精准锁定某行；否则全表扫描，给聚簇索引每一行加锁，等效锁全表。

**2. 哪些情况行锁会退化成表锁？**

三类：条件列完全没索引；索引"有但失效"（函数包裹、隐式类型转换、前导通配符 LIKE '%x'）；范围查询没走上唯一索引导致临键锁范围过大。本质都是"无法通过索引精准定位"，只能扩大锁范围。

**3. RC 和 RR 在锁上最大区别是什么？**

RC 只有记录锁，没有间隙锁和 Next-Key Lock，每次查询刷新快照、无法防幻读；RR 有间隙锁 + Next-Key Lock，配合 MVCC 最大程度规避幻读。所以很多公司生产直接用 RC——并发更高、死锁更少，幻读交给唯一约束或乐观锁兜底。

**4. Next-Key Lock 什么时候降级成记录锁？**

唯一索引（主键/唯一键）的等值查询且命中时，直接锁定单行，退化为纯记录锁，不需要锁间隙，并发度最高。普通索引等值查询则会锁行 + 锁两侧间隙。范围查询一律逐区间加 Next-Key Lock。

**5. 间隙锁会不会阻塞 UPDATE / DELETE？**

不会。间隙锁只锁"空隙"，只阻塞 INSERT 新记录；已有行的修改、删除不受影响。这也是为什么两个事务可以同时持有同一空隙的间隙锁（间隙锁之间兼容），但谁要往里插数据谁就被阻塞。

**6. 死锁的四个必要条件，怎么避免？**

互斥、请求与保持、不可剥夺、循环等待，缺一不可。避免手段：统一加锁顺序（多行更新前对 ID 排序）、大事务拆小、合理加索引缩小锁范围、非严格场景降 RC、应用层捕获 1213 异常加退避重试。

**7. 怎么排查线上死锁？**

开启 innodb_print_all_deadlocks（生产建议常开）；SHOW ENGINE INNODB STATUS 看 LATEST DETECTED DEADLOCK 段，关注被回滚方、双方等待的锁模式、涉及索引；8.0+ 用 performance_schema.data_locks 和 data_lock_waits 直接看锁持有与阻塞关系。

**8. 意向锁（IS/IX）能不能手动加？有什么用？**

不能，由 InnoDB 自动维护。它是表级"信号灯"，事务要在某行加 S/X 锁前先在表上加对应意向锁，用来快速判断表内是否有行被锁，避免为了检查行锁而逐行扫描。意向锁之间全兼容，只与表级 S/X 锁互斥。

**9. MDL 元数据锁的坑是什么？**

访问表时自动加 MDL 读锁，做 DDL 时加 MDL 写锁。长事务不提交会一直持有 MDL 读锁，导致后续 DDL 阻塞，进而所有新读写排队雪崩。排查看 performance_schema.metadata_locks 的 PENDING 状态，kill 掉长事务持有者即可。

**10. 乐观锁和悲观锁的区别，怎么实现？**

悲观锁假设冲突高，先加锁再操作（SELECT ... FOR UPDATE），适合写多读少。乐观锁假设冲突低，操作不加锁、提交时校验，典型实现是版本号 / CAS：UPDATE ... SET val=?, ver=ver+1 WHERE id=? AND ver=?，影响行数 0 即冲突重试，适合读多写少。高冲突下乐观锁会因大量重试浪费 CPU。

**加分题：RR 下幻读到底防住没有？**

呼应第④篇——快照读靠 MVCC 防住幻读，当前读靠 Next-Key Lock 防住幻读，两条路合起来覆盖了绝大多数场景。但如果一个事务先快照读（判断某行不存在）、再当前读 UPDATE 它，就会看到自己 UPDATE 带进来的"幻影行"，这是混合用法的残留漏洞。能讲清这个边界，是区分"真懂"和"背了十个字"的关键。

## 十五、下一篇（六）待解问题

本篇把"锁"这座大山翻过去了，但要真正保证 ACID，还差一个绕不开的支撑层——日志。本篇反复提到"原子性靠 Undo、持久性靠 Redo"，可 Undo / Redo 到底是什么、为什么非写日志不可、崩溃之后又怎么恢复，我们一直没展开。这正是留给第⑥篇的待解问题：

- Undo Log 除了回滚，为什么还能支撑 MVCC 的多版本（版本链到底怎么和 Undo 段关联）；
- Redo Log 怎么保证事务持久性、掉电也不丢，为什么写 Redo 比直接刷数据页快（WAL 思想）；
- Binlog 是什么，和 Redo 有什么区别，为什么主从复制只能靠 Binlog；
- 两阶段提交（2PC）怎么让 Redo 和 Binlog 达成一致，避免"Redo 说提交了、Binlog 没记"的尴尬；
- 崩溃恢复时，MySQL 怎么用 Redo + Binlog 决定一个事务该提交还是回滚。

这些问题，正是第⑥篇《日志系统：Redo / Undo / Binlog 三件套》要逐一拆开的。本篇到此结束。
