/**
 * Sticker numbers — the app's addressing scheme.
 *
 * A sticker carries digits and nothing else, so a number is normalized by
 * discarding every non-digit. Leading zeros are preserved: "0455" is what is
 * physically on the card, and the dealer types what they see.
 */
import type { Card } from '../types';

/** What the dealer typed, reduced to the digits actually on the sticker. */
export function normalizeNumber(input: string): string {
  return input.replace(/\D/g, '');
}

/** A usable sticker number has at least one digit. */
export function isValidNumber(input: string): boolean {
  return normalizeNumber(input).length > 0;
}

/** The card wearing this sticker, however the number was typed. */
export function findByNumber(cards: Card[], input: string): Card | undefined {
  const n = normalizeNumber(input);
  if (n === '') return undefined;
  return cards.find((c) => normalizeNumber(c.number) === n);
}

/**
 * THE integrity rule: one sticker number, one card.
 *
 * Sold cards still hold their number — the record is what makes the day log and
 * the case audit possible, so a sold card's number is not recycled. Pass
 * `exceptCardId` when editing a card so it does not collide with itself.
 */
export function isDuplicate(cards: Card[], input: string, exceptCardId?: string): boolean {
  const n = normalizeNumber(input);
  if (n === '') return false;
  return cards.some((c) => c.id !== exceptCardId && normalizeNumber(c.number) === n);
}
