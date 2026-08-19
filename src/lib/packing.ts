/**
 * What is in the case today.
 *
 * A show session is a set of GROUPS, not a set of cards. At a thousand cards a
 * per-card packing checklist is unusable, and it is not how the stock moves
 * anyway: a group is the physical unit that gets picked up and carried. So the
 * packed state is a list of stack ids and nothing else.
 *
 * NOTHING IS COUNTED HERE, only derived. Every figure below is computed from
 * the cards on each call, the same rule the rest of this app runs on — there is
 * no stored total that can drift out of step with the cards that produced it.
 * Corollary worth stating: a card added to a packed group is in the case
 * immediately, because the case is a query, not a snapshot.
 */
import type { Card, DB } from '../types';
import { NO_GROUP, cardsInGroup, groupName, statsFor } from './groups';

/** Put a group in the case, or take it out. */
export function togglePacked(packed: string[] | undefined, stackId: string): string[] {
  const now = packed ?? [];
  return now.includes(stackId)
    ? now.filter((id) => id !== stackId)
    : [...now, stackId];
}

/** Whether this group is going to the show. */
export function isPacked(packed: string[] | undefined, stackId: string): boolean {
  return (packed ?? []).includes(stackId);
}

/**
 * Every card in the case right now.
 *
 * A packed id that matches no group contributes nothing rather than throwing —
 * a group can be deleted while it is still packed, and a stale id must not take
 * the whole summary down with it on the morning of a show.
 */
export function packedCards(db: DB): Card[] {
  return (db.packedStackIds ?? []).flatMap((id) => cardsInGroup(db, id));
}

export interface PackedSummary {
  cardCount: number;
  /** Unpriced cards INSIDE the case — the ones that actually cost a sale. */
  unpricedCount: number;
  valueCents: number;
  /** The packed group names, in the order they were packed. */
  names: string[];
}

/**
 * What is going in the car.
 *
 * The unpriced count is deliberately scoped to the packed groups. The whole
 * book's unpriced total is a night-before number; standing at a table, the only
 * one that costs money is a card you brought and cannot put a price on.
 */
export function packedSummary(db: DB): PackedSummary {
  const ids = db.packedStackIds ?? [];
  const stats = statsFor(packedCards(db));
  const names = ids
    .map((id) => {
      if (id === NO_GROUP) return 'No group';
      const stack = db.stacks.find((s) => s.id === id);
      return stack ? groupName(stack) : null;
    })
    .filter((n): n is string => n != null);

  return {
    cardCount: stats.cardCount,
    unpricedCount: stats.unpricedCount,
    valueCents: stats.valueCents,
    names,
  };
}
