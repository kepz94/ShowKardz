import { describe, it, expect } from 'vitest';
import { mergeDb } from './merge-db';
import { EMPTY_DB, type Card, type DB, type Deal, type Receipt, type Stack } from '../../types';

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

describe('groups across two devices', () => {
  const stack = (over: Partial<Stack> = {}): Stack => ({
    id: 's1', name: 'Prizm', createdAt: '2026-08-19T00:00:00Z', ...over,
  });

  it('adopts a rename made on the other device', () => {
    // Groups used to be union-by-id keeping the local copy, which silently threw
    // an incoming rename away and left the two devices disagreeing forever.
    const local: DB = { ...EMPTY_DB, stacks: [stack()] };
    const remote: DB = { ...EMPTY_DB, stacks: [stack({ name: 'Saturday table', updatedAt: '2026-08-19T09:00:00Z' })] };
    expect(mergeDb(local, remote).stacks[0]!.name).toBe('Saturday table');
  });

  it('keeps the local rename when it is the newer one', () => {
    const local: DB = { ...EMPTY_DB, stacks: [stack({ name: 'Mine', updatedAt: '2026-08-19T10:00:00Z' })] };
    const remote: DB = { ...EMPTY_DB, stacks: [stack({ name: 'Theirs', updatedAt: '2026-08-19T09:00:00Z' })] };
    expect(mergeDb(local, remote).stacks[0]!.name).toBe('Mine');
  });

  it('reaches the same answer whichever device merges', () => {
    const a: DB = { ...EMPTY_DB, stacks: [stack({ name: 'Older' })] };
    const b: DB = { ...EMPTY_DB, stacks: [stack({ name: 'Newer', updatedAt: '2026-08-19T09:00:00Z' })] };
    expect(mergeDb(a, b).stacks[0]!.name).toBe(mergeDb(b, a).stacks[0]!.name);
  });

  it('takes in a group the other device made', () => {
    const local: DB = { ...EMPTY_DB, stacks: [stack()] };
    const remote: DB = { ...EMPTY_DB, stacks: [stack({ id: 's2', name: 'Dollar box' })] };
    expect(mergeDb(local, remote).stacks.map((s) => s.id).sort()).toEqual(['s1', 's2']);
  });

  it('does not let a legacy group with no updatedAt beat a real rename', () => {
    const legacy = { id: 's1', year: '2023', product: 'Prizm', parallel: 'Base', createdAt: '2026-08-19T00:00:00Z' };
    const renamed = stack({ name: 'Saturday table', updatedAt: '2026-08-19T09:00:00Z' });
    expect(mergeDb({ ...EMPTY_DB, stacks: [legacy] }, { ...EMPTY_DB, stacks: [renamed] }).stacks[0]!.name)
      .toBe('Saturday table');
  });
});
