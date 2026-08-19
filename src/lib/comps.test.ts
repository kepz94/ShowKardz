import { describe, it, expect } from 'vitest';
import { compsUrl } from './comps';
import type { Stack } from '../types';

const prizm: Stack = {
  id: 's1', year: '2023', product: 'Panini Prizm', parallel: 'Base',
  createdAt: '2026-08-18T00:00:00.000Z',
};

const keywords = (url: string): string =>
  decodeURIComponent(new URL(url).searchParams.get('_nkw') ?? '').replace(/\+/g, ' ');

describe('compsUrl', () => {
  const url = compsUrl(prizm, 'Anthony Edwards', '58');

  it('points at eBay search', () => {
    expect(url.startsWith('https://www.ebay.com/sch/i.html?_nkw=')).toBe(true);
  });

  it('restricts to sold, completed listings — the only figures worth looking at', () => {
    expect(url).toContain('LH_Sold=1');
    expect(url).toContain('LH_Complete=1');
  });

  it('carries the player name and the card number into the query', () => {
    expect(keywords(url)).toContain('Anthony Edwards');
    expect(keywords(url)).toContain('58');
  });

  it('names a non-base parallel in the query', () => {
    expect(keywords(compsUrl({ ...prizm, parallel: 'Silver' }, 'Anthony Edwards')))
      .toContain('Silver');
  });

  it('encodes spaces as + so the URL survives being pasted anywhere', () => {
    expect(url).not.toContain('%20');
  });
});

/* -------------------------------------------------------------------------
   The regression that matters: this query returned ZERO results on real cards.

   Twelve negative keywords and a category scope were layered onto a title that
   was already specific. Each was defensible alone; together nothing matched,
   and the workaround was deleting the app's own additions by hand on every
   card. A search that finds nothing cannot be priced against.
------------------------------------------------------------------------- */
describe('compsUrl — nothing is added to the dealer’s text', () => {
  const url = compsUrl(undefined, 'Anthony Edwards 2023 Panini Prizm Timberwolves 58',
    undefined, ['2023 PANINI PRIZM', 'ANTHONY EDWARDS']);

  it('searches exactly what is in the card name field', () => {
    expect(keywords(url)).toBe('Anthony Edwards 2023 Panini Prizm Timberwolves 58');
  });

  it('adds no negative keywords', () => {
    expect(keywords(url)).not.toContain('-');
  });

  it('adds no category scope, which silently drops anything filed elsewhere', () => {
    expect(url).not.toContain('_sacat');
  });

  it('still limits to sold and completed, which is the point of the link', () => {
    expect(url).toContain('LH_Sold=1');
    expect(url).toContain('LH_Complete=1');
  });

  it('builds a usable search from a bare name with no group', () => {
    expect(keywords(compsUrl(undefined, 'Anthony Edwards'))).toBe('Anthony Edwards');
  });
});
