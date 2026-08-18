/**
 * Deal math. Every amount is whole cents — no floats crossing a boundary, no
 * currency strings parsed twice.
 *
 * The rule these functions exist to protect: totals are DERIVED from records.
 * Nothing here reads or writes a running counter.
 */

/** A percentage of a cent total, rounded to whole cents. */
export function pctOf(totalCents: number, pct: number): number {
  return Math.round((totalCents * pct) / 100);
}

/**
 * A buyer's offer expressed as a percentage of ask — the reverse-offer read.
 * One decimal, because "85.3%" is a real answer and "85%" would be a lie.
 * An ask of zero has no percentage; that reads as 0, never Infinity or NaN.
 */
export function pctFromAmount(amountCents: number, askCents: number): number {
  if (askCents === 0) return 0;
  return Math.round((amountCents / askCents) * 1000) / 10;
}

/** Sum of asks. The subtotal is this and only this. */
export function sumAsks(askCents: number[]): number {
  return askCents.reduce((a, b) => a + b, 0);
}

/**
 * Split an agreed total across lines in proportion to their asks, so each card
 * carries its share of the discount into the books.
 *
 * The parts always sum to exactly `agreedCents`: proportional shares are floored,
 * then the leftover cents go one at a time to the lines with the largest
 * fractional remainder. Without that pass a bundle's card-level realized figures
 * would not add up to what the buyer handed over.
 */
export function splitByWeight(agreedCents: number, askCents: number[]): number[] {
  const n = askCents.length;
  if (n === 0) return [];

  const total = sumAsks(askCents);

  // Every ask is zero (an unpriced bundle): weight is meaningless, split evenly.
  const shares =
    total === 0
      ? askCents.map(() => agreedCents / n)
      : askCents.map((ask) => (ask * agreedCents) / total);

  const parts = shares.map(Math.floor);
  let leftover = agreedCents - parts.reduce((a, b) => a + b, 0);

  const order = shares
    .map((share, i) => ({ i, frac: share - Math.floor(share), ask: askCents[i] ?? 0 }))
    .sort((a, b) => b.frac - a.frac || b.ask - a.ask || a.i - b.i);

  for (let k = 0; leftover > 0; k = (k + 1) % n, leftover--) {
    const target = order[k]!.i;
    parts[target] = (parts[target] ?? 0) + 1;
  }

  return parts;
}

/** Money as a dealer writes it: whole dollars bare, cents only when they exist. */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  return rem === 0
    ? `${sign}$${dollars.toLocaleString()}`
    : `${sign}$${dollars.toLocaleString()}.${String(rem).padStart(2, '0')}`;
}

/**
 * What the dealer typed into a price field, as cents.
 *
 * Deliberately forgiving about the dollar sign and whitespace, and deliberately
 * strict about the result: null means "no number yet", which is what keeps the
 * save button disabled instead of writing a zero price into the record.
 */
export function dollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[^0-9.]/g, '');
  if (cleaned === '' || cleaned === '.') return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}
