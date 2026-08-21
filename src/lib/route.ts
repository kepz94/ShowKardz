/**
 * Where the app is, encoded in the URL hash.
 *
 * IT LIVES IN THE HASH ON PURPOSE. iOS kills PWA processes constantly and a
 * show session is interrupted by definition — someone is standing at the table
 * waiting. Anything held only in component state is gone on the next launch, so
 * the screen and the card being worked on are both in the address instead.
 *
 *   #/collection            the group list
 *   #/collection/<cardId>   that card's editor, straight from a cold start
 *   #/shows                 the shows you have
 *   #/shows/<showId>        that show, on whichever phase it is in
 *
 * An unknown screen falls back rather than erroring: a stale bookmark or a
 * half-typed hash should land somewhere usable, never on a blank page.
 */
export type Route = 'scan' | 'collection' | 'shows' | 'sales' | 'receipts';

export const ROUTES: Route[] = ['scan', 'collection', 'shows', 'sales', 'receipts'];

export interface Location {
  route: Route;
  /**
   * The record to open on arrival — a card under /collection, a show under
   * /shows. One field because it is one slot in the URL; the screen it lands on
   * decides what it means.
   */
  id?: string;
}

/** Read a location out of a hash string. */
export function parseHash(hash: string, fallback: Route = 'shows'): Location {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [head, ...rest] = parts;
  const route = ROUTES.find((r) => r === head);
  if (!route) return { route: fallback };
  // Rejoin so an id that somehow contains a slash survives the round trip.
  const id = rest.join('/');
  return id === '' ? { route } : { route, id };
}

/** Write a location back into a hash string. */
export function toHash(route: Route, id?: string): string {
  return id != null && id !== '' ? `#/${route}/${id}` : `#/${route}`;
}
