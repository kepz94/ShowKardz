import { describe, expect, it } from 'vitest';
import { settleTrade, tradeSide } from './trade';

describe('tradeSide', () => {
  it('values a side at the spread you set for it', () => {
    // Yours at 90% of ask: you are giving a little off sticker.
    expect(tradeSide([10000, 5000], 90)).toBe(13500);
  });

  it('values at full ask when the dial is at 100', () => {
    expect(tradeSide([10000, 5000], 100)).toBe(15000);
  });

  it('is zero for an empty side', () => {
    expect(tradeSide([], 90)).toBe(0);
  });

  it('is zero at a spread of zero, rather than NaN', () => {
    expect(tradeSide([10000], 0)).toBe(0);
  });

  it('rounds to whole cents — no fractional money crosses a boundary', () => {
    // 3333 at 85% is 2833.05. Money is integers here, always.
    expect(Number.isInteger(tradeSide([3333], 85))).toBe(true);
    expect(tradeSide([3333], 85)).toBe(2833);
  });
});

describe('settleTrade', () => {
  it('says nobody owes anything on an even trade', () => {
    const t = settleTrade([10000], 90, [9000], 100);
    expect(t.deltaCents).toBe(0);
    expect(t.owed).toBe('even');
  });

  it('has THEM owing cash when your side is worth more', () => {
    // Yours 10000 at 90% = 9000. Theirs 5000 at 70% = 3500. They owe 5500.
    const t = settleTrade([10000], 90, [5000], 70);
    expect(t.yoursCents).toBe(9000);
    expect(t.theirsCents).toBe(3500);
    expect(t.deltaCents).toBe(5500);
    expect(t.owed).toBe('them');
  });

  it('has YOU owing cash when their side is worth more', () => {
    const t = settleTrade([2000], 90, [10000], 70);
    expect(t.deltaCents).toBe(-5200);
    expect(t.owed).toBe('you');
  });

  it('is the margin, stated: two dials is what makes the spread visible', () => {
    // The same cards on both sides at different dials still favours you — which
    // is the entire reason the two dials are separate controls.
    const t = settleTrade([10000], 90, [10000], 70);
    expect(t.deltaCents).toBe(2000);
    expect(t.owed).toBe('them');
  });

  it('handles an empty side without pretending it is even', () => {
    const t = settleTrade([5000], 100, [], 70);
    expect(t.theirsCents).toBe(0);
    expect(t.deltaCents).toBe(5000);
    expect(t.owed).toBe('them');
  });

  it('is even when both sides are empty, because nothing is being traded', () => {
    expect(settleTrade([], 90, [], 70).owed).toBe('even');
  });

  it('reports what YOUR side is really going out at, against sticker', () => {
    // The number that matters to a dealer: cards asking $150 leaving for $105.
    const t = settleTrade([10000, 5000], 70, [], 70);
    expect(t.yoursAskCents).toBe(15000);
    expect(t.yoursCents).toBe(10500);
  });
});
