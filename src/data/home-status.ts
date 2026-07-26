/**
 * Quiet homepage status — edit here when what you’re writing changes.
 * Keep it public-safe and short.
 */
export type HomeWritingStatus = {
  /** e.g. "正在写" | "本周" */
  label: string;
  /** Short notebook line shown on the homepage. */
  text: string;
};

export const homeWritingStatus: HomeWritingStatus = {
  label: "正在写",
  text: "请求过境 · IdleTimeout 与代理 idle",
};
