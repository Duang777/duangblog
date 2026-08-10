---
author: Duang
pubDatetime: 2026-08-09T14:00:00+08:00
title: MySQL 深度教学（四）：事务与 MVCC 多版本并发控制
featured: true
draft: false
tags:
  - MySQL
description: ACID 靠什么落地、四个隔离级别挡住哪些异常、MVCC 版本链和 ReadView 怎么决定一行对你可不可见，以及长事务为什么是性能杀手。
---

> **系列进度（共 10 篇）**
> ① 整体架构与一条 SQL 的旅程 ✅　② InnoDB 存储引擎核心原理 ✅　③ 索引深度解析与高性能索引设计 ✅　④ 事务与 MVCC 多版本并发控制（本篇）　⑤ 锁机制全解　⑥ 日志系统：Redo / Undo / Binlog 三件套　⑦ SQL 优化与执行计划（EXPLAIN）　⑧ 查询性能调优实战　⑨ 高可用与复制架构　⑩ 备份恢复、分库分表与运维实战

## 开篇：从"读得快"到"并发读写不出错"

上一篇（三）我们集中解决了"读"的问题：索引是 MySQL 性能的第一杠杆，B+Tree 让 InnoDB 能在几十毫秒内从千万行里捞出你要的那几行，而不用全表扫描。读到这儿，你应该已经能设计出一个高性能索引，并用 EXPLAIN 验证它到底有没有生效。

这正是第③篇结尾留给我们的待解问题：索引把"读"做到了极致，但真实业务是很多连接同时读写同一张表，索引管不了"并发下数据对不对"。当时那篇的收尾预告里，已经把本篇要讲透的五个点列了出来，这里直接把它们变成"本篇要回答的问题"：

- ACID 分别是靠什么机制实现的——原子性靠 Undo 撤销、持久性靠 Redo 重放、隔离性靠 MVCC + 锁；
- 四个隔离级别分别挡住哪些并发异常，脏读、不可重复读、幻读到底差在哪；
- MVCC 怎么做到读写互不阻塞，版本链和 ReadView 怎么配合决定某一行某版本对当前事务是否可见；
- 可重复读（RR）下幻读到底解决没有，快照读和当前读各管什么；
- 长事务为什么是性能杀手，怎么在日常里揪出它。

但"读得快"只是单机单用户视角下的故事。真实业务里，同一张表同时被很多连接读写：一个事务正在改第 100 行，另一个事务此刻来读第 100 行，它会不会读到改到一半的"半成品"？两个事务同时给同一个账户加钱，最后金额会不会算错？一个事务先后两次查同一批数据，中间别的事务插入了几行，它两次看到的结果不一样，这又算不算 bug？

这些问题，索引一个都解决不了。它们属于另一个维度——并发下的一致性与隔离性。这一篇我们要把事务（Transaction）和多版本并发控制（MVCC）讲透：事务靠什么保证 ACID、四个隔离级别分别挡住了哪些并发异常、MVCC 又是怎么做到"读写互不阻塞、还能让每个事务读到自己的一致快照"的。理解了这些，你再看第⑤篇的锁、第⑥篇的日志，就知道它们为什么存在——锁是为了堵住 MVCC 快照读覆盖不到的"当前读"场景，日志则是 ACID 里原子性和持久性的物理落点。

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-mvcc-bottle.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">多版本瓶</span>
  </div>
  <p class="duang-whisper-body">索引把读做快了，但两个人同时往同一行写怎么办？这瓶里叠着好几层旧版本，各看各的。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

> 阅读目标：读完本篇，你应该能回答——ACID 各自靠什么机制实现；脏读、不可重复读、幻读分别在什么隔离级别下出现；MVCC 的版本链和 ReadView 是怎么配合决定"某一行某版本对当前事务是否可见"的；以及怎么在日常运维里揪出长事务。本篇默认你已理解第②篇的 Undo 隐藏列（DB_TRX_ID / DB_ROLL_PTR）和第③篇的索引基础。

## 一、事务是什么：从一条转账说起

事务最经典的例子是银行转账：从账户 A 扣 100 元，给账户 B 加 100 元。这两条 UPDATE 必须被当作一个整体——要么都成功（A 少 100、B 多 100），要么都失败（谁的钱都不变）。如果 A 扣了钱、系统崩溃在 B 加钱之前，就会出现"钱凭空消失"的灾难。事务就是用来把这样一组操作捆绑成"不可分割的一个单元"的机制。

数据库用 ACID 四个字母来定义事务应该具备的性质，我们逐条讲清它"解决什么问题、InnoDB 又靠什么实现"：

