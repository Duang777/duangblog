---
author: Duang
pubDatetime: 2026-08-06T10:30:00+08:00
title: MySQL 深度教学（三）：索引深度解析与高性能索引设计
featured: true
draft: false
tags:
  - MySQL
description: 覆盖索引、最左前缀、ICP 与 EXPLAIN：把索引怎么用、为什么失效讲清楚。
---

> **系列总览（共 10 篇）**
> ① 整体架构与一条 SQL 的旅程　② InnoDB 存储引擎核心原理（上一篇）　③ 索引深度解析与高性能索引设计（本篇）　④ 事务与 MVCC 多版本并发控制（下一篇）　⑤ 锁机制全解　⑥ 日志系统：Redo / Undo / Binlog 三件套　⑦ SQL 优化与执行计划（EXPLAIN）　⑧ 查询性能调优实战　⑨ 高可用与复制架构　⑩ 备份恢复、分库分表与运维实战

> 阅读目标：读完本篇，你应该能够回答三个问题——什么查询能用上索引、为什么有时候明明建了索引却没用、以及拿到一条慢 SQL 时该如何下手设计索引。本篇会反复让你用 `EXPLAIN` 亲手验证，而不是只停留在结论。

## 开篇：索引是 MySQL 性能的第一杠杆

上一篇（二）我们把 InnoDB 的存储底座彻底摸透了：数据在磁盘上按 B+Tree 组织，聚簇索引的叶子节点直接存整行数据、二级索引的叶子节点只存主键值（要拿完整行还得回表），页内靠页目录做二分定位，Doublewrite 兜住写断裂。换句话说，InnoDB 已经为你准备好了一棵能高效检索的 B+Tree——但光有这棵树还不够：你得知道怎么"用"它，才能让一条查询从全表扫描变成毫秒级定位。这正是索引要解决的问题。

<aside class="duang-whisper" aria-label="Duang">
  <div class="duang-whisper-jar-row">
    <img
      class="duang-whisper-jar"
      src="/images/childlike-sketch-jar.png"
      alt=""
      width="88"
      height="88"
      loading="lazy"
      decoding="async"
    />
    <span class="duang-whisper-jar-note">瓶子在看了</span>
  </div>
  <p class="duang-whisper-body">有人跟我说 AI coding 起飞了。我说那基本功的降落伞呢。</p>
  <p class="duang-whisper-sign">Duang</p>
</aside>

这正是第②篇结尾留给我们的待解问题：在 B+Tree 这块地基之上，索引到底该怎么用，才能让一条查询从全表扫描变成毫秒级定位？当时那篇的收尾预告里，已经把本篇要讲透的七个点列了出来，这里直接把它们变成"本篇要回答的问题"：

- 覆盖索引：为什么有时候"只查索引就够了"，连回表都不用；
- 最左前缀原则：联合索引里字段顺序为什么这么要命；
- 索引下推（ICP）：把过滤提前到存储引擎层，能少回表多少；
- 索引选择性：为什么给性别这种低区分度列建索引常常没用；
- 联合索引字段顺序：等值条件和范围条件，谁该排在前面；
- 哪些写法会让索引失效：函数、隐式转换、前导通配符这些坑；
- 怎么用 EXPLAIN 看索引到底用没用上、用得对不对。

一张表可能有几十个字段、上千万行数据，InnoDB 凭什么能在几十毫秒内从海量数据里捞出你想要的那么几行？答案就是索引（Index），而上面这七个问题，就是"用好索引"这件事的全部核心。

可以毫不夸张地说，对于大多数 OLTP 业务（增删改查为主、读多写少），性能问题 80% 都能用索引解决，剩下 20% 也多半和索引设计不当有关。很多慢 SQL、主库 CPU 飙高、锁等待，根子都在索引上。

所以这一篇，我们要把索引彻底讲透：它到底是什么、有哪些种类、怎么被组织、又会因为什么而失效、以及怎样从零设计出一个高性能索引。本篇默认你已理解第②篇的 B+Tree 与聚簇/二级索引，重点放在索引作为 B+Tree 时衍生出的设计问题和实践坑点。

## 一、索引的本质：排好序的数据结构

剥离掉所有术语，索引的本质只有一句话：它是为了加速查找，而把某一列（或多列）的值按某种顺序额外维护的一份数据结构。它和书的目录是同一个思路——你不用翻完整本书，先查目录，直接跳到对应页码。

在 MySQL 里，索引本身也是一份数据，也要占空间、也会随数据变更而维护。不同存储引擎支持的索引实现不同，而 InnoDB 的主力索引实现就是我们在第②篇详细讲过的 B+Tree（B 加树）。复习一下它为什么适合做索引：

- **矮胖的树**：一个 3 层的 B+Tree 就能放下上千万甚至上亿条记录，意味着一次查找最多 3 次磁盘 IO，这是它能秒级响应的根基。
- **叶子节点用双向链表串起来**：不仅支持等值查找，还天然支持范围查找（查 18 到 30 岁，找到 18 后顺着链表往后扫即可）。
- **非叶子节点只存键，不存数据**：单个节点能放下更多键，树更矮，IO 更少。
- **所有数据都在叶子层**：每次查找的 IO 次数稳定，性能可预测。

一个常被忽略的点：索引是"冗余数据"。它把同一份数据按另一种顺序又存了一遍，所以建索引一定会带来空间和写入开销——这也决定了后面"索引不是越多越好"的权衡逻辑。本篇后面会专门讲维护代价。

## 二、索引的分类体系

很多人被索引绕晕，是因为市面上有太多名词：主键索引、聚簇索引、二级索引、组合索引、唯一索引、覆盖索引、前缀索引、哈希索引……它们其实是从不同维度对索引做分类，彼此并不互斥。我们从三个维度来梳理。

### 2.1 按数据结构分

