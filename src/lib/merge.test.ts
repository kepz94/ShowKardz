import { describe, it, expect } from 'vitest';
import { mergeCard } from './merge';
import type { Card } from '../types';

const base: Card = {
  id: 'c1', number: '0455', name: 'Anthony Edwards', stackId: 's1', status: 'available',
  priceCents: 5000, createdAt: '2026-08-18T00:00:00.000Z', updatedAt: '2026-08-18T10:00:00.000Z',
};

const sold: Card = {
  ...base, status: 'sold', realizedCents: 4200, soldAt: '2026-08-18T09:00:00.000Z',
  dealId: 'd1', updatedAt: '2026-08-18T09:00:00.000Z',
};

describe('mergeCard — sold wins', () => {
  it('keeps the sold record even when the other side is newer', () => {
    // The physical card is the lock: one card, one hand. A later edit elsewhere
    // cannot un-sell something already out of the case.
    expect(mergeCard(base, sold).status).toBe('sold');
  });

  it('keeps the sold record regardless of which side it arrives on', () => {
    expect(mergeCard(sold, base).status).toBe('sold');
  });

  it('carries the realized figure with the sold record', () => {
    expect(mergeCard(base, sold).realizedCents).toBe(4200);
  });

  it('takes the earlier sale when both sides sold it, because that hand happened first', () => {
    const later: Card = { ...sold, soldAt: '2026-08-18T11:00:00.000Z', realizedCents: 3000 };
    expect(mergeCard(later, sold).realizedCents).toBe(4200);
  });

  it('falls back to last-write-wins when neither side is sold', () => {
    const newer: Card = { ...base, priceCents: 6000, updatedAt: '2026-08-18T12:00:00.000Z' };
    expect(mergeCard(base, newer).priceCents).toBe(6000);
    expect(mergeCard(newer, base).priceCents).toBe(6000);
  });
});
