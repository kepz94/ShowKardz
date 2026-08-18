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
const APPEND_ONLY = ['stacks', 'deals'] as const;
/** Collections whose records carry updatedAt and can change. */
const MUTABLE = ['cards', 'receipts'] as const;

export function changedDocs(prev: DB, next: DB): DocRef[] {
  const out: DocRef[] = [];

  for (const collection of APPEND_ONLY) {
    const seen = new Set(prev[collection].map((r) => r.id));
    for (const record of next[collection]) {
      if (!seen.has(record.id)) out.push({ collection, id: record.id });
    }
  }

  for (const collection of MUTABLE) {
    const before = new Map(prev[collection].map((r) => [r.id, r.updatedAt]));
    for (const record of next[collection]) {
      if (before.get(record.id) !== record.updatedAt) out.push({ collection, id: record.id });
    }
  }

  return out;
}