| 索引类型 | 说明与适用场景 |
|-|-|
| **B+Tree 索引** | InnoDB 默认且最通用的索引，支持等值、范围、排序、前缀匹配。几乎适用于所有场景。 |
| **哈希索引** | 基于哈希表，只支持等值匹配（=、IN），不支持范围、排序、模糊。InnoDB 的自适应哈希索引（AHI）是内部自动创建的，用户不能直接建哈希索引；Memory 引擎支持显式哈希索引。 |
| **全文索引** | 用于大段文本的模糊关键词检索（LIKE '%词%' 会很慢），InnoDB 5.6+ 支持。适合文章搜索等场景。 |
| **空间索引（R-Tree）** | 用于地理空间数据（点、线、面），GIS 场景下使用，日常业务少见。 |

### 2.2 按物理存储分（InnoDB 特有）

这是 InnoDB 最重要的一个分类视角，也是面试高频考点：

- **聚簇索引（Clustered Index）**：并不是一种单独创建的索引，而是 InnoDB 数据的组织形式。InnoDB 把整行数据直接挂在 B+Tree 的叶子节点上，所以"数据即索引，索引即数据"。每张表有且只有一个聚簇索引，默认是主键；没有主键时选第一个唯一非空索引；再没有就隐式生成一个 6 字节的 row_id 作为聚簇索引（第②篇讲过的隐藏列 DB_ROW_ID）。
- **二级索引（Secondary Index，也叫非聚簇索引、辅助索引）**：用户手动建的普通索引、唯一索引、组合索引，都属于二级索引。它的叶子节点不存整行，而是存索引列的值 + 主键值。这个"主键"不是白存的——它是回表时回聚簇索引找整行的钥匙。

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    聚簇叶子存整行、二级叶子存主键；要整行就回表。存储视角和功能视角别混。
  </div>
</details>

### 2.3 按逻辑/功能分

| 类型 | 含义 |
|-|-|
| **主键索引** | 建立在主键上的索引，InnoDB 用它作为聚簇索引。主键应选择短小、递增、不变的列（如 BIGINT 自增），原因在第②篇讲过：随机主键会导致页分裂。 |
| **唯一索引** | 列值必须唯一，允许 NULL（多个 NULL 不算重复）。比普通索引多一步唯一性校验，也因此用不了 Change Buffer（见第②篇）。 |
| **普通索引** | 最基础的索引，无唯一性约束。 |
| **组合索引（联合索引）** | 在多个列上建立的索引，列有序，遵循最左前缀原则（见第三节）。 |
| **覆盖索引** | 不是单独建的，而是一种状态：查询所需的所有列都包含在某索引中，无需回表。 |
| **前缀索引** | 对字符串列只取前 N 个字符建索引，节省空间，但无法用于 ORDER BY 和覆盖扫描。 |

> 重要认知：聚簇索引、二级索引是"存储视角"；主键、唯一、组合、覆盖是"功能视角"。同一个索引可以同时属于多个分类，比如"建立在 (a,b,c) 上的组合二级索引"。理清维度，名词就不乱了。

## 三、回表：二级索引绕不开的一步

理解了聚簇索引和二级索引的叶子差异，就必须理解一个核心动作：回表（Bookmark Lookup / 书签查找）。

当你通过二级索引查询，而 SELECT 里需要返回的列不全在二级索引中时，InnoDB 会：

1. 在二级索引的 B+Tree 上找到匹配的记录，拿到主键值；
2. 拿着主键值，回到聚簇索引的 B+Tree 再查一次，取出完整的行数据；
3. 把最终需要的列返回给服务层。

这一次"回到聚簇索引再查一次"的动作，就叫回表。它意味着多一次 B+Tree 查找（理想情况多一次 IO）。为什么是"理想情况"？因为如果聚簇索引那次查询的页不在 Buffer Pool，就又要去磁盘读，回表代价就不止一次内存查找了。可以用下面这条命令直观感受回表的存在：

```sql
EXPLAIN SELECT id, name FROM users WHERE age = 25;
-- 若 Extra 出现 "Using where; Using index" 表示覆盖（未回表）
-- 若只有 "Using where" 或出现 "Using index condition"，说明走了二级索引但需回表取列
```

回表本身不可避免，但要意识到：如果一次查询要回表几万行，性能会急剧下降（几万次额外的 B+Tree 查找 + 可能的几万次磁盘读）。所以优化方向就出来了——能不能不回表？这就是下一节"覆盖索引"要解决的问题。

> 一个反模式的典型：用 SELECT \* 配上一个二级索引。因为 SELECT \* 需要整行所有列，二级索引几乎永远覆盖不全，于是必然大量回表。能用具体列就不用 \*，既减少回表，也减少网络传输。这点在慢 SQL 优化里几乎是第一条铁律。

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    `SELECT *` + 二级索引 ≈ 几乎必回表。能写列名就别星号。
  </div>
</details>

## 四、组合索引与最左前缀原则（核心）

组合索引是面试和实战里最高频、也最容易用错的部分。我们花最多篇幅把它讲透。

### 4.1 组合索引长什么样

组合索引 (a, b, c) 在 B+Tree 里，是按照 a、b、c 的顺序拼成联合键来排序的。也就是说，它先按 a 排，a 相同再按 b 排，b 相同再按 c 排。可以把 (a,b,c) 想象成一个"复合字符串"来排序。这也意味着：这个索引天然能服务"按 a 查""按 a,b 查"，但单独"按 b 查"是无序的。

### 4.2 最左前缀原则

基于上面的排序方式，组合索引 (a, b, c) 能生效的查询条件是：必须从索引的最左边列开始，连续地匹配。具体哪些能用上、哪些用不上：

