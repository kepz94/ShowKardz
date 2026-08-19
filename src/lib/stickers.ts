/**
 * Taking the sticker number off the card the camera already photographed.
 *
 * The sticker is on the sleeve when the photo is taken, so its number comes
 * back as one of the blocks Vision read. Pointing at that block is faster and
 * less error-prone than retyping digits that are already on screen.
 *
 * WHY THIS IS NOT IN numbers.ts. That module is the app's addressing scheme and
 * the one hard integrity rule; it must stay boring. Anything OCR-shaped — what
 * a read block WOULD store, whether it is worth offering at all — lives here
 * and leans on normalizeNumber rather than reimplementing it.
 *
 * THE NUMBER IS STILL THE DEALER'S. Assigning is a tap on a specific block, not
 * an autofill, and the block is editable before and after it is assigned: a
 * misread is corrected with Edit, not worked around. The digits that will
 * actually be stored are shown in the number band at full size, so what gets
 * filed is on screen before the card is.
 */
import { normalizeNumber } from './numbers';

export interface StickerCandidate {
  /** The digits that would be stored if this block were assigned. */
  digits: string;
  /** Whether this block is worth offering as a sticker number at all. */
  offerable: boolean;
}

/**
 * What a read block would become if it were made the sticker number.
 *
 * Anything with a digit in it is offered. A block reading "4S5" is offered even
 * though it would file as 45 — the dealer can see the digits in the band and
 * fix the block with Edit, and refusing it outright would just mean retyping a
 * number that is nearly right.
 */
export function stickerCandidate(text: string): StickerCandidate {
  const digits = normalizeNumber(text);
  return { digits, offerable: digits !== '' };
}

/**
 * The blocks that still belong to the card's title, once one is the sticker.
 *
 * A sticker number is how the dealer finds the card in the case; it is not part
 * of what the card IS. So an assigned block leaves the title entirely — the
 * composed name, the blocks saved on the record, and the eBay query, all three
 * at once, because all three are built from the same kept list.
 *
 * An id that matches nothing changes nothing. A retake rebuilds the blocks with
 * fresh ids, and a stale id must not drop whichever block now sits in its place.
 */
export function titleBlocks<T extends { id: string }>(
  blocks: T[],
  assignedId: string | null,
): T[] {
  if (assignedId == null) return blocks;
  return blocks.filter((b) => b.id !== assignedId);
}
