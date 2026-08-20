/**
 * Where the app is, encoded in the URL hash.
 *
 * IT LIVES IN THE HASH ON PURPOSE. iOS kills PWA processes constantly and a
 * show session is interrupted by definition — someone is standing at the table
 * waiting. Anything held only in component state is gone on the next launch, so
 * the screen and the card being worked on are both in the address instead.
 *
 *   #/book            the group list
 *   #/book/<cardId>   that card's editor, straight from a cold start
 *
 * An unknown screen falls back rather than erroring: a stale bookmark or a
 * half-typed hash should land somewhere usable, never on a blank page.
 */
export type Route = 'prep' | 'scan' | 'book' | 'show' | 'sales' | 'receipts';

export const ROUTES: Route[] = ['prep', 'scan', 'book', 'show', 'sales', 'receipts'];

export interface Location {
  route: Route;
  /** The card to open on arrival, when the screen supports one. */
  cardId?: string;
}

/** Read a location out of a hash string. */
export function parseHash(hash: string, fallback: Route = 'prep'): Location {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [head, ...rest] = parts;
  const route = ROUTES.find((r) => r === head);
  if (!route) return { route: fallback };
  // Rejoin so an id that somehow contains a slash survives the round trip.
  const cardId = rest.join('/');
  return cardId === '' ? { route } : { route, cardId };
}

/** Write a location back into a hash string. */
export function toHash(route: Route, cardId?: string): string {
  return cardId != null && cardId !== '' ? `#/${route}/${cardId}` : `#/${route}`;
}