| WHERE 条件 | 能否用索引 | 用到的列 |
|-|-|-|
| WHERE a = 1 | ✅ 能用 | a |
| WHERE a = 1 AND b = 2 | ✅ 能用 | a, b |
| WHERE a = 1 AND b = 2 AND c = 3 | ✅ 能用 | a, b, c |
| WHERE b = 2 | ❌ 不能用（缺最左） | 无 |
| WHERE b = 2 AND c = 3 | ❌ 不能用（缺最左 a） | 无 |
| WHERE a = 1 AND c = 3 | ⚠️ 部分用（只用 a） | a |

为什么 WHERE b = 2 用不上 (a,b,c) 索引？因为 B+Tree 是先按 a 排的，b 的值在整个树里是无序的（只有 a 固定时 b 才有序）。索引无法在不指定 a 的情况下定位 b 的范围，只能全表扫描。这就是"最左"的含义。下面这条命令可以亲手验证：先建表建索引，再用 EXPLAIN 看 type 是不是 ALL（全表）：

```sql
CREATE TABLE t_demo (a INT, b INT, c INT, KEY idx_abc (a,b,c));
EXPLAIN SELECT * FROM t_demo WHERE b = 2 AND c = 3;
-- 预期：type=ALL，key=NULL，表示没走索引（全表扫描）
```

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    最左前缀：必须从最左列连续匹配；缺最左常直接 ALL。
  </div>
</details>

### 4.3 范围查询会"截断"后面的列

这是最容易被忽略的一点。当组合索引中某一列用了范围查询（>、<、BETWEEN、LIKE 'x%' 前缀匹配），那么该列之后的列就无法再用索引做等值定位了。原因和 4.2 一样：范围一旦确定，后续列在范围内的顺序对索引不再"连续可用"。

| WHERE 条件 | 说明 |
|-|-|
| WHERE a = 1 AND b > 10 AND c = 3 | 索引用到 a、b；c 用不上（被 b 的范围截断） |
| WHERE a > 1 AND b = 2 | 索引只用到 a（a 是范围，b 用不上） |
| WHERE a = 1 AND b = 2 AND c > 5 | 索引用到 a、b、c（c 是最后一列，范围无妨） |

实践含义：把等值查询的列放在组合索引前面，范围查询的列放在最后。例如业务中常按 city 等值、age 范围查，应建 (city, age) 而非 (age, city)。可以用 EXPLAIN 的 key_len 列验证到底用到了索引的前几列——key_len 越长，用到的列越多。

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    范围列会截断后面等值列；等值在前、范围在后。用 key_len 核对用到几列。
  </div>
</details>

### 4.4 组合索引列顺序怎么定

一个常见误解是"把选择性（区分度）最高的列放最左"。这句话只对了一半。正确的优先级是：

1. **先看查询形态**：哪些列是等值条件、哪些是范围条件。等值列放前面，范围列放后面（见 4.3）。
2. **再看最左覆盖**：让索引能覆盖到尽可能多的查询，避免缺最左导致整条索引失效。
3. **最后考虑选择性**：在满足前两条的前提下，把区分度更高的列尽量靠前，能更快缩小扫描区间。

> 经验公式：组合索引列顺序 ≈ (高频等值列) + (其他等值列，按选择性降序) + (范围列，放末尾)。但一切以你真实的 WHERE/ORDER BY/GROUP BY 为准，脱离查询模式谈顺序是纸上谈兵。

## 五、索引下推（ICP，Index Condition Pushdown）

ICP 是 MySQL 5.6 引入的一个优化，能显著减少回表次数。解释它最好的方式是对比"没有 ICP"和"有 ICP"。仍以组合索引 (a, b, c) 为例，查询：

```sql
SELECT * FROM t WHERE a = 1 AND b LIKE '%x%' AND c = 3;
```

- **无 ICP（旧版）**：存储引擎用 a=1 在索引里定位，然后把所有 a=1 的整行（通过回表）都读出来返回给服务层，由服务层再按 b LIKE '%x%' 和 c=3 过滤。即使 b、c 在索引里就有，也得先回表再判断。
- **有 ICP（默认开启）**：存储引擎在索引内部就直接用 b、c 的条件做过滤，只把真正满足的行回表取数据。减少了大量无谓的回表 IO。

判断 ICP 是否生效，看 EXPLAIN 的 Extra 列里有没有 **Using index condition**。注意它和"Using index"（覆盖索引）不是一回事：Using index 表示整条查询不需要回表；Using index condition 表示在索引内部多做了过滤、减少了回表，但仍可能需要回表取其他列。下一篇（SQL 优化与 EXPLAIN）会系统讲怎么读执行计划，本篇先建立"看到这个关键字就知道 ICP 生效了"的直觉。

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    ICP：索引内先过滤再回表。Using index condition ≠ Using index（覆盖）。
  </div>
</details>

## 六、覆盖索引：避免回表的终极手段

回到第三节的回表问题。如果一个索引本身就包含了查询所需的全部列，InnoDB 就不需要回表，直接在索引里就能把结果算出来。这种"查询所需列全部包含在某个索引中"的状态，就叫覆盖索引（Covering Index）。

```sql
-- 有组合索引 (age, name)
-- 查询的列 id(主键自带)、age、name 全在索引中，无需回表
SELECT id, age, name FROM users WHERE age = 25;
-- EXPLAIN 的 Extra 会显示：Using index
```

覆盖索引是性能优化里性价比极高的一招。很多"慢查询"之所以慢，就是因为差一个列导致无法覆盖，被迫回表几万次。一个常见技巧是：把查询中高频出现的列，纳入组合索引（但要注意索引变宽带来的写放大，见维护代价节）。

这里补一个容易被忽视的代价：InnoDB 的每个二级索引的叶子节点都带着主键。所以如果你选了一个很宽的主键（比如用一长串 UUID 当主键），那么表上的每一个二级索引的叶子都会跟着变胖——同一份数据，所有二级索引都背着这个宽主键。这也是第②篇强调"主键要短"的另一个原因：主键宽，不仅聚簇索引自己大，所有二级索引都跟着大。覆盖索引虽好，主键宽度这个隐藏成本要先算清楚。

