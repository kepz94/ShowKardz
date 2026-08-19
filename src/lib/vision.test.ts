import { describe, it, expect } from 'vitest';
import { EMPTY_READ, groupIntoLines, pickCardText, type VisionAnnotation } from './vision';

/**
 * A whole phrase as ONE annotation. Vision NEVER sends this shape - see word()
 * and the groupIntoLines suite below. These fixtures exercise the PICKING logic
 * (size ranking, noise filtering, card-number rules) on input already grouped
 * into lines. Do not read them as a description of the API.
 */
const phrase = (text: string, x: number, y: number, w: number, h: number): VisionAnnotation => ({
  description: text,
  boundingPoly: {
    vertices: [
      { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
    ],
  },
});

describe('pickCardText', () => {
  it('returns nothing for an empty read', () => {
    expect(pickCardText([])).toEqual(EMPTY_READ);
  });

  it('picks the largest text as the name — the player is the biggest thing printed', () => {
    const read = pickCardText([
      phrase('PANINI', 10, 10, 60, 12),
      phrase('ANTHONY EDWARDS', 10, 200, 260, 40),
      phrase('TIMBERWOLVES', 10, 250, 120, 14),
    ]);
    expect(read.name).toBe('Anthony Edwards');
  });

  it('title-cases a shouted name, because cards print in caps', () => {
    expect(pickCardText([phrase('VICTOR WEMBANYAMA', 0, 0, 300, 40)]).name)
      .toBe('Victor Wembanyama');
  });

  it('leaves a normally-cased name alone', () => {
    expect(pickCardText([phrase('Anthony Edwards', 0, 0, 300, 40)]).name)
      .toBe('Anthony Edwards');
  });

  it('finds a card number written with a hash', () => {
    const read = pickCardText([
      phrase('ANTHONY EDWARDS', 0, 100, 300, 40),
      phrase('#58', 10, 300, 30, 12),
    ]);
    expect(read.cardNumber).toBe('58');
  });

  it('reads a serial like 12/99 as the card number', () => {
    const read = pickCardText([
      phrase('ANTHONY EDWARDS', 0, 100, 300, 40),
      phrase('12/99', 10, 300, 40, 12),
    ]);
    expect(read.cardNumber).toBe('12/99');
  });

  it('never mistakes the player name for a card number', () => {
    expect(pickCardText([phrase('ANTHONY EDWARDS', 0, 0, 300, 40)]).cardNumber).toBe('');
  });

  it('ignores the manufacturer boilerplate that covers every card', () => {
    const read = pickCardText([
      phrase('PANINI', 0, 0, 280, 44),
      phrase('ANTHONY EDWARDS', 0, 100, 200, 30),
    ]);
    expect(read.name).toBe('Anthony Edwards');
  });

  it('ignores a copyright line even when it is large', () => {
    const read = pickCardText([
      phrase('© 2023 NBA PROPERTIES INC', 0, 0, 400, 50),
      phrase('ANTHONY EDWARDS', 0, 100, 200, 30),
    ]);
    expect(read.name).toBe('Anthony Edwards');
  });

  it('rejects a single word as a name — a player has at least two', () => {
    expect(pickCardText([phrase('PRIZM', 0, 0, 300, 40)]).name).toBe('');
  });

  it('drops stray punctuation from the read', () => {
    expect(pickCardText([phrase('ANTHONY EDWARDS*', 0, 0, 300, 40)]).name)
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
      phrase('ANTHONY EDWARDS', 0, 100, 300, 44),
      phrase('TIMBERWOLVES  #58', 0, 300, 200, 14),
    ]);
    expect(read.cardNumber).toBe('58');
  });

  it('finds a serial inside a longer line', () => {
    const read = pickCardText([
      phrase('ANTHONY EDWARDS', 0, 100, 300, 44),
      phrase('SILVER PRIZM 12/99', 0, 300, 200, 14),
    ]);
    expect(read.cardNumber).toBe('12/99');
  });

  it('does not mistake a bare year for a card number', () => {
    const read = pickCardText([
      phrase('ANTHONY EDWARDS', 0, 100, 300, 44),
      phrase('2023 PANINI PRIZM', 0, 300, 200, 14),
    ]);
    expect(read.cardNumber).toBe('');
  });

  it('still prefers a line that is only the number', () => {
    const read = pickCardText([
      phrase('ANTHONY EDWARDS', 0, 100, 300, 44),
      phrase('#58', 0, 300, 30, 14),
      phrase('TEAM 99/99', 0, 340, 60, 14),
    ]);
    expect(read.cardNumber).toBe('58');
  });
});

describe('pickCardText — not inventing a card number from noise', () => {
  it('ignores a lone digit when nothing looked like a name', () => {
    // A foil card read produces junk fragments. "7" on its own is noise, and a
    // wrong card number is worse than no card number.
    expect(pickCardText([phrase('7', 10, 10, 8, 10)]).cardNumber).toBe('');
  });

  it('still trusts a #-prefixed number even with no name', () => {
    expect(pickCardText([phrase('#58', 10, 10, 30, 12)]).cardNumber).toBe('58');
  });

  it('still trusts a serial even with no name', () => {
    expect(pickCardText([phrase('12/99', 10, 10, 40, 12)]).cardNumber).toBe('12/99');
  });

  it('accepts a bare number once a real name is present', () => {
    const read = pickCardText([
      phrase('ANTHONY EDWARDS', 0, 100, 300, 44),
      phrase('58', 10, 300, 20, 12),
    ]);
    expect(read.cardNumber).toBe('58');
  });

  it('reports nothing at all for a read that found only noise', () => {
    expect(pickCardText([phrase('7', 0, 0, 8, 9), phrase('x', 20, 0, 6, 8)]))
      .toMatchObject({ name: '', cardNumber: '', year: '', product: '', team: '' });
  });
});

