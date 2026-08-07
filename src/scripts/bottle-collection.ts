import {
  BOTTLE_COLLECTION_KEY,
  BOTTLES,
  type BottleDef,
} from "@/data/bottles";

export type BottleCollectionState = {
  /** Unlocked bottle ids, oldest first. */
  unlocked: string[];
  updatedAt: string;
};

function emptyState(): BottleCollectionState {
  return { unlocked: [], updatedAt: new Date().toISOString() };
}

export function readBottleCollection(): BottleCollectionState {
  try {
    const raw = localStorage.getItem(BOTTLE_COLLECTION_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as BottleCollectionState;
    if (!Array.isArray(parsed.unlocked)) return emptyState();
    const known = new Set(BOTTLES.map(b => b.id));
    return {
      unlocked: parsed.unlocked.filter(id => known.has(id)),
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return emptyState();
  }
}

function writeBottleCollection(state: BottleCollectionState) {
  try {
    localStorage.setItem(BOTTLE_COLLECTION_KEY, JSON.stringify(state));
  } catch {
    // Private mode / quota — unlock is best-effort.
  }
}

export function isBottleUnlocked(id: string): boolean {
  return readBottleCollection().unlocked.includes(id);
}

/** Unlock a bottle. Returns true if newly collected. */
export function unlockBottle(id: string): boolean {
  if (!BOTTLES.some(b => b.id === id)) return false;
  const state = readBottleCollection();
  if (state.unlocked.includes(id)) return false;
  state.unlocked.push(id);
  state.updatedAt = new Date().toISOString();
  writeBottleCollection(state);
  return true;
}

export function listUnlockedBottles(): BottleDef[] {
  const { unlocked } = readBottleCollection();
  const byId = new Map(BOTTLES.map(b => [b.id, b]));
  return unlocked
    .map(id => byId.get(id))
    .filter((b): b is BottleDef => Boolean(b));
}

export function collectionProgress(): { have: number; total: number } {
  return {
    have: readBottleCollection().unlocked.length,
    total: BOTTLES.length,
  };
}

export const BOTTLE_UNLOCK_EVENT = "duang:bottle-unlock";
