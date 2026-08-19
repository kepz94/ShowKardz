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

/**
 * A whole line that is nothing but a card number: "#58", "# 58", "12/99".
 *
 * The `\s*` after the hash is not cosmetic. Vision returns "#" and "58" as two
 * SEPARATE words, so a line rebuilt from them reads "TIMBERWOLVES # 58" — and a
 * pattern that demands the digits touch the hash silently drops the strongest
 * card-number signal a card has. Confirmed against a real response.
 */
const CARD_NUMBER = /^#?\s*(\d{1,4}(?:\s*\/\s*\d{1,4})?)$/;

/**
 * A card number sitting inside a longer line. Cards print the team and the
 * number on one baseline, so OCR hands both back as a single line.
 *
 * Only #-prefixed numbers and n/n serials count. A bare run of digits is far
 * more likely to be a year ("2023 PANINI PRIZM") than a card number, and a
 * wrong number is worse than none.
 */
const EMBEDDED_NUMBER = /(?:#\s*(\d{1,4})|\b(\d{1,4}\s*\/\s*\d{1,4})\b)/;

interface Box { x0: number; x1: number; y0: number; y1: number }

const box = (a: VisionAnnotation): Box | null => {
  const v = a.boundingPoly?.vertices;
  if (!v || v.length < 3) return null;
  const xs = v.map((p) => p.x ?? 0);
  const ys = v.map((p) => p.y ?? 0);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};

const area = (a: VisionAnnotation): number => {
  const b = box(a);
  return b ? (b.x1 - b.x0) * (b.y1 - b.y0) : 0;
};

/**
 * Rebuild lines from words. THIS IS THE FIX FOR THE READ THAT NEVER WORKED.
 *
 * Vision's `textAnnotations` returns the whole block at index 0 and then **one
 * entry per WORD** — not per line. `pickCardText` picks a name by requiring two
 * or more alphabetic words in a single entry, which one word can never satisfy,
 * so the name came back empty on every card ever scanned and the screen said
 * "nothing readable on that photo". The unit tests missed it because the
 * fixture helper was named `line()` and fed whole phrases as one annotation —
 * a response shape Google does not send.
 *
 * Words are grouped by vertical band. A card photographed by hand is near
 * enough axis-aligned for that, and the tolerance scales with glyph height so a
 * 40px name and a 12px team line stay separate. Within a band words are ordered
 * left to right and the boxes unioned, which also gives `area()` the full
 * printed width of the name — the thing the size heuristic below is actually
 * reasoning about.
 */
export function groupIntoLines(words: VisionAnnotation[]): VisionAnnotation[] {
  const boxed = words.map((w) => ({ w, b: box(w) }));

  // An annotation with no geometry cannot be banded with anything. It survives
  // as its own line rather than being dropped — losing text here would be a
  // silent read failure, which is the exact class of bug this function fixes.
  const loose = boxed.filter((e) => e.b === null).map((e) => e.w);

  const placed = boxed
    .filter((e): e is { w: VisionAnnotation; b: Box } => e.b !== null)
    .sort((a, b) => (a.b.y0 + a.b.y1) - (b.b.y0 + b.b.y1));

  const lines: { parts: { w: VisionAnnotation; b: Box }[]; b: Box }[] = [];

  for (const entry of placed) {
    const cy = (entry.b.y0 + entry.b.y1) / 2;
    const open = lines.find((l) => {
      const lcy = (l.b.y0 + l.b.y1) / 2;
      // Half the taller of the two glyph heights: generous enough for a
      // baseline that drifts across a handheld shot, tight enough that a
      // separate line of smaller type stays its own line.
      const tol = Math.max(entry.b.y1 - entry.b.y0, l.b.y1 - l.b.y0) * 0.5;
      return Math.abs(cy - lcy) <= tol;
    });

    if (open) {
      open.parts.push(entry);
      open.b = {
        x0: Math.min(open.b.x0, entry.b.x0), x1: Math.max(open.b.x1, entry.b.x1),
        y0: Math.min(open.b.y0, entry.b.y0), y1: Math.max(open.b.y1, entry.b.y1),
      };
    } else {
      lines.push({ parts: [entry], b: { ...entry.b } });
    }
  }

  const joined: VisionAnnotation[] = lines.map((l) => ({
    description: l.parts
      .slice()
      .sort((a, b) => a.b.x0 - b.b.x0)
      .map((p) => p.w.description ?? '')
      .join(' ')
      .trim(),
    boundingPoly: {
      vertices: [
        { x: l.b.x0, y: l.b.y0 }, { x: l.b.x1, y: l.b.y0 },
        { x: l.b.x1, y: l.b.y1 }, { x: l.b.x0, y: l.b.y1 },
      ],
    },
  }));

  return [...joined, ...loose];
}

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
 * Takes the WORD-level annotations Vision actually returns (everything after
 * `textAnnotations[0]`) and groups them into lines first — see groupIntoLines
 * above for why that step is load-bearing rather than cosmetic.
 *
 * The name is chosen by printed SIZE, not by position: layouts differ wildly
 * between products, but the player's name is reliably the largest real text on
 * the front. Boilerplate is filtered first so a big "PANINI" cannot win.
 */
export function pickCardText(annotations: VisionAnnotation[]): CardRead {
  const lines = groupIntoLines(annotations)
    .map((a) => {
      const b = box(a);
      return {
        text: clean(a.description ?? ''),
        size: area(a),
        // Glyph HEIGHT, not area: area rewards a long line, and the widest
        // thing on a card is often a row of small print, not the name.
        height: b ? b.y1 - b.y0 : 0,
        top: b ? b.y0 : 0,
        bottom: b ? b.y1 : 0,
      };
    })
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

  /*
   * THE NAME IS A BLOCK, NOT A LINE.
   *
   * Requiring two alphabetic words in ONE line looks reasonable and is wrong on
   * a large share of real cards, because the first and last name are very often
   * printed stacked:
   *
   *     ANTHONY
   *     EDWARDS
   *
   * Neither line has two words, so no candidate survived and the read came back
   * nameless — which is what "could not read the card" actually was, even after
   * lines were being rebuilt from words correctly.
   *
   * So: find the biggest TYPE SIZE among plausible lines, take every line set in
   * that same size, and merge the ones that sit directly above or below each
   * other. That reads a stacked name and a single-line name identically, and it
   * still cannot pick up the team or the set, which are printed smaller.
   */
  const plausible = lines
    .filter((l) => !NOISE.some((re) => re.test(l.text)))
    .filter((l) => !CARD_NUMBER.test(l.text))
    // At least one real word. Rejects "58", "12/99" and other digit debris.
    .filter((l) => l.text.split(/\s+/).some((w) => /^[\p{L}'’-]{2,}$/u.test(w)));

  const tallest = plausible.reduce<typeof plausible[number] | undefined>(
    (best, l) => (best === undefined || l.height > best.height ? l : best),
    undefined,
  );

  let name = '';
  if (tallest) {
    // Same type size as the tallest line, within a tolerance that absorbs the
    // difference between a cap-height line and one with a descender.
    const sameSize = plausible
      .filter((l) => l.height >= tallest.height * 0.72)
      .sort((a, b) => a.top - b.top);

    // Keep only the run that actually touches the tallest line: two large words
    // at opposite ends of the card are not one name.
    const gapLimit = tallest.height * 1.1;
    const block = [tallest];
    const start = sameSize.indexOf(tallest);
    for (let i = start - 1; i >= 0; i -= 1) {
      const above = sameSize[i];
      const next = sameSize[i + 1];
      if (!above || !next || next.top - above.bottom > gapLimit) break;
      block.unshift(above);
    }
    for (let i = start + 1; i < sameSize.length; i += 1) {
      const below = sameSize[i];
      const prev = sameSize[i - 1];
      if (!below || !prev || below.top - prev.bottom > gapLimit) break;
      block.push(below);
    }

    const joined = block.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
    // A player has two names. Checked on the whole block rather than per line,
    // which is the correction: "TIMBERWOLVES" alone still fails, "ANTHONY" +
    // "EDWARDS" stacked now passes.
    const words = joined.split(' ').filter((w) => /^[\p{L}'’-]{2,}$/u.test(w));
    if (words.length >= 2) name = titleCase(joined);
  }
  const cardNumber = strong || (name !== '' ? weak : '');

  return { name, cardNumber: cardNumber.replace(/\s*\/\s*/, '/') };
}