> 口诀：能用覆盖索引就覆盖，能少回表就少回表。读 EXPLAIN 时，看到 Extra 里的 Using index 是好事（覆盖、零回表），看到 Using index condition 是 ICP（减少了回表），看到 Using where 通常是回表后在服务层过滤。

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    覆盖 = 所需列都在索引里，Extra 见 Using index，零回表。
  </div>
</details>

## 七、怎么验证索引到底生不生效：EXPLAIN 实战

前面讲了这么多"索引会用 / 不会用"，但判断的唯一权威工具是 EXPLAIN。这一节给你一套能直接跑的流程，亲手看索引生效和失效的差异。

### 7.1 建一套可复现的环境

```sql
CREATE TABLE emp (
  id    BIGINT PRIMARY KEY,
  name  VARCHAR(50),
  dept  VARCHAR(20),
  age   INT,
  KEY idx_dept_age (dept, age)
);
-- 插入一批数据后，务必先收集统计信息
ANALYZE TABLE emp;
```

### 7.2 对比：走索引 vs 全表扫描

先跑一条能命中组合索引 (dept, age) 的查询：

```sql
EXPLAIN SELECT * FROM emp WHERE dept = '研发' AND age = 30;
```

典型输出（列做了精简，重点是这几项）：

| id | type | key | rows | Extra |
|-|-|-|-|-|
| 1 | ref | idx_dept_age | 3 | Using index condition |

关键信号：**type=ref**（走了非唯一索引的等值查找，比 ALL 好很多）、**key=idx_dept_age**（确实用了我们建的索引）、**rows=3**（优化器估算只扫 3 行）。

再跑一条违反最左前缀的查询：

```sql
EXPLAIN SELECT * FROM emp WHERE age = 30;
```

典型输出：

| id | type | key | rows | Extra |
|-|-|-|-|-|
| 1 | ALL | NULL | 10000 | Using where |

关键信号：**type=ALL**（全表扫描）、**key=NULL**（没用任何索引）、**rows=10000**（扫了整张表）。这就是"建了索引却没用"的可观察证据。type 从 ref 退化成 ALL、key 从有值变 NULL，是诊断索引失效最直接的两条线索。

### 7.3 type 列的取值梯队

EXPLAIN 的 type 列描述"访问类型"，从好到差大致是：system > const > eq_ref > ref > range > index > ALL。日常调优关注的临界点是：

- **ref / range**：正常走了索引，range 表示用了范围（如 IN、BETWEEN、>）。
- **index**：全索引扫描（比全表好一点，因为索引通常比表小，但仍是扫全部）。
- **ALL**：全表扫描，慢查询的头号信号，优先排查。

记住这个流程：怀疑索引没生效 → EXPLAIN 这条 SQL → 看 type 是不是 ALL、key 是不是 NULL、rows 是不是接近全表 → 据此反推是违反了最左前缀、还是列被函数包了、还是优化器估算命中太多干脆走了全表。

<details class="marginalia interview" open>
  <summary></summary>
  <div class="marginalia-body">
    先 EXPLAIN：type=ALL / key=NULL / rows≈全表，就是索引没真正帮上忙。
  </div>
</details>

## 八、选择性、Cardinality 与统计信息

4.4 提到"选择性"，但它到底从哪来？为什么有时候你明明建了完美的最左索引，优化器却还是选了全表扫描？答案藏在统计信息里。

### 8.1 什么是 Cardinality

Cardinality（基数）指索引列中"不重复值"的近似数量。选择性 = Cardinality / 总行数，越接近 1 区分度越高。可以用下面这条命令看每个索引的 Cardinality：

```sql
SHOW INDEX FROM emp;
-- 结果里的 Cardinality 列即该索引的估算基数
```

注意 Cardinality 是估算值，不是精确统计。InnoDB 不会真的去数一遍，而是按 \`innodb_stats_persistent_sample_pages\`（默认 20 个页）采样估算。采样页太少，估算可能严重失真。

### 8.2 统计信息过期会导致"有索引不用"

当表数据变化很大、但统计信息很久没更新时，优化器可能误判：它以为用索引要回表 90% 的行，而全表扫描反而"看起来更便宜"，于是弃用索引。这种场景下，你建的索引是对的，但优化器被旧统计信息骗了。解决办法：

```sql
ANALYZE TABLE emp;   -- 重新采样，刷新 Cardinality 和直方图
```

在 8.0 里，统计信息默认持久化（\`innodb_stats_persistent=ON\`），不会每次重启都重算，所以更需要主动 \`ANALYZE\`。如果发现某张大表索引时灵时不灵，第一反应就该是统计信息是否过期。

### 8.3 数据倾斜：优化器的另一个判断依据

即使统计信息新鲜，如果某列取值极度倾斜（比如 status 只有 0/1，其中 99% 是 1），那么 \`WHERE status = 1\` 命中了绝大多数行，优化器判定"走索引还要回表近全表，不如直接扫"，就会放弃索引——这正是第八节十大场景里"优化器判定全表更快"的底层逻辑。应对方式：缩小查询范围、用覆盖索引避免回表、或用第 8.0 的直方图帮优化器更准地估算倾斜列的分布：

```sql
ANALYZE TABLE orders UPDATE HISTOGRAM ON status WITH 100 BUCKETS;
```

## 九、索引合并（Index Merge）

第八节失效场景里有一条"OR 连接非索引列会导致整体放弃索引"。但有个例外值得单独讲：当 OR 连接的多个列各自都有索引时，MySQL 可能会用 Index Merge 把多个索引的结果合并起来，而不是退化成全表扫描。

Index Merge 有三种类型：

- **Intersection（交集）**：对应 AND 条件，例如 `WHERE a=1 AND b=2`，且 a、b 各有单列索引，分别扫两个索引再取交集。
- **Union（并集）**：对应 OR 条件，例如 `WHERE a=1 OR b=2`，各扫各的索引再合并去重。这正是"OR 场景"的另一种解法。
- **Sort-Union**：Union 的变体，用于 OR 条件但索引返回的不是有序主键时，先排序再合并。

```sql
EXPLAIN SELECT * FROM t WHERE a = 1 OR b = 2;
-- Extra 出现 "Using union(idx_a,idx_b)" 即走了 Index Merge Union
```

Index Merge 是优化器的"补救"手段，说明你可能缺一个覆盖 (a,b) 的组合索引。组合索引通常比 Index Merge 更高效（一次 B+Tree 遍历搞定，不用合并），所以看到 Using union/intersection，往往是个"该建组合索引"的信号，而不是值得高兴的事。

## 十、优化器选错索引怎么办：索引提示与 optimizer_trace

有时候索引是对的、统计信息也新鲜，但优化器就是选了次优甚至全表的计划。这种情况在复杂查询、多索引表上时有发生。除了更新统计信息，你还有两把更硬的扳手。

### 10.1 索引提示（Index Hint）

用 SQL 层面的提示强制优化器用或不用某个索引：

```sql
-- 强制使用某个索引
SELECT * FROM orders FORCE INDEX (idx_user_status) WHERE user_id = 1 AND status = 2;

