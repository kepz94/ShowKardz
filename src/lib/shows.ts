/**
 * Shows: a named day, the case you took to it, and what it made.
 *
 * A show is a RECORD, not a mode the app is in. That is the whole point of this
 * module: "what did Riverside in March actually make" has to be answerable in
 * October, and it cannot be if the packing list and the takings only ever
 * existed as the app's current state.
 *
 * THE PHASES ARE THE SCREEN'S JOB, IN ORDER.
 *
 *   prep  — the night before: price, floor, decide what goes in the car.
 *   live  — the table: type numbers, do the deal math, mark sold.
 *   done  — the record: what it took, what is left, what it cost.
 *
 * Advancing is always a deliberate act (reducer action `show/advance`), never
 * derived from state. A phase that moved on its own would move mid-deal, with a
 * buyer standing there, which is the worst possible moment for the screen to
 * become a different screen.
 *
 * Everything below is derived on call. No show stores a total.
 */
import type { Card, DB, Show, ShowPhase } from '../types';
import { liveCards } from './cards';
import { cardsInGroup } from './groups';

/** What comes after this phase, or null at the end. A closed show is finished. */
export function nextPhase(phase: ShowPhase): ShowPhase | null {
  if (phase === 'prep') return 'live';
  if (phase === 'live') return 'done';
  return null;
}

/** The shows that still exist. Deleted ones stay as tombstones for the merge. */
export function liveShows(db: DB): Show[] {
  return (db.shows ?? []).filter((s) => s.deletedAt == null);
}

/**
 * Soonest first, so the next show to think about leads the list.
 *
 * Ties break on creation order rather than being left to sort stability across
 * a merge — two shows on the same day must not swap places depending on which
 * device rendered them.
 */
export function showsByDate(db: DB): Show[] {
  return [...liveShows(db)].sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
  );
}

/**
 * The show the dealer is on right now.
 *
 * A show being SOLD AT wins outright: while a table is open nothing else is the
 * current show, whatever its date. Otherwise it is the soonest one still in
 * prep. Everything closed means there is no current show, which is the honest
 * answer between shows and is what makes the landing screen say "add one".
 */
export function currentShow(db: DB): Show | undefined {
  const all = showsByDate(db);
  return all.find((s) => s.phase === 'live') ?? all.find((s) => s.phase === 'prep');
}

/** The cards in the case for this show, from the groups it packed. */
export function showCards(db: DB, showId: string): Card[] {
  const show = liveShows(db).find((s) => s.id === showId);
  if (!show) return [];
  return show.packedStackIds.flatMap((stackId) => cardsInGroup(db, stackId));
}

/** Cards packed for this show that could still be sold at it. */
export function showSellable(db: DB, showId: string): Card[] {
  return showCards(db, showId).filter((c) => c.status === 'available');
}

export interface ShowBooks {
  takenCents: number;
  /**
   * What was asked for the cards that ACTUALLY SOLD, in cents.
   *
   * This is the denominator of the day's discount rate, and it deliberately
   * excludes stock that never left the case. Dividing takings by the whole
   * case value answers a question nobody asked and reads as a discount rate,
   * which is the sort of laundered number Principle 4 exists to prevent.
   * Zero when nothing sold, so a caller must guard before dividing.
   */
  askedCents: number;
  dealCount: number;
  cardsSold: number;
}

/**
 * What one show made.
 *
 * Scoped by `deal.showId`, so a deal rung up on the standalone calculator — or
 * before shows existed — counts toward the Sales totals and toward no show.
 * Cards sold comes off the LINES: one deal can carry a bundle, and counting
 * deals would under-report the case by exactly the amount that matters.
 */
export function showBooks(db: DB, showId: string): ShowBooks {
  const deals = db.deals.filter((d) => d.showId === showId);
  const lines = deals.flatMap((d) => d.lines);
  return {
    takenCents: deals.reduce((sum, d) => sum + d.agreedCents, 0),
    askedCents: lines.reduce((sum, l) => sum + l.askCents, 0),
    dealCount: deals.length,
    cardsSold: lines.length,
  };
}

/**
 * Every card still in the case at close — the list the audit counts against.
 *
 * ANYTHING NOT SOLD, priced or not. An unpriced card is physically sitting in
 * the case; leaving it out would make the app's number disagree with the hand
 * doing the counting, and the whole point of the audit is that those two agree.
 */
export function showLeftInCase(db: DB, showId: string): Card[] {
  const ids = new Set(showCards(db, showId).map((c) => c.id));
  return liveCards(db).filter((c) => ids.has(c.id) && c.status !== 'sold');
}
