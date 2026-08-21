import { liveCards } from './cards';
import { describe, it, expect } from 'vitest';
import { reducer } from './reducer';
import { EMPTY_DB, type DB } from '../types';
import { liveReceipts } from './live';

const NOW = '2026-08-18T12:00:00.000Z';
const T1 = '2026-08-18T12:00:00.000Z';
const T2 = '2026-08-18T13:00:00.000Z';

const withStack = (): DB =>
  reducer(EMPTY_DB, {
    type: 'stack/add', id: 's1', name: '2023 Panini Prizm', now: NOW,
  });

const withCards = (): DB => {
  let db = withStack();
  db = reducer(db, { type: 'card/add', id: 'c1', stackId: 's1', number: '0455', name: 'Edwards', now: NOW });
  db = reducer(db, { type: 'card/add', id: 'c2', stackId: 's1', number: '0456', name: 'Wembanyama', now: NOW });
  db = reducer(db, { type: 'card/price', cardId: 'c1', priceCents: 5000, now: NOW });
  db = reducer(db, { type: 'card/price', cardId: 'c2', priceCents: 5000, floorCents: 4000, now: NOW });
  return db;
};

describe('stack/add', () => {
  it('files the declaration', () => {
    expect(withStack().stacks).toHaveLength(1);
  });
});

describe('card/add', () => {
  it('lands the card unpriced, on purpose — intake and pricing are separate passes', () => {
    expect(withStack() && reducer(withStack(), {
      type: 'card/add', id: 'c1', stackId: 's1', number: '0455', name: 'Edwards', now: NOW,
    }).cards[0]!.status).toBe('unpriced');
  });

  it('BLOCKS a duplicate sticker number — the one integrity rule', () => {
    let db = withStack();
    db = reducer(db, { type: 'card/add', id: 'c1', stackId: 's1', number: '0455', name: 'Edwards', now: NOW });
    db = reducer(db, { type: 'card/add', id: 'c2', stackId: 's1', number: '0455', name: 'Someone', now: NOW });
    expect(db.cards).toHaveLength(1);
  });
});

describe('card/price', () => {
  it('makes a priced card available to sell', () => {
    expect(withCards().cards.find((c) => c.id === 'c1')!.status).toBe('available');
  });

  it('stores the floor when one is given', () => {
    expect(withCards().cards.find((c) => c.id === 'c2')!.floorCents).toBe(4000);
  });
});

describe('deal/record', () => {
  const db = reducer(withCards(), {
    type: 'deal/record', id: 'd1', cardIds: ['c1', 'c2'], agreedCents: 8500, now: NOW,
  });

  it('marks every card in the deal sold', () => {
    expect(db.cards.every((c) => c.status === 'sold')).toBe(true);
  });

  it('derives the subtotal from the card records, never a counter', () => {
    expect(db.deals[0]!.subtotalCents).toBe(10000);
  });

  it('splits the agreed total across the cards so the books add up to what was paid', () => {
    const realized = db.cards.map((c) => c.realizedCents!);
    expect(realized.reduce((a, b) => a + b, 0)).toBe(8500);
  });

  it('snapshots the title and ask onto the deal, so a later reprice cannot rewrite history', () => {
    expect(db.deals[0]!.lines[0]!.askCents).toBe(5000);
    expect(db.deals[0]!.lines[0]!.title).toContain('Edwards');
  });

  it('links each card back to its deal', () => {
    expect(db.cards.find((c) => c.id === 'c1')!.dealId).toBe('d1');
  });

  it('refuses to sell a card that is already sold, so a double-tap cannot sell it twice', () => {
    const again = reducer(db, {
      type: 'deal/record', id: 'd2', cardIds: ['c1'], agreedCents: 1000, now: NOW,
    });
    expect(again.deals).toHaveLength(1);
  });

  it('records nothing for an empty cart', () => {
    const empty = reducer(withCards(), {
      type: 'deal/record', id: 'd9', cardIds: [], agreedCents: 0, now: NOW,
    });
    expect(empty.deals).toHaveLength(0);
  });
});

