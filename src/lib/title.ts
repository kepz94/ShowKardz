/**
 * Title composition — principle 2 in practice.
 *
 * The camera reads only what is printed (the player name). Everything else
 * comes from a group the dealer declared. No card-ID database is consulted,
 * because there isn't one and buying access to one is the moat this design
 * routes around.
 *
 * A group is OPTIONAL and usually arrives later. Intake is number-first — peel,
 * stick, type, next — so a card can exist with nothing but its sticker number,
 * and every function here has to hold at that stage.
 */
import type { Card, Stack } from '../types';

/** A parallel token that means "no parallel", and so never appears in a title. */
const BASE_PARALLEL = 'base';

/** Cards shout. Title-case them so a composed title reads like a listing. */
function pretty(text: string): string {
  const t = text.replace(/#/g, ' ').replace(/\s+/g, ' ').trim();
  if (t !== t.toUpperCase()) return t;
  return t.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/**
 * Compose the title, and the eBay query behind it.
 *
 * When the dealer kept blocks off the card, THOSE ARE THE TITLE. They are what
 * is printed on the card in hand, chosen by the person holding it, so nothing
 * here second-guesses them — no parsing into year/product/team, no reordering,
 * no dropping a block because it looked like boilerplate.
 *
 * Only when there are none does it fall back to the group: a card typed in
 * without a photo still gets a usable title from the declaration plus the name.
 */
export function composeTitle(
  stack: Stack | undefined,
  name: string,
  cardNumber?: string,
  printed?: string[],
): string {
  const kept = (printed ?? []).map(pretty).filter(Boolean);
  if (kept.length > 0) return kept.join(' ');

  const parallel = stack?.parallel.trim() ?? '';
  const parts = [
    stack?.year ?? '',
    stack?.product ?? '',
    parallel.toLowerCase() === BASE_PARALLEL ? '' : parallel,
    name,
    cardNumber ?? '',
  ];
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * What to show in a list. Never empty: a freshly entered card has only its
 * sticker number, and a row that renders as nothing looks like a bug.
 */
export function cardLabel(card: Card, stack: Stack | undefined): string {
  const title = composeTitle(stack, card.name, card.cardNumber, card.printed);
  if (title !== '') return title;
  return card.number.trim() === '' ? 'Untitled card' : `Card ${card.number}`;
}
