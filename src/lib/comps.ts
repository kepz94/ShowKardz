/**
 * Market evidence, as a link and nothing else.
 *
 * Principle 4 (claims vs receipts): the app never stores or asserts a market
 * figure. It builds a URL to real eBay sold listings and lets the dealer read
 * them. eBay's sold-data API door is closed to small developers — the Finding
 * API was decommissioned in Feb 2025 and Marketplace Insights is partner-gated
 * — so a link-out is not a shortcut here, it is the whole available surface.
 *
 * The query is the best rung the design's ladder proved from DOCUMENTED eBay
 * behavior: keywords + negative keywords + sold/completed + category scope.
 * The structured-aspect rungs stay in design/comps-query-test.html as an open
 * experiment; nothing here depends on them.
 */
import type { Stack } from '../types';
import { composeTitle } from './title';

/** eBay category 261328 — Trading Card Singles. Kills boxes, packs and bulk lots. */
export const SINGLES_CATEGORY = '261328';

/** Strips the listings that would drag a base-card read in the wrong direction. */
export const NEGATIVE_KEYWORDS =
  '-auto -patch -jersey -relic -lot -reprint -custom -digital -psa -bgs -sgc -cgc';

/** eBay wants + for spaces; %20 works but travels badly when pasted. */
function encodeQuery(q: string): string {
  return encodeURIComponent(q).replace(/%20/g, '+');
}

/**
 * A link to real sold listings for this card. Never a number, always a link.
 *
 * A card with no group still gets a usable search — the printed name is what a
 * buyer would type anyway; the group just narrows it.
 */
export function compsUrl(
  stack: Stack | undefined,
  name: string,
  cardNumber?: string,
  printed?: string[],
): string {
  const keywords = `${composeTitle(stack, name, cardNumber, printed)} ${NEGATIVE_KEYWORDS}`;
  return (
    `https://www.ebay.com/sch/i.html?_nkw=${encodeQuery(keywords)}` +
    `&LH_Sold=1&LH_Complete=1&_sacat=${SINGLES_CATEGORY}`
  );
}
