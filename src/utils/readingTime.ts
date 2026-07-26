/**
 * Estimate reading minutes from raw markdown, counting CJK characters,
 * Latin words, and code lines with separate paces.
 */
const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;

const CJK_CHARS_PER_MIN = 350;
const WORDS_PER_MIN = 200;
const SECONDS_PER_CODE_LINE = 3;

export function getReadingMinutes(body: string | undefined): number {
  if (!body) return 1;

  let codeLines = 0;
  let text = body.replace(/```[\s\S]*?```/g, block => {
    const lines = block.split("\n").length - 2;
    codeLines += Math.max(0, lines);
    return " ";
  });

  text = text
    .replace(/^import\s.+$/gm, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`[^`]*`/g, " code ");

  const cjkCount = (text.match(CJK_RE) ?? []).length;
  const wordCount = (text.replace(CJK_RE, " ").match(/[A-Za-z0-9'-]+/g) ?? [])
    .length;

  const minutes =
    cjkCount / CJK_CHARS_PER_MIN +
    wordCount / WORDS_PER_MIN +
    (codeLines * SECONDS_PER_CODE_LINE) / 60;

  return Math.max(1, Math.round(minutes));
}
