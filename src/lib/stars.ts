/**
 * Ordering the blocks read off a card.
 *
 * The dealer stars the ones that should lead. Up/down arrows were tried first
 * and are the wrong control for a phone — two small targets per row, and moving
 * a block three places costs six taps. A star is one tap that says "this one
 * leads", which is the only ordering decision that actually comes up.
 *
 * A star carries the order it was GIVEN in, so the second star lands behind the
 * first rather than fighting it. Everything unstarred keeps printed order
 * underneath.
 */

export interface Starrable {
  id: string;
  /** When this was starred, as an increasing sequence. null = not starred. */
  star: number | null;
}

/** The next star number, so a new star always goes behind the existing ones. */
export function nextStar<T extends Starrable>(items: T[]): number {
  return Math.max(0, ...items.map((i) => i.star ?? 0)) + 1;
}

/** Star an item, or take its star back. */
export function toggleStar<T extends Starrable>(items: T[], id: string): T[] {
  const next = nextStar(items);
  return items.map((i) => (i.id === id ? { ...i, star: i.star == null ? next : null } : i));
}

/**
 * Starred first in the order they were starred, then everything else in the
 * order it was already in.
 *
 * Relies on Array.prototype.sort being stable, which it is required to be since
 * ES2019 — that is what keeps the unstarred blocks in printed order without
 * carrying a second index around.
 */
export function orderByStar<T extends Starrable>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.star ?? Infinity) - (b.star ?? Infinity));
}