-- 建议用（优化器可否决）某个索引
SELECT * FROM orders USE INDEX (idx_user_status) WHERE user_id = 1;

-- 明确忽略某个索引
SELECT * FROM orders IGNORE INDEX (idx_old) WHERE user_id = 1;
```

FORCE 是"强制、优化器通常照做"，USE 是"建议、优化器可否决"，IGNORE 是"别用它"。注意索引提示是应急手段，不是长久设计——它把本该由优化器决定的事硬编码进了 SQL，一旦索引改名或删了，SQL 会直接报错。优先还是把索引和统计信息设计对。

### 10.2 用 optimizer_trace 看优化器为什么这么选

想知道优化器到底在几个候选计划里怎么权衡的，可以打开追踪：

```sql
SET optimizer_trace = 'enabled=on';
SELECT * FROM orders WHERE user_id = 1 AND status = 2;
SELECT * FROM information_schema.OPTIMIZER_TRACE\G
SET optimizer_trace = 'enabled=off';
```

输出里的 `rows_estimated`、`cost_info`、`chosen` 字段会告诉你每个候选索引的估算行数和代价，以及最终为什么选了它、又为什么放弃了另一个。这是定位"明明有更好的索引却不用"的根因时最彻底的武器——比猜强得多。

## 十一、前缀索引：大字符串的省空间方案

对 VARCHAR(255)、TEXT 这类长字符串建索引，整列建索引会非常占空间（索引也是数据，越大越占内存和磁盘，且让二级索引叶子更胖）。前缀索引只取字符串的前 N 个字符建索引。

```sql
-- 对 email 的前 10 个字符建索引
ALTER TABLE users ADD INDEX idx_email (email(10));
```

关键问题是：N 取多少合适？原则是前缀的选择性要接近完整列的选择性。可以用下面这段 SQL 来测算：

```sql
-- 完整列的选择性（越接近 1 越好）
SELECT COUNT(DISTINCT email) / COUNT(*) FROM users;

-- 前缀长度为 10 时的选择性
SELECT COUNT(DISTINCT LEFT(email, 10)) / COUNT(*) FROM users;

-- 依次增加长度，找到选择性接近完整列、又尽可能短的那个 N
```

前缀索引的代价：它无法用于 ORDER BY 和 GROUP BY（前缀排序不等于整体排序），也无法用于覆盖扫描（因为只存了前缀，得回表取完整值）。所以前缀索引是"用功能换空间"的取舍，只在列确实很长、且不需要按它排序时才划算。

## 十二、索引失效的十大场景

这是实战中踩坑最多的部分。很多同学说"我明明建了索引，怎么还是全表扫描"，原因几乎都在这十种情况里。每一个都可以用第七节的方法 EXPLAIN 亲自验证。

| 失效场景 | 原因 | 正确写法 |
|-|-|-|
| 对索引列做函数运算 | WHERE YEAR(createtime) = 2024，索引列被函数包裹，无法走索引 | 改成范围：createtime >= '2024-01-01' AND createtime < '2025-01-01' |
| 对索引列做表达式运算 | WHERE age + 1 = 20，索引列参与运算 | WHERE age = 19 |
| 隐式类型转换 | phone 是字符串但有索引，WHERE phone = 13800000000（数字），MySQL 会转成 CAST(phone AS signed)，等于对列做函数 | WHERE phone = '13800000000' |
| 隐式字符集转换 | 两表 JOIN 字符集不同，一方被转换，索引失效 | 统一两表字符集/排序规则 |
| 前导模糊查询 | WHERE name LIKE '%明'，最左字符不定，无法定位 | 用后缀或全文索引；LIKE '张%' 可以走索引 |
| 违反最左前缀 | 索引 (a,b,c)，查询只用 b、c | 把 a 补进条件，或调整索引顺序 |
| 范围列后面的列 | 索引 (a,b)，WHERE a > 1 AND b = 2，b 用不上 | 等值列放前，范围列放后 |
| 负向查询 | WHERE status != 1、NOT IN、NOT EXISTS 通常走不了索引 | 改写成正向条件或覆盖其他过滤 |
| OR 连接非索引列 | WHERE a = 1 OR b = 2，b 无索引则整体放弃索引（注意：若 a、b 各有索引，可能走 Index Merge，见第九节） | 分别查再 UNION，或给 b 也建索引 |
| 优化器判定全表更快 | 查询命中数据量过大（如超过约 20%\~30% 表），或统计信息过期/列倾斜，优化器认为全表更便宜 | 缩小查询范围、ANALYZE TABLE、用覆盖索引避免回表、必要时 FORCE INDEX |

> 记住一个统一的心法：只要索引列在 WHERE 里"原封不动"地出现在等号或范围的一边，索引才有望生效；一旦它被函数、运算、类型转换动过，索引就基本废了。再配合 EXPLAIN 看 type=ALL、key=NULL，就能 100% 确认是否失效。

## 十三、MySQL 8.0 索引新特性

如果你用的是 MySQL 8.0（新项目推荐直接用 8.0），有几个很有用的索引能力：

### 13.1 不可见索引（Invisible Index）

把索引设为对优化器"不可见"，但物理上仍然维护。用它来安全地验证"删掉这个索引会不会变慢"：

```sql
-- 先设为不可见，观察业务是否变慢
ALTER TABLE orders ALTER INDEX idx_old INVISIBLE;