describe('receipt/add', () => {
  const NOW2 = '2026-08-18T13:00:00.000Z';

  it('files an expense', () => {
    const db = reducer(EMPTY_DB, {
      type: 'receipt/add', id: 'r1', amountCents: 4000, category: 'table',
      note: 'Saturday table', now: NOW2,
    });
    expect(db.receipts).toHaveLength(1);
    expect(db.receipts[0]!.amountCents).toBe(4000);
  });

  it('keeps the photo reference when there is one', () => {
    const db = reducer(EMPTY_DB, {
      type: 'receipt/add', id: 'r1', amountCents: 4000, category: 'table',
      note: '', photoId: 'p1', now: NOW2,
    });
    expect(db.receipts[0]!.photoId).toBe('p1');
  });

  it('refuses a zero or negative amount rather than filing a meaningless expense', () => {
    expect(reducer(EMPTY_DB, {
      type: 'receipt/add', id: 'r1', amountCents: 0, category: 'other', note: '', now: NOW2,
    }).receipts).toHaveLength(0);
    expect(reducer(EMPTY_DB, {
      type: 'receipt/add', id: 'r2', amountCents: -500, category: 'other', note: '', now: NOW2,
    }).receipts).toHaveLength(0);
  });
});

describe('receipt/delete', () => {
  const NOW2 = '2026-08-18T13:00:00.000Z';
  const withReceipt = reducer(EMPTY_DB, {
    type: 'receipt/add', id: 'r1', amountCents: 4000, category: 'table', note: '', now: NOW2,
  });

  it('takes the expense out of the books', () => {
    const db = reducer(withReceipt, { type: 'receipt/delete', id: 'r1', now: NOW2 });
    expect(liveReceipts(db.receipts)).toHaveLength(0);
  });

  it('leaves the book alone when the id is not there', () => {
    const db = reducer(withReceipt, { type: 'receipt/delete', id: 'nope', now: NOW2 });
    expect(liveReceipts(db.receipts)).toHaveLength(1);
  });
});

describe('card/edit', () => {
  it('renames a card without touching its number', () => {
    let db = withStack();
    db = reducer(db, { type: 'card/add', id: 'c1', stackId: 's1', number: '0455', name: 'Edwrads', now: NOW });
    db = reducer(db, { type: 'card/edit', cardId: 'c1', name: 'Edwards', now: NOW });
    expect(db.cards[0]!.name).toBe('Edwards');
    expect(db.cards[0]!.number).toBe('0455');
  });

  it('BLOCKS a renumber onto a number another card already wears', () => {
    let db = withStack();
    db = reducer(db, { type: 'card/add', id: 'c1', stackId: 's1', number: '0455', name: 'A', now: NOW });
    db = reducer(db, { type: 'card/add', id: 'c2', stackId: 's1', number: '0456', name: 'B', now: NOW });
    db = reducer(db, { type: 'card/edit', cardId: 'c2', number: '0455', now: NOW });
    expect(db.cards.find((c) => c.id === 'c2')!.number).toBe('0456');
  });

  it('allows a card to keep its own number through an edit', () => {
    let db = withStack();
    db = reducer(db, { type: 'card/add', id: 'c1', stackId: 's1', number: '0455', name: 'A', now: NOW });
    db = reducer(db, { type: 'card/edit', cardId: 'c1', number: '0455', name: 'B', now: NOW });
    expect(db.cards[0]!.name).toBe('B');
  });
});

