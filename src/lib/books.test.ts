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
  ({ stacks: [], cards: [], deals, receipts, shows: [] });

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

describe('bookSummary scoped to one show', () => {
  const atShow = (cents: number, showId?: string): Deal => ({
    ...deal(cents), id: `d-${cents}-${showId ?? 'none'}`, showId,
  });
  const cost = (cents: number, showId?: string): Receipt => ({
    ...receipt(cents), id: `r-${cents}-${showId ?? 'none'}`, showId,
  });

  it('totals only the deals rung up at that show', () => {
    const d = db([atShow(5000, 'sh1'), atShow(3000, 'sh1'), atShow(9999, 'sh2')], []);
    expect(bookSummary(d, 'sh1').takenCents).toBe(8000);
  });

  it('totals only the expenses charged to that show', () => {
    const d = db([], [cost(4000, 'sh1'), cost(1000, 'sh2'), cost(2500)]);
    expect(bookSummary(d, 'sh1').spentCents).toBe(4000);
  });

  it('nets the show\u2019s own takings against its own costs', () => {
    // A table fee is incurred BY the show. Leaving it out makes the show's
    // profit "takings with no costs", which is the most flattering possible lie.
    const d = db([atShow(10000, 'sh1')], [cost(4000, 'sh1'), cost(9999, 'sh2')]);
    const s = bookSummary(d, 'sh1');
    expect(s.spentCents).toBe(4000);
    expect(s.profitCents).toBe(6000);
  });

  it('still totals EVERYTHING when no show is named', () => {
    // Sales is the whole business: a calculator sale and a standing cost count.
    const d = db([atShow(5000, 'sh1'), atShow(4000)], [cost(1000, 'sh1'), cost(500)]);
    const s = bookSummary(d);
    expect(s.takenCents).toBe(9000);
    expect(s.spentCents).toBe(1500);
  });

  it('leaves a deal with no show out of every show', () => {
    const d = db([atShow(5000, 'sh1'), atShow(4000)], []);
    expect(bookSummary(d, 'sh1').takenCents).toBe(5000);
  });

  it('reports zeros for a show with nothing against it', () => {
    const s = bookSummary(db([atShow(5000, 'sh1')], [cost(100, 'sh1')]), 'sh-none');
    expect(s.takenCents).toBe(0);
    expect(s.spentCents).toBe(0);
    expect(s.profitCents).toBe(0);
    expect(s.byCategory).toEqual([]);
  });

  it('breaks a show\u2019s costs down by category, biggest first', () => {
    const d = db([], [
      { ...cost(1000, 'sh1'), category: 'travel' },
      { ...cost(4000, 'sh1'), category: 'table' },
      { ...cost(9999, 'sh2'), category: 'supplies' },
    ]);
    expect(bookSummary(d, 'sh1').byCategory.map((c) => c.category)).toEqual(['table', 'travel']);
  });
});
