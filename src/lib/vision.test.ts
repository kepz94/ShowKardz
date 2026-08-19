import { describe, it, expect } from 'vitest';
import { pickCardText, type VisionAnnotation } from './vision';

/** A Vision response line, positioned by its bounding box. */
const line = (text: string, x: number, y: number, w: number, h: number): VisionAnnotation => ({
  description: text,
  boundingPoly: {
    vertices: [
      { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
    ],
  },
});

describe('pickCardText', () => {
  it('returns nothing for an empty read', () => {
    expect(pickCardText([])).toEqual({ name: '', cardNumber: '' });
  });

  it('picks the largest text as the name — the player is the biggest thing printed', () => {
    const read = pickCardText([
      line('PANINI', 10, 10, 60, 12),
      line('ANTHONY EDWARDS', 10, 200, 260, 40),
      line('TIMBERWOLVES', 10, 250, 120, 14),
    ]);
    expect(read.name).toBe('Anthony Edwards');
  });

  it('title-cases a shouted name, because cards print in caps', () => {
    expect(pickCardText([line('VICTOR WEMBANYAMA', 0, 0, 300, 40)]).name)
      .toBe('Victor Wembanyama');
  });

  it('leaves a normally-cased name alone', () => {
    expect(pickCardText([line('Anthony Edwards', 0, 0, 300, 40)]).name)
      .toBe('Anthony Edwards');
  });

  it('finds a card number written with a hash', () => {
    const read = pickCardText([
      line('ANTHONY EDWARDS', 0, 100, 300, 40),
      line('#58', 10, 300, 30, 12),
    ]);
    expect(read.cardNumber).toBe('58');
  });

  it('reads a serial like 12/99 as the card number', () => {
    const read = pickCardText([
      line('ANTHONY EDWARDS', 0, 100, 300, 40),
      line('12/99', 10, 300, 40, 12),
    ]);
    expect(read.cardNumber).toBe('12/99');
  });

  it('never mistakes the player name for a card number', () => {
    expect(pickCardText([line('ANTHONY EDWARDS', 0, 0, 300, 40)]).cardNumber).toBe('');
  });

  it('ignores the manufacturer boilerplate that covers every card', () => {
    const read = pickCardText([
      line('PANINI', 0, 0, 280, 44),
      line('ANTHONY EDWARDS', 0, 100, 200, 30),
    ]);
    expect(read.name).toBe('Anthony Edwards');
  });

  it('ignores a copyright line even when it is large', () => {
    const read = pickCardText([
      line('© 2023 NBA PROPERTIES INC', 0, 0, 400, 50),
      line('ANTHONY EDWARDS', 0, 100, 200, 30),
    ]);
    expect(read.name).toBe('Anthony Edwards');
  });

  it('rejects a single word as a name — a player has at least two', () => {
    expect(pickCardText([line('PRIZM', 0, 0, 300, 40)]).name).toBe('');
  });

  it('drops stray punctuation from the read', () => {
    expect(pickCardText([line('ANTHONY EDWARDS*', 0, 0, 300, 40)]).name)
      .toBe('Anthony Edwards');
  });

  it('handles a Vision block with no bounding box rather than throwing', () => {
    expect(pickCardText([{ description: 'ANTHONY EDWARDS' }]).name).toBe('Anthony Edwards');
  });
});

describe('pickCardText — card number sharing a line', () => {
  it('finds a #-prefixed number inside a longer line', () => {
    // Real cards print the team and the number on one baseline, so OCR
    // returns them as a single line.
    const read = pickCardText([
      line('ANTHONY EDWARDS', 0, 100, 300, 44),
      line('TIMBERWOLVES  #58', 0, 300, 200, 14),
    ]);
    expect(read.cardNumber).toBe('58');
  });

  it('finds a serial inside a longer line', () => {
    const read = pickCardText([
      line('ANTHONY EDWARDS', 0, 100, 300, 44),
      line('SILVER PRIZM 12/99', 0, 300, 200, 14),
    ]);
    expect(read.cardNumber).toBe('12/99');
  });

  it('does not mistake a bare year for a card number', () => {
    const read = pickCardText([
      line('ANTHONY EDWARDS', 0, 100, 300, 44),
      line('2023 PANINI PRIZM', 0, 300, 200, 14),
    ]);
    expect(read.cardNumber).toBe('');
  });

  it('still prefers a line that is only the number', () => {
    const read = pickCardText([
      line('ANTHONY EDWARDS', 0, 100, 300, 44),
      line('#58', 0, 300, 30, 14),
      line('TEAM 99/99', 0, 340, 60, 14),
    ]);
    expect(read.cardNumber).toBe('58');
  });
});

describe('pickCardText — not inventing a card number from noise', () => {
  it('ignores a lone digit when nothing looked like a name', () => {
    // A foil card read produces junk fragments. "7" on its own is noise, and a
    // wrong card number is worse than no card number.
    expect(pickCardText([line('7', 10, 10, 8, 10)]).cardNumber).toBe('');
  });

  it('still trusts a #-prefixed number even with no name', () => {
    expect(pickCardText([line('#58', 10, 10, 30, 12)]).cardNumber).toBe('58');
  });

  it('still trusts a serial even with no name', () => {
    expect(pickCardText([line('12/99', 10, 10, 40, 12)]).cardNumber).toBe('12/99');
  });

  it('accepts a bare number once a real name is present', () => {
    const read = pickCardText([
      line('ANTHONY EDWARDS', 0, 100, 300, 44),
      line('58', 10, 300, 20, 12),
    ]);
    expect(read.cardNumber).toBe('58');
  });

  it('reports nothing at all for a read that found only noise', () => {
    expect(pickCardText([line('7', 0, 0, 8, 9), line('x', 20, 0, 6, 8)]))
      .toEqual({ name: '', cardNumber: '' });
  });
});

describe('pickCardText — a bare number beside the team', () => {
  it('takes a bare number from the team line once a name is known', () => {
    // OCR frequently drops the "#" glyph, leaving "TIMBERWOLVES 58".
    const read = pickCardText([
      line('ANTHONY EDWARDS', 0, 100, 300, 44),
      line('TIMBERWOLVES 58', 0, 300, 200, 14),
    ]);
    expect(read.cardNumber).toBe('58');
  });

  it('never takes a year as the card number', () => {
    const read = pickCardText([
      line('ANTHONY EDWARDS', 0, 100, 300, 44),
      line('TIMBERWOLVES 2023', 0, 300, 200, 14),
    ]);
    expect(read.cardNumber).toBe('');
  });

  it('takes nothing from a bare number when the read found no name', () => {
    expect(pickCardText([line('TIMBERWOLVES 58', 0, 300, 200, 14)]).cardNumber).toBe('');
  });
});
