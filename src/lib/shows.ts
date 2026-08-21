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
 *
 * WHAT A SHOW MADE lives in lib/books.ts, not here: `bookSummary(db, showId)`
 * scopes the same figures Sales already uses. It was briefly duplicated here as
 * `showBooks`, which meant two definitions of "asked" that could drift apart —
 * one off the deal lines, one off the stored subtotal.
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