describe('pickCardText — a bare number beside the team', () => {
  it('takes a bare number from the team line once a name is known', () => {
    // OCR frequently drops the "#" glyph, leaving "TIMBERWOLVES 58".
    const read = pickCardText([
      phrase('ANTHONY EDWARDS', 0, 100, 300, 44),
      phrase('TIMBERWOLVES 58', 0, 300, 200, 14),
    ]);
    expect(read.cardNumber).toBe('58');
  });

  it('never takes a year as the card number', () => {
    const read = pickCardText([
      phrase('ANTHONY EDWARDS', 0, 100, 300, 44),
      phrase('TIMBERWOLVES 2023', 0, 300, 200, 14),
    ]);
    expect(read.cardNumber).toBe('');
  });

  it('takes nothing from a bare number when the read found no name', () => {
    expect(pickCardText([phrase('TIMBERWOLVES 58', 0, 300, 200, 14)]).cardNumber).toBe('');
  });
});

/* ---------------------------------------------------------------------------
   The shape Vision ACTUALLY returns.

   `textAnnotations[0]` is the whole block; every entry after it is a single
   WORD with its own box. The suites above feed whole phrases, which is why the
   read could be broken in production while all of them stayed green: a
   one-word annotation can never satisfy the "two or more alphabetic words"
   name filter, so every card came back nameless and the screen said "nothing
   readable on that photo".
--------------------------------------------------------------------------- */

/** One word, as Vision hands it back. */
const word = (text: string, x: number, y: number, w: number, h: number): VisionAnnotation => ({
  description: text,
  boundingPoly: {
    vertices: [
      { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
    ],
  },
});

/** A real base-card front, word by word, boxes to scale. */
const REAL_CARD: VisionAnnotation[] = [
  word('2023', 18, 22, 46, 14),
  word('PANINI', 70, 22, 62, 14),
  word('PRIZM', 138, 22, 54, 14),
  word('ANTHONY', 20, 300, 148, 34),
  word('EDWARDS', 176, 302, 150, 34),
  word('TIMBERWOLVES', 20, 352, 118, 13),
  word('#58', 146, 353, 26, 13),
];

describe('groupIntoLines — word-level annotations, which is what Vision sends', () => {
  it('joins words sharing a baseline into one line, left to right', () => {
    const lines = groupIntoLines([
      word('EDWARDS', 176, 302, 150, 34),
      word('ANTHONY', 20, 300, 148, 34),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.description).toBe('ANTHONY EDWARDS');
  });

  it('keeps a smaller line of type on its own line', () => {
    const lines = groupIntoLines(REAL_CARD).map((l) => l.description);
    expect(lines).toContain('2023 PANINI PRIZM');
    expect(lines).toContain('ANTHONY EDWARDS');
    expect(lines).toContain('TIMBERWOLVES #58');
  });

  it('unions the boxes, so a joined name outranks the boilerplate by size', () => {
    const name = groupIntoLines(REAL_CARD).find((l) => l.description === 'ANTHONY EDWARDS');
    const v = name?.boundingPoly?.vertices ?? [];
    const xs = v.map((p) => p.x ?? 0);
    const ys = v.map((p) => p.y ?? 0);
    expect(Math.min(...xs)).toBe(20);
    expect(Math.max(...xs)).toBe(326);
    expect(Math.min(...ys)).toBe(300);
    expect(Math.max(...ys)).toBe(336);
  });

  it('keeps an annotation that carries no box rather than dropping its text', () => {
    const lines = groupIntoLines([{ description: 'ANTHONY EDWARDS' }]);
    expect(lines.map((l) => l.description)).toContain('ANTHONY EDWARDS');
  });

  it('returns nothing for nothing', () => {
    expect(groupIntoLines([])).toEqual([]);
  });
});

describe('pickCardText — driven by a real word-level response', () => {
  it('reads the name off a card that used to come back empty', () => {
    // THE REGRESSION. Before lines were rebuilt from words this returned
    // { name: '', cardNumber: '' } for every card ever photographed.
    expect(pickCardText(REAL_CARD)).toMatchObject({
      name: 'Anthony Edwards', cardNumber: '58',
      year: '2023', product: 'Panini Prizm', team: 'Timberwolves',
    });
  });

  it('reads a name with no card number printed on the front', () => {
    const read = pickCardText([
      word('2023', 18, 22, 46, 14),
      word('PANINI', 70, 22, 62, 14),
      word('VICTOR', 20, 300, 130, 34),
      word('WEMBANYAMA', 158, 301, 210, 34),
      word('SPURS', 20, 352, 60, 13),
    ]);
    expect(read).toMatchObject({ name: 'Victor Wembanyama', cardNumber: '' });
  });

  it('does not turn the year into a card number', () => {
    expect(pickCardText(REAL_CARD.filter((a) => a.description !== '#58')).cardNumber).toBe('');
  });

  it('still reports nothing when the read is genuinely junk', () => {
    expect(pickCardText([
      word('7', 12, 40, 9, 11),
      word('rn', 60, 120, 14, 10),
      word('4', 200, 260, 8, 11),
    ])).toMatchObject({ name: '', cardNumber: '', product: '', team: '' });
  });
});
