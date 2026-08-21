/**
 * The states the audit has to reach.
 *
 * COVERAGE IS THE HARD PART, not the assertions. Read-sheet controls sat at
 * 24-30px through several hand-run sweeps because that sheet only exists after
 * a photo, so it was never on screen when anyone looked. A check only covers
 * what happens to be rendered.
 *
 * So every scene below either seeds the store or drives the app into the state
 * first. Anything with a state the app can be in and a screen to show for it
 * belongs here.
 */
const T = '2026-08-19T00:00:00.000Z';

/* A confirmed read writes the WHOLE composed title into the name, so this is
   the realistic long case rather than a short one that always fits. */
const LONG = 'Anthony Edwards 2023 Panini Prizm Silver Wave Timberwolves 58 RC';

/* No spaces anywhere. One unbreakable run is the usual way a phone layout gets
   shoved sideways, and it got MORE likely when truncation became wrapping. */
const HOSTILE = 'SUPERFRACTOR1of1AUTOPATCHRPARELICNUMBEREDXXX999999';

const card = (over) => ({
  name: '', status: 'available', createdAt: T, updatedAt: T, ...over,
});

/** A book with every card state, a long title and a hostile one. */
export const FULL = {
  stacks: [
    { id: 'g1', name: '2023 Panini Prizm Silver Wave', createdAt: T },
    { id: 'g2', name: 'Dollar box', createdAt: T },
    { id: 'g3', name: 'Empty Shelf', createdAt: T },
  ],
  cards: [
    card({ id: 'c1', number: '455', name: LONG, stackId: 'g1', priceCents: 12000, floorCents: 9000, printed: [LONG] }),
    card({ id: 'c2', number: '456', name: 'Victor Wembanyama Prizm Silver Spurs 136', stackId: 'g1', status: 'unpriced' }),
    card({ id: 'c3', number: '12', name: 'Common', stackId: 'g2', priceCents: 100 }),
    card({ id: 'c4', number: '77', name: HOSTILE, stackId: 'g2', priceCents: 2500 }),
    card({ id: 'c5', number: '99', name: 'Loose Card', priceCents: 4000 }),
  ],
  deals: [], receipts: [],
  shows: [{
    id: 'sh-prep', name: 'Riverside Hall B Autumn Classic', date: '2026-09-05',
    phase: 'prep', packedStackIds: ['g1'], createdAt: T,
  }],
};

/** The same book mid-show, with money already taken. */
export const LIVE = {
  ...FULL,
  cards: FULL.cards.map((c) => (c.id === 'c3' ? { ...c, status: 'sold', realizedCents: 90 } : c)),
  deals: [{
    id: 'd1', type: 'cash',
    lines: [{ cardId: 'c3', number: '12', title: 'Common', askCents: 100, realizedCents: 90 }],
    subtotalCents: 100, agreedCents: 90, showId: 'sh-live', createdAt: T,
  }],
  receipts: [{
    id: 'r1', amountCents: 4000, category: 'table', note: 'Saturday table',
    showId: 'sh-live', createdAt: T, updatedAt: T,
  }],
  shows: [{
    id: 'sh-live', name: 'Riverside Hall B', date: '2026-09-05',
    phase: 'live', packedStackIds: ['g1', 'g2'], createdAt: T, openedAt: T,
  }],
};

/** Closed out: the books, the day log and the case audit. */
export const DONE = {
  ...LIVE,
  shows: [{ ...LIVE.shows[0], id: 'sh-live', phase: 'done', closedAt: T }],
};

/** Nothing at all — every empty state at once. */
export const EMPTY = { stacks: [], cards: [], deals: [], receipts: [], shows: [] };

/**
 * Each scene: what to seed, where to go, and how to drive the app into the
 * state that actually needs looking at.
 */
export const SCENES = [
  { name: 'scan', seed: FULL, hash: '#/scan' },

  {
    name: 'scan · read sheet',
    seed: FULL,
    hash: '#/scan',
    /* The one that hid a bug for weeks. It only exists after a photo, so the
       audit uploads one and intercepts Vision with a real captured response. */
    async drive(page) {
      await page.locator('#scan-num').fill('321');
      await page.locator('input[type=file]').first().setInputFiles({
        name: 'card.png', mimeType: 'image/png',
        // 1x1 PNG. The image only has to survive downscale(); the READ is mocked.
        buffer: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          'base64'),
      });
      await page.waitForSelector('.rd', { timeout: 15000 });
    },
  },

  { name: 'collection', seed: FULL, hash: '#/collection' },
  {
    name: 'collection · group',
    seed: FULL, hash: '#/collection',
    async drive(page) {
      await page.locator('.grp').first().click();
      await page.waitForSelector('.backlink');
    },
  },
  {
    name: 'collection · search',
    seed: FULL, hash: '#/collection',
    async drive(page) {
      await page.locator('input[type=search]').fill('a');
      await page.waitForTimeout(300);
    },
  },
  {
    name: 'collection · empty group',
    seed: FULL, hash: '#/collection',
    async drive(page) {
      const rows = page.locator('.grp');
      const n = await rows.count();
      for (let i = 0; i < n; i += 1) {
        if ((await rows.nth(i).innerText()).includes('Empty Shelf')) {
          await rows.nth(i).click();
          break;
        }
      }
      await page.waitForSelector('.empty.dashed');
    },
  },

  { name: 'shows', seed: FULL, hash: '#/shows' },
  {
    name: 'shows · new',
    seed: FULL, hash: '#/shows',
    async drive(page) {
      await page.getByRole('button', { name: 'Add a show' }).click();
      await page.waitForSelector('#sh-name');
    },
  },
  { name: 'show · prep', seed: FULL, hash: '#/shows/sh-prep' },
  { name: 'show · live', seed: LIVE, hash: '#/shows/sh-live' },
  {
    name: 'show · live · trade',
    seed: LIVE, hash: '#/shows/sh-live',
    async drive(page) {
      await page.getByRole('button', { name: 'Trade', exact: true }).click();
      await page.waitForSelector('.pad');
      // Both piles loaded, so both dials and the settlement are on screen.
      for (const d of '455') await page.getByRole('button', { name: d, exact: true }).click();
      await page.getByRole('button', { name: 'Add to your side' }).click();
      await page.locator('#t-name').fill('Their rookie');
      await page.locator('#t-val').fill('50');
      await page.getByRole('button', { name: 'Add to their side' }).click();
      await page.waitForSelector('.settle');
    },
  },
  { name: 'show · done', seed: DONE, hash: '#/shows/sh-live' },
  { name: 'show · calculator', seed: FULL, hash: '#/shows/calculator' },

  { name: 'sales', seed: DONE, hash: '#/sales' },
  { name: 'receipts', seed: DONE, hash: '#/receipts' },

  /* Empty states are their own layout and break in their own ways. */
  { name: 'empty · scan', seed: EMPTY, hash: '#/scan' },
  { name: 'empty · collection', seed: EMPTY, hash: '#/collection' },
  { name: 'empty · shows', seed: EMPTY, hash: '#/shows' },
  { name: 'empty · sales', seed: EMPTY, hash: '#/sales' },
];
