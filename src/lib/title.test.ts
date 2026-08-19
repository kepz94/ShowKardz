import { describe, it, expect } from 'vitest';
import { composeTitle, cardLabel } from './title';
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
describe('composeTitle — blocks kept off the card', () => {
  const stack: Stack = {
    id: 's1', year: '2019', product: 'Old Group', parallel: 'Base',
    createdAt: '2026-08-19T10:00:00.000Z',
  };

  it('uses the kept blocks and ignores the group', () => {
    // The group is a default applied to a run of cards; these came off the card
    // in hand, so they win.
    expect(composeTitle(stack, 'Anthony Edwards', '58',
      ['2023 PANINI PRIZM', 'ANTHONY', 'EDWARDS', 'TIMBERWOLVES # 58']))
      .toBe('Anthony Edwards 2023 Panini Prizm Timberwolves 58');
  });

  it('drops a block the dealer unticked', () => {
    expect(composeTitle(undefined, 'Anthony Edwards', '58',
      ['2023 PANINI PRIZM', 'ANTHONY EDWARDS']))
      .toBe('Anthony Edwards 2023 Panini Prizm');
  });

  it('keeps an edited block exactly as edited', () => {
    expect(composeTitle(undefined, '', undefined, ['2023 Panini Prizm Silver']))
      .toBe('2023 Panini Prizm Silver');
  });

  it('falls back to the group when nothing was kept', () => {
    // A card typed in with no photo still gets a usable title.
    expect(composeTitle(stack, 'Anthony Edwards', '58', []))
      .toBe('2019 Old Group Anthony Edwards 58');
  });

  it('falls back to the group when every block was unticked', () => {
    expect(composeTitle(stack, 'Anthony Edwards', undefined, ['   ', '']))
      .toBe('2019 Old Group Anthony Edwards');
  });
});

describe('composeTitle — the name leads', () => {
  it('does not repeat a name printed stacked over two lines', () => {
    // The blocks carry "ANTHONY" and "EDWARDS" separately. Both are already in
    // the name, so neither is appended again.
    expect(composeTitle(undefined, 'Anthony Edwards', undefined,
      ['ANTHONY', 'EDWARDS', 'TIMBERWOLVES']))
      .toBe('Anthony Edwards Timberwolves');
  });

  it('does not repeat a name printed on one line', () => {
    expect(composeTitle(undefined, 'Victor Wembanyama', undefined,
      ['2024 TOPPS CHROME', 'VICTOR WEMBANYAMA', 'SAN ANTONIO SPURS']))
      .toBe('Victor Wembanyama 2024 Topps Chrome San Antonio Spurs');
  });

  it('keeps a block that merely shares a word with the name', () => {
    // "Edwards Field" is not the name, so it survives.
    expect(composeTitle(undefined, 'Anthony Edwards', undefined, ['EDWARDS FIELD']))
      .toBe('Anthony Edwards Edwards Field');
  });

  it('still lists the blocks when there is no name at all', () => {
    expect(composeTitle(undefined, '', undefined, ['2023 PANINI PRIZM', 'TIMBERWOLVES']))
      .toBe('2023 Panini Prizm Timberwolves');
  });
});