<section class="article-embed-note">
  <p class="article-embed-note-title">图解：ACID 四支柱各靠什么落地</p>
  <p class="article-embed-note-lead">原子性靠 Undo 撤销，持久性靠 Redo 重放，隔离性靠 MVCC + 锁，一致性是前三者加约束的共同结果。</p>
  <figure class="btree-scene" data-btree-demo="compare">
    <svg class="btree-svg" viewBox="0 0 760 340" role="img" aria-label="ACID 四支柱与实现机制">
      <g data-btree-stage="title">
        <text class="btree-label" x="380" y="28" text-anchor="middle">ACID 四支柱 · 谁撑哪一根</text>
      </g>
      <g data-btree-stage="cluster">
        
        <rect class="btree-node is-root" x="30" y="60" width="150" height="100" rx="10" />
        <text class="btree-mono" x="105" y="90" text-anchor="middle" fontSize="16">A 原子性</text>
        <text class="btree-sub" x="105" y="115" text-anchor="middle">要么全做</text>
        <text class="btree-sub" x="105" y="132" text-anchor="middle">要么全不做</text>
        <text class="btree-caption" x="105" y="152" text-anchor="middle">Undo Log 撤销</text>
        
        <rect class="btree-node is-root" x="210" y="60" width="150" height="100" rx="10" />
        <text class="btree-mono" x="285" y="90" text-anchor="middle" fontSize="16">C 一致性</text>
        <text class="btree-sub" x="285" y="115" text-anchor="middle">业务规则</text>
        <text class="btree-sub" x="285" y="132" text-anchor="middle">不被破坏</text>
        <text class="btree-caption" x="285" y="152" text-anchor="middle">A + I + D + 约束</text>
        
        <rect class="btree-node is-root" x="390" y="60" width="150" height="100" rx="10" />
        <text class="btree-mono" x="465" y="90" text-anchor="middle" fontSize="16">I 隔离性</text>
        <text class="btree-sub" x="465" y="115" text-anchor="middle">并发事务</text>
        <text class="btree-sub" x="465" y="132" text-anchor="middle">互不串扰</text>
        <text class="btree-caption" x="465" y="152" text-anchor="middle">MVCC + 锁</text>
        
        <rect class="btree-node is-root" x="570" y="60" width="150" height="100" rx="10" />
        <text class="btree-mono" x="645" y="90" text-anchor="middle" fontSize="16">D 持久性</text>
        <text class="btree-sub" x="645" y="115" text-anchor="middle">提交后</text>
        <text class="btree-sub" x="645" y="132" text-anchor="middle">掉电不丢</text>
        <text class="btree-caption" x="645" y="152" text-anchor="middle">Redo Log 重放</text>
        
        <path class="btree-ink" d="M105 160 V200 H285" />
        <path class="btree-ink" d="M465 160 V200 H285" />
        <path class="btree-ink" d="M645 160 V200 H285" />
        <text class="btree-caption" x="285" y="220" text-anchor="middle">↑ 三根柱子共同撑起一致性</text>
        
        <rect class="btree-node is-cluster-leaf" x="30" y="250" width="690" height="60" rx="8" />
        <text class="btree-mono" x="105" y="275" text-anchor="middle">Undo</text>
        <text class="btree-sub" x="105" y="293" text-anchor="middle">第⑥篇展开</text>
        <text class="btree-mono" x="285" y="275" text-anchor="middle">约束 + 应用层</text>
        <text class="btree-sub" x="285" y="293" text-anchor="middle">本篇 + 第⑤篇</text>
        <text class="btree-mono" x="465" y="275" text-anchor="middle">MVCC + 锁</text>
        <text class="btree-sub" x="465" y="293" text-anchor="middle">本篇核心</text>
        <text class="btree-mono" x="645" y="275" text-anchor="middle">Redo</text>
        <text class="btree-sub" x="645" y="293" text-anchor="middle">第⑥篇展开</text>
      </g>
    </svg>
  </figure>
</section>

### 1.1 原子性（Atomicity）：要么全做，要么全不做

原子性保证事务里的所有操作是一个整体，不会出现"只做了一半"的中间状态对外可见。实现上是靠 Undo Log：事务每修改一行之前，InnoDB 先把这行的旧版本写进 Undo Log；一旦事务要回滚，或者执行到一半崩溃，就用 Undo Log 把数据复原。第⑥篇会详细讲 Undo 的物理结构，这里先记住"原子性的撤销能力来自 Undo Log"。

### 1.2 一致性（Consistency）：事务前后，业务规则不被破坏

一致性指的是数据始终满足预定的约束：转账前后两个账户的总额不变、字段类型合法、外键引用存在。严格说一致性不是数据库单方面"自动保证"的，而是原子性、隔离性、持久性三者共同支撑的结果，再加上应用层写入的数据本身合法。它更像是一个"目标"，而不是某一条具体的技术机制。

### 1.3 隔离性（Isolation）：并发事务互不影响

隔离性保证多个事务并发执行时，彼此的中间状态不互相串扰。但隔离是有代价的：隔离越严，并发性能越低。于是 SQL 标准定义了四个隔离级别，让用户在"正确性"和"性能"之间取舍。本篇第三节会专门展开。实现上，InnoDB 主要靠 MVCC（读不加锁、各看各的快照）加锁（当前读加锁）两套机制共同支撑隔离性。

### 1.4 持久性（Durability）：一旦提交，掉电也不丢

持久性保证事务提交后，结果永久生效，哪怕数据库进程崩溃、机器掉电。实现上是靠 Redo Log：事务提交时，修改先顺序写进 Redo Log（顺序 IO，很快），再异步刷到数据页。崩溃重启后，InnoDB 用 Redo Log 把没来得及刷盘的数据重放出来。Redo 的细节在第⑥篇。

一句话串起来：原子性靠 Undo 撤销，持久性靠 Redo 重放，隔离性靠 MVCC + 锁，一致性靠前三者共同保证。这正好对应了后面几篇的主线。

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    ACID 不是四个独立的开关，是一根链条：Undo 管"撤"，Redo 管"留"，MVCC + 锁管"隔"，一致性是前三者加约束的净结果。
  </div>
</details>

在 MySQL 里，事务的边界由你显式控制，最基础的语法就是这三组命令：

```sql
-- 显式开启一个事务（等价于 BEGIN）
START TRANSACTION;

-- 一组操作
UPDATE account SET balance = balance - 100 WHERE id = 'A';
UPDATE account SET balance = balance + 100 WHERE id = 'B';

-- 都成功就提交，改动正式生效
COMMIT;

-- 如果中途出错，回滚到事务开始前的状态
ROLLBACK;
```

没有显式 BEGIN 时，MySQL 默认每条语句自成一个"自动提交（autocommit）"事务，执行完立刻提交。这也意味着，想让多条语句组成一个事务，必须先 START TRANSACTION 关掉自动提交、再用 COMMIT 收尾。

## 二、隔离级别与三大并发异常

隔离性不是"有或无"的开关，而是一档一档的刻度。SQL 标准定义了四个隔离级别，越往下隔离越严、并发能力越弱。要理解隔离级别，得先认识它要解决的三个并发异常：脏读、不可重复读、幻读。

### 2.1 三个异常到底是什么

#### 脏读（Dirty Read）

