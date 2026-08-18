import { describe, it, expect } from 'vitest';
import { changedDocs } from './changes';
import { EMPTY_DB, type Card, type DB, type Receipt } from '../../types';

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

  it('pushes append-only records once, on first appearance', () => {
    const after = db({
      stacks: [{ id: 's1', year: '2023', product: 'Prizm', parallel: 'Base', createdAt: T1 }],
      deals: [{ id: 'd1', type: 'cash', lines: [], subtotalCents: 0, agreedCents: 0, createdAt: T1 }],
    });
    expect(changedDocs(EMPTY_DB, after)).toEqual([
      { collection: 'stacks', id: 's1' },
      { collection: 'deals', id: 'd1' },
    ]);
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
