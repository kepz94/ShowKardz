import { describe, it, expect } from 'vitest';
import { compsUrl, NEGATIVE_KEYWORDS, SINGLES_CATEGORY } from './comps';
import type { Stack } from '../types';

const prizm: Stack = {
  id: 's1', year: '2023', product: 'Panini Prizm', parallel: 'Base',
  createdAt: '2026-08-18T00:00:00.000Z',
};

describe('compsUrl', () => {
  const url = compsUrl(prizm, 'Anthony Edwards', '58');

  it('points at eBay search', () => {
    expect(url.startsWith('https://www.ebay.com/sch/i.html?_nkw=')).toBe(true);
  });

  it('restricts to sold, completed listings — the only figures worth looking at', () => {
    expect(url).toContain('LH_Sold=1');
    expect(url).toContain('LH_Complete=1');
  });

  it('scopes to trading card singles so boxes and lots never enter the result', () => {
    expect(url).toContain(`_sacat=${SINGLES_CATEGORY}`);
  });

  it('appends the negative keywords that strip autos, relics and slabs', () => {
    const decoded = decodeURIComponent(url.replace(/\+/g, ' '));
    for (const term of NEGATIVE_KEYWORDS.split(' ')) expect(decoded).toContain(term);
  });

  it('carries the player name and the card number into the query', () => {
    const decoded = decodeURIComponent(url.replace(/\+/g, ' '));
    expect(decoded).toContain('Anthony Edwards');
    expect(decoded).toContain('58');
  });

  it('names a non-base parallel in the query', () => {
    const decoded = decodeURIComponent(compsUrl({ ...prizm, parallel: 'Silver' }, 'Anthony Edwards')
      .replace(/\+/g, ' '));
    expect(decoded).toContain('Silver');
  });

  it('encodes spaces as + so the URL survives being pasted anywhere', () => {
    expect(url).not.toContain('%20');
  });
});
