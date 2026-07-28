/**
 * Column-specific「念头瓶」shapes for tag / series pages.
 * Silhouette + liquid tint only — keep quiet, not a sticker pack.
 */

export type ColumnJarKind = "wide" | "flask" | "vial" | "round" | "plain";

export type ColumnJarSpec = {
  kind: ColumnJarKind;
  /** Short label under the bottle */
  caption: string;
  /** Hover / title hint */
  hint: string;
};

const COLUMN_JARS: Record<string, ColumnJarSpec> = {
  后端专栏: {
    kind: "wide",
    caption: "机制瓶",
    hint: "广口罐 · 本专栏已读液位",
  },
  请求过境: {
    kind: "flask",
    caption: "过境瓶",
    hint: "细颈烧瓶 · 顺着请求往下灌",
  },
  最新速递: {
    kind: "vial",
    caption: "速递瓶",
    hint: "小样瓶 · 一事一滴",
  },
  Agent: {
    kind: "round",
    caption: "拆解瓶",
    hint: "圆底瓶 · 拆开再收拢",
  },
  拆解: {
    kind: "round",
    caption: "拆解瓶",
    hint: "圆底瓶 · 拆开再收拢",
  },
};

export function resolveColumnJar(tagName: string): ColumnJarSpec {
  return (
    COLUMN_JARS[tagName] ?? {
      kind: "plain",
      caption: "念头瓶",
      hint: "这本笔记的已读液位",
    }
  );
}

/** True when this tag has a dedicated bottle silhouette. */
export function hasColumnJar(tagName: string | undefined): boolean {
  return Boolean(tagName && tagName in COLUMN_JARS);
}

const COLUMN_JAR_PRIORITY = [
  "最新速递",
  "请求过境",
  "后端专栏",
  "Agent",
  "拆解",
] as const;

/**
 * Pick the jar column for a post: prefer known jar tags by priority
 * (sub-column before parent mega-column).
 */
export function pickJarColumnTag(
  tags: string[] | undefined
): string | undefined {
  if (!tags?.length) return undefined;
  for (const name of COLUMN_JAR_PRIORITY) {
    if (tags.includes(name)) return name;
  }
  return undefined;
}
