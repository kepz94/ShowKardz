/**
 * Document shapes for SHOWKARDZ. This file is the contract: UI, storage, and
 * any future serverless function all read and write these types.
 *
 * THE SYNC BOUNDARY
 * -----------------
 * Everything in `DB` syncs. Stacks, cards, deals and receipts are records, they
 * are small, and they are the thing a dealer cannot afford to lose — Firestore
 * is their intended home, with the device holding a copy.
 *
 * Photographs do NOT sync. An image is stored in this device's IndexedDB
 * (lib/photos.ts) and referenced from a record by id only. That keeps the sync
 * payload small and the app free to run, at a cost that is deliberate and worth
 * stating plainly: a photo exists on exactly one device, and if that device is
 * lost, wiped, or reinstalled, the image is gone for good while the record it
 * belonged to survives. On any other device the reference resolves to nothing,
 * which is a normal state rather than an error — see lib/attachments.ts.
 *
 * Storage note: v1 persists `DB` to localStorage under a repository interface
 * (src/lib/store.tsx). The shapes here are already Firestore-document-shaped so
 * the swap is additive.
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

/** What a receipt was for. Drives the expense breakdown. */
export type ExpenseCategory = 'table' | 'travel' | 'inventory' | 'supplies' | 'other';

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'table', label: 'Table fee' },
  { value: 'travel', label: 'Travel' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'other', label: 'Other' },
];

/**
 * Money going out — the other half of a show's real number.
 *
 * A paper receipt is photographed rather than transcribed; the image itself is
 * too big for the record, so it lives in IndexedDB (lib/photos.ts) and is
 * referenced by id here. `photoId` absent means a digital or hand-entered
 * expense with no image, which is a normal state, not a missing one.
 */
export interface Receipt {
  id: string;
  /** In whole cents, like every other amount in the app. */
  amountCents: number;
  category: ExpenseCategory;
  /** What it was — "Table fee, Saturday" or a vendor name. */
  note: string;
  /** Key into the photo store. Absent when there is no picture. */
  photoId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /**
   * When this was deleted. A tombstone, not a hole: under sync a hard delete is
   * indistinguishable from "not synced to this device yet", so the row comes
   * back on the next pull. Readers must go through liveReceipts().
   */
  deletedAt?: Timestamp;
}

/** The whole persisted state. One document's worth. */
export interface DB {
  stacks: Stack[];
  cards: Card[];
  deals: Deal[];
  receipts: Receipt[];
}

export const EMPTY_DB: DB = { stacks: [], cards: [], deals: [], receipts: [] };
