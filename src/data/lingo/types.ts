/**
 * Shared glossary types for inline term cards.
 */
export type LingoTerm = {
  id: string;
  /** Card title, usually English or the canonical name. */
  title: string;
  /** Smaller line under the title. */
  subtitle?: string;
  /** Canonical definition for the whole site. Blank lines split paragraphs. */
  definition: string;
  /** Match strings in body text. Longer aliases win at runtime. */
  aliases: string[];
  /** Optional primary reference (prefer a real Wikipedia entry). */
  source?: {
    label: string;
    url: string;
  };
};