describe('receipt/delete — tombstones, not holes', () => {
  const NOW2 = '2026-08-18T13:00:00.000Z';
  const LATER = '2026-08-18T14:00:00.000Z';
  const withReceipt2 = reducer(EMPTY_DB, {
    type: 'receipt/add', id: 'r1', amountCents: 4000, category: 'table', note: '', now: NOW2,
  });

  it('keeps a record of the deletion rather than removing the row', () => {
    // A hard delete is indistinguishable from "never synced here" on the next
    // pull, so the row comes back. The tombstone is what makes it stay dead.
    const db = reducer(withReceipt2, { type: 'receipt/delete', id: 'r1', now: LATER });
    expect(db.receipts).toHaveLength(1);
    expect(db.receipts[0]!.deletedAt).toBe(LATER);
  });

  it('stamps the deletion so a later edit elsewhere can still win', () => {
    const db = reducer(withReceipt2, { type: 'receipt/delete', id: 'r1', now: LATER });
    expect(db.receipts[0]!.updatedAt).toBe(LATER);
  });
});

describe('card/add without a group — the day-one path', () => {
  it('accepts a card with nothing but a sticker number', () => {
    const db = reducer(EMPTY_DB, {
      type: 'card/add', id: 'c1', number: '0455', name: '', now: NOW,
    });
    expect(db.cards).toHaveLength(1);
    expect(db.cards[0]!.stackId).toBeUndefined();
    expect(db.cards[0]!.status).toBe('unpriced');
  });

  it('still blocks a duplicate number when no group is involved', () => {
    let db = reducer(EMPTY_DB, { type: 'card/add', id: 'c1', number: '0455', name: '', now: NOW });
    db = reducer(db, { type: 'card/add', id: 'c2', number: '0455', name: '', now: NOW });
    expect(db.cards).toHaveLength(1);
  });

  it('refuses a card with no sticker number at all — the number IS the card', () => {
    expect(reducer(EMPTY_DB, {
      type: 'card/add', id: 'c1', number: '', name: 'Someone', now: NOW,
    }).cards).toHaveLength(0);
  });
});

describe('card/edit — filling in what was skipped', () => {
  it('assigns a group to a card entered without one', () => {
    let db = reducer(EMPTY_DB, {
      type: 'stack/add', id: 's1', name: '2023 Prizm', now: NOW,
    });
    db = reducer(db, { type: 'card/add', id: 'c1', number: '0455', name: '', now: NOW });
    db = reducer(db, { type: 'card/edit', cardId: 'c1', stackId: 's1', now: NOW });
    expect(db.cards[0]!.stackId).toBe('s1');
  });

  it('takes a card back OUT of a group', () => {
    let db = reducer(EMPTY_DB, {
      type: 'stack/add', id: 's1', name: '2023 Prizm', now: NOW,
    });
    db = reducer(db, { type: 'card/add', id: 'c1', stackId: 's1', number: '0455', name: '', now: NOW });
    db = reducer(db, { type: 'card/edit', cardId: 'c1', stackId: null, now: NOW });
    expect(db.cards[0]!.stackId).toBeUndefined();
  });

  it('adds the name later without disturbing the number', () => {
    let db = reducer(EMPTY_DB, { type: 'card/add', id: 'c1', number: '0455', name: '', now: NOW });
    db = reducer(db, { type: 'card/edit', cardId: 'c1', name: 'Anthony Edwards', now: NOW });
    expect(db.cards[0]!.name).toBe('Anthony Edwards');
    expect(db.cards[0]!.number).toBe('0455');
  });
});

describe('card photos', () => {
  it('keeps the photo reference from a scan', () => {
    const db = reducer(EMPTY_DB, {
      type: 'card/add', id: 'c1', number: '0455', name: '', photoId: 'p1', now: NOW,
    });
    expect(db.cards[0]!.photoId).toBe('p1');
  });

  it('attaches a photo to a card that was scanned without one', () => {
    let db = reducer(EMPTY_DB, { type: 'card/add', id: 'c1', number: '0455', name: '', now: NOW });
    db = reducer(db, { type: 'card/edit', cardId: 'c1', photoId: 'p1', now: NOW });
    expect(db.cards[0]!.photoId).toBe('p1');
  });

  it('leaves an existing photo alone on an unrelated edit', () => {
    let db = reducer(EMPTY_DB, {
      type: 'card/add', id: 'c1', number: '0455', name: '', photoId: 'p1', now: NOW,
    });
    db = reducer(db, { type: 'card/edit', cardId: 'c1', name: 'Edwards', now: NOW });
    expect(db.cards[0]!.photoId).toBe('p1');
  });
});

