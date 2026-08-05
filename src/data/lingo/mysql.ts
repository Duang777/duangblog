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
    aliases: ["独立表空间", "系统表空间", "表空间", "Tablespace", "tablespace"],
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
    aliases: ["Change Buffer"],
  },
  {
    id: "log-buffer",
    title: "Log Buffer",
    subtitle: "redo 日志缓冲",
    definition:
      "InnoDB 在内存里暂存 redo 记录的缓冲区。事务产生的 redo 先写入 Log Buffer，再按规则刷到 redo 日志文件（例如提交时、缓冲区将满时，或后台周期性刷盘）。\n\n它让日志写入可以批量进行，避免每条变更都同步打文件。Log Buffer 服务的是 redo 通路，和缓存数据页的 Buffer Pool 不是同一块内存；调缓冲大小和 flush 策略，影响的是提交延迟与耐久强度的权衡。",
    aliases: ["Log Buffer"],
  },
];
