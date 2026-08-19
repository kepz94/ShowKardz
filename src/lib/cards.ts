/**
 * Which cards are real right now.
 *
 * Deleting a card writes a TOMBSTONE rather than removing the record — a
 * hard delete plus a sync merge is how deleted things come back from the dead,
 * because the merge cannot tell "deleted here" from "not synced here yet" and
 * rebuilds anything it finds remotely. So `db.cards` is the full history
 * including the dead, and every screen reads it through here instead.
 *
 * The rule that makes this safe: `db.cards` is for MERGING, `liveCards(db)` is
 * for everything else. If a new screen reads `db.cards` directly it will show
 * deleted cards, so treat a direct read outside sync code as a bug.
 */
import type { Card, DB } from '../types';

/** A card the dealer still has: not deleted. */
export const isLive = (card: Card): boolean => card.deletedAt == null;

/** Every card that has not been deleted, in insertion order. */
export const liveCards = (db: DB): Card[] => db.cards.filter(isLive);
