/**
 * The conflict rule for offline-tolerant sync: SOLD WINS.
 *
 * The physical card is the real lock — one card, one hand — so genuine
 * conflicts are rare by nature. When they do happen, the sale is the event that
 * actually occurred in the world; an edit made on another device cannot put a
 * card back in the case. Two sales of the same card means one of them was a
 * mistake, and the earlier hand is the one that happened.
 *
 * Everything else is last-write-wins on `updatedAt`.
 */
import type { Card } from '../types';

export function mergeCard(a: Card, b: Card): Card {
  /*
   * DELETED WINS, checked before everything else.
   *
   * A tombstone only works if it survives the merge. If sold-wins ran first, a
   * card deleted on the phone and sold on the laptop would come back on the
   * next pull — the resurrection bug with an extra step. Letting the delete win
   * does not lose the sale: the Deal carries its own snapshot of the number,
   * title and amounts, so Sales and the day log still show it. What goes is the
   * card, which is what was asked for.
   *
   * Two deletes: the earlier one is when the dealer decided, so it holds.
   */
  const aDead = a.deletedAt != null;
  const bDead = b.deletedAt != null;
  if (aDead && bDead) return (a.deletedAt ?? '') <= (b.deletedAt ?? '') ? a : b;
  if (aDead) return a;
  if (bDead) return b;

  const aSold = a.status === 'sold';
  const bSold = b.status === 'sold';

  if (aSold && bSold) {
    // Both sold: the earlier sale is the one that happened.
    return (a.soldAt ?? '') <= (b.soldAt ?? '') ? a : b;
  }
  if (aSold) return a;
  if (bSold) return b;

  return a.updatedAt >= b.updatedAt ? a : b;
}
