import { describe, expect, it } from 'vitest';
import { stickerCandidate, titleBlocks } from './stickers';

describe('stickerCandidate', () => {
  it('takes a block that is already just digits', () => {
    expect(stickerCandidate('455')).toEqual({ digits: '455', offerable: true });
  });

  it('keeps leading zeros, because that is what is on the sticker', () => {
    // numbers.ts is explicit about this: the dealer types what they see.
    expect(stickerCandidate('0455')).toEqual({ digits: '0455', offerable: true });
  });

  it('drops a hash the camera read off the sticker', () => {
    expect(stickerCandidate('#455')).toEqual({ digits: '455', offerable: true });
  });

  it('offers a misread block, because the dealer can edit it before assigning', () => {
    // "4S5" would file as 45. That is not silently accepted anywhere — the
    // number band shows the digits, and Edit is on the row.
    expect(stickerCandidate('4S5')).toEqual({ digits: '45', offerable: true });
  });

  it('offers a block with digits and words', () => {
    expect(stickerCandidate('455 MINT')).toEqual({ digits: '455', offerable: true });
  });

  it('refuses a block with no digits in it', () => {
    expect(stickerCandidate('PANINI PRIZM')).toEqual({ digits: '', offerable: false });
  });

  it('refuses an empty or blank block', () => {
    expect(stickerCandidate('')).toEqual({ digits: '', offerable: false });
    expect(stickerCandidate('   ')).toEqual({ digits: '', offerable: false });
  });
});

describe('titleBlocks', () => {
  const a = { id: 'a' };
  const b = { id: 'b' };
  const c = { id: 'c' };

  it('drops the assigned block, because a sticker number is not part of the title', () => {
    expect(titleBlocks([a, b, c], 'b')).toEqual([a, c]);
  });

  it('keeps every block when nothing is assigned', () => {
    expect(titleBlocks([a, b, c], null)).toEqual([a, b, c]);
  });

  it('keeps every block when the assigned id is not among them', () => {
    // A retake rebuilds the blocks with new ids. A stale id must not silently
    // drop whichever block happens to sit in that position now.
    expect(titleBlocks([a, b, c], 'gone')).toEqual([a, b, c]);
  });

  it('preserves the order it was given', () => {
    expect(titleBlocks([c, a, b], 'a')).toEqual([c, b]);
  });
});
