import { liveCards } from '../lib/cards';
import { groupRows } from '../lib/groups';
import { isPacked, packedCards, packedSummary } from '../lib/packing';
import { liveShows } from '../lib/shows';
import { useEffect, useState } from 'react';
import type { Route } from '../App';
import { useStore, newId, nowIso } from '../lib/store';
import { findByNumber } from '../lib/numbers';
import { rowLabel } from '../lib/title';
import { formatCents, pctOf, sumAsks } from '../lib/money';
import { checkFloors } from '../lib/floors';
import type { Card } from '../types';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** The register. Works with no signal — every figure here is local arithmetic. */
/**
 * The register. Used two ways, and it must not care which:
 *
 *   - at a show, with `showId` — "in case" means the cards that show packed,
 *     and every deal is stamped with it so the show can be totalled later;
 *   - standalone, with no showId — the same math for a sale away from a table.
 *     Those deals count toward Sales and toward no show.
 */
export function Show({ go, showId }: { go: (r: Route, id?: string) => void; showId?: string }) {
  const { db, dispatch } = useStore();
  const [entry, setEntry] = useState('');
  const [cart, setCart] = useState<string[]>([]);
  const [pct, setPct] = useState(85);
  const [charging, setCharging] = useState(false);
  const [done, setDone] = useState<{ agreedCents: number; count: number } | null>(null);
  /**
   * A deal dispatched but not yet confirmed to have landed.
   *
   * The reducer refuses a deal outright if a card in the cart is already sold —
   * which happens when the same card was rung up on another device a moment
   * ago. It refuses by returning the record unchanged, so the only way to know
   * is to look for the deal afterwards. This screen used to show "Sold, took
   * $120" either way.
   */
  const [awaiting, setAwaiting] = useState<{ id: string; agreedCents: number; count: number } | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  const sellable = liveCards(db).filter((c) => c.status === 'available');

  /*
   * What this show packed. With no show there is no case — the calculator sells
   * from the whole book, because nothing said otherwise.
   */
  const show = showId != null ? liveShows(db).find((s) => s.id === showId) : undefined;
  const packedIds = show?.packedStackIds;
  const packed = packedSummary(db, packedIds);
  const rows = groupRows(db);
  const onTable = packedCards(db, packedIds).filter((c) => c.status === 'available');
  const cartCards = cart
    .map((id) => liveCards(db).find((c) => c.id === id))
    .filter((c): c is Card => c !== undefined);

  // The typo guard: show what the typed number actually points at before it
  // joins the deal. A wrong digit is the failure mode at a busy table.
  const match = entry === '' ? undefined : findByNumber(sellable, entry);
  const soldMatch = entry === '' ? undefined : findByNumber(liveCards(db), entry);
  const alreadyInCart = match ? cart.includes(match.id) : false;

  const asks = cartCards.map((c) => c.priceCents ?? 0);
  const subtotalCents = sumAsks(asks);
  const agreedCents = pctOf(subtotalCents, pct);
  const floors = checkFloors(cartCards, agreedCents);

  function commit() {
    if (cart.length === 0 || charging) return;
    setCharging(true);
    setRefused(null);
    const id = newId();
    dispatch({ type: 'deal/record', id, cardIds: cart, agreedCents, showId, now: nowIso() });
    // The cart is NOT cleared here. If the deal was refused the dealer needs
    // what they just typed still on screen to fix it.
    setAwaiting({ id, agreedCents, count: cart.length });
  }

  /*
   * Did the deal actually land?
   *
   * By the time this runs, `db` is either the new record containing the deal or
   * — if the reducer refused — the exact same record as before. Both cases
   * render, because `awaiting` changed, so this always gets its answer.
   */
  useEffect(() => {
    if (awaiting == null) return;
    const landed = db.deals.some((d) => d.id === awaiting.id);
    setAwaiting(null);
    setCharging(false);

    if (landed) {
      setDone({ agreedCents: awaiting.agreedCents, count: awaiting.count });
      setCart([]);
      setEntry('');
      setPct(85);
      return;
    }

    // The only way the reducer refuses is a card that is no longer sellable.
    // Name the numbers: at a table "something went wrong" is useless.
    const blocked = db.cards
      .filter((c) => cart.includes(c.id) && (c.status === 'sold' || c.deletedAt != null))
      .map((c) => c.number);
    setRefused(
      blocked.length > 0
        ? `${blocked.join(', ')} ${blocked.length === 1 ? 'was' : 'were'} already sold somewhere else. Take ${blocked.length === 1 ? 'it' : 'them'} off the deal and ring it up again.`
        : 'That deal did not go through. Nothing was recorded — check the numbers and try again.',
    );
  }, [db, awaiting, cart]);

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
        <div className="mt4 stackgap">
          <button className="btn" onClick={() => setDone(null)}>Next sale</button>
          <button className="btn ghost" onClick={() => go('sales')}>Open Sales</button>
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
            <button className="btn sm inline mt4"
                    onClick={() => go('collection')}>
              Go to the collection
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
          <div className="eb">Show</div>
          <h1>Cash sale</h1>
        </div>
        <div className="aside">
          <div className="k">In case</div>
          {/*
            * PACKED, not the whole book. Standing at a table, "in case" has to
            * mean the cards actually in front of you — counting stock left at
            * home makes the one number a dealer glances at a lie. Nothing
            * packed falls back to everything sellable, because a dealer who
            * never used Prep has not said otherwise.
            */}
          <div className="v">{onTable.length > 0 ? onTable.length : sellable.length}</div>
        </div>
      </header>

      {packed.cardCount > 0 && (
        <section className="ontable" aria-labelledby="ontable-t">
          <div className="top">
            <h2 id="ontable-t">On the table today</h2>
            <span className="worth">{formatCents(packed.valueCents)}</span>
          </div>
          <div className="chips">
            {rows
              .filter((r) => isPacked(packedIds, r.id))
              .map((r) => (
                <span className="chip" key={r.id}>
                  {r.name}<b>{r.cardCount}</b>
                </span>
              ))}
          </div>
        </section>
      )}

      <div className="band">
        <div className="k">Sticker number</div>
        <div className="digits">{entry === '' ? <span className="ph">− − − −</span> : entry}</div>
        {entry !== '' && (
          <div className={`echo${match ? '' : ' bad'}`}>
            {match ? (
              <>
                {/* The typo guard has to say something even for a card entered
                    with only its number, or it guards nothing. */}
                <b>{rowLabel(match, db.stacks.find((s) => s.id === match.stackId))}</b>
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

      <button className="btn mt3" disabled={!match || alreadyInCart}
              onClick={() => {
                if (!match || alreadyInCart) return;
                setCart((c) => [...c, match.id]);
                setEntry('');
              }}>
        Add to deal
      </button>

      {refused && (
        <div className="flash bad" role="alert">
          <div>
            <div className="b">Not recorded</div>
            <div className="s">{refused}</div>
          </div>
        </div>
      )}

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
                <span className="t">{rowLabel(c, stack)}</span>
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
