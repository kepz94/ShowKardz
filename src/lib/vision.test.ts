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
