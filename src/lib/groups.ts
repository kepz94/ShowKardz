/**
 * Groups: what one is called, and what it is worth.
 *
 * A group is a name over a run of cards. Everything here is derived from the
 * records on each call — there is no stored count or total anywhere to drift out
 * of step with the cards that produced it.
 */
import type { Card, DB, Stack } from '../types';
import { liveCards } from './cards';

/** The bucket id used for cards that are in no group. Not a real stack id. */
export const NO_GROUP = '';

/**
 * How a group reads wherever one is named.
 *
 * THE ONLY READER OF THE LEGACY FIELDS. A group made before groups became a
 * plain name has year / product / parallel and no `name`, and one can arrive
 * through a merge from an older device long after this ships, so this derives
 * rather than migrates — see the note on Stack in types.ts.
 */
export function groupName(stack: Stack): string {
  const named = stack.name?.trim();
  if (named) return named;

  // Legacy: stitch the three declared fields back into something sayable.
  // "Base" meant "no parallel" and was kept out of titles, so it stays out here.
  return (
    [
      stack.year,
      stack.product,
      stack.parallel?.trim().toLowerCase() === 'base' ? '' : stack.parallel,
    ]
      .map((p) => p?.trim() ?? '')
      .filter(Boolean)
      .join(' ') || 'Untitled group'
  );
}

/**
 * What a group is worth right now, and how many cards that describes.
 *
 * VALUE IS WHAT IS STILL IN THE CASE. A sold card stops counting toward its
 * group: its money is realized and belongs on the sales screen, not on a total
 * meant to answer "what have I got left". The count is filtered the same way, so
 * "20 cards · $1,268" always describes the same twenty cards — a count and a
 * total that disagree about which cards they cover is a number nobody can check
 * against the case in front of them.
 *
 * An unpriced card contributes nothing to the value, which is why the count of
 * them is reported: it is the reason the total is short.
 */
export interface GroupStats {
  cardCount: number;
  unpricedCount: number;
  valueCents: number;
}

export function statsFor(cards: Card[]): GroupStats {
  const inCase = cards.filter((c) => c.status !== 'sold');
  return {
    cardCount: inCase.length,
    unpricedCount: inCase.filter((c) => c.status === 'unpriced').length,
    valueCents: inCase.reduce((sum, c) => sum + (c.priceCents ?? 0), 0),
  };
}

/** A group with its numbers, ready to render as a row. */
export interface GroupRow extends GroupStats {
  /** The stack id, or NO_GROUP for the ungrouped bucket. */
  id: string;
  name: string;
  /** True for the ungrouped bucket, which cannot be renamed or deleted. */
  ungrouped: boolean;
}

/**
 * Every group, plus the ungrouped bucket, each with its numbers.
 *
 * The ungrouped bucket is included ON PURPOSE, and only when it has cards in it:
 * a card that was never filed is the one most likely to be forgotten, and a
 * screen listing only real groups hides it. It sorts last — a leftover pile, not
 * a group.
 *
 * Groups with nothing in the case still appear. A group that sold out reads as
 * "0 cards · $0", which is true and useful; dropping it would make the group
 * vanish at the exact moment it finished doing its job.
 */
export function groupRows(db: DB): GroupRow[] {
  const cards = liveCards(db);

  const byGroup = new Map<string, Card[]>();
  for (const c of cards) {
    const key = c.stackId ?? NO_GROUP;
    const bucket = byGroup.get(key);
    if (bucket) bucket.push(c);
    else byGroup.set(key, [c]);
  }

  const rows: GroupRow[] = db.stacks.map((s) => ({
    id: s.id,
    name: groupName(s),
    ungrouped: false,
    ...statsFor(byGroup.get(s.id) ?? []),
  }));

  const loose = byGroup.get(NO_GROUP) ?? [];
  if (loose.length > 0) {
    rows.push({ id: NO_GROUP, name: 'No group', ungrouped: true, ...statsFor(loose) });
  }

  return rows;
}

/** The cards filed under one group, or — for NO_GROUP — the ones filed nowhere. */
export function cardsInGroup(db: DB, groupId: string): Card[] {
  return liveCards(db).filter((c) =>
    groupId === NO_GROUP ? c.stackId == null : c.stackId === groupId,
  );
}

/** Everything still in the case, across every group and the loose cards alike. */
export function totalInCase(db: DB): number {
  return statsFor(liveCards(db)).valueCents;
}
