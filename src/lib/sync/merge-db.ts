/**
 * Reconciling this device's records with another's.
 *
 * Each collection has its own rule, decided here rather than discovered in
 * production:
 *
 *   stacks   — last-write-wins on updatedAt. They WERE append-only, from when a
 *              group was three fields declared once and never touched again. A
 *              group is a name now, and a name can be corrected, so a rename is
 *              an edit and has to travel like one.
 *   cards    — SOLD WINS, then last-write-wins (lib/merge.ts). The physical card
 *              is the real lock: one card, one hand.
 *   deals    — immutable once rung up. Union by id; a deal is never edited, so
 *              two copies of the same id are the same deal.
 *   receipts — last-write-wins on updatedAt, which carries deletions too: a
 *              tombstone is a write, so it travels like any other edit and a
 *              later edit can legitimately undo it.
 *
 * The function is symmetric on cards — both devices reach the same answer
 * whichever side they call it from — so a merge cannot oscillate.
 */
import type { Card, DB, Deal, Receipt, Show, Stack } from '../../types';
import { mergeCard } from '../merge';

/** Union by id, keeping the first copy seen. For records that never change. */
function unionById<T extends { id: string }>(a: T[], b: T[]): T[] {
  const out = new Map<string, T>();
  for (const item of a) out.set(item.id, item);
  for (const item of b) if (!out.has(item.id)) out.set(item.id, item);
  return [...out.values()];
}

/** Merge by id with a per-record rule. */
function mergeById<T extends { id: string }>(a: T[], b: T[], pick: (x: T, y: T) => T): T[] {
  const out = new Map<string, T>();
  for (const item of a) out.set(item.id, item);
  for (const item of b) {
    const mine = out.get(item.id);
    out.set(item.id, mine ? pick(mine, item) : item);
  }
  return [...out.values()];
}

const lastWriteWins = <T extends { updatedAt: string }>(a: T, b: T): T =>
  a.updatedAt >= b.updatedAt ? a : b;

/**
 * When a record was last written, for a record whose updatedAt is optional.
 *
 * A group only gets an updatedAt when it is renamed, and one made before groups
 * were renameable has none at all. Falling back to createdAt makes "never
 * edited" comparable with "edited", so a rename beats an original and two
 * originals tie — which is the correct answer, since they are the same record.
 */
const stampOf = (r: { createdAt: string; updatedAt?: string }): string => r.updatedAt ?? r.createdAt;

/** Later write wins; a tie keeps the local copy so the merge cannot oscillate. */
const pickStack = (a: Stack, b: Stack): Stack => (stampOf(a) >= stampOf(b) ? a : b);

/** Same rule for shows: later write wins, a tie keeps the local copy. */
const pickShow = (a: Show, b: Show): Show => (stampOf(a) >= stampOf(b) ? a : b);

export function mergeDb(local: DB, remote: DB): DB {
  return {
    stacks: mergeById<Stack>(local.stacks, remote.stacks, pickStack),
    cards: mergeById<Card>(local.cards, remote.cards, mergeCard),
    deals: unionById<Deal>(local.deals, remote.deals),
    receipts: mergeById<Receipt>(local.receipts, remote.receipts, lastWriteWins),
    /*
     * Shows are last-write-wins on updatedAt, falling back to createdAt for one
     * never edited. A show carries its own packing list, so unlike the old
     * device-local field this DOES travel: pack the case on the laptop, sell
     * from the phone.
     */
    shows: mergeById<Show>(local.shows, remote.shows, pickShow),
  };
}
