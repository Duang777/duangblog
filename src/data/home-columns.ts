import { getTagIntro } from "@/data/tag-intros";

export type HomeColumnScent =
  "digest" | "backend" | "frontend" | "agent" | "misc";

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
};

type ColumnCopy = { title: string; intro: string };

const COLUMN_COPY: Record<"zh-CN" | "en", Record<string, ColumnCopy>> = {
  "zh-CN": {
    digest: { title: "最新速递", intro: getTagIntro("最新速递") },
    backend: { title: "后端专栏", intro: getTagIntro("后端专栏") },
    frontend: { title: "前端实验室", intro: getTagIntro("前端实验室") },
    agent: { title: "Agent 拆解", intro: getTagIntro("Agent") },
    misc: { title: "随笔与其他", intro: "还没收进大专栏的笔记。" },
  },
  en: {
    digest: {
      title: "Latest Digest",
      intro: "Short notes: tools, follow-ups, or one production symptom.",
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
        "Loops, tools, state, and engineering trade-offs in Agent projects.",
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
    {
      id: "agent",
      title: agent.title,
      intro: agent.intro,
      tagHrefName: "Agent",
      scent: "agent",
      limit: 2,
      match: tags => tags.includes("Agent") || tags.includes("拆解"),
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
