import { describe, it, expect } from 'vitest';
import { reducer } from './reducer';
import { EMPTY_DB, type DB } from '../types';

const NOW = '2026-08-18T12:00:00.000Z';

const withStack = (): DB =>
  reducer(EMPTY_DB, {
    type: 'stack/add', id: 's1', year: '2023', product: 'Panini Prizm',
    parallel: 'Base', now: NOW,
  });

const withCards = (): DB => {
  let db = withStack();
  db = reducer(db, { type: 'card/add', id: 'c1', stackId: 's1', number: '0455', name: 'Edwards', now: NOW });
  db = reducer(db, { type: 'card/add', id: 'c2', stackId: 's1', number: '0456', name: 'Wembanyama', now: NOW });
  db = reducer(db, { type: 'card/price', cardId: 'c1', priceCents: 5000, now: NOW });
  db = reducer(db, { type: 'card/price', cardId: 'c2', priceCents: 5000, floorCents: 4000, now: NOW });
  return db;
};

describe('stack/add', () => {
  it('files the declaration', () => {
    expect(withStack().stacks).toHaveLength(1);
  });
});

describe('card/add', () => {
  it('lands the card unpriced, on purpose — intake and pricing are separate passes', () => {
    expect(withStack() && reducer(withStack(), {
      type: 'card/add', id: 'c1', stackId: 's1', number: '0455', name: 'Edwards', now: NOW,
    }).cards[0]!.status).toBe('unpriced');
  });

  it('BLOCKS a duplicate sticker number — the one integrity rule', () => {
    let db = withStack();
    db = reducer(db, { type: 'card/add', id: 'c1', stackId: 's1', number: '0455', name: 'Edwards', now: NOW });
    db = reducer(db, { type: 'card/add', id: 'c2', stackId: 's1', number: '0455', name: 'Someone', now: NOW });
    expect(db.cards).toHaveLength(1);
  });
});

describe('card/price', () => {
  it('makes a priced card available to sell', () => {
    expect(withCards().cards.find((c) => c.id === 'c1')!.status).toBe('available');
  });

  it('stores the floor when one is given', () => {
    expect(withCards().cards.find((c) => c.id === 'c2')!.floorCents).toBe(4000);
  });
});

describe('deal/record', () => {
  const db = reducer(withCards(), {
    type: 'deal/record', id: 'd1', cardIds: ['c1', 'c2'], agreedCents: 8500, now: NOW,
  });

  it('marks every card in the deal sold', () => {
    expect(db.cards.every((c) => c.status === 'sold')).toBe(true);
  });

  it('derives the subtotal from the card records, never a counter', () => {
    expect(db.deals[0]!.subtotalCents).toBe(10000);
  });

  it('splits the agreed total across the cards so the books add up to what was paid', () => {
    const realized = db.cards.map((c) => c.realizedCents!);
    expect(realized.reduce((a, b) => a + b, 0)).toBe(8500);
  });

  it('snapshots the title and ask onto the deal, so a later reprice cannot rewrite history', () => {
    expect(db.deals[0]!.lines[0]!.askCents).toBe(5000);
    expect(db.deals[0]!.lines[0]!.title).toContain('Edwards');
  });

  it('links each card back to its deal', () => {
    expect(db.cards.find((c) => c.id === 'c1')!.dealId).toBe('d1');
  });

  it('refuses to sell a card that is already sold, so a double-tap cannot sell it twice', () => {
    const again = reducer(db, {
      type: 'deal/record', id: 'd2', cardIds: ['c1'], agreedCents: 1000, now: NOW,
    });
    expect(again.deals).toHaveLength(1);
  });

  it('records nothing for an empty cart', () => {
    const empty = reducer(withCards(), {
      type: 'deal/record', id: 'd9', cardIds: [], agreedCents: 0, now: NOW,
    });
    expect(empty.deals).toHaveLength(0);
  });
});
