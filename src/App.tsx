import { liveCards } from './lib/cards';
import { useEffect, useState } from 'react';
import { Scan } from './screens/Scan';
import { Collection } from './screens/Collection';
import { Shows } from './screens/Shows';
import { ShowDetail } from './screens/ShowDetail';
import { Show as Register } from './screens/Show';
import { Sales } from './screens/Sales';
import { Receipts } from './screens/Receipts';
import { ScanIcon, CardsIcon, ShowIcon, SalesIcon, ReceiptsIcon } from './components/Icons';
import { useStore } from './lib/store';
import { SyncBar } from './components/SyncBar';
import { parseHash, toHash, type Route } from './lib/route';

export type { Route };

/*
 * FIVE TABS. Scan is its own screen because getting cards in is its own job and
 * happens at a different time from everything else. Shows is where a show gets
 * made, prepped, sold at and closed. Sales and Receipts stay whole-business
 * totals: a show's own numbers live inside that show.
 */
const TABS: { route: Route; label: string; Icon: () => JSX.Element }[] = [
  { route: 'scan', label: 'Scan', Icon: ScanIcon },
  { route: 'collection', label: 'Collection', Icon: CardsIcon },
  { route: 'shows', label: 'Shows', Icon: ShowIcon },
  { route: 'sales', label: 'Sales', Icon: SalesIcon },
  { route: 'receipts', label: 'Receipts', Icon: ReceiptsIcon },
];

/**
 * The id reserved for the standalone register.
 *
 * It sits in the shows route because it IS the show screen's calculator, but it
 * is not a show and never becomes one: nothing is stored under this id, and a
 * deal rung up here carries no showId.
 */
const CALCULATOR = 'calculator';

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

  /* An id rides along so a screen can open one record — and so a cold start
     lands back on it rather than on the list it came from. */
  const go = (r: Route, id?: string) => {
    location.hash = toHash(r, id);
  };

  // A card scanned but never priced cannot be sold, and that is invisible from
  // the table — so the screen where it gets fixed carries the mark.
  const unpriced = liveCards(db).filter((c) => c.status === 'unpriced').length;

  return (
    <>
      <main className="app">
        <SyncBar />
        {route === 'scan' && <Scan go={go} />}
        {route === 'collection' && <Collection go={go} openCardId={loc.id} />}

        {route === 'shows' && loc.id == null && (
          <Shows go={go} onOpen={(id) => go('shows', id)} />
        )}
        {route === 'shows' && loc.id === CALCULATOR && (
          <>
            <button className="backlink" onClick={() => go('shows')}>← Shows</button>
            <Register go={go} />
          </>
        )}
        {route === 'shows' && loc.id != null && loc.id !== CALCULATOR && (
          <ShowDetail showId={loc.id} go={go}
                      onBack={() => go('shows')}
                      onOpenCard={(cardId) => go('collection', cardId)} />
        )}

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
                {r === 'collection' && unpriced > 0 && (
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
