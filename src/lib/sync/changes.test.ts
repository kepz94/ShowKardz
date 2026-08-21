import { describe, it, expect } from 'vitest';
import { changedDocs, withPushed } from './changes';
import { EMPTY_DB, type Card, type DB, type Receipt, type Stack } from '../../types';

const T1 = '2026-08-18T10:00:00.000Z';
const T2 = '2026-08-18T11:00:00.000Z';

const card = (id: string, over: Partial<Card> = {}): Card => ({
  id, number: id, name: 'P', stackId: 's1', status: 'available',
  createdAt: T1, updatedAt: T1, ...over,
});
const receipt = (id: string, over: Partial<Receipt> = {}): Receipt => ({
  id, amountCents: 100, category: 'other', note: '', createdAt: T1, updatedAt: T1, ...over,
});
const db = (over: Partial<DB> = {}): DB => ({ ...EMPTY_DB, ...over });

describe('changedDocs', () => {
  it('pushes nothing when nothing changed', () => {
    const same = db({ cards: [card('a')] });
    expect(changedDocs(same, same)).toEqual([]);
  });

  it('pushes a newly added card', () => {
    expect(changedDocs(EMPTY_DB, db({ cards: [card('a')] })))
      .toEqual([{ collection: 'cards', id: 'a' }]);
  });

  it('pushes a card whose updatedAt moved', () => {
    const before = db({ cards: [card('a')] });
    const after = db({ cards: [card('a', { priceCents: 900, updatedAt: T2 })] });
    expect(changedDocs(before, after)).toEqual([{ collection: 'cards', id: 'a' }]);
  });

  it('does NOT push a card that was only re-created identically', () => {
    const before = db({ cards: [card('a')] });
    const after = db({ cards: [{ ...card('a') }] });
    expect(changedDocs(before, after)).toEqual([]);
  });

  it('pushes a tombstoned receipt, because a deletion is a write', () => {
    const before = db({ receipts: [receipt('r')] });
    const after = db({ receipts: [receipt('r', { deletedAt: T2, updatedAt: T2 })] });
    expect(changedDocs(before, after)).toEqual([{ collection: 'receipts', id: 'r' }]);
  });

  it('pushes a new group and a new deal on first appearance', () => {
    // Order is not part of the contract: a deal is append-only and a group is
    // mutable now, so the two come out of different passes.
    const after = db({
      stacks: [{ id: 's1', name: '2023 Prizm', createdAt: T1 }],
      deals: [{ id: 'd1', type: 'cash', lines: [], subtotalCents: 0, agreedCents: 0, createdAt: T1 }],
    });
    expect(changedDocs(EMPTY_DB, after)).toEqual(
      expect.arrayContaining([
        { collection: 'stacks', id: 's1' },
        { collection: 'deals', id: 'd1' },
      ]),
    );
    expect(changedDocs(EMPTY_DB, after)).toHaveLength(2);
  });

  it('pushes a deal only once, because a deal is never edited', () => {
    const deal = { id: 'd1', type: 'cash' as const, lines: [], subtotalCents: 0, agreedCents: 0, createdAt: T1 };
    expect(changedDocs(db({ deals: [deal] }), db({ deals: [deal] }))).toEqual([]);
  });

  it('pushes every changed record, not just the first', () => {
    const after = db({ cards: [card('a', { updatedAt: T2 }), card('b')] });
    expect(changedDocs(db({ cards: [card('a')] }), after)).toHaveLength(2);
  });

  it('never pushes a removal — records are tombstoned, never dropped', () => {
    // If a row vanishes locally it was not a user deletion, so there is nothing
    // to send. Sending a delete here would let a merge artifact destroy data.
    expect(changedDocs(db({ cards: [card('a')] }), EMPTY_DB)).toEqual([]);
  });
});

describe('a renamed group', () => {
  const stack = (over: Partial<Stack> = {}): Stack => ({
    id: 's1', name: 'Prizm', createdAt: '2026-08-19T00:00:00Z', ...over,
  });

  it('pushes a brand-new group', () => {
    // A new group carries no updatedAt, so a stamp-only comparison reports it
    // unchanged and it never leaves the device. Presence is what catches it.
    const next: DB = { ...EMPTY_DB, stacks: [stack()] };
    expect(changedDocs(EMPTY_DB, next)).toEqual([{ collection: 'stacks', id: 's1' }]);
  });

  it('pushes the rename, not just the original', () => {
    const prev: DB = { ...EMPTY_DB, stacks: [stack()] };
    const next: DB = { ...EMPTY_DB, stacks: [stack({ name: 'Saturday table', updatedAt: '2026-08-19T09:00:00Z' })] };
    expect(changedDocs(prev, next)).toEqual([{ collection: 'stacks', id: 's1' }]);
  });

  it('pushes nothing when a group did not change', () => {
    const prev: DB = { ...EMPTY_DB, stacks: [stack()] };
    expect(changedDocs(prev, { ...EMPTY_DB, stacks: [stack()] })).toEqual([]);
  });
});

describe('withPushed', () => {
  it('stops a pushed record from being pushed again', () => {
    const next = db({ cards: [card('a')] });
    const refs = changedDocs(EMPTY_DB, next);
    expect(refs).toEqual([{ collection: 'cards', id: 'a' }]);

    const known = withPushed(EMPTY_DB, next, refs);
    expect(changedDocs(known, next)).toEqual([]);
  });

  it('leaves everything else on the server alone', () => {
    const known = db({ cards: [card('a')] });
    const next = db({ cards: [card('a')], receipts: [receipt('r1')] });

    const after = withPushed(known, next, [{ collection: 'receipts', id: 'r1' }]);
    expect(after.cards).toHaveLength(1);
    expect(after.receipts).toHaveLength(1);
  });

  it('replaces rather than duplicates when a record is pushed twice', () => {
    const known = withPushed(EMPTY_DB, db({ cards: [card('a')] }),
      [{ collection: 'cards', id: 'a' }]);

    const edited = db({ cards: [card('a', { number: '456', updatedAt: T2 })] });
    const refs = changedDocs(known, edited);
    expect(refs).toEqual([{ collection: 'cards', id: 'a' }]);

    const after = withPushed(known, edited, refs);
    expect(after.cards).toHaveLength(1);
    expect(after.cards[0]!.number).toBe('456');
  });
});

/*
 * The bug the whole "compare against the server" model exists to kill.
 *
 * The push set used to be measured against the last state believed to be
 * synced, seeded from whatever was on the device at launch. At the moment of
 * sign-in those were the same object, so an existing collection had nothing to
 * push and stayed on one phone forever while the bar said "Syncing".
 */
describe('a collection built before signing in', () => {
  it('is entirely unsent as far as the server is concerned', () => {
    const local = db({
      stacks: [{ id: 'g1', name: 'Prizm', createdAt: T1 } as Stack],
      cards: [card('a')],
    });

    // The old model, asserted so that returning to it fails here.
    expect(changedDocs(local, local)).toEqual([]);

    // The new one: the server has described nothing, so all of it goes up.
    expect(changedDocs(EMPTY_DB, local)).toEqual([
      { collection: 'stacks', id: 'g1' },
      { collection: 'cards', id: 'a' },
    ]);
  });
});
