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