一个事务读到了另一个事务"尚未提交"的修改。如果那个事务随后回滚了，你读到的就是根本不存在的"脏数据"。这是最危险的异常，因为数据从源头上就是错的。

#### 不可重复读（Non-Repeatable Read）

同一个事务内，前后两次读取同一行，结果不一样。原因是两次读取之间，另一个已提交的事务修改了这行并提交了。注意它的焦点是"某一条已存在的记录被改了"。

#### 幻读（Phantom Read）

同一个事务内，用同样的条件前后两次查询，第二次查出了第一次没有的"新行"（或少了行）。原因是两次查询之间，另一个已提交的事务插入/删除了符合条件的行。它的焦点是"结果集的行数变了"，而不是某行内容变了。很多人把幻读和不可重复读混淆，关键区别就在：不可重复读是老行内容变，幻读是结果集多了/少了行。

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    脏读读的是"没提交的"，不可重复读读的是"提交后的新值"，幻读读的是"提交后的新行"。三种异常的焦点逐级递进。
  </div>
</details>

### 2.2 四个隔离级别能挡住什么

下面的表把四个级别和三个异常一一对应。注意 MySQL 的默认级别是 REPEATABLE READ，它靠 MVCC 在"快照读"层面避免了脏读、不可重复读和幻读；但在"当前读"下要彻底防住幻读，还需要第⑤篇讲的间隙锁/临键锁配合。这块第三节、第四节会展开。

| 隔离级别 | 脏读 | 不可重复读 | 幻读 | 实现机制 |
|-|-|-|-|-|
| READ UNCOMMITTED（读未提交） | 可能发生 | 可能发生 | 可能发生 | 读不加锁，直接读最新版 |
| READ COMMITTED（读已提交） | 已避免 | 可能发生 | 可能发生 | 每次读生成新 ReadView，只看已提交 |
| REPEATABLE READ（可重复读，MySQL 默认） | 已避免 | 已避免 | 快照读已避免，当前读需锁配合 | 事务内首个快照固定，MVCC 版本链 |
| SERIALIZABLE（串行化） | 已避免 | 已避免 | 已避免 | 读也加共享锁，事务串行执行 |

读已提交（RC）是很多互联网公司实际采用的级别（Oracle 默认就是 RC），因为它在"避免脏读"和"并发度"之间比较平衡；可重复读（RR）是 MySQL 默认，对"对账、统计"这类要求前后一致的场景更友好，但更容易遇到间隙锁导致的锁等待。两者没有绝对优劣，取决于业务对"读到旧值能不能接受"的容忍度。

### 2.3 怎么查看和设置隔离级别

隔离级别分全局和会话两个作用域，查看当前的命令如下：

```sql
-- 查看当前会话的隔离级别（MySQL 8.0 用 transaction_isolation）
SELECT @@transaction_isolation;

-- 查看全局隔离级别
SELECT @@global.transaction_isolation;

-- 仅在当前连接生效：改为读已提交
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;

-- 全局生效（新连接继承，需权限）
SET GLOBAL TRANSACTION ISOLATION LEVEL REPEATABLE READ;
```

### 2.4 亲手复现三种异常（两个终端对照）

光看定义抽象，下面用两个连接（Session A、Session B）的脚本把三种异常跑出来。准备一张表：

```sql
CREATE TABLE t (
  id INT PRIMARY KEY,
  val INT
) ENGINE=InnoDB;
INSERT INTO t(id, val) VALUES (1, 10);
```

复现脏读（把 A、B 都设成 READ UNCOMMITTED）：

```sql
-- Session A
SET SESSION TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
START TRANSACTION;
UPDATE t SET val = 999 WHERE id = 1;   -- 改了但还没提交

-- Session B（另开一个连接）
SET SESSION TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
START TRANSACTION;
SELECT val FROM t WHERE id = 1;        -- 读到 999！A 还没提交，这是脏读
```

复现不可重复读（把 A、B 都设成 READ COMMITTED）：

```sql
-- Session A
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
START TRANSACTION;
SELECT val FROM t WHERE id = 1;        -- 第一次读到 10

-- Session B
START TRANSACTION;
UPDATE t SET val = 999 WHERE id = 1;
COMMIT;                               -- B 提交了

-- 回到 Session A，在同一个事务里再查一次
SELECT val FROM t WHERE id = 1;        -- 读到 999，和第一次不一样 → 不可重复读
```

复现幻读（把 A、B 都设成 READ COMMITTED，幻读在 RC 下也会出现）：

```sql
-- Session A
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
START TRANSACTION;
SELECT * FROM t WHERE val > 0;         -- 第一次看到 1 行 (id=1)

-- Session B
INSERT INTO t(id, val) VALUES (2, 20);
COMMIT;

-- 回到 Session A，同样条件再查
SELECT * FROM t WHERE val > 0;         -- 第二次看到 2 行，多出 (id=2) → 幻读
```

把 A 的隔离级别换成 REPEATABLE READ 再跑上面"不可重复读"和"幻读"的脚本，你会看到 A 两次查询的结果保持一致——这正是 MVCC 的功劳，下一节讲它为什么能做到。

## 三、MVCC 核心思想：给数据留多个历史版本

MVCC（Multi-Version Concurrency Control，多版本并发控制）的核心思路只有一句话：不改原数据，而是每次修改都保留一个旧版本，让不同事务各取所需地读自己该看的那个版本。这样一来，读事务不用等写事务释放锁，写事务也不用等读事务，读写天然互不阻塞。

回顾第②篇讲的 Compact 行格式，InnoDB 给每行偷偷塞了几个隐藏列，MVCC 正是建立在它们之上：

| 隐藏列 | 含义 | 在 MVCC 里的角色 |
|-|-|-|
| DB_TRX_ID | 最近一次修改这行的事务 ID | 判断"这个版本是谁改的、我该不该看见它" |
| DB_ROLL_PTR | 回滚指针，指向 Undo Log 里的上一个版本 | 把一行所有的历史版本串成一条链表 |
| DB_ROW_ID | 行 ID（无主键时 InnoDB 自动生成） | 定位行本身，和 MVCC 可见性关系不大 |

