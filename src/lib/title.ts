/**
 * Title composition — principle 2 in practice.
 *
 * The camera reads only what is printed (the player name). Everything else
 * comes from the stack the dealer declared once. No card-ID database is
 * consulted, because there isn't one and buying access to one is the moat this
 * design routes around.
 */
import type { Stack } from '../types';

/** A parallel token that means "no parallel", and so never appears in a title. */
const BASE_PARALLEL = 'base';

export function composeTitle(stack: Stack, name: string, cardNumber?: string): string {
  const parallel = stack.parallel.trim();
  const parts = [
    stack.year,
    stack.product,
    parallel.toLowerCase() === BASE_PARALLEL ? '' : parallel,
    name,
    cardNumber ?? '',
  ];
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' ');
}
