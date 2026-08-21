import { describe, expect, it } from 'vitest';
import { parseHash, toHash } from './route';

describe('parseHash', () => {
  it('reads a plain screen', () => {
    expect(parseHash('#/collection')).toEqual({ route: 'collection' });
  });

  it('reads a card to open with it', () => {
    expect(parseHash('#/collection/abc123')).toEqual({ route: 'collection', id: 'abc123' });
  });

  it('falls back rather than erroring on an unknown screen', () => {
    // A stale bookmark should land somewhere usable, never on a blank page.
    expect(parseHash('#/nonsense')).toEqual({ route: 'shows' });
    expect(parseHash('')).toEqual({ route: 'shows' });
    expect(parseHash('#/')).toEqual({ route: 'shows' });
  });

  it('honours a caller-supplied fallback', () => {
    expect(parseHash('#/junk', 'scan')).toEqual({ route: 'scan' });
  });

  it('tolerates a missing or doubled slash', () => {
    expect(parseHash('#collection')).toEqual({ route: 'collection' });
    expect(parseHash('#//collection')).toEqual({ route: 'collection' });
    expect(parseHash('#/collection/')).toEqual({ route: 'collection' });
  });

  it('does not mistake a card id for a screen', () => {
    expect(parseHash('#/shows/999')).toEqual({ route: 'shows', id: '999' });
  });
});

describe('toHash', () => {
  it('writes a plain screen', () => {
    expect(toHash('shows')).toBe('#/shows');
  });

  it('writes a card alongside it', () => {
    expect(toHash('collection', 'abc123')).toBe('#/collection/abc123');
  });

  it('treats an empty id as no id', () => {
    expect(toHash('collection', '')).toBe('#/collection');
  });
});

describe('round trip', () => {
  it('survives a cold start, which is the whole reason it is in the URL', () => {
    expect(parseHash(toHash('collection', 'card-7'))).toEqual({ route: 'collection', id: 'card-7' });
    expect(parseHash(toHash('sales'))).toEqual({ route: 'sales' });
  });
});