### 3.1 版本链是怎么串起来的

假设事务 10 把 id=1 这行的 val 从 10 改成 20，事务 20 又改成 30。InnoDB 并不是直接覆盖，而是这样工作：

- 事务 10 修改前，先把旧值（val=10）拷进 Undo Log，新行的 DB_TRX_ID 写成 10，DB_ROLL_PTR 指向那块 Undo；
- 事务 20 修改前，再把当前值（val=20）拷进 Undo Log，新行的 DB_TRX_ID 写成 20，DB_ROLL_PTR 指向事务 10 留下的那块 Undo；
- 于是从最新行出发，顺着 DB_ROLL_PTR 一路往前，能拉出一条 val = 30 → 20 → 10 的版本链。

某个事务来读时，就拿着自己的"资格"（下面讲的 ReadView），顺着版本链从头往后找，找到第一个"对我可见"的版本返回。这就是为什么一个事务能在不改任何数据的前提下，看到它自己那个时间点的快照——它读的是版本链上适合自己的那一环。

<section class="article-embed-note">
  <p class="article-embed-note-title">图解：一行数据的版本链长什么样</p>
  <p class="article-embed-note-lead">最新行 val=30 挂在聚簇索引里，顺着 DB_ROLL_PTR 一路往左，穿过 Undo Log 里的旧版本，直到 val=10。</p>
  <figure class="btree-scene" data-btree-demo="compare">
    <svg class="btree-svg" viewBox="0 0 760 300" role="img" aria-label="MVCC 版本链示意">
      <g data-btree-stage="title">
        <text class="btree-label" x="380" y="24" text-anchor="middle">id=1 的版本链 · val = 30 → 20 → 10</text>
      </g>
      <g data-btree-stage="cluster">
        
        <rect class="btree-node is-cluster-leaf" x="40" y="55" width="170" height="90" rx="8" />
        <text class="btree-mono" x="125" y="80" text-anchor="middle">聚簇索引 · 当前行</text>
        <text class="btree-sub" x="125" y="100" text-anchor="middle">val = 30</text>
        <text class="btree-sub" x="125" y="118" text-anchor="middle">DB_TRX_ID = 20</text>
        <text class="btree-sub" x="125" y="136" text-anchor="middle">DB_ROLL_PTR →</text>

        
        <path class="btree-ink" d="M210 100 H250" />
        <path class="btree-ink" d="M243 93 L250 100 L243 107" />

        
        <rect class="btree-node is-sec-leaf" x="255" y="55" width="160" height="90" rx="8" />
        <text class="btree-mono" x="335" y="80" text-anchor="middle">Undo Log · 旧版本</text>
        <text class="btree-sub" x="335" y="100" text-anchor="middle">val = 20</text>
        <text class="btree-sub" x="335" y="118" text-anchor="middle">DB_TRX_ID = 10</text>
        <text class="btree-sub" x="335" y="136" text-anchor="middle">DB_ROLL_PTR →</text>

        
        <path class="btree-ink" d="M415 100 H455" />
        <path class="btree-ink" d="M448 93 L455 100 L448 107" />

        
        <rect class="btree-node is-sec-leaf" x="460" y="55" width="160" height="90" rx="8" />
        <text class="btree-mono" x="540" y="80" text-anchor="middle">Undo Log · 最旧版本</text>
        <text class="btree-sub" x="540" y="100" text-anchor="middle">val = 10</text>
        <text class="btree-sub" x="540" y="118" text-anchor="middle">DB_TRX_ID = init</text>
        <text class="btree-sub" x="540" y="136" text-anchor="middle">DB_ROLL_PTR = NULL</text>

        
        <text class="btree-caption" x="125" y="175" text-anchor="middle">事务 20 改完后</text>
        <text class="btree-caption" x="125" y="192" text-anchor="middle">这一行存的就是 30</text>
        <text class="btree-caption" x="335" y="175" text-anchor="middle">事务 10 的旧值</text>
        <text class="btree-caption" x="335" y="192" text-anchor="middle">被拷进了 Undo</text>
        <text class="btree-caption" x="540" y="175" text-anchor="middle">最初的值</text>
        <text class="btree-caption" x="540" y="192" text-anchor="middle">链的终点</text>

        
        <rect class="btree-badge" x="40" y="220" width="580" height="40" rx="8" />
        <text class="btree-badge-text" x="330" y="245" text-anchor="middle">读事务顺着 ROLL_PTR 从左往右找，命中第一个"可见"版本就返回</text>
      </g>
    </svg>
  </figure>
</section>

### 3.2 Undo Log 不是只为了回滚

很多人以为 Undo Log 只服务于 ROLLBACK，其实它同时是 MVCC 的"历史仓库"：快照读要找回旧版本，全靠 Undo Log 里存的旧数据。当没有任何事务还需要某个旧版本时，后台的 purge 线程才会把它清理掉（这也是长事务的危害之一：它不结束，它启动前的所有旧版本都不能被 purge，Undo 越堆越大）。

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    Undo Log 一身二职：回滚靠它，MVCC 快照读也靠它。purge 线程只在没有事务还需要旧版本时才清理——长事务不结束，旧版本就永远清不掉。
  </div>
</details>

## 四、ReadView 与可见性判断

"某个版本对当前事务是否可见"由 ReadView 决定。ReadView 是事务在"某个时刻"生成的一张快照凭证，记录当时还在活跃（已开启、未提交）的事务 ID 范围，主要包含四样东西：

- **m_ids**：生成 ReadView 那一刻，所有活跃（未提交）事务的 ID 列表；
- **min_trx_id**：m_ids 里的最小值，代表"当前还活着的最小事务"；
- **max_trx_id**：生成 ReadView 时，系统应该分配给"下一个新事务"的 ID（注意它比当前任何活跃事务都大）；
- **creator_trx_id**：创建这个 ReadView 的事务自己的 ID。

