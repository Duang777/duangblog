import type { LingoTerm } from "./types";
import { MYSQL_LINGO } from "./mysql";
import { PERF_LINGO } from "./perf";
import { MIXUP_LINGO } from "./mixup";
import { AGENT_LINGO } from "./agent";

export type { LingoTerm } from "./types";

/**
 * Merge domain packs into one site-wide glossary.
 * Duplicate `id` or case-insensitive `alias` fails the build so two packs
 * cannot silently disagree.
 */
export function mergeLingoPacks(...packs: LingoTerm[][]): LingoTerm[] {
  const byId = new Map<string, LingoTerm>();
  const aliasOwner = new Map<string, string>();

  for (const pack of packs) {
    for (const term of pack) {
      if (byId.has(term.id)) {
        throw new Error(`Duplicate lingo id: ${term.id}`);
      }
      for (const alias of term.aliases) {
        const key = alias.toLowerCase();
        const owner = aliasOwner.get(key);
        // Same term may list "Redo Log" and "redo log"; only cross-term clashes fail.
        if (owner && owner !== term.id) {
          throw new Error(
            `Duplicate lingo alias "${alias}" shared by ${owner} and ${term.id}`
          );
        }
        aliasOwner.set(key, term.id);
      }
      byId.set(term.id, term);
    }
  }

  return [...byId.values()];
}

/** Canonical site glossary. Add new domain packs here as the bank grows. */
export const LINGO_TERMS: LingoTerm[] = mergeLingoPacks(
  MYSQL_LINGO,
  PERF_LINGO,
  MIXUP_LINGO,
  AGENT_LINGO
);
