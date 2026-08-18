/**
 * The books: what came in, what went out, what is left.
 *
 * Every figure is derived from the records on each call — there is no running
 * total anywhere in the app to drift out of step with the deals and receipts
 * that produced it.
 */
import type { DB, ExpenseCategory } from '../types';

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

export function bookSummary(db: DB): BookSummary {
  const takenCents = db.deals.reduce((sum, d) => sum + d.agreedCents, 0);
  const askedCents = db.deals.reduce((sum, d) => sum + d.subtotalCents, 0);
  const cardsSold = db.deals.reduce((sum, d) => sum + d.lines.length, 0);
  const spentCents = db.receipts.reduce((sum, r) => sum + r.amountCents, 0);

  const totals = new Map<ExpenseCategory, number>();
  for (const r of db.receipts) {
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
    dealCount: db.deals.length,
    cardsSold,
    byCategory,
  };
}
