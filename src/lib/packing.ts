/**
 * What is in the case.
 *
 * A case is packed by GROUP, not by card. At a thousand cards a per-card
 * checklist is unusable, and a group is the physical unit that gets picked up
 * and carried anyway — so a packed case is a list of stack ids and nothing else.
 *
 * THESE TAKE THE ID LIST, NOT THE DB. Packing used to live on the DB, as one
 * case for the whole app. It belongs to a SHOW now (see types.ts), because two
 * shows have two different cases and last month's packing list is part of last
 * month's record. Keeping these functions on a plain string[] is what lets the
 * same logic serve any show without knowing which one it is looking at.
 *
 * NOTHING IS COUNTED HERE, only derived. Every figure is computed from the cards
 * on each call, so a card added to a packed group is in the case immediately —
 * the case is a query, not a snapshot.
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

/** Whether this group is going. */
export function isPacked(packed: string[] | undefined, stackId: string): boolean {
  return (packed ?? []).includes(stackId);
}

/**
 * Every card in the case.
 *
 * A packed id matching no group contributes nothing rather than throwing — a
 * group can be deleted while a show still lists it, and a stale id must not
 * take the whole summary down on the morning of a show.
 */
export function packedCards(db: DB, packed: string[] | undefined): Card[] {
  return (packed ?? []).flatMap((id) => cardsInGroup(db, id));
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
 * The unpriced count is scoped to the packed groups on purpose. The whole
 * book's unpriced total is a night-before number; standing at a table, the only
 * one that costs money is a card you brought and cannot put a price on.
 */
export function packedSummary(db: DB, packed: string[] | undefined): PackedSummary {
  const ids = packed ?? [];
  const stats = statsFor(packedCards(db, ids));
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