拿着版本链上某行的 DB_TRX_ID（记为 trx_id），可见性规则按下面顺序判断：

- 如果 trx_id == creator_trx_id，说明是"我自己改的"，可见；
- 如果 trx_id < min_trx_id，说明修改这行的事务在 ReadView 生成前就已提交，可见；
- 如果 trx_id >= max_trx_id，说明修改发生在 ReadView 生成之后，对本事务不可见，顺着版本链往前找更早的版本；
- 如果 min_trx_id <= trx_id < max_trx_id，要看 trx_id 是否在 m_ids 活跃列表里：不在（已提交）就可见，在（还没提交）就不可见，继续往前找。

顺着版本链一路往前找，直到命中一个"可见"的版本为止；如果整条链都不可见，就认为这行对当前事务不存在。

<section class="article-embed-note">
  <p class="article-embed-note-title">图解：ReadView 可见性判断流程</p>
  <p class="article-embed-note-lead">拿到一行的 DB_TRX_ID，按四条规则依次判断，命中"可见"就返回，否则顺着 ROLL_PTR 继续往前。</p>
  <figure class="btree-scene" data-btree-demo="compare">
    <svg class="btree-svg" viewBox="0 0 760 420" role="img" aria-label="ReadView 可见性判断流程">
      <g data-btree-stage="title">
        <text class="btree-label" x="380" y="24" text-anchor="middle">ReadView 可见性判断 · 四条规则</text>
      </g>
      <g data-btree-stage="cluster">
        
        <rect class="btree-node is-root" x="290" y="45" width="180" height="36" rx="8" />
        <text class="btree-mono" x="380" y="68" text-anchor="middle">取行的 trx_id</text>
        <path class="btree-ink" d="M380 81 V100" />

        
        <rect class="btree-node" x="250" y="100" width="260" height="50" rx="8" />
        <text class="btree-sub" x="380" y="122" text-anchor="middle">trx_id == creator_trx_id ?</text>
        <text class="btree-caption" x="380" y="140" text-anchor="middle">我自己改的 → 可见</text>
        <path class="btree-ink" d="M380 150 V165" />
        <text class="btree-caption" x="530" y="130" text-anchor="middle">否 ↓</text>

        
        <rect class="btree-node" x="250" y="165" width="260" height="50" rx="8" />
        <text class="btree-sub" x="380" y="187" text-anchor="middle">trx_id &lt; min_trx_id ?</text>
        <text class="btree-caption" x="380" y="205" text-anchor="middle">早于我进场、已提交 → 可见</text>
        <path class="btree-ink" d="M380 215 V230" />
        <text class="btree-caption" x="530" y="195" text-anchor="middle">否 ↓</text>

        
        <rect class="btree-node" x="250" y="230" width="260" height="50" rx="8" />
        <text class="btree-sub" x="380" y="252" text-anchor="middle">trx_id &gt;= max_trx_id ?</text>
        <text class="btree-caption" x="380" y="270" text-anchor="middle">我进场后才改的 → 不可见</text>
        <path class="btree-ink" d="M380 280 V295" />
        <text class="btree-caption" x="530" y="260" text-anchor="middle">否 ↓</text>

        
        <rect class="btree-node" x="250" y="295" width="260" height="50" rx="8" />
        <text class="btree-sub" x="380" y="317" text-anchor="middle">trx_id 在 m_ids 里 ?</text>
        <text class="btree-caption" x="380" y="335" text-anchor="middle">在 → 未提交，不可见 / 不在 → 可见</text>
        <path class="btree-ink" d="M380 345 V360" />

        
        <rect class="btree-node is-cluster-leaf" x="140" y="360" width="200" height="40" rx="8" />
        <text class="btree-mono" x="240" y="385" text-anchor="middle">可见 → 返回此版本</text>
        <rect class="btree-node is-sec-leaf" x="420" y="360" width="200" height="40" rx="8" />
        <text class="btree-mono" x="520" y="385" text-anchor="middle">不可见 → 顺着 ROLL_PTR 找</text>
        <path class="btree-ink" d="M340 380 H420" />
      </g>
    </svg>
  </figure>
</section>

### 4.1 RC 与 RR 的根本区别：ReadView 何时生成

同样是这套规则，为什么 RC 会有不可重复读、而 RR 不会？差别只有一个——ReadView 的生成时机：

- **READ COMMITTED**：每次执行 SELECT 都会重新生成一个新的 ReadView。所以事务内第二次 SELECT 时，如果别的事务已经提交了，新 ReadView 里那个事务就不在 m_ids 里了，于是能看见它的修改——表现为"不可重复读"。
- **REPEATABLE READ**：在事务里第一次 SELECT 时生成 ReadView，之后整个事务都复用这同一个 ReadView。后续哪怕别的事务提交了，本事务的 ReadView 不变，旧版本依旧"不可见"，于是前后两次读到的内容一致——这就是"可重复读"的来由。

也就是说，RR 下不是数据没变，而是你手里那张 ReadView 一直没换，所以你始终只看见你"进场那一刻"该看见的世界。