/* ---------------------------------------------------------------------------
   Deleting a card. Soft, with a tombstone, and the sticker number comes back.
--------------------------------------------------------------------------- */
describe('card/delete', () => {
  const T0 = '2026-08-19T10:00:00.000Z';
  const T1 = '2026-08-19T11:00:00.000Z';

  const withCard = (): DB => reducer(EMPTY_DB, {
    type: 'card/add', id: 'c1', number: '0455', name: 'Anthony Edwards', now: T0,
  });

  it('tombstones the card instead of removing the record', () => {
    const after = reducer(withCard(), { type: 'card/delete', cardId: 'c1', now: T1 });
    expect(after.cards).toHaveLength(1);
    expect(after.cards[0]?.deletedAt).toBe(T1);
  });

  it('hides the card from every screen', () => {
    const after = reducer(withCard(), { type: 'card/delete', cardId: 'c1', now: T1 });
    expect(liveCards(after)).toEqual([]);
  });

  it('releases the sticker number, so the same sticker can be used again', () => {
    // The point of deleting: a mis-scan must not burn a number off the roll.
    const deleted = reducer(withCard(), { type: 'card/delete', cardId: 'c1', now: T1 });
    const reused = reducer(deleted, {
      type: 'card/add', id: 'c2', number: '0455', name: 'Victor Wembanyama', now: T1,
    });
    expect(liveCards(reused).map((c) => c.name)).toEqual(['Victor Wembanyama']);
  });

  it('still blocks a duplicate against a card that is alive', () => {
    const twice = reducer(withCard(), {
      type: 'card/add', id: 'c2', number: '0455', name: 'Someone Else', now: T1,
    });
    expect(liveCards(twice)).toHaveLength(1);
  });

  it('refuses to edit a deleted card', () => {
    const deleted = reducer(withCard(), { type: 'card/delete', cardId: 'c1', now: T1 });
    const edited = reducer(deleted, { type: 'card/edit', cardId: 'c1', name: 'Ghost', now: T1 });
    expect(edited.cards[0]?.name).toBe('Anthony Edwards');
  });

  it('leaves a deleted card out of a deal rather than half-recording it', () => {
    const priced = reducer(withCard(), {
      type: 'card/price', cardId: 'c1', priceCents: 12000, now: T0,
    });
    const deleted = reducer(priced, { type: 'card/delete', cardId: 'c1', now: T1 });
    const sold = reducer(deleted, {
      type: 'deal/record', id: 'd1', cardIds: ['c1'], agreedCents: 10000, now: T1,
    });
    expect(sold.deals).toEqual([]);
  });

  it('does nothing to a card id that is not there', () => {
    const before = withCard();
    expect(reducer(before, { type: 'card/delete', cardId: 'nope', now: T1 })).toEqual(before);
  });
});

