/**
 * Tab icons, inline. A handful of small paths do not justify an icon dependency, and a
 * package here would be one more thing to keep alive for the life of the app.
 */
const base = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

/** A checklist — the short, finite job the night before a show. */
export const PrepIcon = () => (
  <svg {...base}>
    <path d="M4 6.5 5.6 8 8.5 5" />
    <path d="M4 12.5 5.6 14 8.5 11" />
    <path d="M4 18.5 5.6 20 8.5 17" />
    <path d="M12 6.5h8M12 12.5h8M12 18.5h5" />
  </svg>
);

/** A viewfinder over a card — getting one in. */
export const ScanIcon = () => (
  <svg {...base}>
    <path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8" />
    <path d="M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8" />
    <path d="M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16" />
    <path d="M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16" />
    <rect x="8" y="7.5" width="8" height="9" rx="1.2" />
  </svg>
);

/** Two stacked cards — the collection. */
export const CardsIcon = () => (
  <svg {...base}>
    <rect x="3" y="6" width="12" height="15" rx="2" />
    <path d="M8 3h11a2 2 0 0 1 2 2v13" />
  </svg>
);

/** A keypad — the register you work at the table. */
export const ShowIcon = () => (
  <svg {...base}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" />
  </svg>
);

/** A rising line — what the day did. */
export const SalesIcon = () => (
  <svg {...base}>
    <path d="M3 20h18" />
    <path d="M6 16l4.5-5 3.5 3L20 7" />
    <path d="M20 11V7h-4" />
  </svg>
);

/** A torn slip — the receipt. */
export const ReceiptsIcon = () => (
  <svg {...base}>
    <path d="M5 3v18l2.5-1.6L10 21l2-1.6L14 21l2.5-1.6L19 21V3z" />
    <path d="M9 8h6M9 12h6" />
  </svg>
);
