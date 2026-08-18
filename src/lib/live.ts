/**
 * The reader-side half of tombstoning.
 *
 * Deleted records stay in the store so a sync can tell "deleted here" from
 * "not synced here yet". Nothing in the UI may read the raw array — every
 * reader goes through here, or deleted expenses reappear on screen.
 */
import type { Receipt } from '../types';

export function liveReceipts(receipts: Receipt[]): Receipt[] {
  return receipts.filter((r) => r.deletedAt == null);
}
