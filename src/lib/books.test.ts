import { describe, it, expect } from 'vitest';
import { bookSummary } from './books';
import type { DB, Deal, Receipt } from '../types';

const deal = (agreedCents: number, subtotalCents = agreedCents): Deal => ({
  id: 'd' + agreedCents, type: 'cash', lines: [], subtotalCents, agreedCents,
  createdAt: '2026-08-18T12:00:00.000Z',
});

const receipt = (amountCents: number, category: Receipt['category'] = 'other'): Receipt => ({
  id: 'r' + amountCents + category, amountCents, category, note: '',
  createdAt: '2026-08-18T12:00:00.000Z', updatedAt: '2026-08-18T12:00:00.000Z',
});

const db = (deals: Deal[], receipts: Receipt[]): DB =>
  ({ stacks: [], cards: [], deals, receipts });

describe('bookSummary', () => {
  it('takes in what the deals actually realized', () => {
    expect(bookSummary(db([deal(8500), deal(1500)], [])).takenCents).toBe(10000);
  });

  it('reports what was asked, separately from what was taken', () => {
    expect(bookSummary(db([deal(8500, 10000)], [])).askedCents).toBe(10000);
  });

  it('sums the expenses', () => {
    expect(bookSummary(db([], [receipt(4000), receipt(1200)])).spentCents).toBe(5200);
  });

  it('nets expenses against sales — the number a show is actually judged on', () => {
    expect(bookSummary(db([deal(10000)], [receipt(4000)])).profitCents).toBe(6000);
  });

  it('goes negative when the table cost more than it took, rather than clamping at zero', () => {
    expect(bookSummary(db([deal(1000)], [receipt(4000)])).profitCents).toBe(-3000);
  });

  it('breaks expenses down by category for the ones present', () => {
    const s = bookSummary(db([], [receipt(4000, 'table'), receipt(1000, 'travel'), receipt(500, 'travel')]));
    expect(s.byCategory).toEqual([
      { category: 'table', totalCents: 4000 },
      { category: 'travel', totalCents: 1500 },
    ]);
  });

  it('orders the breakdown by size, so the biggest cost reads first', () => {
    const s = bookSummary(db([], [receipt(1000, 'travel'), receipt(9000, 'table')]));
    expect(s.byCategory[0]!.category).toBe('table');
  });

  it('is all zeros on an empty book, with no NaN anywhere', () => {
    const s = bookSummary(db([], []));
    expect(s).toEqual({
      takenCents: 0, askedCents: 0, spentCents: 0, profitCents: 0,
      dealCount: 0, cardsSold: 0, byCategory: [],
    });
  });
});
