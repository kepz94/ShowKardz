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
