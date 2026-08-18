import { describe, it, expect } from 'vitest';
import { composeTitle } from './title';
import type { Stack } from '../types';

const prizm: Stack = {
  id: 's1', year: '2023', product: 'Panini Prizm', parallel: 'Base',
  createdAt: '2026-08-18T00:00:00.000Z',
};

describe('composeTitle', () => {
  it('joins the stack declaration with the player name', () => {
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

  it('survives a stack with fields left blank', () => {
    expect(composeTitle({ ...prizm, year: '', product: '', parallel: '' }, 'Anthony Edwards'))
      .toBe('Anthony Edwards');
  });

  it('collapses the whitespace a blank field would otherwise leave behind', () => {
    expect(composeTitle({ ...prizm, product: '' }, 'Anthony Edwards')).toBe('2023 Anthony Edwards');
  });
});
