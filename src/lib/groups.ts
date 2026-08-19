/** How a group reads wherever one is named. */
import type { Stack } from '../types';

export function groupName(stack: Stack): string {
  return (
    [
      stack.year,
      stack.product,
      stack.parallel.toLowerCase() === 'base' ? '' : stack.parallel,
    ]
      .map((p) => p.trim())
      .filter(Boolean)
      .join(' ') || 'Untitled group'
  );
}
