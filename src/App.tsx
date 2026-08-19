import { liveCards } from './lib/cards';
import { useEffect, useState } from 'react';
import { Scan } from './screens/Scan';
import { Book } from './screens/Book';
import { Show } from './screens/Show';
import { Sales } from './screens/Sales';
import { Receipts } from './screens/Receipts';
import { ScanIcon, CardsIcon, ShowIcon, SalesIcon, ReceiptsIcon } from './components/Icons';
import { useStore } from './lib/store';
import { SyncBar } from './components/SyncBar';

export type Route = 'scan' | 'book' | 'show' | 'sales' | 'receipts';

const TABS: { route: Route; label: string; Icon: () => JSX.Element }[] = [
  { route: 'scan', label: 'Scan', Icon: ScanIcon },
  { route: 'book', label: 'Book', Icon: CardsIcon },
  { route: 'show', label: 'Show', Icon: ShowIcon },
  { route: 'sales', label: 'Sales', Icon: SalesIcon },
  { route: 'receipts', label: 'Receipts', Icon: ReceiptsIcon },
];

function currentRoute(): Route {
  const h = location.hash.replace('#/', '') as Route;
  return TABS.some((t) => t.route === h) ? h : 'scan';
}

/**
 * Hash routing so a cold start lands where the dealer was. iOS kills PWA
 * processes constantly and a show session is interrupted by definition —
 * someone is standing at the table waiting.
 */
export function App() {
  const [route, setRoute] = useState<Route>(currentRoute);
  const { db } = useStore();

  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  const go = (r: Route) => {
    location.hash = `#/${r}`;
  };

  // A card scanned but never priced cannot be sold, and that is invisible from
  // the Show screen — so the Book, which is where it gets fixed, carries the mark.
  const unpriced = liveCards(db).filter((c) => c.status === 'unpriced').length;

  return (
    <>
      <main className="app">
        <SyncBar />
        {route === 'scan' && <Scan go={go} />}
        {route === 'book' && <Book go={go} />}
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
                {r === 'book' && unpriced > 0 && (
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