-- 没问题再真正删除；若出事一行命令改回可见
ALTER TABLE orders ALTER INDEX idx_old VISIBLE;
```

### 13.2 降序索引（Descending Index）

8.0 开始真正支持 DESC 排序的索引结构（之前写法上支持但底层仍是升序，靠额外排序）。对 ORDER BY a ASC, b DESC 这类混合排序，建 (a, b DESC) 索引可以免去 filesort。

### 13.3 函数索引（Functional Index）

8.0 支持基于表达式建索引，直接解决了第十二节"对列做函数导致失效"的问题：

```sql
-- 对 YEAR(createtime) 建函数索引，WHERE YEAR(createtime)=2024 就能走索引了
CREATE INDEX idx_year ON orders ((YEAR(createtime)));
```

### 13.4 直方图（Histogram）

8.0 支持为列单独建直方图，帮助优化器更准确地估算倾斜列的数据分布，缓解"统计信息不够细导致选错计划"的问题。用法见第八节 8.3。

## 十四、三星索引设计理论

业界有一套经典的"三星索引"理论（出自《Relational Database Index Design and the Optimizers》一书），用来衡量一个索引设计得有多好。一颗索引最多得三星：

- **第一星（减少扫描）**：索引能最大限度地过滤掉不需要的行。也就是说，WHERE 里的等值/范围列尽量放进索引，越靠前过滤越强。
- **第二星（避免排序）**：ORDER BY / GROUP BY 的列也放进索引，且顺序匹配，从而避免额外的 filesort 排序。
- **第三星（避免回表）**：SELECT 所需的列全部包含在索引中，形成覆盖索引，彻底省掉回表。

现实中"三星全满"往往意味着索引很宽、列很多，会加大写放大和存储空间。所以三星是理想目标，实际要在查询性能和写入成本之间做权衡（见下一节）。

## 十五、索引设计实战演练

光讲理论不够，我们来做一个完整的设计推演。假设有一张订单表：

```sql
CREATE TABLE orders (
  id BIGINT PRIMARY KEY,
  user_id BIGINT,
  status TINYINT,
  amount DECIMAL(10,2),
  created_at DATETIME,
  province VARCHAR(20)
);
```

业务里最高频的查询是：

```sql
SELECT id, amount, created_at
FROM orders
WHERE user_id = 123 AND status = 1
ORDER BY created_at DESC
LIMIT 20;
```

套用三星理论一步步设计：

1. **第一星**：过滤条件是 user_id = ? 和 status = ?，都是等值，放进索引前面 → (user_id, status)。
2. **第二星**：ORDER BY created_at DESC，把它接在等值列后面 → (user_id, status, created_at DESC)。这样排序直接由索引满足，无需 filesort。
3. **第三星**：SELECT 需要 id、amount、created_at。id 是主键自带；created_at 已在索引里；差一个 amount。把 amount 也加进索引 → (user_id, status, created_at DESC, amount)。这样整条查询完全覆盖、零回表。

```sql
CREATE INDEX idx_user_status_time_amt
  ON orders (user_id, status, created_at DESC, amount);
```

设计完别拍脑袋，用 EXPLAIN 验证一下是否真的达成三星：

```sql
EXPLAIN SELECT id, amount, created_at
FROM orders
WHERE user_id = 123 AND status = 1
ORDER BY created_at DESC LIMIT 20;
```

| 观察项 | 期望结果 | 对应星 |
|-|-|-|
| key = idx_user_status_time_amt | 用了我们建的索引 | 第一星 |
| Extra 无 Using filesort | 排序由索引满足，没额外排序 | 第二星 |
| Extra 含 Using index | 覆盖索引，没回表 | 第三星 |

如果三者同时出现，说明这条索引把三星拿满了。如果 Extra 里还有 Using where，说明可能还有列需要纳入覆盖；如果有 Using filesort，说明排序列没接在索引合适的位置。EXPLAIN 是检验设计成败的唯一标准。

> 设计完成后要权衡：这个索引有 4 列，每次写入订单都要维护它，写成本比单列索引高。但如果这是核心读路径、查询量远大于写入量，多花这点写成本换极致的读性能，通常是划算的。索引设计永远是读写权衡。

## 十六、索引的维护代价

索引不是免费的。每一个索引，都会在数据增删改时同步维护，带来三笔账：

- **空间成本**：索引本身是数据，一张表建十几个索引，磁盘和 Buffer Pool 都会被占用（还记得第六节说的：宽主键会让所有二级索引更胖）。
- **写放大**：INSERT/UPDATE/DELETE 时，所有相关索引的 B+Tree 都要更新。索引越多，写越慢。
- **页分裂与碎片**：特别是当主键不是递增的（比如用 UUID 做主键），插入会导致 B+Tree 频繁页分裂、产生碎片，读写效率下降。这也是第②篇强调"主键用递增短整型"的原因。

所以在生产环境，要定期审视冗余和闲置索引。下面几条命令能直接帮你定位该删的索引：

```sql
-- 冗余索引：例如已有 (a,b) 又建了 (a)，(a) 即冗余
SELECT * FROM sys.schema_redundant_indexes;

-- 长期未被使用的索引（需先开启 performance_schema 相关采集）
SELECT * FROM sys.schema_unused_indexes;

