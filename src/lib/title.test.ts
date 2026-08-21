import { describe, it, expect } from 'vitest';
import { composeTitle, cardLabel, prettyBlock, rowLabel } from './title';
import type { Card, Stack } from '../types';

const prizm: Stack = {
  id: 's1', year: '2023', product: 'Panini Prizm', parallel: 'Base',
  createdAt: '2026-08-18T00:00:00.000Z',
};

const card = (over: Partial<Card> = {}): Card => ({
  id: 'c1', number: '0455', name: '', status: 'unpriced',
  createdAt: '2026-08-18T00:00:00.000Z', updatedAt: '2026-08-18T00:00:00.000Z', ...over,
});

describe('composeTitle', () => {
  it('joins the group declaration with the player name', () => {
    expect(composeTitle(prizm, 'Anthony Edwards')).toBe('2023 Panini Prizm Anthony Edwards');
  });

  it('omits the parallel token for a base card', () => {
    expect(composeTitle(prizm, 'Anthony Edwards')).not.toContain('Base');
  });

  it('names the parallel when there is one', () => {
    expect(composeTitle({ ...prizm, parallel: 'Silver' }, 'Anthony Edwards'))
      .toBe('2023 Panini Prizm Silver Anthony Edwards');
  });

  it('appends the printed card number when known', () => {
    expect(composeTitle(prizm, 'Anthony Edwards', '58'))
      .toBe('2023 Panini Prizm Anthony Edwards 58');
  });

  it('is just the name when the card belongs to no group', () => {
    // Groups are optional and arrive later, so a card entered on day one has
    // nothing but what is printed on it.
    expect(composeTitle(undefined, 'Anthony Edwards')).toBe('Anthony Edwards');
  });

  it('is empty when there is nothing to say yet', () => {
    expect(composeTitle(undefined, '')).toBe('');
  });

  it('collapses whitespace a blank field would leave behind', () => {
    expect(composeTitle({ ...prizm, product: '' }, 'Anthony Edwards')).toBe('2023 Anthony Edwards');
  });
});

describe('cardLabel', () => {
  it('is the composed title once the card has a name', () => {
    expect(cardLabel(card({ name: 'Anthony Edwards' }), prizm))
      .toBe('2023 Panini Prizm Anthony Edwards');
  });

  it('falls back to the sticker number for a card entered with nothing else', () => {
    // Intake is number-first: peel, stick, type, next. The row still has to
    // read as something rather than as a blank.
    expect(cardLabel(card(), undefined)).toBe('Card 0455');
  });

  it('uses the group alone when there is a group but no name yet', () => {
    expect(cardLabel(card(), prizm)).toBe('2023 Panini Prizm');
  });

  it('never returns an empty string', () => {
    expect(cardLabel(card({ number: '' }), undefined).length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------
   Kept blocks. What the dealer ticked off the card IS the title — nothing
   reorders it, drops it, or second-guesses which line was the team.
------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------
   A card that came from a confirmed read.

   Confirming writes the kept blocks, in the dealer's chosen order, into the
   NAME field. So by the time anything composes a title the name already holds
   the year, the product, the team and the number — and the title is the name.
   Re-deriving it from the blocks would undo any edit made afterwards.
------------------------------------------------------------------------- */
describe('composeTitle — a card with a confirmed read', () => {
  const stack: Stack = {
    id: 's1', year: '2019', product: 'Old Group', parallel: 'Base',
    createdAt: '2026-08-19T10:00:00.000Z',
  };
  const blocks = ['2023 PANINI PRIZM', 'ANTHONY', 'EDWARDS', 'TIMBERWOLVES # 58'];

  it('is the name, which already carries the whole read', () => {
    expect(composeTitle(stack, 'Anthony Edwards 2023 Panini Prizm Timberwolves 58', '58', blocks))
      .toBe('Anthony Edwards 2023 Panini Prizm Timberwolves 58');
  });

  it('does not re-append the blocks, so nothing is repeated', () => {
    expect(composeTitle(undefined, 'Anthony Edwards 2023 Panini Prizm', undefined, blocks))
      .toBe('Anthony Edwards 2023 Panini Prizm');
  });

  it('respects an edit made to the name after confirming', () => {
    // The dealer cut the team out. It must not come back from the blocks.
    expect(composeTitle(undefined, 'Anthony Edwards 2023 Panini Prizm', undefined, blocks))
      .not.toContain('Timberwolves');
  });

  it('ignores the group, which is only a default for a run of cards', () => {
    expect(composeTitle(stack, 'Anthony Edwards Prizm', undefined, blocks))
      .not.toContain('Old Group');
  });

  it('falls back to the group when there was no read at all', () => {
    expect(composeTitle(stack, 'Anthony Edwards', '58', []))
      .toBe('2019 Old Group Anthony Edwards 58');
  });

  it('falls back to the group when printed is absent', () => {
    expect(composeTitle(stack, 'Anthony Edwards', undefined))
      .toBe('2019 Old Group Anthony Edwards');
  });
});

describe('prettyBlock — what a kept block looks like in the name', () => {
  it('title-cases a shouted block, because cards print in caps', () => {
    expect(prettyBlock('2023 PANINI PRIZM')).toBe('2023 Panini Prizm');
  });

  it('leaves a normally-cased block alone', () => {
    expect(prettyBlock('Panini Prizm Silver')).toBe('Panini Prizm Silver');
  });

  it('drops the hash and closes the gap Vision leaves after it', () => {
    // "#" and "58" come back as separate words, so the block reads "# 58".
    expect(prettyBlock('TIMBERWOLVES # 58')).toBe('Timberwolves 58');
  });

  it('is empty for a block that is only punctuation', () => {
    expect(prettyBlock('#')).toBe('');
  });
});

describe('rowLabel', () => {
  const stack: Stack = { id: 's1', name: '2023 Panini Prizm', createdAt: '2026-08-19T00:00:00Z' };
  const base: Card = {
    id: 'c1', number: '455', name: '', status: 'available',
    createdAt: '2026-08-19T00:00:00Z', updatedAt: '2026-08-19T00:00:00Z',
  };

  it('uses the card\u2019s own name, not the composed title', () => {
    // A list row is narrow. composeTitle prefixes the group, so the group eats
    // the width and the PLAYER is what gets truncated — the one part that tells
    // the rows apart. Measured at 390px: 313px of text into a 159px row.
    expect(rowLabel({ ...base, name: 'Anthony Edwards' }, stack)).toBe('Anthony Edwards');
  });

  it('falls back to the composed title when the card has no name', () => {
    // No printed card number on this fixture, so the title is just the group.
    expect(rowLabel(base, stack)).toBe('2023 Panini Prizm');
  });

  it('falls back for a card with no name and no group', () => {
    expect(rowLabel(base, undefined)).toBe('Card 455');
  });

  it('treats a whitespace-only name as no name', () => {
    expect(rowLabel({ ...base, name: '   ' }, stack)).toBe('2023 Panini Prizm');
  });
});
