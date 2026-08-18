import { describe, it, expect } from 'vitest';
import { checkFloors } from './floors';

const A = { priceCents: 5000 };                    // no floor
const B = { priceCents: 5000, floorCents: 4000 };  // floor $40

describe('checkFloors', () => {
  it('reports no floor at all when nothing in the bundle has one', () => {
    expect(checkFloors([A, A], 5000).hasFloor).toBe(false);
  });

  it('never breaches when nothing has a floor', () => {
    expect(checkFloors([A, A], 100).breached).toBe(false);
  });

  it('is clear when a single card lands above its floor', () => {
    expect(checkFloors([B], 4500).breached).toBe(false);
  });

  it('breaches when a single card lands under its floor', () => {
    expect(checkFloors([B], 3500).breached).toBe(true);
  });

  it('reports how far under the floor the deal is', () => {
    expect(checkFloors([B], 3500).shortfallCents).toBe(500);
  });

  it('judges a bundled card on ITS SHARE, not on the bundle total', () => {
    // $100 of ask sold for $50: B's half is $25, under its $40 floor — even
    // though $50 comfortably clears the $40 combined floor. Comparing the whole
    // bundle against a partial floor sum is what hides this.
    expect(checkFloors([A, B], 5000).breached).toBe(true);
  });

  it('clears the same bundle at a price where every share holds', () => {
    // $85 bundle: B's share is $42.50, above its $40 floor.
    expect(checkFloors([A, B], 8500).breached).toBe(false);
  });

  it('sums the combined floor for display', () => {
    expect(checkFloors([A, B], 8500).combinedFloorCents).toBe(4000);
  });

  it('handles an empty cart without dividing by zero', () => {
    expect(checkFloors([], 0)).toEqual({
      hasFloor: false, breached: false, combinedFloorCents: 0, shortfallCents: 0,
    });
  });
});
