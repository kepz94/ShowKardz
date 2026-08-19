/**
 * What to push after a local change.
 *
 * Comparing two states beats maintaining a dirty flag: there is no bookkeeping
 * to get out of step with the records, and a state arrived at by any route —
 * a user action, a merge, a restore — produces the same answer.
 *
 * One deliberate omission: a record that disappears locally is NEVER pushed as
 * a delete. Deletions are tombstones (a write with deletedAt), so a row that
 * merely vanished is a merge artifact, and turning that into a remote delete
 * would let a local glitch destroy the record everywhere.
 */
import type { DB } from '../../types';

export type SyncCollection = 'stacks' | 'cards' | 'deals' | 'receipts';

export interface DocRef {
  collection: SyncCollection;
  id: string;
}

/** Collections whose records are written once and never edited. */
const APPEND_ONLY = ['deals'] as const;
/**
 * Collections whose records can change after they are written.
 *
 * `stacks` moved here when a group became a renameable name. Left as append-only
 * it would be pushed once and never again, so a rename would sit on the device
 * that made it while every other device kept the old name — with sync reporting
 * perfect health, because nothing failed.
 */
const MUTABLE = ['stacks', 'cards', 'receipts'] as const;

/**
 * When a record was last written. `updatedAt` is optional on a group — one never
 * renamed has none — so createdAt stands in for it.
 */
const stampOf = (r: { createdAt: string; updatedAt?: string }): string => r.updatedAt ?? r.createdAt;

export function changedDocs(prev: DB, next: DB): DocRef[] {
  const out: DocRef[] = [];

  for (const collection of APPEND_ONLY) {
    const seen = new Set(prev[collection].map((r) => r.id));
    for (const record of next[collection]) {
      if (!seen.has(record.id)) out.push({ collection, id: record.id });
    }
  }

  for (const collection of MUTABLE) {
    const before = new Map(prev[collection].map((r) => [r.id, stampOf(r)]));
    for (const record of next[collection]) {
      // Presence is checked separately from the stamp: comparing stamps alone
      // would miss a brand-new record whose stamp is absent on both sides.
      if (!before.has(record.id) || before.get(record.id) !== stampOf(record)) {
        out.push({ collection, id: record.id });
      }
    }
  }

  return out;
}
