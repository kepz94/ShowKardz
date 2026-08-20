import { describe, expect, it } from 'vitest';
import { parseHash, toHash } from './route';

describe('parseHash', () => {
  it('reads a plain screen', () => {
    expect(parseHash('#/book')).toEqual({ route: 'book' });
  });

  it('reads a card to open with it', () => {
    expect(parseHash('#/book/abc123')).toEqual({ route: 'book', cardId: 'abc123' });
  });

  it('falls back rather than erroring on an unknown screen', () => {
    // A stale bookmark should land somewhere usable, never on a blank page.
    expect(parseHash('#/nonsense')).toEqual({ route: 'prep' });
    expect(parseHash('')).toEqual({ route: 'prep' });
    expect(parseHash('#/')).toEqual({ route: 'prep' });
  });

  it('honours a caller-supplied fallback', () => {
    expect(parseHash('#/junk', 'scan')).toEqual({ route: 'scan' });
  });

  it('tolerates a missing or doubled slash', () => {
    expect(parseHash('#book')).toEqual({ route: 'book' });
    expect(parseHash('#//book')).toEqual({ route: 'book' });
    expect(parseHash('#/book/')).toEqual({ route: 'book' });
  });

  it('does not mistake a card id for a screen', () => {
    expect(parseHash('#/show/999')).toEqual({ route: 'show', cardId: '999' });
  });
});

describe('toHash', () => {
  it('writes a plain screen', () => {
    expect(toHash('prep')).toBe('#/prep');
  });

  it('writes a card alongside it', () => {
    expect(toHash('book', 'abc123')).toBe('#/book/abc123');
  });

  it('treats an empty id as no id', () => {
    expect(toHash('book', '')).toBe('#/book');
  });
});

describe('round trip', () => {
  it('survives a cold start, which is the whole reason it is in the URL', () => {
    expect(parseHash(toHash('book', 'card-7'))).toEqual({ route: 'book', cardId: 'card-7' });
    expect(parseHash(toHash('sales'))).toEqual({ route: 'sales' });
  });
});
