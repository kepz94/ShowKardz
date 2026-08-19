import { describe, it, expect } from 'vitest';
import { cardsInGroup, groupName, groupRows, NO_GROUP, statsFor, totalInCase } from './groups';
import { EMPTY_DB, type Card, type DB, type Stack } from '../types';

const stack = (over: Partial<Stack> = {}): Stack => ({
  id: 's1', name: 'Saturday table', createdAt: '2026-08-19T00:00:00Z', ...over,
});

let n = 0;
const card = (over: Partial<Card> = {}): Card => {
  n += 1;
  return {
    id: `c${n}`, number: `${100 + n}`, name: '', status: 'available',
    createdAt: '2026-08-19T00:00:00Z', updatedAt: '2026-08-19T00:00:00Z', ...over,
  };
};

const db = (over: Partial<DB> = {}): DB => ({ ...EMPTY_DB, ...over });

describe('groupName', () => {
  it('is whatever the dealer typed', () => {
    expect(groupName(stack({ name: 'Dollar box' }))).toBe('Dollar box');
  });

  it('trims it', () => {
    expect(groupName(stack({ name: '  Case 2  ' }))).toBe('Case 2');
  });

  it('falls back to the legacy three fields when there is no name', () => {
    // A group made before groups became a plain name. It can also arrive fresh
    // through a merge from a device still on the old build, which is why this
    // is a read-time fallback and not a migration.
    const legacy = stack({ name: undefined, year: '2023', product: 'Panini Prizm', parallel: 'Silver' });
    expect(groupName(legacy)).toBe('2023 Panini Prizm Silver');
  });

  it('keeps a legacy "Base" parallel out of the name, as it always did', () => {
    const legacy = stack({ name: undefined, year: '2023', product: 'Panini Prizm', parallel: 'Base' });
    expect(groupName(legacy)).toBe('2023 Panini Prizm');
  });

  it('prefers the name over legacy fields when a renamed group has both', () => {
    const both = stack({ name: 'Saturday table', year: '2023', product: 'Panini Prizm' });
    expect(groupName(both)).toBe('Saturday table');
  });

  it('never renders as nothing', () => {
    expect(groupName(stack({ name: '   ', year: undefined, product: undefined }))).toBe('Untitled group');
  });
});

describe('statsFor', () => {
  it('counts and totals only what is still in the case', () => {
    // The rule: a sold card leaves the group's value behind. Its money is
    // realized and shows on the sales screen instead.
    const cards = [
      card({ status: 'available', priceCents: 4000 }),
      card({ status: 'available', priceCents: 8500 }),
      card({ status: 'sold', priceCents: 8500, realizedCents: 7000 }),
    ];
    expect(statsFor(cards)).toEqual({ cardCount: 2, unpricedCount: 0, valueCents: 12500 });
  });

  it('counts an unpriced card but adds nothing for it', () => {
    const cards = [card({ status: 'available', priceCents: 4000 }), card({ status: 'unpriced' })];
    expect(statsFor(cards)).toEqual({ cardCount: 2, unpricedCount: 1, valueCents: 4000 });
  });

  it('reads as zero for a group that sold out, rather than going negative or blank', () => {
    const cards = [card({ status: 'sold', priceCents: 8500, realizedCents: 7000 })];
    expect(statsFor(cards)).toEqual({ cardCount: 0, unpricedCount: 0, valueCents: 0 });
  });
});

describe('groupRows', () => {
  it('gives every group its own numbers', () => {
    const a = stack({ id: 'a', name: 'Prizm' });
    const b = stack({ id: 'b', name: 'Dollar box' });
    const rows = groupRows(db({
      stacks: [a, b],
      cards: [
        card({ stackId: 'a', priceCents: 4000 }),
        card({ stackId: 'a', priceCents: 6000 }),
        card({ stackId: 'b', priceCents: 100 }),
      ],
    }));
    expect(rows.map((r) => [r.name, r.cardCount, r.valueCents])).toEqual([
      ['Prizm', 2, 10000],
      ['Dollar box', 1, 100],
    ]);
  });

  it('shows a group with nothing left in it rather than dropping it', () => {
    const rows = groupRows(db({
      stacks: [stack({ id: 'a', name: 'Prizm' })],
      cards: [card({ stackId: 'a', status: 'sold', priceCents: 4000, realizedCents: 3500 })],
    }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Prizm', cardCount: 0, valueCents: 0 });
  });

  it('surfaces the loose cards as their own row, last', () => {
    // A card nobody filed is the one most likely to be forgotten. A screen that
    // lists only real groups is exactly where it would get lost.
    const rows = groupRows(db({
      stacks: [stack({ id: 'a', name: 'Prizm' })],
      cards: [card({ stackId: 'a', priceCents: 4000 }), card({ priceCents: 2500 })],
    }));
    expect(rows.map((r) => r.name)).toEqual(['Prizm', 'No group']);
    expect(rows[1]).toMatchObject({ ungrouped: true, cardCount: 1, valueCents: 2500 });
  });

  it('leaves the loose row out entirely when every card is filed', () => {
    const rows = groupRows(db({
      stacks: [stack({ id: 'a', name: 'Prizm' })],
      cards: [card({ stackId: 'a', priceCents: 4000 })],
    }));
    expect(rows.map((r) => r.name)).toEqual(['Prizm']);
  });

  it('ignores deleted cards', () => {
    const rows = groupRows(db({
      stacks: [stack({ id: 'a', name: 'Prizm' })],
      cards: [
        card({ stackId: 'a', priceCents: 4000 }),
        card({ stackId: 'a', priceCents: 9900, deletedAt: '2026-08-19T01:00:00Z' }),
      ],
    }));
    expect(rows[0]).toMatchObject({ cardCount: 1, valueCents: 4000 });
  });
});

describe('cardsInGroup', () => {
  it('returns the cards filed under a group', () => {
    const found = cardsInGroup(db({
      stacks: [stack({ id: 'a' })],
      cards: [card({ id: 'x', stackId: 'a' }), card({ id: 'y' })],
    }), 'a');
    expect(found.map((c) => c.id)).toEqual(['x']);
  });

  it('returns the unfiled cards for NO_GROUP', () => {
    const found = cardsInGroup(db({
      stacks: [stack({ id: 'a' })],
      cards: [card({ id: 'x', stackId: 'a' }), card({ id: 'y' })],
    }), NO_GROUP);
    expect(found.map((c) => c.id)).toEqual(['y']);
  });

  it('keeps sold cards, because a group card list is still a list of its cards', () => {
    // Only the VALUE excludes sold cards. Opening a group and finding its sold
    // cards gone would read as data loss.
    const found = cardsInGroup(db({
      stacks: [stack({ id: 'a' })],
      cards: [card({ id: 'x', stackId: 'a', status: 'sold' })],
    }), 'a');
    expect(found.map((c) => c.id)).toEqual(['x']);
  });
});

describe('totalInCase', () => {
  it('adds up everything still in the case, grouped or not', () => {
    const total = totalInCase(db({
      cards: [
        card({ stackId: 'a', priceCents: 4000 }),
        card({ priceCents: 2500 }),
        card({ status: 'sold', priceCents: 9900, realizedCents: 8000 }),
      ],
    }));
    expect(total).toBe(6500);
  });
});
