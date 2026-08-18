import { describe, it, expect } from 'vitest';
import { liveReceipts } from './live';
import type { Receipt } from '../types';

const r = (id: string, over: Partial<Receipt> = {}): Receipt => ({
  id, amountCents: 1000, category: 'other', note: '',
  createdAt: '2026-08-18T12:00:00.000Z', updatedAt: '2026-08-18T12:00:00.000Z', ...over,
});

describe('liveReceipts', () => {
  it('returns receipts that are not deleted', () => {
    expect(liveReceipts([r('a'), r('b')])).toHaveLength(2);
  });

  it('hides tombstoned receipts from every reader', () => {
    expect(liveReceipts([r('a'), r('b', { deletedAt: '2026-08-18T13:00:00.000Z' })]))
      .toEqual([r('a')]);
  });

  it('is empty when everything is deleted, not undefined', () => {
    expect(liveReceipts([r('a', { deletedAt: '2026-08-18T13:00:00.000Z' })])).toEqual([]);
  });
});
