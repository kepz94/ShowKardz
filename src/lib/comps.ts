/**
 * Market evidence, as a link and nothing else.
 *
 * Principle 4 (claims vs receipts): the app never stores or asserts a market
 * figure. It builds a URL to real eBay sold listings and lets the dealer read
 * them. eBay's sold-data API door is closed to small developers — the Finding
 * API was decommissioned in Feb 2025 and Marketplace Insights is partner-gated
 * — so a link-out is not a shortcut here, it is the whole available surface.
 *
 * THE QUERY IS THE DEALER'S TEXT, AND NOTHING ELSE.
 *
 * It used to append twelve negative keywords and scope to a category:
 *
 *   Anthony Edwards 2023 Panini Prizm Timberwolves 58 -auto -patch -jersey
 *   -relic -lot -reprint -custom -digital -psa -bgs -sgc -cgc  &_sacat=261328
 *
 * Every filter was defensible on its own and together they returned NOTHING.
 * A specific title is already narrow; each extra term is one more way for a
 * real listing to miss, and a category scope silently drops everything filed
 * anywhere else. An empty result page is worse than a broad one — nobody can
 * price against nothing, and the fix the dealer reaches for is deleting the
 * app's own additions by hand, on every card.
 *
 * So the keywords are exactly what is in the card name field. The only thing
 * still added is sold-and-completed, which is the entire point of the link.
 */
import type { Stack } from '../types';
import { composeTitle } from './title';

/** eBay wants + for spaces; %20 works but travels badly when pasted. */
function encodeQuery(q: string): string {
  return encodeURIComponent(q).replace(/%20/g, '+');
}

/**
 * A link to real sold listings for this card. Never a number, always a link.
 *
 * Nothing is appended to the keywords. The dealer is holding the card and has
 * already curated the name; narrowing it further on their behalf is exactly how
 * the search came back empty.
 */
export function compsUrl(
  stack: Stack | undefined,
  name: string,
  cardNumber?: string,
  printed?: string[],
): string {
  const keywords = composeTitle(stack, name, cardNumber, printed).trim();
  return (
    `https://www.ebay.com/sch/i.html?_nkw=${encodeQuery(keywords)}` +
    '&LH_Sold=1&LH_Complete=1'
  );
}
