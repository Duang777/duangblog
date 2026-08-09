import { getTagIntro } from "@/data/tag-intros";

export type HomeColumnScent =
  | "digest"
  | "backend"
  | "frontend"
  | "agent"
  | "agent-arch"
  | "mysql"
  | "perf"
  | "mixup"
  | "pi"
  | "misc";

/** A topic cluster shown on the homepage instead of raw posts. */
export type HomeSubTopic = {
  /** Short label on the homepage (e.g. 进程). */
  title: string;
  intro: string;
  /** Tag page to open. */
  tagHrefName: string;
  /** How many articles currently sit under this topic (for the count chip). */
  count?: number;
};

export type HomeColumnDef = {
  id: string;
  title: string;
  intro: string;
  /** Tag used for the “enter column” link when no hub slug is set. */
  tagHrefName?: string;
  /** Dedicated hub post slug (without .md). */
  hubSlug?: string;
  scent: HomeColumnScent;
  /** How many latest posts to show under the column. */
  limit: number;
  match: (tags: string[]) => boolean;
  /**
   * When set, the homepage lists these topic entries instead of article cards.
   * Matching posts are still claimed so they do not leak into 随笔.
   */
  subTopics?: HomeSubTopic[];
};

type ColumnCopy = { title: string; intro: string };

const COLUMN_COPY: Record<"zh-CN" | "en", Record<string, ColumnCopy>> = {
  "zh-CN": {
    digest: { title: "最新速递", intro: getTagIntro("最新速递") },
    backend: { title: "后端专栏", intro: getTagIntro("后端专栏") },
    frontend: { title: "前端实验室", intro: getTagIntro("前端实验室") },
    agent: { title: "Agent 拆解", intro: getTagIntro("Agent") },
    "agent-arch": {
      title: "Agent 系统架构设计",
      intro: getTagIntro("Agent 系统架构设计"),
    },
    mysql: { title: "MySQL", intro: getTagIntro("MySQL") },
    perf: {
      title: "高性能后端实战",
      intro: getTagIntro("高性能后端实战"),
    },
    mixup: {
      title: "易混专栏",
      intro: getTagIntro("易混专栏"),
    },
    pi: { title: "Pi 深度解析", intro: getTagIntro("Pi 深度解析") },
    misc: { title: "随笔与其他", intro: "还没收进大专栏的笔记。" },
  },
  en: {
    digest: {
      title: "Latest Digest",
      intro: "What I've been reading lately.",
    },
    backend: {
      title: "Backend Notes",
      intro: "Server boundaries, timing, and real failures from one request.",
    },
    frontend: {
      title: "Frontend Lab",
      intro: "Interactive browser experiments with working code.",
    },
    agent: {
      title: "Agent Breakdowns",
      intro:
        "Loops, tools, and engineering trade-offs in Agent projects.",
    },
    "agent-arch": {
      title: "Agent System Architecture",
      intro:
        "Define the boundary, climb the spectrum, and design without a framework first.",
    },
    mysql: {
      title: "MySQL",
      intro: "Walk one SQL through architecture, engine, indexes, and transactions.",
    },
    perf: {
      title: "High-Performance Backend",
      intro:
        "Measure first, then dig into CPU, memory, concurrency, and I/O — Python and Go side by side.",
    },
    mixup: {
      title: "Easy-to-Mix Notes",
      intro:
        "Split concepts that get tangled: process, thread, coroutine, and more.",
    },
    pi: {
      title: "Pi Deep Dive",
      intro: "What Pi is, how the packages split, and which trade-offs it made.",
    },
    misc: {
      title: "Notes & Other",
      intro: "Loose notes that have not grown into a column yet.",
    },
  },
};

function copyFor(locale: string, id: string): ColumnCopy {
  const pack = locale === "en" ? COLUMN_COPY.en : COLUMN_COPY["zh-CN"];
  return pack[id] ?? COLUMN_COPY["zh-CN"][id]!;
}

