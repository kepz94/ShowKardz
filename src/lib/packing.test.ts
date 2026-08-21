import { describe, expect, it } from 'vitest';
import { EMPTY_DB, type Card, type DB, type Stack } from '../types';
import { isPacked, packedCards, packedSummary, togglePacked } from './packing';

const stack = (id: string, name: string): Stack => ({
  id, name, createdAt: '2026-08-19T00:00:00.000Z',
});

const card = (
  id: string, stackId: string | undefined,
  status: Card['status'], priceCents?: number,
): Card => ({
  id,
  number: id,
  name: `Card ${id}`,
  status,
  stackId,
  priceCents,
  createdAt: '2026-08-19T00:00:00.000Z',
  updatedAt: '2026-08-19T00:00:00.000Z',
});

const db = (over: Partial<DB>): DB => ({ ...EMPTY_DB, ...over });

describe('togglePacked', () => {
  it('packs a group that was not packed', () => {
    expect(togglePacked(undefined, 'a')).toEqual(['a']);
  });

  it('unpacks a group that was packed', () => {
    expect(togglePacked(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('is its own inverse, so the case cannot drift from what was tapped', () => {
    expect(togglePacked(togglePacked(['a'], 'b'), 'b')).toEqual(['a']);
  });

  it('never packs the same group twice', () => {
    expect(togglePacked(togglePacked(undefined, 'a'), 'a')).toEqual([]);
  });

  it('leaves the other groups in the order they were packed', () => {
    expect(togglePacked(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });
});

describe('isPacked', () => {
  it('is false when nothing has ever been packed', () => {
    expect(isPacked(undefined, 'a')).toBe(false);
  });

  it('finds a packed group', () => {
    expect(isPacked(['a', 'b'], 'b')).toBe(true);
    expect(isPacked(['a', 'b'], 'c')).toBe(false);
  });
});

describe('packedCards', () => {
  const base = db({
    stacks: [stack('g1', 'Prizm'), stack('g2', 'Dollar box')],
    cards: [
      card('1', 'g1', 'available', 2000),
      card('2', 'g1', 'unpriced'),
      card('3', 'g2', 'available', 500),
      card('4', undefined, 'available', 900),
    ],
  });

  it('is empty when nothing is packed', () => {
    expect(packedCards(db(base), [])).toEqual([]);
  });

  it('returns only the cards in the packed groups', () => {
    const got = packedCards(db(base), ['g1']);
    expect(got.map((c) => c.id).sort()).toEqual(['1', '2']);
  });

  it('can pack the loose cards, because they travel too', () => {
    // NO_GROUP is '' — the ungrouped bucket is packable like any other row.
    const got = packedCards(db(base), ['']);
    expect(got.map((c) => c.id)).toEqual(['4']);
  });

  it('ignores a packed id whose group no longer exists', () => {
    // A deleted group must not take the whole summary down with it.
    const got = packedCards(db(base), ['g1', 'gone']);
    expect(got.map((c) => c.id).sort()).toEqual(['1', '2']);
  });
});

describe('packedSummary', () => {
  const base = db({
    stacks: [stack('g1', 'Prizm'), stack('g2', 'Dollar box')],
    cards: [
      card('1', 'g1', 'available', 2000),
      card('2', 'g1', 'unpriced'),
      card('3', 'g2', 'available', 500),
      card('4', 'g1', 'sold', 3000),
    ],
  });

  it('reports nothing packed as zeros and no names', () => {
    expect(packedSummary(db(base), []))
      .toEqual({ cardCount: 0, unpricedCount: 0, valueCents: 0, names: [] });
  });

  it('counts and values only what is packed, and leaves sold out of both', () => {
    // A sold card is money already realized; it is not in the case any more.
    expect(packedSummary(db(base), ['g1']))
      .toEqual({ cardCount: 2, unpricedCount: 1, valueCents: 2000, names: ['Prizm'] });
  });

  it('adds up across every packed group', () => {
    expect(packedSummary(db(base), ['g1', 'g2']))
      .toEqual({ cardCount: 3, unpricedCount: 1, valueCents: 2500, names: ['Prizm', 'Dollar box'] });
  });

  it('counts unpriced cards INSIDE the case, not across the whole book', () => {
    // The warning that matters at a table is the one about cards you brought.
    const withOutsider = db({ ...base, cards: [...base.cards, card('5', 'g2', 'unpriced')] });
    expect(packedSummary(withOutsider, ['g1']).unpricedCount).toBe(1);
  });

  it('names the loose bucket so the summary is readable', () => {
    const loose = db({ ...base, cards: [...base.cards, card('6', undefined, 'available', 100)] });
    expect(packedSummary(loose, ['']).names).toEqual(['No group']);
  });
});
