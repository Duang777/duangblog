/**
 * Inline term cards (Lingo-style). Matched by alias in article text;
 * first hit per term only. Keep definitions short and plain.
 */
export type LingoTerm = {
  id: string;
  /** Card title, usually the English or canonical name. */
  title: string;
  /** Smaller line under the title. */
  subtitle?: string;
  /** Short plain definition. */
  definition: string;
  /** Strings to match in body text (longer first is applied at runtime). */
  aliases: string[];
};

export const LINGO_TERMS: LingoTerm[] = [
  {
    id: "buffer-pool",
    title: "Buffer Pool",
    subtitle: "缓冲池",
    definition:
      "InnoDB 在内存里缓存数据页和索引页的地方。命中就直接返回，未命中才从磁盘把页读进来。命中率高低，往往直接决定查询快慢。",
    aliases: ["Buffer Pool", "缓冲池"],
  },
  {
    id: "tablespace",
    title: "Tablespace",
    subtitle: "表空间 / Tablespaces",
    definition:
      "InnoDB 把表的数据和索引落到磁盘上的逻辑容器。开启独立表空间时，一张表通常对应一个 .ibd 文件；系统表空间则常见为 ibdata1。",
    aliases: ["独立表空间", "系统表空间", "表空间", "Tablespace", "tablespace"],
  },
  {
    id: "innodb",
    title: "InnoDB",
    subtitle: "默认存储引擎",
    definition:
      "MySQL 默认的存储引擎。支持事务、行级锁、外键和崩溃恢复。后面讲索引、锁、日志，默认都以它为对象。",
    aliases: ["InnoDB"],
  },
  {
    id: "redo-log",
    title: "Redo Log",
    subtitle: "重做日志",
    definition:
      "引擎层的物理日志，记录页上改了什么。遵循先写日志再刷盘（WAL），崩溃后可以靠它把已提交的改动补回去。",
    aliases: ["redo log", "Redo Log", "redo", "重做日志"],
  },
  {
    id: "undo-log",
    title: "Undo Log",
    subtitle: "回滚日志",
    definition:
      "记下修改前的旧值。事务回滚时用来恢复；MVCC 读旧版本时也靠它。",
    aliases: ["Undo Log", "undo log", "undo", "回滚日志"],
  },
  {
    id: "binlog",
    title: "Binlog",
    subtitle: "二进制日志",
    definition:
      "Server 层的逻辑日志，记录改了什么。主从复制和时间点恢复都依赖它，和引擎层的 redo 不是同一套。",
    aliases: ["Binlog", "binlog", "二进制日志"],
  },
  {
    id: "wal",
    title: "WAL",
    subtitle: "Write-Ahead Logging",
    definition:
      "先写日志、后刷数据页的原则。即使进程突然挂掉，也可以用日志把已提交的改动恢复出来。",
    aliases: ["WAL"],
  },
  {
    id: "checkpoint",
    title: "Checkpoint",
    subtitle: "检查点",
    definition:
      "标记哪些脏页已经安全落到磁盘。崩溃恢复时不必从头重放全部 redo，从最近的检查点之后开始即可。",
    aliases: ["Checkpoint", "检查点"],
  },
  {
    id: "dirty-page",
    title: "脏页",
    subtitle: "Dirty Page",
    definition:
      "Buffer Pool 里已经被改过、但还没写回磁盘的页。后台 Page Cleaner 会异步把它们刷盘。",
    aliases: ["脏页"],
  },
  {
    id: "mvcc",
    title: "MVCC",
    subtitle: "多版本并发控制",
    definition:
      "用多个数据版本让读写尽量不互相堵。读请求常常看到旧版本，而不必等写事务把行锁放开。",
    aliases: ["MVCC", "多版本并发控制"],
  },
  {
    id: "handler-api",
    title: "Handler API",
    subtitle: "引擎接口",
    definition:
      "Server 层调用存储引擎的那套固定接口，比如按主键读一行、插入、开事务。Server 不关心底下是 B+Tree 还是别的结构。",
    aliases: ["Handler API"],
  },
  {
    id: "bplus-tree",
    title: "B+Tree",
    subtitle: "B+ 树",
    definition:
      "InnoDB 组织和定位数据的主要结构。聚簇索引的叶子节点就是行数据本身，二级索引叶子则指向主键。",
    aliases: ["B+Tree", "B+ 树", "B+树"],
  },
  {
    id: "query-cache",
    title: "Query Cache",
    subtitle: "查询缓存",
    definition:
      "Server 层曾经有过的结果缓存。表一旦被写入，相关缓存全部失效。MySQL 8.0 已移除，热点只读缓存更适合放在应用层。",
    aliases: ["Query Cache", "查询缓存"],
  },
  {
    id: "two-phase-commit",
    title: "两阶段提交",
    subtitle: "2PC · redo 与 binlog",
    definition:
      "让引擎层 redo 和 Server 层 binlog 最终一致的协议：先 prepare redo，再写 binlog，最后 commit。崩在中间也能判断该提交还是回滚。",
    aliases: ["两阶段提交"],
  },
  {
    id: "change-buffer",
    title: "Change Buffer",
    subtitle: "写缓冲",
    definition:
      "InnoDB 用来缓存对二级索引的修改。数据页不在内存时，可先记在 Change Buffer，稍后再合并，减少随机 IO。",
    aliases: ["Change Buffer"],
  },
  {
    id: "log-buffer",
    title: "Log Buffer",
    subtitle: "日志缓冲",
    definition:
      "InnoDB 在内存里暂存 redo 日志的缓冲区。攒到一定量或事务提交时，再刷到 redo 日志文件。",
    aliases: ["Log Buffer"],
  },
];