<section class="article-embed-note">
  <p class="article-embed-note-title">图解：RC vs RR · ReadView 生成时机</p>
  <p class="article-embed-note-lead">RC 每次 SELECT 都换一张新 ReadView；RR 从第一次 SELECT 起就锁定同一张，整个事务不换。</p>
  <figure class="btree-scene" data-btree-demo="compare">
    <svg class="btree-svg" viewBox="0 0 760 280" role="img" aria-label="RC 与 RR 的 ReadView 生成时机对比">
      <g data-btree-stage="title">
        <text class="btree-label" x="180" y="24" text-anchor="middle">READ COMMITTED</text>
        <text class="btree-label" x="560" y="24" text-anchor="middle">REPEATABLE READ</text>
      </g>
      <g data-btree-stage="cluster">
        
        <rect class="btree-node is-sec-leaf" x="30" y="50" width="300" height="50" rx="8" />
        <text class="btree-mono" x="180" y="72" text-anchor="middle">SELECT 1 → 生成 ReadView A</text>
        <text class="btree-caption" x="180" y="90" text-anchor="middle">看到的是此刻已提交的快照</text>

        <rect class="btree-node" x="60" y="115" width="240" height="30" rx="6" />
        <text class="btree-caption" x="180" y="135" text-anchor="middle">别的事务提交了修改</text>

        <rect class="btree-node is-sec-leaf" x="30" y="160" width="300" height="50" rx="8" />
        <text class="btree-mono" x="180" y="182" text-anchor="middle">SELECT 2 → 生成 ReadView B</text>
        <text class="btree-caption" x="180" y="200" text-anchor="middle">新 ReadView，看到了别人的修改</text>

        <text class="btree-caption" x="180" y="240" text-anchor="middle">两次结果不同 → 不可重复读</text>

        
        <rect class="btree-node is-cluster-leaf" x="410" y="50" width="300" height="50" rx="8" />
        <text class="btree-mono" x="560" y="72" text-anchor="middle">SELECT 1 → 生成 ReadView A</text>
        <text class="btree-caption" x="560" y="90" text-anchor="middle">锁定快照</text>

        <rect class="btree-node" x="440" y="115" width="240" height="30" rx="6" />
        <text class="btree-caption" x="560" y="135" text-anchor="middle">别的事务提交了修改</text>

        <rect class="btree-node is-cluster-leaf" x="410" y="160" width="300" height="50" rx="8" />
        <text class="btree-mono" x="560" y="182" text-anchor="middle">SELECT 2 → 复用 ReadView A</text>
        <text class="btree-caption" x="560" y="200" text-anchor="middle">同一张 ReadView，旧版本仍不可见</text>

        <text class="btree-caption" x="560" y="240" text-anchor="middle">两次结果相同 → 可重复读</text>
      </g>
    </svg>
  </figure>
</section>

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    RC 和 RR 用的是同一套可见性规则，唯一区别是 ReadView 的生成时机。RC 每次读都换新"门票"，RR 从头到尾用同一张。
  </div>
</details>

## 五、快照读与当前读

理解了 MVCC，要分清 MySQL 里两类读的差别，这是理解"为什么 RR 下有时还会看到新插入行"的关键。

### 5.1 快照读（Snapshot Read）

普通的 SELECT（不加锁）走的就是快照读：它读的是版本链上对自己可见的那个版本，完全不加锁，所以和写操作互不阻塞。在 RR 下，它读的是事务开始时的快照，天然避免了脏读、不可重复读、幻读。

```sql
-- 快照读：不加锁，走 MVCC 版本链
SELECT * FROM t WHERE id = 1;
```

### 5.2 当前读（Current Read）

下面这些操作读的是"最新已提交版本"，并且会加锁，确保读到的这一刻没人能改它：

```sql
-- 当前读：读最新版并加排他锁
SELECT * FROM t WHERE id = 1 FOR UPDATE;

-- 当前读：读最新版并加共享锁
SELECT * FROM t WHERE id = 1 LOCK IN SHARE MODE;

-- 这些写操作本质也是当前读：先读最新版，再修改
UPDATE t SET val = val + 1 WHERE id = 1;
DELETE FROM t WHERE id = 1;
```

当前读的存在，是因为 UPDATE/DELETE 必须基于"最新真实数据"去改，不能改一个历史版本。而它加的锁，正是第⑤篇要展开的主题。这里有一个重要的点：在 RR 下，当前读除了加行锁，还会对"索引记录之间的间隙"加锁（间隙锁 / 临键锁 Next-Key Lock），从而挡住别的事务在它读的范围内插入新行——这才是 RR 彻底防住幻读的真正手段。快照读靠 MVCC 防幻读，当前读靠 Next-Key Lock 防幻读，两条路合在一起，RR 才在实操中做到了"避免幻读"。具体锁机制，第⑤篇单独深挖。

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    快照读走 MVCC 无锁，当前读走最新版加锁。RR 防幻读靠两条腿：快照读靠版本链，当前读靠 Next-Key Lock。少一条都漏。
  </div>
</details>

## 六、Undo Log 与回滚：长事务是隐形杀手

前面提到 Undo Log 既是回滚的依据，也是 MVCC 的历史仓库。这里把它的运行机制再往下钻一层，因为它直接关系到一个高频运维坑——长事务。

### 6.1 回滚是怎么发生的

事务开始时，InnoDB 会在回滚段（rollback segment，InnoDB 默认有 128 个，每个又含若干 undo slot）里给它分配空间。事务每改一行，都把旧版本写入 Undo Log，并通过 DB_ROLL_PTR 串成版本链。当执行 ROLLBACK，InnoDB 就顺着这个事务的 Undo 记录反向"重放"一遍：之前是加，就再减回去；之前是插入，就删除。回滚完成后，这些 Undo 记录标记作废，等 purge 线程回收。

### 6.2 长事务为什么危险

"长事务"指开启后长时间不提交也不回滚的事务。它在 MVCC 体系下会同时带来多个问题：

- **Undo 无法 purge，磁盘持续膨胀**：purge 线程清理旧版本的前提是"没有任何活跃事务还需要它"。一个长事务一直不结束，它启动时之前的所有旧版本都不能被清理，Undo 表空间（或系统表空间）越涨越大，甚至把磁盘吃满。
- **版本链变长，快照读变慢**：别的事务为了读到自己该看的旧版本，要顺着越来越长的版本链一路往前找，读性能随长事务持续而劣化。
- **回滚代价高**：事务越长，累积的 Undo 越多，一旦回滚，反向重放的工作量也越大，可能造成长时间阻塞。
- **锁和资源持有时间拉长**：事务期间申请的锁、持有的行锁在提交前都不会释放，更容易引发别的会话锁等待甚至死锁（锁的细节见第⑤篇）。

