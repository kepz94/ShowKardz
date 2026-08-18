import type { Route } from '../App';
import { useStore } from '../lib/store';
import { formatCents } from '../lib/money';

export function Home({ go }: { go: (r: Route) => void }) {
  const { db } = useStore();

  const unpriced = db.cards.filter((c) => c.status === 'unpriced').length;
  const available = db.cards.filter((c) => c.status === 'available').length;
  const sold = db.cards.filter((c) => c.status === 'sold');
  const takenCents = db.deals.reduce((sum, d) => sum + d.agreedCents, 0);

  return (
    <>
      <div className="eb">SHOWKARDZ</div>
      <h1>What are you doing right now?</h1>
      <p className="lede">
        The sticker is a pointer, not a price. Numbers go on the cards; the price lives here.
      </p>

      <nav className="nav">
        <a onClick={() => go('night')} tabIndex={0} role="button"
           onKeyDown={(e) => e.key === 'Enter' && go('night')}>
          <div className="step">Step 1 · Home, on wifi</div>
          <div className="t">Night before</div>
          <div className="d">
            {db.cards.length === 0
              ? 'Declare the stack, then enter cards and price them.'
              : `${db.cards.length} in the book · ${unpriced} still unpriced`}
          </div>
        </a>

        <a onClick={() => go('sale')} tabIndex={0} role="button"
           onKeyDown={(e) => e.key === 'Enter' && go('sale')}>
          <div className="step">Step 2 · At the table, offline</div>
          <div className="t">Cash sale</div>
          <div className="d">
            {available === 0
              ? 'Nothing priced yet — price the stack first.'
              : `${available} in the case, ready to sell.`}
          </div>
        </a>

        <a onClick={() => go('close')} tabIndex={0} role="button"
           onKeyDown={(e) => e.key === 'Enter' && go('close')}>
          <div className="step">Step 3 · End of day</div>
          <div className="t">Close out</div>
          <div className="d">
            {sold.length === 0
              ? 'No sales yet today.'
              : `${sold.length} sold · ${formatCents(takenCents)} taken · case audit`}
          </div>
        </a>
      </nav>

      <p className="claim" style={{ marginTop: 24 }}>
        Records live on this device. Open the app on wifi before you leave for the show.
      </p>
    </>
  );
}
