import { describe, it, expect } from 'vitest';
import { nextStar, orderByStar, toggleStar } from './stars';

const block = (id: string, star: number | null = null) => ({ id, star });

/** The blocks off a real card, in the order they are printed. */
const printed = () => [
  block('a'), // 2023 PANINI PRIZM
  block('b'), // ANTHONY
  block('c'), // EDWARDS
  block('d'), // TIMBERWOLVES # 58
];

describe('orderByStar', () => {
  it('leaves printed order alone when nothing is starred', () => {
    expect(orderByStar(printed()).map((b) => b.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('puts a starred block first', () => {
    const after = toggleStar(printed(), 'c');
    expect(orderByStar(after).map((b) => b.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('puts a second star BEHIND the first, not in front of it', () => {
    // The whole rule: the order stars were given in is the order they land in.
    let blocks = toggleStar(printed(), 'c');
    blocks = toggleStar(blocks, 'b');
    expect(orderByStar(blocks).map((b) => b.id)).toEqual(['c', 'b', 'a', 'd']);
  });

  it('keeps the unstarred blocks in printed order underneath', () => {
    let blocks = toggleStar(printed(), 'd');
    blocks = toggleStar(blocks, 'c');
    expect(orderByStar(blocks).map((b) => b.id)).toEqual(['d', 'c', 'a', 'b']);
  });

  it('takes a star back and drops the block to where it was printed', () => {
    let blocks = toggleStar(printed(), 'c');
    blocks = toggleStar(blocks, 'c');
    expect(orderByStar(blocks).map((b) => b.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(blocks.every((b) => b.star == null)).toBe(true);
  });

  it('re-starring after unstarring goes to the back of the stars, not the front', () => {
    let blocks = toggleStar(printed(), 'a');   // a is star 1
    blocks = toggleStar(blocks, 'd');          // d is star 2
    blocks = toggleStar(blocks, 'a');          // a unstarred
    blocks = toggleStar(blocks, 'a');          // a starred again, now behind d
    expect(orderByStar(blocks).map((b) => b.id)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('does not mutate what it was given', () => {
    const before = printed();
    orderByStar(before);
    expect(before.map((b) => b.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('handles an empty read', () => {
    expect(orderByStar([])).toEqual([]);
    expect(nextStar([])).toBe(1);
  });
});
