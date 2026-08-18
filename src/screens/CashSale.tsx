import { useState } from 'react';
import type { Route } from '../App';
import { Back } from '../components/Back';
import { useStore, newId, nowIso } from '../lib/store';
import { findByNumber } from '../lib/numbers';
import { composeTitle } from '../lib/title';
import { formatCents, pctOf, sumAsks } from '../lib/money';
import { checkFloors } from '../lib/floors';
import type { Card } from '../types';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function CashSale({ go }: { go: (r: Route) => void }) {
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

  // The typo guard: echo what the typed number actually points at, before it
  // joins the deal.
  const match = entry === '' ? undefined : findByNumber(sellable, entry);
  const alreadyInCart = match ? cart.includes(match.id) : false;
  const soldMatch = entry === '' ? undefined : findByNumber(db.cards, entry);

  const asks = cartCards.map((c) => c.priceCents ?? 0);
  const subtotalCents = sumAsks(asks);
  const agreedCents = pctOf(subtotalCents, pct);

  // Each floored card is judged on its share of the deal, not on the bundle
  // total — see lib/floors.ts for why the total-vs-sum version hides breaches.
  const floors = checkFloors(cartCards, agreedCents);

  function commit() {
    if (cart.length === 0 || charging) return;
    setCharging(true);
    dispatch({
      type: 'deal/record', id: newId(), cardIds: cart, agreedCents, now: nowIso(),
    });
    setDone({ agreedCents, count: cart.length });
    setCart([]);
    setEntry('');
    setPct(85);
    setCharging(false);
  }

  if (done) {
    return (
      <>
        <Back go={go} />
        <div className="eb">Step 2 · Show day</div>
        <h1>Sold</h1>
        <div className="flash ok">
          {formatCents(done.agreedCents)} · {done.count} {done.count === 1 ? 'card' : 'cards'}
          <span>Out of the case and into the day log.</span>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn" onClick={() => setDone(null)}>Next sale</button>
          <button className="btn ghost" onClick={() => go('close')}>See the day log</button>
        </div>
      </>
    );
  }

  return (
    <>
      <Back go={go} />
      <div className="eb">Step 2 · Show day · works offline</div>
      <h1>Cash sale</h1>

      <div className="band">
        <div className="l">Sticker number</div>
        <div className="digits">{entry === '' ? <span className="ph">— — — —</span> : entry}</div>
        {entry !== '' && (
          <div style={{ marginTop: 10, fontSize: 13.5 }}>
            {match ? (
              <span>
                {match.name} · <b>{formatCents(match.priceCents ?? 0)}</b>
                {alreadyInCart && ' · already on this deal'}
              </span>
            ) : soldMatch ? (
              <span style={{ color: '#F0A08C' }}>{soldMatch.number} is already sold</span>
            ) : (
              <span style={{ color: '#F0A08C' }}>No card with that number</span>
            )}
          </div>
        )}
      </div>

      <div className="pad">
        {KEYS.map((k) => (
          <button className="key" key={k} onClick={() => setEntry((e) => e + k)}>{k}</button>
        ))}
        <button className="key sm" onClick={() => setEntry('')}>Clear</button>
        <button className="key" onClick={() => setEntry((e) => e + '0')}>0</button>
        <button className="key sm" onClick={() => setEntry((e) => e.slice(0, -1))}>⌫</button>
      </div>

      <button className="btn" style={{ marginTop: 10 }}
              disabled={!match || alreadyInCart}
              onClick={() => {
                if (!match || alreadyInCart) return;
                setCart((c) => [...c, match.id]);
                setEntry('');
              }}>
        Add to deal
      </button>

      <h2>On this deal · {cartCards.length}</h2>
      <div className="list">
        {cartCards.length === 0 && <div className="empty">Type a number off a sticker.</div>}
        {cartCards.map((c) => {
          const stack = db.stacks.find((s) => s.id === c.stackId);
          return (
            <div className="line" key={c.id}>
              <div className="no">{c.number}</div>
              <div className="mid">
                <div className="nm">{stack ? composeTitle(stack, c.name, c.cardNumber) : c.name}</div>
                {c.floorCents != null && (
                  <div className="mt">Floor {formatCents(c.floorCents)}</div>
                )}
              </div>
              <div className="pr">{formatCents(c.priceCents ?? 0)}</div>
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
              <span>My price, {cartCards.length} {cartCards.length === 1 ? 'card' : 'cards'}</span>
              <span>{formatCents(subtotalCents)}</span>
            </div>

            <div className="dial">
              <div className="top">
                <span className="pct">{pct}% of my price</span>
                <span className="amt">{formatCents(agreedCents)}</span>
              </div>
              <input type="range" min={50} max={100} step={1} value={pct}
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
              This is your number, not a market price. Comps live in the night-before pass.
            </p>
          </div>

          <div className="sticky">
            <button className={floors.breached ? 'btn warn' : 'btn'} disabled={charging} onClick={commit}>
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
