import { describe, it, expect } from 'vitest';
import { pctOf, pctFromAmount, splitByWeight, sumAsks, formatCents, dollarsToCents } from './money';

describe('pctOf', () => {
  it('takes a percentage of a cent total and rounds to whole cents', () => {
    expect(pctOf(10000, 85)).toBe(8500);
  });

  it('rounds half away from zero so a dealer never loses a cent to banker rounding', () => {
    // 1 cent at 50% is exactly half a cent
    expect(pctOf(1, 50)).toBe(1);
  });

  it('is zero for a zero total', () => {
    expect(pctOf(0, 85)).toBe(0);
  });
});

describe('pctFromAmount', () => {
  it('reports the buyer offer as a percentage of ask', () => {
    expect(pctFromAmount(8500, 10000)).toBe(85);
  });

  it('keeps one decimal for awkward offers', () => {
    expect(pctFromAmount(8533, 10000)).toBe(85.3);
  });

  it('is zero when there is nothing to compare against, not Infinity', () => {
    expect(pctFromAmount(5000, 0)).toBe(0);
  });
});

describe('splitByWeight', () => {
  it('splits an agreed total across lines in proportion to their asks', () => {
    expect(splitByWeight(8500, [5000, 5000])).toEqual([4250, 4250]);
  });

  it('always sums to exactly the agreed total, giving the remainder to the largest line', () => {
    const parts = splitByWeight(10000, [3333, 3333, 3334]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it('handles a single line', () => {
    expect(splitByWeight(4200, [5000])).toEqual([4200]);
  });

  it('splits evenly when every ask is zero rather than dividing by zero', () => {
    expect(splitByWeight(300, [0, 0, 0])).toEqual([100, 100, 100]);
  });

  it('returns nothing for no lines', () => {
    expect(splitByWeight(500, [])).toEqual([]);
  });
});

describe('sumAsks', () => {
  it('derives a subtotal from the records', () => {
    expect(sumAsks([1000, 2500, 75])).toBe(3575);
  });

  it('is zero for an empty cart', () => {
    expect(sumAsks([])).toBe(0);
  });
});

describe('formatCents', () => {
  it('renders whole dollars without decimals', () => {
    expect(formatCents(8500)).toBe('$85');
  });

  it('renders cents when they are not zero', () => {
    expect(formatCents(8550)).toBe('$85.50');
  });

  it('renders zero as $0', () => {
    expect(formatCents(0)).toBe('$0');
  });
});

describe('dollarsToCents', () => {
  it('reads whole dollars', () => {
    expect(dollarsToCents('42')).toBe(4200);
  });

  it('reads dollars and cents', () => {
    expect(dollarsToCents('42.50')).toBe(4250);
  });

  it('ignores a typed dollar sign and stray spaces', () => {
    expect(dollarsToCents(' $42.50 ')).toBe(4250);
  });

  it('reads a single trailing decimal place as tens of cents', () => {
    expect(dollarsToCents('42.5')).toBe(4250);
  });

  it('rounds sub-cent input rather than carrying a float into the record', () => {
    expect(dollarsToCents('42.555')).toBe(4256);
  });

  it('is null when nothing numeric was typed, so callers can hold the button disabled', () => {
    expect(dollarsToCents('')).toBeNull();
    expect(dollarsToCents('$')).toBeNull();
    expect(dollarsToCents('.')).toBeNull();
  });
});
