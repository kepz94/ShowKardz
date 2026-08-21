/**
 * The single write path. Every mutation in the app is an action through this
 * reducer — there is no second place that edits a card, which is what keeps the
 * "one writer per field" rule true by construction rather than by discipline.
 *
 * The reducer is pure: ids and timestamps arrive on the action rather than being
 * generated here, so every transition is reproducible in a test.
 */
import type { Card, DB, Deal, DealLine, ExpenseCategory, Receipt, Show, Stack, TradeLine } from '../types';
import { isDuplicate, isValidNumber } from './numbers';
import { liveCards } from './cards';
import { splitByWeight, sumAsks } from './money';
import { cardLabel } from './title';
import { mergeDb } from './sync/merge-db';
import { togglePacked } from './packing';
import { nextPhase } from './shows';

export type Action =
  | { type: 'stack/add'; id: string; name: string; now: string }
  | { type: 'stack/rename'; stackId: string; name: string; now: string }
  /** File a pile of cards into a group at once. groupId null takes them out of one. */
  | { type: 'cards/assign'; cardIds: string[]; stackId: string | null; now: string }
  | { type: 'show/add'; id: string; name: string; date: string; now: string }
  | { type: 'show/edit'; showId: string; name?: string; date?: string; now: string }
  /** Move a show on one phase. Deliberate, never derived — see lib/shows.ts. */
  | { type: 'show/advance'; showId: string; now: string }
  /** Put a group in this show's case, or take it out. */
  | { type: 'show/pack'; showId: string; stackId: string; now: string }
  | { type: 'show/delete'; showId: string; now: string }
  | { type: 'card/add'; id: string; stackId?: string; number: string; name: string; cardNumber?: string; printed?: string[]; photoId?: string; now: string }
  | { type: 'card/price'; cardId: string; priceCents: number; floorCents?: number; now: string }
  /** stackId: a string assigns a group, null removes one, undefined leaves it. */
  | { type: 'card/edit'; cardId: string; number?: string; name?: string; cardNumber?: string; printed?: string[]; stackId?: string | null; photoId?: string; now: string }
  /** Tombstone, never a hole — see Card.deletedAt and lib/cards.ts. */
  | { type: 'card/delete'; cardId: string; now: string }
  | { type: 'receipt/add'; id: string; amountCents: number; category: ExpenseCategory; note: string; photoId?: string; showId?: string; now: string }
  | { type: 'receipt/delete'; id: string; now: string }
  | { type: 'deal/record'; id: string; cardIds: string[]; agreedCents: number; showId?: string; now: string }
  /**
   * A trade. `cardIds` is your side and is marked sold exactly as a cash sale
   * is; `incoming` is what came back, recorded but NOT created as inventory —
   * see TradeLine in types.ts.
   */
  | {
      type: 'deal/trade'; id: string; cardIds: string[];
      yoursCents: number; yoursPct: number;
      incoming: TradeLine[]; theirsPct: number;
      cashDeltaCents: number; showId?: string; now: string;
    }
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
      // A group is a name. Nothing writes the legacy year/product/parallel any
      // more — they are read-only history now, see types.ts.
      const name = action.name.trim();
      if (name === '') return db;
      const stack: Stack = { id: action.id, name, createdAt: action.now };
      return { ...db, stacks: [...db.stacks, stack] };
    }

    case 'show/add': {
      const name = action.name.trim();
      if (name === '') return db;
      const show: Show = {
        id: action.id, name, date: action.date,
        // Every show starts the night before. There is nothing to sell at a
        // show you have not packed.
        phase: 'prep', packedStackIds: [],
        createdAt: action.now,
      };
      return { ...db, shows: [...(db.shows ?? []), show] };
    }

    case 'show/edit': {
      const name = action.name?.trim();
      // An empty rename would leave the show nameless in a list of shows.
      if (action.name != null && name === '') return db;
      return {
        ...db,
        shows: (db.shows ?? []).map((s) =>
          s.id === action.showId
            ? { ...s, name: name ?? s.name, date: action.date ?? s.date, updatedAt: action.now }
            : s,
        ),
      };
    }

    case 'show/advance':
      return {
        ...db,
        shows: (db.shows ?? []).map((s) => {
          if (s.id !== action.showId) return s;
          const next = nextPhase(s.phase);
          // A closed show is the record. There is nothing after it.
          if (next == null) return s;
          return {
            ...s,
            phase: next,
            openedAt: next === 'live' ? action.now : s.openedAt,
            closedAt: next === 'done' ? action.now : s.closedAt,
            updatedAt: action.now,
          };
        }),
      };

    case 'show/pack':
      return {
        ...db,
        shows: (db.shows ?? []).map((s) =>
          s.id === action.showId
            ? {
                ...s,
                packedStackIds: togglePacked(s.packedStackIds, action.stackId),
                updatedAt: action.now,
              }
            : s,
        ),
      };

    case 'show/delete':
      // A tombstone, matching cards and receipts. Its deals keep their showId
      // and stay in the Sales totals: the money happened whatever the record says.
      return {
        ...db,
        shows: (db.shows ?? []).map((s) =>
          s.id === action.showId ? { ...s, deletedAt: action.now, updatedAt: action.now } : s,
        ),
      };

    case 'stack/rename': {
      const name = action.name.trim();
      // An empty rename would leave the group nameless and make it fall back to
      // its legacy fields, which is a rename nobody asked for. Refuse it.
      if (name === '') return db;
      return {
        ...db,
        stacks: db.stacks.map((s) =>
          s.id === action.stackId ? { ...s, name, updatedAt: action.now } : s,
        ),
      };
    }

    case 'cards/assign': {
      const ids = new Set(action.cardIds);
      if (ids.size === 0) return db;
      return {
        ...db,
        cards: db.cards.map((c) =>
          ids.has(c.id)
            // Same convention as card/edit: null means "no group".
            ? { ...c, stackId: action.stackId ?? undefined, updatedAt: action.now }
            : c,
        ),
      };
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
        // The blocks the dealer kept off the card. Optional.
        printed: action.printed,
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
                printed: action.printed ?? c.printed,
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
        // Absent for a standing cost that belongs to the business, not one day.
        showId: action.showId,
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

    case 'deal/trade':
    case 'deal/record': {
      const isTrade = action.type === 'deal/trade';
      /* A trade realizes what YOUR side went out at — which by construction is
         what you took in plus the cash difference. One meaning of agreedCents
         lets Sales total both kinds with no special case. */
      const realizedTotal = isTrade ? action.yoursCents : action.agreedCents;
      const cards = action.cardIds
        .map((id) => db.cards.find((c) => c.id === id))
        .filter((c): c is Card => c !== undefined && c.deletedAt == null);

      // Nothing to sell, or something in the cart is already out of the case:
      // record nothing rather than half a deal. This is also the double-tap guard.
      if (cards.length === 0) return db;
      if (cards.some((c) => c.status === 'sold')) return db;

      const asks = cards.map((c) => c.priceCents ?? 0);
      const parts = splitByWeight(realizedTotal, asks);

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
        type: isTrade ? 'trade' : 'cash',
        lines,
        subtotalCents: sumAsks(asks),
        agreedCents: realizedTotal,
        ...(isTrade
          ? {
              incoming: action.incoming,
              yoursPct: action.yoursPct,
              theirsPct: action.theirsPct,
              cashDeltaCents: action.cashDeltaCents,
            }
          : {}),
        // Absent when the deal was rung up outside a show, on the standalone
        // calculator. Sales totals everything; a show's own numbers filter here.
        showId: action.showId,
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