所以在业务代码里，最该杜绝的就是"开启事务后去做远程调用、人工审核、文件上传"这类耗时操作——事务应该尽可能短小，begin 之后紧跟着把该做的读写做完，立刻 commit。

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    长事务 = Undo 清不掉 + 版本链变长 + 锁久持 + 回滚重。事务里干外部调用是最常见的踩法。
  </div>
</details>

## 七、实战观测：把事务和 MVCC 看在眼里

和前面几篇一样，这一节给你能直接敲的命令，而不是只讲概念。重点是用 information_schema.innodb_trx 看清"现在有哪些事务、开了多久、在跑什么"。

### 7.1 查看当前所有活跃事务

```sql
SELECT
  trx_id,
  trx_state,
  trx_started,
  TIMESTAMPDIFF(SECOND, trx_started, NOW()) AS 已运行秒数,
  trx_mysql_thread_id AS 连接线程ID,
  trx_query AS 正在执行的SQL
FROM information_schema.innodb_trx
ORDER BY trx_started;
```

字段含义：trx_state 是 RUNNING / LOCK WAIT 等状态；trx_started 是事务开启时间；trx_mysql_thread_id 对应 SHOW PROCESSLIST 里的 Id，用来定位是哪个连接；trx_query 是它当前正在跑的语句（如果空闲则是 NULL）。

### 7.2 专门揪出长事务

```sql
-- 找出已运行超过 30 秒还没提交的事务
SELECT trx_id, trx_mysql_thread_id, trx_started, trx_query
FROM information_schema.innodb_trx
WHERE trx_started < DATE_SUB(NOW(), INTERVAL 30 SECOND);
```

把这个查询接入监控（比如 Prometheus + exporter，或定时脚本），一旦长事务超过阈值就告警，是生产环境防事故的常用手段。

### 7.3 查看 MVCC 历史版本积压长度

```sql
SHOW ENGINE INNODB STATUS\G
```

在输出里找到 "History list length" 这一行，它表示当前待 purge 的 Undo 记录条数。正常情况下是个很小的数；如果它持续攀升不下降，往往意味着有长事务卡住、或者 purge 线程跟不上写入，需要排查。

### 7.4 杀掉问题长事务

```sql
-- 用 7.1 / 7.2 拿到的 trx_mysql_thread_id 来杀连接
KILL 12345;

-- 只终止当前正在执行的那条查询、保留连接（轻量一些）
KILL QUERY 12345;
```

KILL 掉连接会触发对应事务回滚，回滚期间可能短暂占用资源，所以生产上确认无误再操作。

## 八、常见坑与误区

### 8.1 "RR 下永远不会幻读"是片面的

准确说法：RR 下"快照读"确实避免了幻读；但"当前读"（如 SELECT ... FOR UPDATE）要防住幻读，靠的是 Next-Key Lock 锁住范围和间隙。如果当前读的查询没有命中索引，InnoDB 只能退化为锁住整张表的聚簇索引，既影响并发，也把"防幻读"的代价放大到全表。所以"RR 无幻读"成立的前提，是查询能走合理的索引。

### 8.2 忘了显式开启事务，多语句其实各自提交了

autocommit 开启时，一条 UPDATE 就是独立事务、立即提交。如果你以为"这几条语句是一个事务"，却没有 START TRANSACTION，中间任何一条失败都不会自动回滚前面的——它们早已各自落盘。需要原子性的多步操作，务必显式 BEGIN ... COMMIT 包起来。

### 8.3 在事务里做耗时外部操作

事务内调用 HTTP 接口、发消息队列、传文件，会人为拉长事务生命周期，直接踩中第六节讲的长事务所有坑（Undo 膨胀、锁久持、回滚重）。正确做法是：事务外做完外部调用，事务内只保留必要的数据库读写，尽快提交。

### 8.4 无脑上 SERIALIZABLE 求"绝对安全"

串行化会在读上也加共享锁，事务近乎串行执行，并发度断崖式下跌，高 QPS 场景会成为瓶颈。绝大多数业务用 RR（默认）或 RC 配合合理索引就已经足够，不要为心理安慰牺牲吞吐。

### 8.5 FOR UPDATE 锁的范围由索引决定

SELECT ... FOR UPDATE 锁的是"它实际扫描到的索引记录 + 间隙"。如果 WHERE 条件没走索引，会锁住几乎全部聚簇索引记录，等价于表级锁，极易引发大面积锁等待。这也再次呼应了第③篇：索引不仅决定"查得快不快"，还决定了"锁得准不准"。

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    FOR UPDATE 的锁范围 = 实际扫描的索引记录 + 间隙。没走索引 = 锁全表。索引不只管查得快不快，还管锁得准不准。
  </div>
</details>

## 九、本篇小结

- **ACID 的落点**：原子性靠 Undo 撤销，持久性靠 Redo 重放，隔离性靠 MVCC + 锁，一致性靠前三者共同保证（Redo / Undo 细节在第⑥篇）。
- **四个隔离级别**：RU 全不管；RC 避免脏读；RR（MySQL 默认）避免脏读 + 不可重复读、快照读避免幻读；SERIALIZABLE 全避免但并发最低。
- **MVCC 三件套**：隐藏列 DB_TRX_ID / DB_ROLL_PTR、Undo Log 版本链、ReadView 可见性规则。
- **RC 与 RR 的分水岭**：ReadView 生成时机——RC 每次 SELECT 重建，RR 事务内复用首个。
- **两类读**：快照读走 MVCC 无锁；当前读走最新版 + 加锁，RR 下靠 Next-Key Lock 补防幻读。
- **长事务危害**：Undo 无法 purge、版本链变长、回滚重、锁久持——生产务必监控并扼杀。

## 十、自测思考题

