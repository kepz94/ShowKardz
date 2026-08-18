import { describe, it, expect } from 'vitest';
import { photoState } from './attachments';

describe('photoState', () => {
  it('is "none" when the record never had a photo', () => {
    expect(photoState(undefined, false)).toBe('none');
  });

  it('is "local" when the image is on this device', () => {
    expect(photoState('p1', true)).toBe('local');
  });

  it('is "elsewhere" when the record references a photo this device does not hold', () => {
    // Photos never sync — only the reference does. On a second device this is
    // the NORMAL state, not an error, and must read as such.
    expect(photoState('p1', false)).toBe('elsewhere');
  });

  it('ignores a stray local blob when the record claims no photo', () => {
    expect(photoState(undefined, true)).toBe('none');
  });
});