/** Homepage column order: one section per mega-column. */
export function getHomeColumns(locale: string = "zh-CN"): HomeColumnDef[] {
  const digest = copyFor(locale, "digest");
  const backend = copyFor(locale, "backend");
  const frontend = copyFor(locale, "frontend");
  const agent = copyFor(locale, "agent");
  const agentArch = copyFor(locale, "agent-arch");
  const mysql = copyFor(locale, "mysql");
  const perf = copyFor(locale, "perf");
  const mixup = copyFor(locale, "mixup");
  const pi = copyFor(locale, "pi");
  const processIntro =
    locale === "en"
      ? "Process, thread, and coroutine — Python and Go side by side."
      : getTagIntro("进程");
  return [
    {
      id: "digest",
      title: digest.title,
      intro: digest.intro,
      hubSlug: "latest-digest",
      scent: "digest",
      limit: 2,
      match: tags => tags.includes("最新速递"),
    },
    {
      id: "agent",
      title: agent.title,
      intro: agent.intro,
      hubSlug: "agent-breakdown",
      tagHrefName: "Agent 拆解专栏",
      scent: "agent",
      limit: 2,
      match: tags =>
        (tags.includes("Agent 拆解专栏") ||
          tags.includes("Agent") ||
          tags.includes("拆解")) &&
        !tags.includes("Agent 系统架构设计"),
    },
    {
      id: "agent-arch",
      title: agentArch.title,
      intro: agentArch.intro,
      hubSlug: "agent-system-architecture",
      scent: "agent-arch",
      limit: 2,
      match: tags => tags.includes("Agent 系统架构设计"),
    },
    {
      id: "pi",
      title: pi.title,
      intro: pi.intro,
      hubSlug: "pi-deep-dive",
      scent: "pi",
      limit: 2,
      match: tags => tags.includes("Pi 深度解析"),
    },
    {
      id: "mysql",
      title: mysql.title,
      intro: mysql.intro,
      hubSlug: "mysql-column",
      scent: "mysql",
      limit: 2,
      match: tags => tags.includes("MySQL"),
    },
    {
      id: "perf",
      title: perf.title,
      intro: perf.intro,
      hubSlug: "perf-backend",
      scent: "perf",
      limit: 2,
      match: tags => tags.includes("高性能后端实战"),
    },
    {
      id: "mixup",
      title: mixup.title,
      intro: mixup.intro,
      hubSlug: "dont-mix",
      scent: "mixup",
      limit: 2,
      match: tags => tags.includes("易混专栏") || tags.includes("进程"),
      subTopics: [
        {
          title: locale === "en" ? "Process" : "进程",
          intro: processIntro,
          tagHrefName: "进程",
        },
      ],
    },
    {
      id: "backend",
      title: backend.title,
      intro: backend.intro,
      hubSlug: "backend-column",
      scent: "backend",
      limit: 2,
      match: tags => tags.includes("后端专栏") || tags.includes("请求过境"),
    },
    {
      id: "frontend",
      title: frontend.title,
      intro: frontend.intro,
      tagHrefName: "前端实验室",
      scent: "frontend",
      limit: 2,
      match: tags => tags.includes("前端实验室"),
    },
  ];
}

export function getHomeMiscColumn(locale: string = "zh-CN"): HomeColumnDef {
  const misc = copyFor(locale, "misc");
  return {
    id: "misc",
    title: misc.title,
    intro: misc.intro,
    tagHrefName: "随笔",
    scent: "misc",
    limit: 2,
    match: () => true,
  };
}

/** @deprecated Prefer getHomeColumns(locale) */
export const HOME_COLUMNS = getHomeColumns("zh-CN");
/** @deprecated Prefer getHomeMiscColumn(locale) */
export const HOME_MISC_COLUMN = getHomeMiscColumn("zh-CN");
