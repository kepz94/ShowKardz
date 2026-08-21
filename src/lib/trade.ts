/**
 * Trade math: two sides, two dials, and who owes cash.
 *
 * A trade is not a sale with extra steps. In a sale there is one number to
 * agree on; in a trade there are two piles, each worth whatever the two of you
 * decide it is worth, and the difference settles in cash.
 *
 * WHY TWO DIALS AND NOT ONE. The spread IS the margin, and it is the whole
 * reason a dealer takes a trade at all: your cards go out near sticker, theirs
 * come in under it, and the gap is the profit. One dial would force a single
 * percentage across both piles and quietly delete the trade's entire economics.
 * Two dials make the spread a thing you can see and argue about at the table.
 *
 * NOTHING HERE IS A MARKET VALUE. Both dials apply to asking prices — yours,
 * and whatever you decided theirs are worth. The app is not asserting what any
 * card is worth, which is Principle 4 and applies to a trade exactly as it does
 * to a sale.
 *
 * Every amount is whole cents. Percentages are the only floats and they never
 * survive a return.
 */
import { pctOf, sumAsks } from './money';

/** What one pile is worth at the spread set for it. */
export function tradeSide(askCents: number[], pct: number): number {
  return pctOf(sumAsks(askCents), pct);
}

export interface TradeSettlement {
  /** What your side is worth at your dial. */
  yoursCents: number;
  /** What your side is asking, before the dial. */
  yoursAskCents: number;
  /** What their side is worth at their dial. */
  theirsCents: number;
  theirsAskCents: number;
  /**
   * Yours minus theirs. POSITIVE means they owe you cash — you are handing over
   * more value than you are getting back.
   */
  deltaCents: number;
  /** Who reaches for their wallet. */
  owed: 'you' | 'them' | 'even';
}

/**
 * Settle a trade.
 *
 * The sign convention is stated rather than inferred, because a sign error here
 * is money moving the wrong way across a table: positive delta means THEY owe.
 */
export function settleTrade(
  yoursAsk: number[], yoursPct: number,
  theirsAsk: number[], theirsPct: number,
): TradeSettlement {
  const yoursAskCents = sumAsks(yoursAsk);
  const theirsAskCents = sumAsks(theirsAsk);
  const yoursCents = tradeSide(yoursAsk, yoursPct);
  const theirsCents = tradeSide(theirsAsk, theirsPct);
  const deltaCents = yoursCents - theirsCents;

  return {
    yoursCents,
    yoursAskCents,
    theirsCents,
    theirsAskCents,
    deltaCents,
    owed: deltaCents === 0 ? 'even' : deltaCents > 0 ? 'them' : 'you',
  };
}
