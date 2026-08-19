import { useState } from 'react';
import type { Route } from '../App';
import { useStore, newId, nowIso } from '../lib/store';
import { findByNumber } from '../lib/numbers';
import { cardLabel } from '../lib/title';
import { formatCents, pctOf, sumAsks } from '../lib/money';
import { checkFloors } from '../lib/floors';
import type { Card } from '../types';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** The register. Works with no signal — every figure here is local arithmetic. */
export function Show({ go }: { go: (r: Route) => void }) {
  const { db, dispatch } = useStore();
  const [entry, setEntry] = useState('');
  const [cart, setCart] = useState<string[]>([]);
  const [pct, setPct] = useState(85);
  const [charging, setCharging] = useState(false);
  const [done, setDone] = useState<{ agreedCents: number; count: number } | null>(null);

  const sellable = db.cards.filter((c) => c.status === 'available');
  const cartCards = cart
    .map((id) => db.cards.find((c) => c.id === id))
    .filter((c): c is Card => c !== undefined);

  // The typo guard: show what the typed number actually points at before it
  // joins the deal. A wrong digit is the failure mode at a busy table.
  const match = entry === '' ? undefined : findByNumber(sellable, entry);
  const soldMatch = entry === '' ? undefined : findByNumber(db.cards, entry);
  const alreadyInCart = match ? cart.includes(match.id) : false;

  const asks = cartCards.map((c) => c.priceCents ?? 0);
  const subtotalCents = sumAsks(asks);
  const agreedCents = pctOf(subtotalCents, pct);
  const floors = checkFloors(cartCards, agreedCents);

  function commit() {
    if (cart.length === 0 || charging) return;
    setCharging(true);
    dispatch({ type: 'deal/record', id: newId(), cardIds: cart, agreedCents, now: nowIso() });
    setDone({ agreedCents, count: cart.length });
    setCart([]);
    setEntry('');
    setPct(85);
    setCharging(false);
  }

  if (done) {
    return (
      <>
        <header className="screen-head">
          <div>
            <div className="eb">Show</div>
            <h1>Sold</h1>
          </div>
        </header>
        <div className="stats two">
          <div className="stat money">
            <div className="k">Took</div>
            <div className="v">{formatCents(done.agreedCents)}</div>
          </div>
          <div className="stat">
            <div className="k">Cards</div>
            <div className="v">{done.count}</div>
            <div className="s">out of the case</div>
          </div>
        </div>
        <div style={{ marginTop: 14, display: 'grid', gap: 9 }}>
          <button className="btn" onClick={() => setDone(null)}>Next sale</button>
          <button className="btn ghost" onClick={() => go('sales')}>See the day</button>
        </div>
      </>
    );
  }

  if (sellable.length === 0 && cartCards.length === 0) {
    return (
      <>
        <header className="screen-head">
          <div>
            <div className="eb">Show</div>
            <h1>Cash sale</h1>
          </div>
        </header>
        <div className="list">
          <div className="empty">
            <div className="t">Nothing priced yet</div>
            <div className="s">
              A card can only be sold once it has a price. Price them in the Book and they land here.
            </div>
            <button className="btn sm" style={{ marginTop: 14, width: 'auto', display: 'inline-flex' }}
                    onClick={() => go('book')}>
              Go to the Book
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="screen-head">
        <div>
          <div className="eb">Show · works offline</div>
          <h1>Cash sale</h1>
        </div>
        <div className="aside">
          <div className="k">In case</div>
          <div className="v">{sellable.length}</div>
        </div>
      </header>

      <div className="band">
        <div className="k">Sticker number</div>
        <div className="digits">{entry === '' ? <span className="ph">− − − −</span> : entry}</div>
        {entry !== '' && (
          <div className={`echo${match ? '' : ' bad'}`}>
            {match ? (
              <>
                {/* The typo guard has to say something even for a card entered
                    with only its number, or it guards nothing. */}
                <b>{cardLabel(match, db.stacks.find((s) => s.id === match.stackId))}</b>
                {alreadyInCart && <span className="muted"> · already on this deal</span>}
                <span className="amt">{formatCents(match.priceCents ?? 0)}</span>
              </>
            ) : soldMatch ? `${soldMatch.number} is already sold` : 'No card with that number'}
          </div>
        )}
      </div>

      <div className="pad">
        {KEYS.map((k) => (
          <button className="key" key={k} onClick={() => setEntry((e) => e + k)}>{k}</button>
        ))}
        <button className="key sm" onClick={() => setEntry('')}>Clear</button>
        <button className="key" onClick={() => setEntry((e) => e + '0')}>0</button>
        <button className="key sm" onClick={() => setEntry((e) => e.slice(0, -1))}
                aria-label="Delete last digit">⌫</button>
      </div>

      <button className="btn" style={{ marginTop: 11 }} disabled={!match || alreadyInCart}
              onClick={() => {
                if (!match || alreadyInCart) return;
                setCart((c) => [...c, match.id]);
                setEntry('');
              }}>
        Add to deal
      </button>

      <h2>
        <span>On this deal</span>
        <span className="count">{cartCards.length}</span>
      </h2>

      <div className="list">
        {cartCards.length === 0 ? (
          <div className="empty">
            <div className="t">Nothing on the deal</div>
            <div className="s">Type a number off a sticker. The name comes back as your check.</div>
          </div>
        ) : cartCards.map((c) => {
          const stack = db.stacks.find((s) => s.id === c.stackId);
          return (
            <div className="row" key={c.id}>
              <span className="num">{c.number}</span>
              <span className="mid">
                <span className="t">{cardLabel(c, stack)}</span>
                {c.floorCents != null && (
                  <span className="s">Floor {formatCents(c.floorCents)}</span>
                )}
              </span>
              <span className="amt">{formatCents(c.priceCents ?? 0)}</span>
              <button className="x" aria-label={`Remove ${c.number}`}
                      onClick={() => setCart((cur) => cur.filter((id) => id !== c.id))}>×</button>
            </div>
          );
        })}
      </div>

      {cartCards.length > 0 && (
        <>
          <div className="deal">
            <div className="dl">
              <span className="muted">
                My price · {cartCards.length} {cartCards.length === 1 ? 'card' : 'cards'}
              </span>
              <span>{formatCents(subtotalCents)}</span>
            </div>

            <div className="dial">
              <div className="top">
                <span className="pct">{pct}% of my price</span>
                <span className="amt">{formatCents(agreedCents)}</span>
              </div>
              <input type="range" min={40} max={100} step={1} value={pct}
                     aria-label="Percent of my price"
                     onChange={(e) => setPct(Number(e.target.value))} />

              {floors.hasFloor && (
                <div className="floorline">
                  <span className="muted">Floors {formatCents(floors.combinedFloorCents)}</span>
                  <span className={floors.breached ? 'bad' : 'good'}>
                    {floors.breached
                      ? `${formatCents(floors.shortfallCents)} under a floor`
                      : 'Every floor holds'}
                  </span>
                </div>
              )}
            </div>
            <p className="claim">
              This is your number, not a market price. Comps live on the card, in the price pass.
            </p>
          </div>

          <div className="sticky">
            <button className={floors.breached ? 'btn alert' : 'btn money'} disabled={charging}
                    onClick={commit}>
              {floors.breached ? 'Sell below your floor' : 'Mark sold'}
              <span className="sub">
                {formatCents(agreedCents)} · {cartCards.length} {cartCards.length === 1 ? 'card' : 'cards'}
              </span>
            </button>
          </div>
        </>
      )}
    </>
  );
}
