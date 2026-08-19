/**
 * The single write path. Every mutation in the app is an action through this
 * reducer — there is no second place that edits a card, which is what keeps the
 * "one writer per field" rule true by construction rather than by discipline.
 *
 * The reducer is pure: ids and timestamps arrive on the action rather than being
 * generated here, so every transition is reproducible in a test.
 */
import type { Card, DB, Deal, DealLine, ExpenseCategory, Receipt, Stack } from '../types';
import { isDuplicate, isValidNumber } from './numbers';
import { liveCards } from './cards';
import { splitByWeight, sumAsks } from './money';
import { cardLabel } from './title';
import { mergeDb } from './sync/merge-db';

export type Action =
  | { type: 'stack/add'; id: string; year: string; product: string; parallel: string; now: string }
  | { type: 'card/add'; id: string; stackId?: string; number: string; name: string; cardNumber?: string; year?: string; product?: string; team?: string; photoId?: string; now: string }
  | { type: 'card/price'; cardId: string; priceCents: number; floorCents?: number; now: string }
  /** stackId: a string assigns a group, null removes one, undefined leaves it. */
  | { type: 'card/edit'; cardId: string; number?: string; name?: string; cardNumber?: string; year?: string; product?: string; team?: string; stackId?: string | null; photoId?: string; now: string }
  /** Tombstone, never a hole — see Card.deletedAt and lib/cards.ts. */
  | { type: 'card/delete'; cardId: string; now: string }
  | { type: 'receipt/add'; id: string; amountCents: number; category: ExpenseCategory; note: string; photoId?: string; now: string }
  | { type: 'receipt/delete'; id: string; now: string }
  | { type: 'deal/record'; id: string; cardIds: string[]; agreedCents: number; now: string }
  | { type: 'db/replace'; db: DB }
  /** Records arriving from another device, reconciled by the sync rules. */
  | { type: 'db/merge'; db: DB };

export function reducer(db: DB, action: Action): DB {
  switch (action.type) {
    case 'db/replace':
      return action.db;

    case 'db/merge':
      return mergeDb(db, action.db);

    case 'stack/add': {
      const stack: Stack = {
        id: action.id, year: action.year, product: action.product,
        parallel: action.parallel, createdAt: action.now,
      };
      return { ...db, stacks: [...db.stacks, stack] };
    }

    case 'card/add': {
      // The sticker number IS the card's identity — everything else can be
      // filled in later, but a card without one cannot be looked up at the table.
      if (!isValidNumber(action.number)) return db;

      // The integrity rule, enforced at the write path rather than in the UI —
      // a screen can forget to check, this cannot. Checked against LIVE cards:
      // a deleted card releases its sticker number, so a mis-scan can be thrown
      // away and the same sticker used again.
      if (isDuplicate(liveCards(db), action.number)) return db;

      const card: Card = {
        id: action.id, number: action.number, name: action.name,
        cardNumber: action.cardNumber, stackId: action.stackId, photoId: action.photoId,
        // What the camera read off the card itself. Optional, every one of them.
        year: action.year, product: action.product, team: action.team,
        status: 'unpriced', createdAt: action.now, updatedAt: action.now,
      };
      return { ...db, cards: [...db.cards, card] };
    }

    case 'card/price': {
      return {
        ...db,
        cards: db.cards.map((c) =>
          c.id === action.cardId
            ? {
                ...c,
                priceCents: action.priceCents,
                floorCents: action.floorCents,
                // Pricing is what makes a card sellable; a sold card stays sold.
                status: c.status === 'sold' ? 'sold' : 'available',
                updatedAt: action.now,
              }
            : c,
        ),
      };
    }

    case 'card/edit': {
      const target = db.cards.find((c) => c.id === action.cardId);
      if (!target || target.deletedAt != null) return db;

      // Renumbering runs through the same integrity rule as a new card — a card
      // may keep its own number, but may not take one another LIVE card wears.
      const number = action.number ?? target.number;
      if (isDuplicate(liveCards(db), number, target.id)) return db;

      return {
        ...db,
        cards: db.cards.map((c) =>
          c.id === action.cardId
            ? {
                ...c,
                number,
                name: action.name ?? c.name,
                cardNumber: action.cardNumber ?? c.cardNumber,
                year: action.year ?? c.year,
                product: action.product ?? c.product,
                team: action.team ?? c.team,
                // null is an explicit "no group"; undefined means leave it be.
                stackId: action.stackId === null ? undefined : (action.stackId ?? c.stackId),
                photoId: action.photoId ?? c.photoId,
                updatedAt: action.now,
              }
            : c,
        ),
      };
    }

    case 'card/delete':
      // A tombstone, matching receipt/delete. The record stays so the sync
      // merge can tell "deleted here" from "not synced here yet" — hard-delete
      // the row and the next pull brings the card back from the dead.
      //
      // A sold card can still be deleted. Its Deal already carries a snapshot
      // of the number, title and amounts, so Sales and the day log are
      // untouched; what leaves is the card itself.
      return {
        ...db,
        cards: db.cards.map((c) =>
          c.id === action.cardId ? { ...c, deletedAt: action.now, updatedAt: action.now } : c,
        ),
      };

    case 'receipt/add': {
      // A zero or negative expense is a typo, not a record.
      if (action.amountCents <= 0) return db;

      const receipt: Receipt = {
        id: action.id, amountCents: action.amountCents, category: action.category,
        note: action.note, photoId: action.photoId,
        createdAt: action.now, updatedAt: action.now,
      };
      return { ...db, receipts: [...db.receipts, receipt] };
    }

    case 'receipt/delete':
      // Tombstone, never a hole — see the deletedAt note in types.ts.
      return {
        ...db,
        receipts: db.receipts.map((r) =>
          r.id === action.id ? { ...r, deletedAt: action.now, updatedAt: action.now } : r,
        ),
      };

    case 'deal/record': {
      const cards = action.cardIds
        .map((id) => db.cards.find((c) => c.id === id))
        .filter((c): c is Card => c !== undefined && c.deletedAt == null);

      // Nothing to sell, or something in the cart is already out of the case:
      // record nothing rather than half a deal. This is also the double-tap guard.
      if (cards.length === 0) return db;
      if (cards.some((c) => c.status === 'sold')) return db;

      const asks = cards.map((c) => c.priceCents ?? 0);
      const parts = splitByWeight(action.agreedCents, asks);

      const lines: DealLine[] = cards.map((c, i) => {
        const stack = db.stacks.find((s) => s.id === c.stackId);
        return {
          cardId: c.id,
          number: c.number,
          // Snapshot: a later reprice must not rewrite what this deal was.
          title: cardLabel(c, stack),
          askCents: asks[i] ?? 0,
          realizedCents: parts[i] ?? 0,
        };
      });

      const deal: Deal = {
        id: action.id,
        type: 'cash',
        lines,
        subtotalCents: sumAsks(asks),
        agreedCents: action.agreedCents,
        createdAt: action.now,
      };

      const realizedByCard = new Map(lines.map((l) => [l.cardId, l.realizedCents]));

      return {
        ...db,
        deals: [...db.deals, deal],
        cards: db.cards.map((c) =>
          realizedByCard.has(c.id)
            ? {
                ...c,
                status: 'sold' as const,
                soldAt: action.now,
                realizedCents: realizedByCard.get(c.id),
                dealId: action.id,
                updatedAt: action.now,
              }
            : c,
        ),
      };
    }
  }
}
