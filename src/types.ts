/**
 * Document shapes for SHOWKARDZ. This file is the contract: UI, storage, and
 * any future serverless function all read and write these types.
 *
 * Storage note: v1 persists to localStorage under a repository interface
 * (src/lib/store.ts). Firestore is the intended record of truth — the shapes
 * here are already Firestore-document-shaped so the swap is additive.
 */

/** ISO-8601 timestamp. Stored as a string so records survive JSON round-trips. */
export type Timestamp = string;

/**
 * A stack declaration: what the camera cannot read, declared once for a run of
 * cards. Supplies year/product/set and parallel to every card entered under it.
 */
export interface Stack {
  id: string;
  /** e.g. "2023" */
  year: string;
  /** e.g. "Panini Prizm" */
  product: string;
  /** e.g. "Base", "Silver". Omitted from composed titles when it is "Base". */
  parallel: string;
  createdAt: Timestamp;
}

/** Where a card is in its life. Drives every screen's filtering. */
export type CardStatus = 'unpriced' | 'available' | 'sold';

/**
 * One physical card, addressed by the number on its sticker.
 *
 * INVARIANT: `number` is unique across all non-deleted cards. This is the one
 * hard integrity rule in the product — see lib/numbers.ts.
 */
export interface Card {
  id: string;
  /** The sticker number, as typed. Digits only, no leading-zero normalization. */
  number: string;
  /** Player or subject name, read off the card (v1: typed). */
  name: string;
  /** Card number printed on the card itself, e.g. "58". Optional. */
  cardNumber?: string;
  stackId: string;
  /** The dealer's asking price, in whole cents. Absent until the price pass. */
  priceCents?: number;
  /** Least the dealer would take, in whole cents. Optional per card. */
  floorCents?: number;
  status: CardStatus;
  /** Set when status becomes 'sold'. */
  soldAt?: Timestamp;
  /** What it actually realized, in whole cents. Set with status 'sold'. */
  realizedCents?: number;
  /** The deal that sold it. */
  dealId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** A line on a deal, captured at deal time so the record never re-derives. */
export interface DealLine {
  cardId: string;
  /** Snapshot of the card's number at deal time. */
  number: string;
  /** Snapshot of the composed title at deal time. */
  title: string;
  /** Snapshot of the asking price at deal time, in cents. */
  askCents: number;
  /** What this line realized, in cents (the agreed total, split by ask weight). */
  realizedCents: number;
}

/**
 * A completed sale. Totals are DERIVED from lines, never from a counter —
 * see lib/money.ts.
 */
export interface Deal {
  id: string;
  type: 'cash';
  lines: DealLine[];
  /** Sum of line asks at deal time, in cents. */
  subtotalCents: number;
  /** What the buyer actually paid, in cents. */
  agreedCents: number;
  createdAt: Timestamp;
}

/** The whole persisted state. One document's worth. */
export interface DB {
  stacks: Stack[];
  cards: Card[];
  deals: Deal[];
}

export const EMPTY_DB: DB = { stacks: [], cards: [], deals: [] };
