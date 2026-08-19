/**
 * Reading what is printed on a card.
 *
 * Principle 2 stands: the camera reads only what is PRINTED. Everything else —
 * year, product, parallel — comes from the group the dealer declared. So this
 * module's whole job is to find the player's name, and the card number if it is
 * there, and to be honest when it cannot.
 *
 * Errors here are cosmetic by design, never financial: a misread name is ugly
 * in a title, while the price and the sticker number are always the dealer's own
 * input. That is what makes an imperfect read acceptable.
 */

export interface Vertex {
  x?: number;
  y?: number;
}

export interface VisionAnnotation {
  description?: string;
  boundingPoly?: { vertices?: Vertex[] };
}

export interface CardRead {
  /** The player, title-cased. Empty when nothing looked like a name. */
  name: string;
  /** The printed card number or serial, e.g. "58" or "12/99". Empty if absent. */
  cardNumber: string;
}

/** Boilerplate that appears on cards but is never the player. */
const NOISE = [
  /^©/, /\binc\b/i, /\ball rights\b/i, /\bproperties\b/i, /\bpanini\b/i, /\btopps\b/i,
  /\bupper deck\b/i, /\bprizm\b/i, /\bdonruss\b/i, /\boptic\b/i, /\bmosaic\b/i,
  /\bnba\b/i, /\bnfl\b/i, /\bmlb\b/i, /\bnhl\b/i, /\brookie\b/i, /\bcard\b/i,
];

/** A whole line that is nothing but a card number: "#58", "12/99". */
const CARD_NUMBER = /^#?(\d{1,4}(?:\s*\/\s*\d{1,4})?)$/;

/**
 * A card number sitting inside a longer line. Cards print the team and the
 * number on one baseline, so OCR hands both back as a single line.
 *
 * Only #-prefixed numbers and n/n serials count. A bare run of digits is far
 * more likely to be a year ("2023 PANINI PRIZM") than a card number, and a
 * wrong number is worse than none.
 */
const EMBEDDED_NUMBER = /(?:#(\d{1,4})|\b(\d{1,4}\s*\/\s*\d{1,4})\b)/;

const area = (a: VisionAnnotation): number => {
  const v = a.boundingPoly?.vertices;
  if (!v || v.length < 3) return 0;
  const xs = v.map((p) => p.x ?? 0);
  const ys = v.map((p) => p.y ?? 0);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
};

/** Cards shout. "ANTHONY EDWARDS" is a name, not an acronym. */
function titleCase(text: string): string {
  if (text !== text.toUpperCase()) return text;
  return text
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

const clean = (text: string): string => text.replace(/[^\p{L}\p{N}\s'./#-]/gu, '').trim();

/**
 * Reduce a Vision text response to the two fields worth keeping.
 *
 * The name is chosen by printed SIZE, not by position: layouts differ wildly
 * between products, but the player's name is reliably the largest real text on
 * the front. Boilerplate is filtered first so a big "PANINI" cannot win.
 */
export function pickCardText(annotations: VisionAnnotation[]): CardRead {
  const lines = annotations
    .map((a) => ({ text: clean(a.description ?? ''), size: area(a) }))
    .filter((l) => l.text !== '');

  // A "#" or an "n/n" serial is unambiguous — that is a card number and
  // nothing else. Trust those on their own.
  const strong = lines
    .map((l) => {
      const m = EMBEDDED_NUMBER.exec(l.text);
      return m ? (m[1] ?? m[2] ?? '') : '';
    })
    .find((n) => n !== '') ?? '';

  /**
   * Bare digits are only PROBABLY a card number, so they count only when the
   * same read also produced a credible name — on a failed foil read the output
   * is digit-shaped fragments, and one of those becoming "card #7" is worse
   * than reporting nothing.
   *
   * Both a line that is only digits and digits sitting beside the team name
   * qualify: OCR frequently drops the "#" glyph, leaving "TIMBERWOLVES 58".
   * Years are excluded — every card carries one and it is never the number.
   */
  const isYear = (n: string) => /^(19|20)\d{2}$/.test(n);
  const weak = lines
    .flatMap((l) => l.text.split(/\s+/))
    .map((token) => /^#?(\d{1,4})$/.exec(token)?.[1] ?? '')
    .find((n) => n !== '' && !isYear(n)) ?? '';

  const nameCandidates = lines
    .filter((l) => !NOISE.some((re) => re.test(l.text)))
    .filter((l) => !CARD_NUMBER.test(l.text))
    // A player has at least two ALPHABETIC words. Counting tokens alone lets
    // "TIMBERWOLVES 58" pass as a name; counting words made of letters does
    // not, and also rejects "PRIZM 58" and similar.
    .filter((l) => l.text.split(/\s+/).filter((w) => /^[\p{L}'’-]{2,}$/u.test(w)).length >= 2)
    .sort((a, b) => b.size - a.size);

  const best = nameCandidates[0];
  const name = best ? titleCase(best.text).replace(/\s+/g, ' ').trim() : '';
  const cardNumber = strong || (name !== '' ? weak : '');

  return { name, cardNumber: cardNumber.replace(/\s*\/\s*/, '/') };
}
