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

export type SyncCollection = 'stacks' | 'cards' | 'deals' | 'receipts' | 'shows';

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
const MUTABLE = ['stacks', 'cards', 'receipts', 'shows'] as const;

/**
 * When a record was last written. `updatedAt` is optional on a group — one never
 * renamed has none — so createdAt stands in for it.
 */
const stampOf = (r: { createdAt: string; updatedAt?: string }): string => r.updatedAt ?? r.createdAt;

/**
 * The server's copy, updated with records we just successfully pushed.
 *
 * Without this a successful push would be forgotten the moment the effect ran
 * again, and the same records would be re-sent on every subsequent change. The
 * listener does eventually echo a write back, but "eventually" is not a thing
 * to build a push set on.
 */
export function withPushed(known: DB, source: DB, refs: DocRef[]): DB {
  const next: DB = { ...known };
  for (const ref of refs) {
    const record = (source[ref.collection] as { id: string }[]).find((r) => r.id === ref.id);
    if (!record) continue;
    const without = (next[ref.collection] as { id: string }[]).filter((r) => r.id !== ref.id);
    // The cast is contained here: DocRef.collection is a union, so TypeScript
    // cannot see that the record and the list it goes into are the same type.
    (next[ref.collection] as unknown[]) = [...without, record];
  }
  return next;
}

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
