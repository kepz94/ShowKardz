/**
 * Reconciling this device's records with another's.
 *
 * Each collection has its own rule, decided here rather than discovered in
 * production:
 *
 *   stacks   — append-only declarations. Union by id.
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
import type { Card, DB, Deal, Receipt, Stack } from '../../types';
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

export function mergeDb(local: DB, remote: DB): DB {
  return {
    stacks: unionById<Stack>(local.stacks, remote.stacks),
    cards: mergeById<Card>(local.cards, remote.cards, mergeCard),
    deals: unionById<Deal>(local.deals, remote.deals),
    receipts: mergeById<Receipt>(local.receipts, remote.receipts, lastWriteWins),
  };
}