describe('groups — a name, and cards filed under it', () => {
  it('creates a group from a name alone', () => {
    const db = reducer(EMPTY_DB, { type: 'stack/add', id: 's1', name: 'Dollar box', now: NOW });
    expect(db.stacks).toEqual([{ id: 's1', name: 'Dollar box', createdAt: NOW }]);
  });

  it('trims the name', () => {
    const db = reducer(EMPTY_DB, { type: 'stack/add', id: 's1', name: '  Case 2  ', now: NOW });
    expect(db.stacks[0]!.name).toBe('Case 2');
  });

  it('refuses a group with no name at all', () => {
    const db = reducer(EMPTY_DB, { type: 'stack/add', id: 's1', name: '   ', now: NOW });
    expect(db.stacks).toEqual([]);
  });

  it('writes none of the old year/product/parallel fields', () => {
    // They are read-only history now. Writing one would create a record that
    // disagrees with itself about which shape it is.
    const db = reducer(EMPTY_DB, { type: 'stack/add', id: 's1', name: 'Prizm', now: NOW });
    expect(Object.keys(db.stacks[0]!).sort()).toEqual(['createdAt', 'id', 'name']);
  });

  it('renames a group', () => {
    let db = reducer(EMPTY_DB, { type: 'stack/add', id: 's1', name: 'Prizm', now: NOW });
    db = reducer(db, { type: 'stack/rename', stackId: 's1', name: 'Saturday table', now: '2026-08-19T00:00:00Z' });
    expect(db.stacks[0]).toMatchObject({ name: 'Saturday table', updatedAt: '2026-08-19T00:00:00Z' });
  });

  it('refuses to rename a group to nothing', () => {
    // An empty name would make the group fall back to its legacy fields, or to
    // "Untitled group" — a rename nobody asked for.
    let db = reducer(EMPTY_DB, { type: 'stack/add', id: 's1', name: 'Prizm', now: NOW });
    db = reducer(db, { type: 'stack/rename', stackId: 's1', name: '  ', now: NOW });
    expect(db.stacks[0]!.name).toBe('Prizm');
  });

  it('leaves the cards alone when a group is renamed', () => {
    let db = withCards();
    db = reducer(db, { type: 'stack/rename', stackId: 's1', name: 'Renamed', now: NOW });
    expect(liveCards(db).map((c) => c.stackId)).toEqual(['s1', 's1']);
  });

  it('files a pile of cards into a group in one action', () => {
    let db = reducer(EMPTY_DB, { type: 'stack/add', id: 's1', name: 'Prizm', now: NOW });
    db = reducer(db, { type: 'card/add', id: 'c1', number: '0455', name: '', now: NOW });
    db = reducer(db, { type: 'card/add', id: 'c2', number: '0456', name: '', now: NOW });
    db = reducer(db, { type: 'card/add', id: 'c3', number: '0457', name: '', now: NOW });
    db = reducer(db, { type: 'cards/assign', cardIds: ['c1', 'c3'], stackId: 's1', now: NOW });
    expect(liveCards(db).map((c) => c.stackId)).toEqual(['s1', undefined, 's1']);
  });

  it('takes a pile of cards back out of every group', () => {
    let db = withCards();
    db = reducer(db, { type: 'cards/assign', cardIds: ['c1', 'c2'], stackId: null, now: NOW });
    expect(liveCards(db).map((c) => c.stackId)).toEqual([undefined, undefined]);
  });

  it('moves cards from one group straight into another', () => {
    let db = withCards();
    db = reducer(db, { type: 'stack/add', id: 's2', name: 'Dollar box', now: NOW });
    db = reducer(db, { type: 'cards/assign', cardIds: ['c2'], stackId: 's2', now: NOW });
    expect(liveCards(db).map((c) => c.stackId)).toEqual(['s1', 's2']);
  });

  it('stamps updatedAt on the cards it moved, so a merge can order the change', () => {
    let db = withCards();
    db = reducer(db, { type: 'cards/assign', cardIds: ['c1'], stackId: null, now: '2026-08-19T09:00:00Z' });
    expect(liveCards(db)[0]!.updatedAt).toBe('2026-08-19T09:00:00Z');
    expect(liveCards(db)[1]!.updatedAt).toBe(NOW);
  });

  it('does nothing when nothing was picked', () => {
    const db = withCards();
    expect(reducer(db, { type: 'cards/assign', cardIds: [], stackId: 's1', now: NOW })).toBe(db);
  });
});

