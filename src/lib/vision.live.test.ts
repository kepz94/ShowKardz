import { describe, it, expect } from 'vitest';
import { pickCardText, groupIntoLines, type VisionAnnotation } from './vision';
import { compsUrl } from './comps';
import real from './__real-vision-response.json';

/**
 * A VERBATIM Google Cloud Vision response, captured by POSTing a card-shaped
 * image to images:annotate with the app's own deployed key.
 *
 * This is the fixture the suite never had. Every other test in vision.test.ts
 * is hand-written, and the hand-written ones all agreed with each other about a
 * response shape Google does not send — which is how a read that failed on
 * 100% of cards shipped green.
 */
const annotations = (real.responses[0]?.textAnnotations ?? []) as VisionAnnotation[];

describe('a real Vision response', () => {
  it('returns the whole block first, then ONE ENTRY PER WORD', () => {
    expect(annotations[0]?.description).toContain('\n');
    // The entries after the block are single words, never lines.
    const words = annotations.slice(1).map((a) => a.description ?? '');
    expect(words).toContain('ANTHONY');
    expect(words).toContain('EDWARDS');
    expect(words.some((w) => w.includes(' '))).toBe(false);
  });

  it('rebuilds the printed lines from those words', () => {
    const lines = groupIntoLines(annotations.slice(1)).map((l) => l.description);
    // The name is printed STACKED on this card, so two of these lines carry one
    // word each. That is correct output — and it is exactly the case that broke
    // the "two alphabetic words in one line" name rule.
    // "#" and "58" come back as separate words, so the rebuilt line has a gap
    // in it. The card-number patterns tolerate that; they used not to.
    expect(lines).toEqual(['2023 PANINI PRIZM', 'ANTHONY', 'EDWARDS', 'TIMBERWOLVES # 58']);
  });

  it('keeps everything printed on the card, not just the name', () => {
    // The whole point of the read: a bare player name returns every card he has
    // ever appeared on. This is what makes the eBay query the card in hand.
    expect(pickCardText(annotations.slice(1))).toEqual({
      name: 'Anthony Edwards',
      cardNumber: '58',
      year: '2023',
      product: 'Panini Prizm',
      team: 'Timberwolves',
      lines: ['2023 PANINI PRIZM', 'ANTHONY', 'EDWARDS', 'TIMBERWOLVES # 58'],
    });
  });
});

/* A second verbatim response: a different layout, name on ONE line, no card
   number printed on the front. Two real fixtures rather than one, because the
   first fix passed every hand-written test and still failed on real data. */
import real2 from './__real-vision-response-2.json';

describe('a real Vision response — single-line name, no card number', () => {
  const words2 = (real2.responses[0]?.textAnnotations ?? []).slice(1) as VisionAnnotation[];

  it('rebuilds the three printed lines', () => {
    expect(groupIntoLines(words2).map((l) => l.description))
      .toEqual(['2024 TOPPS CHROME', 'VICTOR WEMBANYAMA', 'SAN ANTONIO SPURS']);
  });

  it('reads the player and reports no card number rather than inventing one', () => {
    // "2024" is a year and must never become the card number, and the team line
    // is smaller type so it cannot be mistaken for the name.
    expect(pickCardText(words2)).toEqual({
      name: 'Victor Wembanyama',
      cardNumber: '',
      year: '2024',
      product: 'Topps Chrome',
      team: 'San Antonio Spurs',
      lines: ['2024 TOPPS CHROME', 'VICTOR WEMBANYAMA', 'SAN ANTONIO SPURS'],
    });
  });
});

/* -------------------------------------------------------------------------
   What the read is FOR. A player name on its own is not a search: "Anthony
   Edwards" returns every card he has ever appeared on, including the autos and
   patches that sell for ten times a base card and drag the read high.
------------------------------------------------------------------------- */
describe('the comps query the read produces', () => {
  const read1 = pickCardText((real.responses[0]?.textAnnotations ?? []).slice(1) as VisionAnnotation[]);

  it('searches the card in hand, not just the player', () => {
    const url = compsUrl(undefined, read1.name, read1.cardNumber, read1);
    const kw = decodeURIComponent(new URL(url).searchParams.get('_nkw') ?? '').replace(/\+/g, ' ');
    expect(kw).toContain('2023');
    expect(kw).toContain('Panini Prizm');
    expect(kw).toContain('Anthony Edwards');
    expect(kw).toContain('Timberwolves');
    expect(kw).toContain('58');
  });

  it('needs no declared group to be specific', () => {
    // Before the read kept this, an ungrouped card searched on the name alone.
    const withoutRead = compsUrl(undefined, read1.name, read1.cardNumber);
    const bare = decodeURIComponent(new URL(withoutRead).searchParams.get('_nkw') ?? '');
    expect(bare).not.toContain('Prizm');
  });
});
