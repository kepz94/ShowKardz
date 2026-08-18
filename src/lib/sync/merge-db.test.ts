import { describe, it, expect } from 'vitest';
import { mergeDb } from './merge-db';
import { EMPTY_DB, type Card, type DB, type Deal, type Receipt } from '../../types';

const T1 = '2026-08-18T10:00:00.000Z';
const T2 = '2026-08-18T11:00:00.000Z';

const card = (id: string, over: Partial<Card> = {}): Card => ({
  id, number: id, name: 'Player', stackId: 's1', status: 'available', priceCents: 5000,
  createdAt: T1, updatedAt: T1, ...over,
});
const deal = (id: string): Deal => ({
  id, type: 'cash', lines: [], subtotalCents: 5000, agreedCents: 4000, createdAt: T1,
});
const receipt = (id: string, over: Partial<Receipt> = {}): Receipt => ({
  id, amountCents: 1000, category: 'other', note: '', createdAt: T1, updatedAt: T1, ...over,
});

const db = (over: Partial<DB> = {}): DB => ({ ...EMPTY_DB, ...over });

describe('mergeDb — cards', () => {
  it('takes records the other side has and this one does not', () => {
    const out = mergeDb(db({ cards: [card('a')] }), db({ cards: [card('b')] }));
    expect(out.cards.map((c) => c.id).sort()).toEqual(['a', 'b']);
  });

  it('keeps a sale even when the other side has a newer unsold copy', () => {
    const sold = card('a', { status: 'sold', realizedCents: 4200, soldAt: T1, updatedAt: T1 });
    const editedLater = card('a', { priceCents: 9999, updatedAt: T2 });
    expect(mergeDb(db({ cards: [editedLater] }), db({ cards: [sold] })).cards[0]!.status)
      .toBe('sold');
  });

  it('falls back to last-write-wins when neither side sold', () => {
    const newer = card('a', { priceCents: 9999, updatedAt: T2 });
    expect(mergeDb(db({ cards: [card('a')] }), db({ cards: [newer] })).cards[0]!.priceCents)
      .toBe(9999);
  });
});

describe('mergeDb — deals', () => {
  it('unions deals, which are immutable once rung up', () => {
    const out = mergeDb(db({ deals: [deal('d1')] }), db({ deals: [deal('d2')] }));
    expect(out.deals).toHaveLength(2);
  });

  it('never duplicates a deal present on both sides', () => {
    const out = mergeDb(db({ deals: [deal('d1')] }), db({ deals: [deal('d1')] }));
    expect(out.deals).toHaveLength(1);
  });
});

describe('mergeDb — receipts', () => {
  it('takes the newer edit', () => {
    const newer = receipt('r1', { amountCents: 7777, updatedAt: T2 });
    expect(mergeDb(db({ receipts: [receipt('r1')] }), db({ receipts: [newer] })).receipts[0]!.amountCents)
      .toBe(7777);
  });

  it('lets a deletion travel — a tombstone is a write, not an absence', () => {
    const deleted = receipt('r1', { deletedAt: T2, updatedAt: T2 });
    const out = mergeDb(db({ receipts: [receipt('r1')] }), db({ receipts: [deleted] }));
    expect(out.receipts[0]!.deletedAt).toBe(T2);
  });

  it('does NOT resurrect a receipt deleted here but still present there', () => {
    // The remote copy is older, so last-write-wins keeps it dead. This is the
    // case a hard delete would have got wrong.
    const deletedHere = receipt('r1', { deletedAt: T2, updatedAt: T2 });
    const out = mergeDb(db({ receipts: [deletedHere] }), db({ receipts: [receipt('r1')] }));
    expect(out.receipts[0]!.deletedAt).toBe(T2);
  });

  it('lets a later edit win over an earlier deletion, so an undo can travel', () => {
    const deletedEarlier = receipt('r1', { deletedAt: T1, updatedAt: T1 });
    const editedLater = receipt('r1', { amountCents: 4242, updatedAt: T2 });
    const out = mergeDb(db({ receipts: [deletedEarlier] }), db({ receipts: [editedLater] }));
    expect(out.receipts[0]!.deletedAt).toBeUndefined();
  });
});

describe('mergeDb — shape', () => {
  it('is a no-op against an empty other side', () => {
    const local = db({ cards: [card('a')], deals: [deal('d')], receipts: [receipt('r')] });
    expect(mergeDb(local, EMPTY_DB)).toEqual(local);
  });

  it('adopts everything when this side is empty', () => {
    const remote = db({ cards: [card('a')], deals: [deal('d')], receipts: [receipt('r')] });
    expect(mergeDb(EMPTY_DB, remote)).toEqual(remote);
  });

  it('is symmetric on cards — both devices reach the same answer', () => {
    const sold = card('a', { status: 'sold', soldAt: T1, updatedAt: T1 });
    const edited = card('a', { priceCents: 1, updatedAt: T2 });
    expect(mergeDb(db({ cards: [edited] }), db({ cards: [sold] })).cards[0])
      .toEqual(mergeDb(db({ cards: [sold] }), db({ cards: [edited] })).cards[0]);
  });
});
