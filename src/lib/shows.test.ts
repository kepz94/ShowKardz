import { describe, expect, it } from 'vitest';
import { EMPTY_DB, type Card, type DB, type Show } from '../types';
import {
  currentShow, liveShows, nextPhase, showCards, showLeftInCase, showsByDate,
} from './shows';

const T = '2026-08-19T10:00:00.000Z';

const show = (over: Partial<Show> = {}): Show => ({
  id: 's1', name: 'Riverside Hall B', date: '2026-09-05', phase: 'prep',
  packedStackIds: [], createdAt: T, ...over,
});

const card = (id: string, stackId: string | undefined, over: Partial<Card> = {}): Card => ({
  id, number: id, name: `Card ${id}`, stackId, status: 'available', priceCents: 1000,
  createdAt: T, updatedAt: T, ...over,
});

const db = (over: Partial<DB>): DB => ({ ...EMPTY_DB, ...over });

describe('nextPhase', () => {
  it('walks prep to live to done', () => {
    expect(nextPhase('prep')).toBe('live');
    expect(nextPhase('live')).toBe('done');
  });

  it('stops at done — a closed show is the record, not a state to advance', () => {
    expect(nextPhase('done')).toBe(null);
  });
});

describe('liveShows', () => {
  it('hides a deleted show but keeps the tombstone in the store', () => {
    const d = db({ shows: [show(), show({ id: 's2', deletedAt: T })] });
    expect(liveShows(d).map((s) => s.id)).toEqual(['s1']);
    expect(d.shows).toHaveLength(2);
  });
});

describe('showsByDate', () => {
  it('puts the soonest show first, so the next one to think about leads', () => {
    const d = db({
      shows: [
        show({ id: 'a', date: '2026-09-20' }),
        show({ id: 'b', date: '2026-09-05' }),
        show({ id: 'c', date: '2026-09-12' }),
      ],
    });
    expect(showsByDate(d).map((s) => s.id)).toEqual(['b', 'c', 'a']);
  });

  it('breaks a same-day tie on creation order, so it never shuffles', () => {
    const d = db({
      shows: [
        show({ id: 'a', date: '2026-09-05', createdAt: '2026-08-02T00:00:00Z' }),
        show({ id: 'b', date: '2026-09-05', createdAt: '2026-08-01T00:00:00Z' }),
      ],
    });
    expect(showsByDate(d).map((s) => s.id)).toEqual(['b', 'a']);
  });
});

describe('currentShow', () => {
  it('is the one being sold at, because that beats everything while it is open', () => {
    const d = db({
      shows: [show({ id: 'a', phase: 'prep' }), show({ id: 'b', phase: 'live' })],
    });
    expect(currentShow(d)?.id).toBe('b');
  });

  it('falls back to the soonest show still in prep', () => {
    const d = db({
      shows: [
        show({ id: 'a', phase: 'prep', date: '2026-09-20' }),
        show({ id: 'b', phase: 'prep', date: '2026-09-05' }),
      ],
    });
    expect(currentShow(d)?.id).toBe('b');
  });

  it('is nothing when every show is closed', () => {
    expect(currentShow(db({ shows: [show({ phase: 'done' })] }))).toBe(undefined);
  });

  it('is nothing when there are no shows at all', () => {
    expect(currentShow(EMPTY_DB)).toBe(undefined);
  });
});

describe('showCards', () => {
  const base = db({
    stacks: [],
    cards: [card('1', 'g1'), card('2', 'g1'), card('3', 'g2'), card('4', undefined)],
  });

  it('is the cards in the groups this show packed', () => {
    const d = db({ ...base, shows: [show({ packedStackIds: ['g1'] })] });
    expect(showCards(d, 's1').map((c) => c.id).sort()).toEqual(['1', '2']);
  });

  it('is empty for a show that packed nothing', () => {
    const d = db({ ...base, shows: [show()] });
    expect(showCards(d, 's1')).toEqual([]);
  });

  it('is empty for a show id that does not exist', () => {
    expect(showCards(base, 'nope')).toEqual([]);
  });
});

describe('showLeftInCase', () => {
  it('counts every card that did not sell, priced or not', () => {
    // The audit is against what is PHYSICALLY in the case. An unpriced card is
    // sitting right there; leaving it out makes the count disagree with the
    // hand that is doing the counting.
    const d = db({
      shows: [show({ packedStackIds: ['g1'] })],
      cards: [
        card('1', 'g1'),
        card('2', 'g1', { status: 'unpriced', priceCents: undefined }),
        card('3', 'g1', { status: 'sold' }),
      ],
    });
    expect(showLeftInCase(d, 's1').map((c) => c.id).sort()).toEqual(['1', '2']);
  });

  it('leaves out a deleted card, which is not in the case either', () => {
    const d = db({
      shows: [show({ packedStackIds: ['g1'] })],
      cards: [card('1', 'g1'), card('2', 'g1', { deletedAt: T })],
    });
    expect(showLeftInCase(d, 's1').map((c) => c.id)).toEqual(['1']);
  });
});