-- 索引的使用统计：多少次读、多少次更新
SELECT * FROM performance_schema.table_io_waits_summary_by_index_usage
WHERE object_schema = 'your_db' AND index_name IS NOT NULL;
```

维护的判断原则：

- (a, b) 和 (a) 同时存在时，(a) 是冗余的（(a,b) 已经能覆盖 a 的查询），可以删掉 (a)。
- 通过 `sys.schema_unused_indexes` 发现长期零访问的索引，结合业务确认后删除，能明显减轻写放大。
- 删之前，优先用第十三节的"不可见索引"先观察一阵，确认无误再真正 DROP，避免误删导致线上慢查询。

## 十七、小结与下篇预告

本篇我们彻底拆解了索引：

- 索引本质是"排好序的数据结构"，InnoDB 的主力实现是 B+Tree；它也是冗余数据，带来空间与写开销。
- 从数据结构、物理存储（聚簇/二级）、逻辑功能三个维度给索引分类，理清名词维度就不乱了。
- 二级索引查询会回表，覆盖索引能避免回表；主键宽度会隐性撑胖所有二级索引。
- 组合索引遵循最左前缀，范围列会截断后续列，列顺序要等值在前、范围在后；顺序优先级是查询形态 > 最左覆盖 > 选择性。
- ICP 把过滤下推到引擎层减少回表；Index Merge 是优化器对 OR/AND 多索引的合并补救。
- 判断索引生不生效的唯一权威是 EXPLAIN：看 type 是否退化成 ALL、key 是否为 NULL、rows 是否接近全表；Cardinality 与统计信息过期会让优化器弃用正确索引。
- 列举了索引失效的十大场景，以及 8.0 的不可见/降序/函数索引、直方图。
- 用三星理论 + 实战演练（并用 EXPLAIN 验证三星达成）给出索引设计方法，并提醒索引有空间、写放大、碎片三重代价，要用 sys 视图定期清冗余。

下一篇（四）我们将进入事务与 MVCC：当你理解了索引如何加速读，就会发现"并发读写同时发生"会带来一系列一致性难题——脏读、不可重复读、幻读到底是什么，InnoDB 又如何用 MVCC（多版本并发控制）+ Undo Log 在"不加锁"的情况下实现可重复读。那是另一座大山，我们下篇翻过去。

## 十八、自测思考题

1. 聚簇索引和二级索引的叶子节点分别存什么？为什么二级索引查询常常需要回表？如果主键用 UUID 而不是自增 BIGINT，对二级索引有什么隐性影响（提示：回顾第六节）？
2. 组合索引 (a, b, c)，下列查询分别能用上哪些列：WHERE a=1 AND b>2 AND c=3；WHERE b=1 AND c=2；WHERE a>1 AND b=2？请用 EXPLAIN 亲手验证你的判断（type 和 key 应该是什么）。
3. 为什么对索引列使用函数（如 WHERE YEAR(created_at)=2024）会让索引失效？MySQL 8.0 提供了什么机制来优雅解决？统计信息过期又会导致哪种"有索引却不用"的现象？
4. 什么是覆盖索引？EXPLAIN 的 Extra 里出现 Using index 与 Using index condition 分别意味着什么？假设你设计的索引让 Extra 同时出现了 Using index 且无 filesort，说明三星里哪几颗星达成了？
5. 给你一张表 t(id PK, a, b, c)，高频查询是 SELECT a,b FROM t WHERE a=? AND b=? ORDER BY c DESC。请设计一颗尽可能接近"三星"的索引，并用 EXPLAIN 的哪些字段来证明三星达成。

## 十九、面试高频考点清单

索引是后端岗面试里出现频率最高的模块，没有之一。上面十八章把原理、设计、失效、验证都讲透了，这一节把最常问、最容易被追问的点单独拎出来，按出现频率从高到低排。配合正文一起看，面试时基本能应对绝大多数索引题。

### 考点 1：为什么 InnoDB 用 B+树，而不用 B树 / 哈希 / 红黑树

这是索引题的"开场白"，几乎是必问。核心在三个对比：

- 比 B树：B+树的非叶子节点只存索引键、不存数据，同样 16KB 的页能放下更多键值，扇出更大、树更矮（3 层就能存千万级记录），磁盘 I/O 次数更少；而且 B+树叶子节点通过双向链表串联，范围查询、排序、分组是顺着链表扫，B树没有这层链表，只能中序遍历整棵树，范围查询差一个量级。
- 比哈希：哈希索引只支持等值查询（=、IN），不支持范围、排序、前缀匹配，还有哈希冲突退化问题。OLTP 业务里范围查询和 ORDER BY 是常态，哈希根本扛不住。
- 比红黑树：红黑树是内存数据结构，树高随数据量线性增长，千万级数据可能要 20 多层，每层一次磁盘 I/O，完全不可接受；B+树是"矮胖多叉"，3 层够用。

一句话记忆：B+树矮胖多叉、叶子有序连成链、范围查询快、三层能存千万级。追问常是"那等值查询哈希 O(1) 不比 B+树快吗"——答：哈希场景太窄，OLTP 以范围/排序为主，B+树综合最优。

### 考点 2：聚簇索引 vs 二级索引，回表，覆盖索引

这组概念是最容易混的，要能张口就说清三者关系。聚簇索引的叶子节点直接存整行数据，每张表有且只有一个，数据行的物理存储顺序和聚簇索引的逻辑顺序一致。二级索引（除了主键之外的所有索引）的叶子节点只存索引列的值 + 主键值，要拿完整行必须拿主键再回一次聚簇索引，这就是回表。如果查询需要的所有列都已经在索引里（比如 SELECT id, name FROM user WHERE name='张三'，name 索引叶子自带 id 和 name），就不需要回表，这叫覆盖索引，EXPLAIN 的 Extra 里会显示 Using index。

高频追问：为什么 "SELECT \* 走二级索引" 常常比 "走聚簇索引" 还慢？因为二级索引拿到的只是主键，还得再回表取其他列，多了一次随机 I/O；而且主键越宽，每个二级索引叶子节点里存的主键值就越大，所有二级索引跟着变胖——这一点和上一篇讲 InnoDB 时说的"主键要紧凑"完全呼应。

### 考点 3：最左前缀原则，以及"范围查询会截断后续列"这个高频坑

联合索引 (a, b, c) 的 B+树是先按 a 排序、a 相同再按 b、b 相同再按 c，所以查询必须从最左列开始、且不能跳列。常见判断：

- WHERE a=1 AND b=2 AND c=3：三列全用上。
- WHERE b=2：完全用不上（跳过了 a，B+树按 b 无序）。
- WHERE a=1 AND c=3：只用上 a，c 用不上（跳过了 b）。

真正的坑在范围列：遇到范围查询（>、<、BETWEEN、LIKE 'abc%'）之后，后面的列索引就失效了。比如 (a, b, c)，WHERE a=1 AND b>2 AND c=3 实际只用到 a 和 b，c 用不上；因为 b>2 是一个区间，区间内 c 是无序的，B+树没法利用有序性定位 c。但 WHERE a>=1 AND b=2 能用到 a 和 b，因为 >= 含有一个等值边界点 a=1，在那个点上 b 仍然有序。

验证手段就是 EXPLAIN 的 key_len：它能告诉你索引实际用到了多少列。设计联合索引的硬原则——等值条件列放前面，范围条件列放最后。

### 考点 4：索引失效的常见场景

这道题通常要求现场列举，至少要能说出下面几条，并讲清各自的原理：

- 对索引列使用函数或表达式：WHERE YEAR(created_at)=2024，索引是按原始值排的，套了函数之后 B+树的有序性被破坏，只能全表扫描。MySQL 8.0 可以用函数索引（CREATE INDEX idx ON t ((YEAR(created_at)))）优雅解决。
- 隐式类型转换：字符串列 phone 用数字查 WHERE phone=12345，MySQL 会把 phone 转成数字，相当于对列用了函数，索引失效。必须写成 WHERE phone='12345'。
- 前导通配符：LIKE '%abc' 开头是通配，B+树没法从中间定位；LIKE 'abc%' 前缀匹配是能走索引的。
- OR 连接了未索引列：WHERE id=1 OR name='张三'，如果 name 没索引，优化器为了稳妥直接全表扫描（除非走 Index Merge，见考点 8）。
- 数据分布极度不均：比如性别字段，区分度极低，优化器测算走索引还不如全表扫描快，会主动弃用索引。这和第⑧篇讲的 Cardinality 与统计信息直接相关。

### 考点 5：索引下推（ICP，Index Condition Pushdown）

这是 5.6 引入的优化，专门减少二级索引的回表次数。没有 ICP 时，存储引擎按最左前缀在二级索引里找到 N 条符合条件的记录，把这 N 条全部回表交给 Server 层，Server 层再用 WHERE 里的其他条件过滤，剩下 M 条。有了 ICP，Server 层会把"能用索引列判断的条件"下推给存储引擎，在遍历二级索引时就先过滤掉不满足的记录，只对最终满足的 M 条回表。回表次数从 N 降到 M，I/O 明显变少。

判断是否生效看 EXPLAIN 的 Extra 列，出现 Using index condition 就是触发了。限制：ICP 主要作用在二级索引上，且不支持子查询、存储函数等复杂条件。

```sql
-- 联合索引 (name, age)，查询 WHERE name LIKE '张%' AND age > 30
-- 无 ICP：索引先按 name 定位，age 条件在 Server 层过滤，回表多条
-- 有 ICP（默认开启）：age > 30 下推到引擎层，索引遍历时就过滤
-- Extra 出现 Using index condition 即生效
EXPLAIN SELECT * FROM user WHERE name LIKE '张%' AND age > 30;
```

### 考点 6：联合索引的顺序该怎么设计

原则按优先级排：第一，查询形态优先，等值条件列放最左、范围条件列放最后（回看考点 3）；第二，在满足最左前缀能覆盖的前提下，把区分度高的列往前放，能更快缩小扫描范围；第三，别忘了主键宽度会隐性撑胖所有二级索引（呼应第②篇），所以主键要紧凑，间接影响索引效率。常见反例就是把经常做范围查询的时间列放在联合索引第二位，导致后面的列全失效。

### 考点 7：为什么推荐自增主键、不推荐 UUID

聚簇索引的数据是按主键顺序物理排列的。自增主键是单调递增的，新数据基本都是追加写入最后一个页，极少触发页分裂，碎片少，二级索引叶子存的主键值也小，省空间。UUID 是无序的，每次插入都可能落到已写满的页中间，频繁触发页分裂和页重排，产生大量碎片；同时 UUID 占用空间大，会把所有二级索引叶子节点撑大，空间和性能双重恶化。所以主键用自增 BIGINT 或雪花算法这类趋势递增的值，比随机 UUID 好得多。

### 考点 8：Index Merge 是什么，看到它说明什么

Index Merge 指一条 SQL 同时使用了多个单列索引，再把结果合并（union 或 intersection）。最常见于 OR 连接的多个条件各自都有单列索引，比如 WHERE a=1 OR b=2，优化器分别走 idx_a 和 idx_b 再合并。它本质上是优化器对"该建联合索引却没建"的一种补救——看到 Index Merge 往往是个信号：你应该把这几个单列索引合并成一个联合索引，性能通常更好。这一点和第⑨节讲 Index Merge 的底层逻辑完全对应。

把上面八个考点和本篇正文对照着过一遍，索引这一块在面试里基本就稳了。下一篇（四）我们会从"读得快"切换到"并发读写不出错"，进入事务与 MVCC——那是另一座大山。