1. REPEATABLE READ 下，同一个事务第一次 SELECT 和第十次 SELECT，为什么看到的数据一致？从 ReadView 的生成时机解释，并对照 READ COMMITTED 说明差异。
2. 版本链上某行的 DB_TRX_ID = 15，当前事务的 ReadView 中 min_trx_id=10、max_trx_id=20、m_ids=[12,15]，且 15 在 m_ids 里。这一行对当前事务可见吗？顺着版本链往前找时，规则是什么？
3. 快照读和当前读分别适用哪些语句？为什么 SELECT ... FOR UPDATE 属于当前读，且 RR 下它仍需要 Next-Key Lock 才能真正防住幻读（提示：回顾 5.2）？
4. 如果一个事务开启后一直不提交，对 Undo Log、版本链长度、purge 线程分别有什么影响？给出一条能查出"已运行超过 30 秒事务"的 SQL（结合 7.2）。
5. 结合第③篇：假设事务里 UPDATE 了一行并触发了二级索引维护，随后 ROLLBACK。回滚会不会把索引改动一并撤销？为什么（提示：Undo 记录的是"行的前像"，索引由 InnoDB 内部一致维护）？

## 十一、面试高频考点清单

这一节把本篇内容按"面试官常怎么问、标准答法是什么"重新梳理一遍。不建议死背八股，机制理解透之后用自己的话讲出来才是真懂。下面每个考点都给"问法 + 核心答法要点 + 容易翻车的点"。

### 11.1 事务的 ACID 分别是怎么实现的

这是几乎必问的开场题。一句话答法：原子性靠 Undo Log 回滚，持久性靠 Redo Log（WAL 先写日志再刷盘），隔离性靠 MVCC（快照读无锁）+ 锁（当前读加锁），一致性由前三者加约束共同保证。两个常见追问：

- 如果只有 Redo Log 没有 Undo Log 行不行？不行。Redo 只能重放已提交的事务，遇到要回滚的未提交事务、或崩溃恢复时要撤销修改，必须靠 Undo。
- WAL 机制的好处是什么？把随机写数据页变成顺序写日志，吞吐量高几个数量级，且崩溃恢复逻辑更简单。

### 11.2 四种隔离级别和三大异常

必须能脱口而出：RU 全不管；RC 防脏读；RR（MySQL 默认）防脏读 + 不可重复读、快照读防幻读；Serializable 全防但并发最差。三个异常的区别是高频追问：脏读是读到别人未提交的数据；不可重复读是同一行前后两次读内容不一样（侧重"改"）；幻读是同一条件前后两次查、结果集行数变了（侧重"增/删"）。

```sql
-- 查看默认隔离级别（MySQL 8.0 用 transaction_isolation）
SELECT @@transaction_isolation;
```

### 11.3 MVCC 到底怎么实现可重复读

这是中高级岗的"镇场题"。核心三件套：每行隐藏列 DB_TRX_ID（最后修改它的事务 ID）和 DB_ROLL_PTR（指向 Undo Log 里的上一版本）；Undo Log 把旧版本串成版本链；事务快照读时生成 ReadView（含活跃事务列表 m_ids、min_trx_id、max_trx_id、creator_trx_id），按可见性规则顺着版本链找第一个自己该看的版本。RC 和 RR 的根本区别只有一点：ReadView 的生成时机——RC 每次 SELECT 都新建，RR 在事务第一次快照读时生成、之后复用，所以 RR 前后读到一致。

### 11.4 RR 下幻读到底解决没有（分水岭题）

这题是区分"真懂"和"背了十个字"的分水岭。标准答法分两层：快照读靠 MVCC 防住了幻读；当前读（UPDATE / DELETE / SELECT ... FOR UPDATE）靠 Next-Key Lock（记录锁 + 间隙锁）防住了幻读。但要点出：RR 并没有"完全"杜绝幻读——如果事务先快照读、再当前读（比如先普通 SELECT 判断某行不存在，再 UPDATE 它），就会看到本事务 UPDATE 带进来的"幻影行"。能举出这个反例，面试官会认为你真推演过，而不是只背了"MVCC 加间隙锁解决幻读"十个字。另外，很多互联网公司生产环境直接用 RC，因为 RC 不加间隙锁、并发更高、死锁更少，幻读交给业务层唯一约束或乐观锁兜底；被问"你们用哪个"时，答哪个都要能讲清代价。

### 11.5 Undo Log 和 Redo Log 的区别

必问对比题。Undo Log 在 InnoDB 引擎层、是逻辑日志（记反向操作）、负责回滚和支撑 MVCC、长事务会导致它无法被 purge 而膨胀；Redo Log 也在引擎层、是物理日志（记"某页某偏移改成某值"）、负责崩溃恢复保证持久性、循环写固定大小。两者都不跨引擎，而 Binlog 在 Server 层、所有引擎通用、负责主从复制和按时间点恢复、追加写——这一条留到第⑥篇展开，但面试常三者一起问，提前知道区别不吃亏。

### 11.6 长事务为什么是坑，怎么监控

追问题。长事务不提交，它启动前所有的 Undo 旧版本都不能被 purge，Undo 表空间持续膨胀、版本链变长导致快照读变慢、持有的锁久持易引发锁等待。监控用 information_schema.innodb_trx 按 trx_started 过滤出运行超时的连接，应用层用事务注解的超时参数兜底。

```sql
SELECT trx_id, trx_mysql_thread_id, trx_started
FROM information_schema.innodb_trx
WHERE trx_started < DATE_SUB(NOW(), INTERVAL 30 SECOND);
```

### 11.7 快照读和当前读

这俩分不清，前面所有题都讲不利索。普通 SELECT 是快照读，走 MVCC 无锁；SELECT ... FOR UPDATE / LOCK IN SHARE MODE / INSERT / UPDATE / DELETE 是当前读，读最新版并加锁。同一个事务里混用两者，正是 11.4 幻读反例的根源，写业务时要刻意避免"先普通 SELECT 判断、再 UPDATE"这种混用。

下一篇（五）我们将进入锁机制全解：MVCC 让快照读实现了无锁并发，但当前读和写写冲突终究要靠锁来仲裁。行锁、间隙锁、临键锁（Next-Key Lock）到底怎么配合、为什么 RR 下 UPDATE 一个范围会把间隙也锁住、死锁又是怎么形成的——那是紧接着本篇的另一座大山，我们下篇翻过去。
