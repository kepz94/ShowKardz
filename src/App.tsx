import { liveCards } from './lib/cards';
import { useEffect, useState } from 'react';
import { Prep } from './screens/Prep';
import { Scan } from './screens/Scan';
import { Book } from './screens/Book';
import { Show } from './screens/Show';
import { Sales } from './screens/Sales';
import { Receipts } from './screens/Receipts';
import { PrepIcon, CardsIcon, ShowIcon, SalesIcon, ReceiptsIcon } from './components/Icons';
import { useStore } from './lib/store';
import { SyncBar } from './components/SyncBar';
import { parseHash, toHash, type Route } from './lib/route';

export type { Route };

/*
 * FIVE TABS, NOT SIX. Prep is the night-before home and replaces Scan on the
 * bar; Scan is reached from Prep and from an empty group, which is where the
 * dealer already is when they want it. A sixth tab makes every tab smaller on
 * the one screen size that matters.
 */
const TABS: { route: Route; label: string; Icon: () => JSX.Element }[] = [
  { route: 'prep', label: 'Prep', Icon: PrepIcon },
  { route: 'book', label: 'Book', Icon: CardsIcon },
  { route: 'show', label: 'Show', Icon: ShowIcon },
  { route: 'sales', label: 'Sales', Icon: SalesIcon },
  { route: 'receipts', label: 'Receipts', Icon: ReceiptsIcon },
];

/**
 * Hash routing so a cold start lands where the dealer was. iOS kills PWA
 * processes constantly and a show session is interrupted by definition —
 * someone is standing at the table waiting.
 */
export function App() {
  const [loc, setLoc] = useState(() => parseHash(location.hash));
  const { db } = useStore();

  useEffect(() => {
    const onHash = () => setLoc(parseHash(location.hash));
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  const route = loc.route;

  /* A card id rides along so Prep can send the dealer straight to the card
     that needs work — and so a cold start lands back on it. */
  const go = (r: Route, cardId?: string) => {
    location.hash = toHash(r, cardId);
  };

  // A card scanned but never priced cannot be sold, and that is invisible from
  // the Show screen — so the Book, which is where it gets fixed, carries the mark.
  const unpriced = liveCards(db).filter((c) => c.status === 'unpriced').length;

  return (
    <>
      <main className="app">
        <SyncBar />
        {route === 'prep' && <Prep go={go} />}
        {route === 'scan' && <Scan go={go} />}
        {route === 'book' && <Book go={go} openCardId={loc.cardId} />}
        {route === 'show' && <Show go={go} />}
        {route === 'sales' && <Sales go={go} />}
        {route === 'receipts' && <Receipts />}
      </main>

      <nav className="tabbar" aria-label="Main">
        <div className="inner">
          {TABS.map(({ route: r, label, Icon }) => (
            <button key={r} onClick={() => go(r)}
                    aria-current={route === r ? 'page' : undefined}>
              <span style={{ position: 'relative', display: 'flex' }}>
                <Icon />
                {r === 'prep' && unpriced > 0 && (
                  <span className="dot" aria-label={`${unpriced} unpriced`} />
                )}
              </span>
              {label}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
