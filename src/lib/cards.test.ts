import { describe, it, expect } from 'vitest';
import { isLive, liveCards } from './cards';
import type { Card, DB } from '../types';

const card = (id: string, number: string, over: Partial<Card> = {}): Card => ({
  id, number, name: '', status: 'unpriced',
  createdAt: '2026-08-19T10:00:00.000Z', updatedAt: '2026-08-19T10:00:00.000Z',
  ...over,
});

const db = (cards: Card[]): DB => ({ stacks: [], cards, deals: [], receipts: [] });

describe('liveCards', () => {
  it('keeps a card with no tombstone', () => {
    expect(isLive(card('a', '1'))).toBe(true);
  });

  it('drops a card carrying a tombstone', () => {
    expect(isLive(card('a', '1', { deletedAt: '2026-08-19T11:00:00.000Z' }))).toBe(false);
  });

  it('filters the deleted out of a db while leaving the record in place', () => {
    const state = db([
      card('a', '0001'),
      card('b', '0002', { deletedAt: '2026-08-19T11:00:00.000Z' }),
      card('c', '0003'),
    ]);
    expect(liveCards(state).map((c) => c.id)).toEqual(['a', 'c']);
    // The tombstone must survive in the raw list — sync reads that one.
    expect(state.cards).toHaveLength(3);
  });
});
