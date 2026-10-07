import type { LingoTerm } from "./types";

export const PRODUCTION_OBS_LINGO: LingoTerm[] = [
  {
    id: "red-method",
    title: "RED",
    subtitle: "速率、错误、延迟",
    definition:
      "看一个在线服务，先看三件事：请求速率、错误率、延迟的分位。应用看板按这三件摆。CPU 高不高，要等这三件说了算。",
    aliases: ["RED"],
  },
  {
    id: "use-method",
    title: "USE",
    subtitle: "利用率、饱和、错误",
    definition:
      "看机器和资源，看利用率、饱和程度、错误。连接池在等、队列在堆，都算饱和。它跟 RED 不是同一层：应用看 RED，基础设施看 USE。",
    aliases: ["基础设施看 USE", "基础设施则是 USE"],
    source: {
      label: "The USE Method",
      url: "https://www.brendangregg.com/usemethod.html",
    },
  },
  {
    id: "error-budget",
    title: "Error Budget",
    subtitle: "错误预算",
    definition:
      "SLO 允许失败的那一点余量。99.9% 的一个月里，大约 43 分钟可以不成功。预算快花完，就少做高风险发布。",
    aliases: ["Error Budget"],
    source: {
      label: "Site Reliability Engineering",
      url: "https://sre.google/sre-book/embracing-risk/",
    },
  },
  {
    id: "label-cardinality",
    title: "高基数",
    subtitle: "Metrics 标签别塞身份",
    definition:
      "把 user_id、request_id、完整 URL 写进指标标签，每个值都长出一条时间序列。用户一多，监控存储自己先被压垮。这些值放日志和 Trace，指标标签用归一化后的 route。",
    aliases: ["高基数（Cardinality）", "Sampling 与 Cardinality", "Cardinality 的规则", "高基数"],
  },
  {
    id: "low-cardinality-label",
    title: "低基数",
    subtitle: "指标标签只放取值少的维度",
    definition:
      "指标标签只放 service、route、method、status_code 这种取值很少的维度。user_id、request_id、完整 URL 取值海量，放进去会把时间序列撑爆，那些值留给 Trace 和日志。",
    aliases: ["低基数"],
  },
];
