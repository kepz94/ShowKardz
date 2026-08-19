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

export function mergeDb(local: DB, remote: DB): DB {
  return {
    stacks: mergeById<Stack>(local.stacks, remote.stacks, pickStack),
    cards: mergeById<Card>(local.cards, remote.cards, mergeCard),
    deals: unionById<Deal>(local.deals, remote.deals),
    receipts: mergeById<Receipt>(local.receipts, remote.receipts, lastWriteWins),
    /*
     * NOT MERGED — deliberately kept from THIS device.
     *
     * What is physically in one dealer's case is a fact about this trip and
     * this bag, not a record to reconcile: a phone and a laptop can disagree
     * and neither is wrong. It is never pushed (changedDocs only walks the
     * collections), so a remote copy is either absent or stale by definition.
     *
     * It is carried explicitly rather than left out, because this function
     * rebuilds the DB field by field and anything it forgets is DROPPED. A
     * merge that quietly emptied the case would surface on the morning of a
     * show, with sync reporting perfect health because nothing failed.
     */
    packedStackIds: local.packedStackIds ?? [],
  };
}
