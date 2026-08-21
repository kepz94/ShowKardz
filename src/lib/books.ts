/**
 * The books: what came in, what went out, what is left.
 *
 * Every figure is derived from the records on each call — there is no running
 * total anywhere in the app to drift out of step with the deals and receipts
 * that produced it.
 */
import type { DB, ExpenseCategory } from '../types';
import { liveReceipts } from './live';

export interface CategoryTotal {
  category: ExpenseCategory;
  totalCents: number;
}

export interface BookSummary {
  /** What buyers actually paid. */
  takenCents: number;
  /** What those same cards were asking. */
  askedCents: number;
  /** What the day cost to run. */
  spentCents: number;
  /** taken − spent. Negative is a real answer and is shown as one. */
  profitCents: number;
  dealCount: number;
  cardsSold: number;
  /** Only the categories that actually have expenses, biggest first. */
  byCategory: CategoryTotal[];
}

/**
 * The books, for the whole business or for one show.
 *
 * Pass a showId and both sides are scoped to it: only deals rung up there, and
 * only expenses charged to it. That pairing is the point — a table fee is
 * incurred BY a show, and totalling a show's takings without its costs is the
 * most flattering possible lie about how the day went.
 *
 * With no showId this is the whole business, which is what Sales is: a
 * calculator sale and a standing cost both belong there and to no show.
 */
export function bookSummary(db: DB, showId?: string): BookSummary {
  const deals = showId == null ? db.deals : db.deals.filter((d) => d.showId === showId);
  const takenCents = deals.reduce((sum, d) => sum + d.agreedCents, 0);
  const askedCents = deals.reduce((sum, d) => sum + d.subtotalCents, 0);
  const cardsSold = deals.reduce((sum, d) => sum + d.lines.length, 0);
  // Tombstoned expenses are gone as far as the books are concerned.
  const allReceipts = liveReceipts(db.receipts);
  const receipts = showId == null ? allReceipts : allReceipts.filter((r) => r.showId === showId);
  const spentCents = receipts.reduce((sum, r) => sum + r.amountCents, 0);

  const totals = new Map<ExpenseCategory, number>();
  for (const r of receipts) {
    totals.set(r.category, (totals.get(r.category) ?? 0) + r.amountCents);
  }

  const byCategory = [...totals.entries()]
    .map(([category, totalCents]) => ({ category, totalCents }))
    .sort((a, b) => b.totalCents - a.totalCents);

  return {
    takenCents,
    askedCents,
    spentCents,
    profitCents: takenCents - spentCents,
    dealCount: deals.length,
    cardsSold,
    byCategory,
  };
}
