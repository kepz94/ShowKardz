/**
 * Floors — the warning that has to fire BEFORE a bundle drops, not after.
 *
 * A floor is a promise about one card ("I won't let this go under $40"), so the
 * check has to be made about one card. In a bundle that means each card's SHARE
 * of the agreed total, apportioned the same way the books will apportion it.
 *
 * The naive version — compare the agreed total against the sum of floors — is
 * worse than no check: cards without a floor add their full ask to the total
 * while adding nothing to the floor, so a bundle reads "above floor" while a
 * floored card inside it is quietly going out at half its minimum.
 */
import { splitByWeight } from './money';

export interface FloorCheck {
  /** Does any card in the bundle carry a floor at all? */
  hasFloor: boolean;
  /** Is at least one floored card's share below its floor? */
  breached: boolean;
  /** Sum of the floors present, for display. */
  combinedFloorCents: number;
  /** Total distance under, across every breached card. */
  shortfallCents: number;
}

export interface FloorInput {
  priceCents?: number;
  floorCents?: number;
}

export function checkFloors(cards: FloorInput[], agreedCents: number): FloorCheck {
  const floors = cards.map((c) => c.floorCents);
  const hasFloor = floors.some((f) => f != null);
  const combinedFloorCents = floors.reduce<number>((sum, f) => sum + (f ?? 0), 0);

  if (cards.length === 0 || !hasFloor) {
    return { hasFloor, breached: false, combinedFloorCents, shortfallCents: 0 };
  }

  const shares = splitByWeight(agreedCents, cards.map((c) => c.priceCents ?? 0));

  const shortfallCents = cards.reduce<number>((sum, c, i) => {
    const floor = c.floorCents;
    if (floor == null) return sum;
    const share = shares[i] ?? 0;
    return sum + Math.max(0, floor - share);
  }, 0);

  return { hasFloor, breached: shortfallCents > 0, combinedFloorCents, shortfallCents };
}