describe('shows — the lifecycle', () => {
  const add = (db = EMPTY_DB) =>
    reducer(db, { type: 'show/add', id: 'sh1', name: 'Riverside Hall B', date: '2026-09-05', now: T1 });

  it('a new show starts in prep with an empty case', () => {
    const s = add().shows[0]!;
    expect(s.phase).toBe('prep');
    expect(s.packedStackIds).toEqual([]);
    expect(s.name).toBe('Riverside Hall B');
  });

  it('refuses a nameless show — it would be a blank row in a list of shows', () => {
    expect(reducer(EMPTY_DB, { type: 'show/add', id: 'x', name: '   ', date: '2026-09-05', now: T1 }).shows)
      .toEqual([]);
  });

  it('advances prep to live to done and stamps each transition once', () => {
    let db = add();
    db = reducer(db, { type: 'show/advance', showId: 'sh1', now: T1 });
    expect(db.shows[0]!.phase).toBe('live');
    expect(db.shows[0]!.openedAt).toBe(T1);

    db = reducer(db, { type: 'show/advance', showId: 'sh1', now: T2 });
    expect(db.shows[0]!.phase).toBe('done');
    expect(db.shows[0]!.closedAt).toBe(T2);
    // The opening stamp is history and must not be rewritten by a later move.
    expect(db.shows[0]!.openedAt).toBe(T1);
  });

  it('will not advance past done — a closed show is the record', () => {
    let db = add();
    db = reducer(db, { type: 'show/advance', showId: 'sh1', now: T1 });
    db = reducer(db, { type: 'show/advance', showId: 'sh1', now: T1 });
    const closed = reducer(db, { type: 'show/advance', showId: 'sh1', now: T2 });
    expect(closed.shows[0]!.phase).toBe('done');
    expect(closed.shows[0]!.closedAt).toBe(T1);
  });

  it('packs and unpacks a group on the show itself', () => {
    let db = add();
    db = reducer(db, { type: 'show/pack', showId: 'sh1', stackId: 'g1', now: T1 });
    expect(db.shows[0]!.packedStackIds).toEqual(['g1']);
    db = reducer(db, { type: 'show/pack', showId: 'sh1', stackId: 'g1', now: T2 });
    expect(db.shows[0]!.packedStackIds).toEqual([]);
  });

  it('keeps two shows\u2019 cases apart', () => {
    let db = add();
    db = reducer(db, { type: 'show/add', id: 'sh2', name: 'Other', date: '2026-10-01', now: T1 });
    db = reducer(db, { type: 'show/pack', showId: 'sh1', stackId: 'g1', now: T1 });
    expect(db.shows.find((s) => s.id === 'sh1')!.packedStackIds).toEqual(['g1']);
    expect(db.shows.find((s) => s.id === 'sh2')!.packedStackIds).toEqual([]);
  });

  it('renames without touching the phase or the case', () => {
    let db = reducer(add(), { type: 'show/pack', showId: 'sh1', stackId: 'g1', now: T1 });
    db = reducer(db, { type: 'show/edit', showId: 'sh1', name: 'Renamed', now: T2 });
    expect(db.shows[0]!.name).toBe('Renamed');
    expect(db.shows[0]!.phase).toBe('prep');
    expect(db.shows[0]!.packedStackIds).toEqual(['g1']);
  });

  it('refuses an empty rename rather than leaving the show nameless', () => {
    const db = reducer(add(), { type: 'show/edit', showId: 'sh1', name: '  ', now: T2 });
    expect(db.shows[0]!.name).toBe('Riverside Hall B');
  });

  it('deletes as a tombstone, so a sync cannot resurrect it', () => {
    const db = reducer(add(), { type: 'show/delete', showId: 'sh1', now: T2 });
    expect(db.shows).toHaveLength(1);
    expect(db.shows[0]!.deletedAt).toBe(T2);
  });
});
