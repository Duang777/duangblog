import type { LingoTerm } from "./types";

/** MySQL / InnoDB domain pack. */
export const MYSQL_LINGO: LingoTerm[] = [
  {
    id: "buffer-pool",
    title: "Buffer Pool",
    subtitle: "缓冲池",
    definition:
      "InnoDB 的主内存缓存，按页（默认 16KB）缓存表数据与索引页。读请求先查 Buffer Pool：命中则直接返回，未命中才从 tablespace 把页读入内存并留下供后续复用。\n\n写请求通常先改缓存中的页，使之成为脏页，同时把变更记入 redo；脏页由后台线程异步刷回磁盘。Buffer Pool 命中率、脏页比例和刷脏能力，直接决定 InnoDB 的读写表现。",
    aliases: ["Buffer Pool", "缓冲池"],
  },
  {
    id: "tablespace",
    title: "Tablespace",
    subtitle: "表空间",
    definition:
      "Tablespace 是存放数据库对象实际数据的存储位置。它在物理文件与逻辑对象（表、索引等 segment）之间提供一层抽象：创建 tablespace 后，可以按名称把表或索引放到指定存储位置。\n\nTablespace 管的是“数据落在哪块存储”，不是 schema 本身。InnoDB 里常见系统表空间（如 ibdata1）以及开启 file-per-table 后每张表一个 .ibd 的独立表空间。",
    aliases: ["独立表空间", "系统表空间", "表空间", "Tablespace", "tablespace", "ibdata1", ".ibd"],
    source: {
      label: "Wikipedia: Tablespace",
      url: "https://en.wikipedia.org/wiki/Tablespace",
    },
  },
  {
    id: "innodb",
    title: "InnoDB",
    subtitle: "MySQL / MariaDB storage engine",
    definition:
      "InnoDB 是 MySQL 与 MariaDB 的存储引擎。自 MySQL 5.5.5 起取代 MyISAM 成为默认表类型，提供 ACID 事务、外键（声明式引用完整性），并支持 tablespace 等能力。\n\n在 MySQL 分层架构里，Server 层负责解析与优化 SQL，InnoDB 负责页面组织、缓冲、行锁、MVCC 与崩溃恢复。本系列后续讨论默认都以它为对象。",
    aliases: ["InnoDB"],
    source: {
      label: "Wikipedia: InnoDB",
      url: "https://en.wikipedia.org/wiki/InnoDB",
    },
  },
  {
    id: "redo-log",
    title: "Redo Log",
    subtitle: "重做日志",
    definition:
      "InnoDB 引擎层的物理日志，记录对数据页的变更（改了哪个页、改成什么），而不是完整 SQL。更新时通常先改 Buffer Pool 中的页，同时把变更写入 redo；真正把脏页刷回 tablespace 可以稍后进行。\n\n这遵循 write-ahead logging：redo 先持久化，崩溃后才能靠它重放已提交但未落盘的修改。文件常见为循环写入的 ib_logfile*。它和 Server 层 binlog 职责不同，二者提交要用两阶段提交对齐。",
    aliases: ["redo log", "Redo Log", "redo", "重做日志"],
  },
  {
    id: "undo-log",
    title: "Undo Log",
    subtitle: "回滚日志",
    definition:
      "InnoDB 在修改行之前保存的旧版本信息。事务 ROLLBACK 时用它恢复改前状态；MVCC 快照读也靠它构造对其他事务可见的旧镜像。\n\n旧版本会串成版本链，由 purge 等机制回收已无用部分。undo 通常在独立的 undo tablespace（或历史配置下的系统表空间区域）中管理。没有正确的 undo，回滚和一致性读都会出问题。",
    aliases: ["Undo Log", "undo log", "undo", "回滚日志"],
  },
  {
    id: "binlog",
    title: "Binlog",
    subtitle: "二进制日志",
    definition:
      "MySQL Server 层的逻辑日志，记录已提交事务做了什么（statement / row / mixed 等格式）。复制时源库把 binlog 事件传给副本重放；备份体系也可拿它做时间点恢复。\n\nbinlog 不属于 InnoDB 内部。引擎崩溃恢复靠 redo；跨实例复制与逻辑恢复靠 binlog。同一事务两者都写时，通过内部两阶段提交保证“引擎已提交”和“binlog 可复制”的集合一致。",
    aliases: ["Binlog", "binlog", "二进制日志"],
  },
  {
    id: "wal",
    title: "WAL",
    subtitle: "Write-ahead logging",
    definition:
      "Write-ahead logging 是数据库用来保证原子性与耐久性的一类技术：变更先写入追加型日志并落到稳定存储，之后才把对应修改写回数据库文件。\n\n这样页面缓存可以先缓冲更新，崩溃后仍能根据日志重建丢失的内存中变更。系统还会做 checkpoint，把日志中的变更推进到数据文件并回收日志空间。InnoDB 的 redo 通路就是 WAL 在引擎里的主要落点。",
    aliases: ["WAL"],
    source: {
      label: "Wikipedia: Write-ahead logging",
      url: "https://en.wikipedia.org/wiki/Write-ahead_logging",
    },
  },
  {
    id: "checkpoint",
    title: "Checkpoint",
    subtitle: "检查点",
    definition:
      "把“日志里已经可以认为安全落盘的进度”记下来的恢复边界。做完 checkpoint 后，崩溃恢复不必从日志开头全量重放，只需从检查点之后继续。\n\n在 InnoDB 里，检查点推进和刷脏、redo 循环复用绑在一起：脏页刷得越及时，检查点越能前移，redo 空间也越好回收。脏页长期堆积会拖住检查点，推高写压力。",
    aliases: ["Checkpoint", "检查点"],
  },
  {
    id: "dirty-page",
    title: "脏页",
    subtitle: "Dirty page",
    definition:
      "在计算机系统里，若某块内存相对后端存储已被修改且尚未写回，就会被标为 dirty（常见实现是 dirty bit）。替换或淘汰这块内存前，通常要先写回，否则改动会丢。\n\nInnoDB Buffer Pool 中已修改、尚未写回 tablespace 的页就是脏页。更新往往先改内存并记 redo，再由 Page Cleaner 等后台机制异步刷脏；脏页堆积会影响可用缓存和检查点推进。",
    aliases: ["脏页"],
    source: {
      label: "Wikipedia: Dirty bit",
      url: "https://en.wikipedia.org/wiki/Dirty_bit",
    },
  },
  {
    id: "mvcc",
    title: "MVCC",
    subtitle: "Multiversion concurrency control",
    definition:
      "Multiversion concurrency control 通过为数据保留多个版本来做并发控制。写事务创建新版本，而不是简单覆盖唯一副本；读事务按隔离级别看到某个时间点的快照，从而减少读写互相阻塞。\n\n代价是要保存历史版本，并清理永不可见的旧版本。InnoDB 主要把旧版本放在 undo 里，快照读依据 Read View 判断可见性；这与当前读（加锁读）不是同一条路径。",
    aliases: ["MVCC", "多版本并发控制"],
    source: {
      label: "Wikipedia: Multiversion concurrency control",
      url: "https://en.wikipedia.org/wiki/Multiversion_concurrency_control",
    },
  },
  {
    id: "handler-api",
    title: "Handler API",
    subtitle: "存储引擎接口",
    definition:
      "MySQL Server 层调用存储引擎时使用的内部接口。执行器不会自己去解析 .ibd 页格式，而是通过 handler 发出“打开表”“按索引定位”“取下一条”“插入/更新”“开始/提交事务”这类请求。\n\n正因为接口固定，解析、优化和执行计划生成可以独立于具体引擎。InnoDB、MyISAM、Memory 等只要实现这套约定，就能挂到同一 Server 上。这是 MySQL 分层加插件化架构的连接点。",
    aliases: ["Handler API"],
  },
  {
    id: "bplus-tree",
    title: "B+Tree",
    subtitle: "B+ tree",
    definition:
      "B+ tree 是一种高扇出的多路搜索树，适合块设备上的检索：内部节点主要存键和子节点指针，真正的记录放在叶子层，叶子通常处在同一深度并可顺序链接，便于范围扫描。\n\n与把键值塞在内部节点的 B-tree 变体相比，B+ tree 把数据集中在叶子，能显著减少定位一次记录所需的磁盘 I/O。InnoDB 的聚簇索引与二级索引都以 B+Tree 组织：聚簇索引叶子即行数据，二级索引叶子指向主键。",
    aliases: ["B+Tree", "B+ 树", "B+树"],
    source: {
      label: "Wikipedia: B+ tree",
      url: "https://en.wikipedia.org/wiki/B%2B_tree",
    },
  },
  {
    id: "query-cache",
    title: "Query Cache",
    subtitle: "查询缓存（MySQL 8.0 已移除）",
    definition:
      "MySQL 曾经在 Server 层提供的结果集缓存：字面完全相同的 SELECT，若缓存未失效，可以直接返回上次结果，跳过再次执行。失效以表为粒度——相关表一旦发生写操作，对应缓存全部丢掉。\n\n在写多或读写交错的负载里，命中率往往偏低，还要为维护缓存付出同步开销，所以官方在 MySQL 8.0 移除了它。现在要做热点只读加速，更常见是放在应用层或 Redis 等外部缓存，而不是指望 Server 内置 Query Cache。",
    aliases: ["Query Cache", "查询缓存"],
  },
  {
    id: "two-phase-commit",
    title: "两阶段提交",
    subtitle: "Two-phase commit · 2PC",
    definition:
      "Two-phase commit 是一种原子提交协议，用来让多个参与者对“提交还是中止”达成一致。正常路径分两步：先由协调者发起投票（prepare），再根据全票结果通知 commit 或 abort。参与者要记录协议状态，以便故障后恢复。\n\nMySQL 在单机内用类似机制协调 InnoDB redo 与 Server binlog：引擎先 prepare，Server 写完 binlog，引擎再 commit。这样崩溃恢复时能判断该补提交还是回滚，避免主库恢复结果和副本重放分叉。",
    aliases: ["两阶段提交"],
    source: {
      label: "Wikipedia: Two-phase commit protocol",
      url: "https://en.wikipedia.org/wiki/Two-phase_commit_protocol",
    },
  },
  {
    id: "change-buffer",
    title: "Change Buffer",
    subtitle: "二级索引写缓冲",
    definition:
      "InnoDB 用来缓存对二级索引页修改的内存结构。如果这次更新要改的二级索引页还不在 Buffer Pool 里，可以把变更先记在 Change Buffer，稍后再 merge 进真正的索引页，减少立刻打磁盘的随机读。\n\n它对非唯一二级索引更有价值；唯一索引往往要马上判断是否冲突，不能随便延期。Change Buffer 不改变 SQL 语义，只改变物理 IO 形态和合并时机。",
    aliases: ["Change Buffer", "写缓冲", "非唯一二级索引"],
  },
  {
    id: "log-buffer",
    title: "Log Buffer",
    subtitle: "redo 日志缓冲",
    definition:
      "InnoDB 在内存里暂存 redo 记录的缓冲区。事务产生的 redo 先写入 Log Buffer，再按规则刷到 redo 日志文件（例如提交时、缓冲区将满时，或后台周期性刷盘）。\n\n它让日志写入可以批量进行，避免每条变更都同步打文件。Log Buffer 服务的是 redo 通路，和缓存数据页的 Buffer Pool 不是同一块内存；调缓冲大小和 flush 策略，影响的是提交延迟与耐久强度的权衡。",
    aliases: ["Log Buffer", "日志缓冲"],
  },
  {
    id: "adaptive-hash-index",
    title: "Adaptive Hash Index",
    subtitle: "自适应哈希索引 · AHI",
    definition:
      "InnoDB 在内存里为热点等值查询自动维护的哈希索引。访问模式稳定时，可以把部分 B+Tree 定位从 O(log n) 压到接近 O(1)。它只服务等值查找，由引擎自动创建与失效，可用 innodb_adaptive_hash_index 开关。\n\n高并发写入、访问模式抖动时，AHI 自身的维护和锁争用可能变成瓶颈；不少写入向基准会关掉它换更稳的吞吐。自适应不等于永远该开。",
    aliases: ["Adaptive Hash Index", "自适应哈希索引", "AHI"],
  },
  {
    id: "doublewrite",
    title: "Doublewrite Buffer",
    subtitle: "双写缓冲",
    definition:
      "InnoDB 防止“写断裂页”的安全垫：脏页刷回数据文件前，先顺序写入系统表空间里的 Doublewrite 区域；写成功后再写真正的 .ibd 页。若刷盘中途断电导致 16KB 页只写了一半，崩溃恢复可用 Doublewrite 里的完整副本覆盖坏页。\n\nredo 记录的是页内偏移修改，前提是页本身完整，所以救不了半写坏页。默认开启更稳；只有底层存储能保证页原子写时，才值得评估关掉它的收益。",
    aliases: ["Doublewrite Buffer", "Doublewrite", "双写缓冲", "双写"],
  },
  {
    id: "clustered-index",
    title: "聚簇索引",
    subtitle: "Clustered Index",
    definition:
      "InnoDB 里按主键组织的那棵 B+Tree：叶子节点存放整行数据，行的物理顺序就是主键顺序。一张表有且只有一个聚簇索引。\n\n没有显式主键时，InnoDB 会选第一个非空唯一索引；再没有就隐式生成 row_id。主键越短、越顺序（如自增 BIGINT），树越紧凑、写入越友好；随机 UUID 主键容易引发页分裂与碎片。",
    aliases: ["聚簇索引", "Clustered Index"],
  },
  {
    id: "secondary-index",
    title: "二级索引",
    subtitle: "Secondary Index",
    definition:
      "InnoDB 里除聚簇索引以外的索引。二级索引的 B+Tree 叶子通常存“索引键 + 主键值”，而不是整行。用二级索引定位后，若还要取叶子里没有的列，需要拿主键再回聚簇索引查一次。\n\n回表次数和覆盖情况，往往直接决定二级索引查询快不快。",
    aliases: ["二级索引", "Secondary Index", "非聚簇索引", "辅助索引"],
  },
  {
    id: "table-lookup",
    title: "回表",
    subtitle: "二级索引 → 聚簇索引",
    definition:
      "通过二级索引找到主键后，再回到聚簇索引取完整行（或取二级索引叶子里没有的列）的过程。每多一次回表，就多一次 B+Tree 定位，慢查询里很常见。\n\n若查询所需列都已出现在二级索引叶子上，就可以避免回表，这就是覆盖索引要解决的问题。",
    aliases: ["回表", "书签查找", "Bookmark Lookup"],
  },
  {
    id: "covering-index",
    title: "覆盖索引",
    subtitle: "Covering Index",
    definition:
      "一次查询所需的列全部落在某个索引里，优化器可以只读该索引就返回结果，不必再回表。对 InnoDB 二级索引而言，叶子已带主键，所以“索引列 + 主键列”的查询常常天然可覆盖。\n\n覆盖索引减少的是随机回表 I/O，是建联合索引和改写 SELECT 列表时的常用手段。",
    aliases: ["覆盖索引", "索引覆盖"],
  },
  {
    id: "lru",
    title: "LRU",
    subtitle: "Buffer Pool 淘汰策略",
    definition:
      "Least Recently Used：优先淘汰最久未被访问的缓存页。InnoDB 的 Buffer Pool 不用朴素 LRU，而是拆成 young / old 区：新页先进入 old 区，只有停留超过 innodb_old_blocks_time 后再被访问，才晋升到 young 区。\n\n这样全表扫描带来的一次性页很难挤掉真正热点，避免缓冲池被冷数据污染。",
    aliases: ["LRU", "改良 LRU", "young 区", "old 区"],
  },
  {
    id: "page-directory",
    title: "页目录",
    subtitle: "Page Directory",
    definition:
      "InnoDB 数据页尾部的槽（slot）数组，把页内记录分成若干组，并记下每组边界记录的位置。页内查找先在页目录上二分，定位到组，再沿组内记录链表线性扫描。\n\n它和页间双向链表、页内单向链表一起，构成“按主键在页里精确定位”的骨架。",
    aliases: ["页目录", "Page Directory"],
  },
  {
    id: "innodb-page",
    title: "页",
    subtitle: "Page · 默认 16KB",
    definition:
      "InnoDB 在内存与磁盘之间交换的最小 I/O 单位，默认 16KB。Buffer Pool 按页缓存，脏页按页刷盘；B+Tree 的一个节点通常对应一个页。\n\n即使只改一行，也要读写整页。行有多长、一页能装多少行，会直接影响缓存利用率和树的高度。",
    aliases: ["数据页", "索引页", "16KB", "页框"],
  },
  {
    id: "extent",
    title: "区",
    subtitle: "Extent · 1MB / 64 页",
    definition:
      "InnoDB 磁盘组织里，页之上的连续分配单位。一个区固定 1MB，在默认 16KB 页大小下正好包含 64 个页。段向表空间要空间时，常按区批量申请，让一次磁盘读取更容易拿到连续页。",
    aliases: ["区（Extent）", "Extent"],
  },
  {
    id: "segment",
    title: "段",
    subtitle: "Segment",
    definition:
      "InnoDB 里一组区的逻辑集合，对应一类数据对象的空间：例如聚簇索引一个段、每个二级索引各一个段。段下面是区，区下面是页，页里才是行。\n\n看懂段，是为了把“一张表/一个索引占用的空间”落到可观察的物理层级上。",
    aliases: ["段（Segment）", "Segment"],
  },
  {
    id: "unique-index",
    title: "唯一索引",
    subtitle: "UNIQUE Index",
    definition:
      "要求索引键在表内唯一（允许多个 NULL 的规则依引擎与版本而定）。InnoDB 里它常被用来保证业务约束，也会影响物理路径：插入或更新唯一键时，引擎必须立刻定位对应索引页做冲突校验。\n\n因此唯一二级索引通常吃不到 Change Buffer 的“先攒着再合并”红利——页已经被读进内存了。是否加唯一约束，要在正确性和写入吞吐之间取舍。",
    aliases: ["唯一索引", "UNIQUE 索引"],
  },
  {
    id: "lsn",
    title: "LSN",
    subtitle: "Log Sequence Number",
    definition:
      "InnoDB redo 日志里的逻辑序号，随 redo 写入单调递增。脏页、checkpoint、刷盘进度都可以用 LSN 对齐：flush 链表大致按最早修改对应的 LSN 排队；检查点推进意味着“这个 LSN 之前的改动已经可以认为安全落盘”。\n\n看 SHOW ENGINE INNODB STATUS 的 LOG 段时，LSN 就是在回答“日志写到哪了、刷盘跟到哪了”。",
    aliases: ["LSN"],
  },
  {
    id: "free-list",
    title: "free 链表",
    subtitle: "Buffer Pool 空闲页框",
    definition:
      "Buffer Pool 里尚未装数据的空闲页框队列。读入新页时先从 free 摘一个页框；free 空了，就要从 LRU 尾部淘汰页腾位置。\n\n它和 LRU、flush 一起描述页框的生命周期：空闲 → 在用 →（若变脏）待刷 → 再空闲。",
    aliases: ["free 链表"],
  },
  {
    id: "flush-list",
    title: "flush 链表",
    subtitle: "脏页刷盘队列",
    definition:
      "Buffer Pool 中所有脏页挂成的链表，大致按最早被修改的顺序（对应 redo LSN）排队，供后台线程刷回磁盘。刷完后从 flush 摘掉；页框若不再被引用，可回到 free。\n\n脏页比例高、redo 要覆盖旧日志、或 LRU 淘汰撞上脏页时，都会加压这条链路上的刷盘。",
    aliases: ["flush 链表"],
  },
  {
    id: "row-overflow",
    title: "行溢出",
    subtitle: "大字段与溢出页",
    definition:
      "一行装不进单个 16KB 页时，InnoDB（常见 Dynamic 行格式）会把过长列的主体放到溢出页，原页只留一小段指针。这样页里还能塞更多短行，B+Tree 更不容易被大字段撑高。\n\n代价是：查询若必须读那个大列，可能多一次溢出页 I/O。TEXT / BLOB / 很长的 VARCHAR 都是典型触发点。",
    aliases: ["行溢出", "溢出页"],
  },
  {
    id: "row-format-dynamic",
    title: "Dynamic",
    subtitle: "行格式（MySQL 5.7+ 默认）",
    definition:
      "InnoDB 常见行格式之一，MySQL 5.7 起多为默认。大列更容易整段放到溢出页，页内只留指针，有利于一页多行、树更矮。可用 SHOW TABLE STATUS / ROW_FORMAT 查看或修改。\n\n和 Compact 比，Dynamic 在大字段场景通常更省页内空间；具体选哪个仍要看表结构和访问模式。",
    aliases: ["Dynamic", "ROW_FORMAT = DYNAMIC"],
  },
  {
    id: "row-format-compact",
    title: "Compact",
    subtitle: "行格式",
    definition:
      "InnoDB 较早广泛使用的行格式（5.6 默认，5.7 仍支持）。一条 Compact 行大致包括：变长字段长度列表、NULL 位图、记录头、隐藏列，再跟真实列数据。\n\n读懂 Compact 布局，有助于理解隐藏列、NULL 怎么省空间，以及为什么主键长度会影响非叶节点扇出。",
    aliases: ["Compact"],
  },
  {
    id: "hidden-columns",
    title: "隐藏列",
    subtitle: "DB_TRX_ID / DB_ROLL_PTR / DB_ROW_ID",
    definition:
      "InnoDB 行里默默带着的系统列：DB_TRX_ID 记录最后修改该行的事务 ID；DB_ROLL_PTR 指向 undo 里的旧版本，支撑回滚和 MVCC；若表没有可用主键，还会有隐式 DB_ROW_ID 充当聚簇索引键。\n\n它们不是业务字段，却是事务、多版本和“没主键时引擎自己补一个”的物理基础。",
    aliases: ["隐藏列", "DB_TRX_ID", "DB_ROLL_PTR", "DB_ROW_ID", "row_id"],
  },
  {
    id: "page-split",
    title: "页分裂",
    subtitle: "B+Tree 页满时拆分",
    definition:
      "叶子（或内部）页写满后，InnoDB 要申请新页并把部分记录挪过去，以维持有序与可用空间。随机主键、中间插入多时，页分裂更频繁，伴随更多 I/O 和碎片；顺序自增主键则多在“最右”追加，分裂更温和。\n\n页合并是反向动作：页太空时可能与兄弟页合并，回收空间。",
    aliases: ["页分裂", "页合并"],
  },
  {
    id: "partial-page",
    title: "写断裂页",
    subtitle: "Partial page write",
    definition:
      "一次本应写完的 16KB 页，只写了一部分就掉电或崩溃，页内容半新半旧。这种坏页本身不完整，redo 按“完整页上的偏移修改”重放会失前提，所以单靠 redo 救不回来。\n\nInnoDB 用 Doublewrite：先留下完整副本，再写数据文件；恢复时可用副本覆盖坏页。",
    aliases: ["写断裂页", "写断裂", "partial page"],
  },
  {
    id: "infimum-supremum",
    title: "Infimum / Supremum",
    subtitle: "页内虚拟边界记录",
    definition:
      "每个 InnoDB 索引页里都有的两条虚拟记录：Infimum 表示“比一切用户记录都小”，Supremum 表示“比一切用户记录都大”。真实行都挂在它们之间的记录链表上。\n\n页目录二分、页内扫描都以这两条边界为框架，所以看页结构图时不要把它们当成业务数据。",
    aliases: ["Infimum", "Supremum", "Infimum / Supremum"],
  },
  {
    id: "fsync",
    title: "fsync",
    subtitle: "刷盘系统调用",
    definition:
      "把文件缓冲区里的脏数据真正推到稳定存储的系统调用。数据库说“日志落盘”“数据落盘”时，底层往往要靠 fsync（或同等语义）保证掉电后还在。\n\nInnoDB 的 innodb_flush_method 默认偏向 fsync 路径；它稳，但在繁忙写负载下也常是延迟来源之一。",
    aliases: ["fsync"],
  },
  {
    id: "o-direct",
    title: "O_DIRECT",
    subtitle: "绕过操作系统页缓存",
    definition:
      "打开文件时的一种标志：读写尽量绕过 OS page cache，减少双缓冲。InnoDB 可通过 innodb_flush_method 配到 O_DIRECT 一类路径，在专用库机器上有时能换更稳的 I/O 画像。\n\n它不是默认就更快；要对齐文件系统、I/O 调度和缓冲池大小，乱开可能更慢或不稳。",
    aliases: ["O_DIRECT"],
  },
  {
    id: "file-header",
    title: "File Header",
    subtitle: "页头通用信息 · 38 字节",
    definition:
      "InnoDB 页开头的固定头部，记录表空间、页号、前后页指针等，让页与页串成双向链表。校验与页身份识别也依赖这部分元数据。\n\n和 Page Header（页类型、记录数、页目录槽数等）分工不同：File Header 更偏“这一页在文件里是谁、和谁相邻”。",
    aliases: ["File Header", "文件头"],
  },
  {
    id: "page-header",
    title: "Page Header",
    subtitle: "页类型与记录元信息",
    definition:
      "紧跟 File Header 的页级头部，描述页类型、记录数量、堆顶指针、页目录槽数等。页内空间怎么切、有多少用户记录，先看这里。\n\n它不存行数据本身，但决定了后面 User Records、Free Space、Page Directory 如何解读。",
    aliases: ["Page Header", "页头"],
  },
  {
    id: "file-trailer",
    title: "File Trailer",
    subtitle: "页尾校验 · 8 字节",
    definition:
      "页末尾的短trailer，带校验信息，用来发现页是否写完整、是否损坏。写断裂导致半页新旧内容时，头尾校验对不上就是重要信号。\n\n和 Doublewrite 搭配：先发现坏页，再考虑用双写区副本去修。",
    aliases: ["File Trailer", "文件尾"],
  },
  {
    id: "leftmost-prefix",
    title: "最左前缀",
    subtitle: "组合索引匹配规则",
    definition:
      "组合索引 (a,b,c) 按列从左到右排序。查询条件必须从最左列开始、连续匹配，索引才能有效定位：可用 a、a+b、a+b+c；单独 b、b+c 通常用不上整条索引。\n\n缺最左等于在无序维度上瞎找，优化器常退化成全表扫描。范围条件还会截断后续列的等值利用。",
    aliases: ["最左前缀", "最左前缀原则"],
  },
  {
    id: "icp",
    title: "索引下推",
    subtitle: "ICP · Index Condition Pushdown",
    definition:
      "MySQL 5.6+ 把本可在索引列上判断的 WHERE 条件下推到存储引擎：在二级索引里先过滤，再对幸存行回表。相比旧路径“先大量回表、再回服务层过滤”，能明显少 IO。\n\nEXPLAIN Extra 出现 Using index condition 表示 ICP 生效。它和 Using index（覆盖、零回表）不是一回事。",
    aliases: ["索引下推", "ICP", "Index Condition Pushdown", "Using index condition"],
  },
  {
    id: "composite-index",
    title: "组合索引",
    subtitle: "联合索引",
    definition:
      "在多列上按固定顺序建立的一条索引，B+Tree 按“联合键”排序。它同时服务最左前缀匹配，也常被设计成覆盖更多查询列。\n\n列顺序要先看查询形态（等值在前、范围在后），再谈选择性；乱序建组合索引，是索引“建了却没用”的常见原因。",
    aliases: ["组合索引", "联合索引"],
  },
  {
    id: "prefix-index",
    title: "前缀索引",
    subtitle: "字符串前 N 字符",
    definition:
      "对长字符串只取前 N 个字符建索引，换空间和缓冲命中，代价是前缀排序≠整串排序，通常不能很好服务 ORDER BY / GROUP BY，也难做真正的覆盖扫描。\n\n适合列很长、主要做等值或前缀匹配、且不依赖完整排序的场景。",
    aliases: ["前缀索引"],
  },
  {
    id: "primary-index",
    title: "主键索引",
    subtitle: "Primary Key Index",
    definition:
      "建在主键上的索引。在 InnoDB 里主键索引就是聚簇索引：叶子存整行。主键宜短、宜递增、宜稳定，否则页分裂和二级索引叶子里的主键副本都会变贵。",
    aliases: ["主键索引"],
  },
  {
    id: "fulltext-index",
    title: "全文索引",
    subtitle: "Full-Text Index",
    definition:
      "面向大段文本关键词检索的索引。对 LIKE '%词%' 这类前后模糊，普通 B+Tree 往往无能为力；全文索引用分词与倒排思路加速文本搜索。InnoDB 5.6+ 支持，适合文章检索等场景，不是日常等值点查的替身。",
    aliases: ["全文索引"],
  },
  {
    id: "cardinality",
    title: "Cardinality",
    subtitle: "基数 · 选择性",
    definition:
      "Cardinality 是索引列不重复值的近似个数；选择性 ≈ Cardinality / 表行数，越接近 1 区分度越高。优化器靠它估算走索引是否划算。\n\n它是采样估算，会过期；倾斜列即使有索引，优化器也可能判定全表更便宜。可用 ANALYZE TABLE 刷新统计。",
    aliases: ["Cardinality", "基数", "选择性"],
  },
  {
    id: "index-merge",
    title: "Index Merge",
    subtitle: "索引合并",
    definition:
      "一条 SQL 同时用多个单列索引，再把结果做 union / intersection 合并。常见于 OR 两侧各有索引却没有合适的组合索引。\n\n它多半是补救而不是最优：看到 Using union/intersection，往往该考虑建一条覆盖条件的组合索引。",
    aliases: ["Index Merge", "索引合并"],
  },
  {
    id: "explain",
    title: "EXPLAIN",
    subtitle: "执行计划",
    definition:
      "查看优化器打算怎么执行一条 SQL 的工具。看索引是否生效，优先盯 type（是否退化成 ALL）、key（是否为 NULL）、rows（是否接近全表），以及 Extra（Using index / Using index condition / Using where 等）。\n\n它是“有没有用上索引”的权威现场，不是猜。",
    aliases: ["EXPLAIN"],
  },
  {
    id: "using-index",
    title: "Using index",
    subtitle: "覆盖索引信号",
    definition:
      "EXPLAIN Extra 中的 Using index 表示查询所需列都在索引里，不必回表。它是覆盖索引生效的标志。\n\n不要和 Using index condition（ICP，索引内过滤、仍可能回表）混淆。",
    aliases: ["Using index"],
  },
  {
    id: "key-len",
    title: "key_len",
    subtitle: "EXPLAIN 用到的索引字节数",
    definition:
      "EXPLAIN 里 key_len 表示本次用到了索引键的多少字节。对组合索引，它能帮你判断最左匹配用到了前几列：越长通常用到的列越多。\n\n范围截断后续列时，key_len 往往停在被截断的位置附近。",
    aliases: ["key_len"],
  },
  {
    id: "index-hint",
    title: "索引提示",
    subtitle: "USE / FORCE / IGNORE INDEX",
    definition:
      "用提示干涉优化器选哪个索引：USE INDEX 建议、FORCE INDEX 更强硬、IGNORE INDEX 避开某索引。适合统计偏差或选错索引时的应急与对照实验。\n\n长期仍应修好索引与统计，而不是依赖提示硬绑。",
    aliases: ["索引提示", "FORCE INDEX", "USE INDEX", "IGNORE INDEX"],
  },
  {
    id: "histogram",
    title: "直方图",
    subtitle: "列值分布统计",
    definition:
      "MySQL 8.0 可为列建立直方图，更细地描述值分布，帮助优化器在倾斜数据上估算更准。对“有索引却总被弃用”的低区分度/倾斜列，有时比干瞪 Cardinality 更有用。",
    aliases: ["直方图"],
  },
  {
    id: "analyze-table",
    title: "ANALYZE TABLE",
    subtitle: "刷新统计信息",
    definition:
      "重新采样表与索引统计（含 Cardinality 等），让优化器按更新鲜的数据分布做选择。大批量导入、分布剧变后，若“明明有索引却走全表”，先怀疑统计过期，再 ANALYZE。",
    aliases: ["ANALYZE TABLE", "统计信息"],
  },
  {
    id: "explain-type-all",
    title: "type = ALL",
    subtitle: "全表扫描",
    definition:
      "EXPLAIN type 为 ALL 表示按表顺序扫行，通常没有效用上索引（或优化器认为索引不划算）。调优时若 key 为 NULL、rows 接近全表，就要回头查最左前缀、函数包裹、类型转换、统计与选择性。",
    aliases: ["type=ALL", "type = ALL", "全表扫描"],
  },
];
