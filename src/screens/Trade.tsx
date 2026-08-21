/**
 * A trade: two piles, two dials, and who reaches for their wallet.
 *
 * A trade is not a sale with extra steps. In a sale there is one number to
 * agree; here there are two piles, each worth what the two of you decide, and
 * the difference settles in cash.
 *
 * THE TWO DIALS ARE THE PRODUCT. The spread between them is the margin, and it
 * is the reason a dealer takes a trade at all: your cards go out near sticker,
 * theirs come in under it, and the gap is the profit. One dial would force a
 * single percentage across both piles and delete the trade's economics — see
 * lib/trade.ts.
 *
 * YOUR SIDE IS TYPED BY STICKER NUMBER, like every other deal in this app.
 * Their side is ad hoc, because their cards have no stickers and are not in the
 * book — they get scanned in afterwards, so what is recorded here is what they
 * were credited at, not an invented inventory row.
 */
import { useMemo, useState } from 'react';
import { useStore, newId, nowIso } from '../lib/store';
import { liveCards } from '../lib/cards';
import { findByNumber, normalizeNumber } from '../lib/numbers';
import { dollarsToCents, formatCents } from '../lib/money';
import { rowLabel } from '../lib/title';
import { settleTrade } from '../lib/trade';
import { checkFloors } from '../lib/floors';
import type { TradeLine } from '../types';

export function Trade({ showId, onDone }: { showId?: string; onDone: () => void }) {
  const { db, dispatch } = useStore();

  const [entry, setEntry] = useState('');
  const [mine, setMine] = useState<string[]>([]);
  const [yoursPct, setYoursPct] = useState(90);

  const [theirs, setTheirs] = useState<TradeLine[]>([]);
  const [theirsPct, setTheirsPct] = useState(70);
  const [tName, setTName] = useState('');
  const [tValue, setTValue] = useState('');

  const [busy, setBusy] = useState(false);
  /* The finished trade, captured at commit. It has to hold its own numbers:
     the piles are cleared for the next trade, so reading them here would
     report the empty state instead of what just happened. */
  const [done, setDone] = useState<{ delta: number; cardsIn: number } | null>(null);

  const cards = useMemo(() => liveCards(db), [db]);
  const mineCards = mine
    .map((id) => cards.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => c != null);

  const match = entry === '' ? undefined : findByNumber(cards, entry);
  const alreadyIn = match != null && mine.includes(match.id);
  const sold = match?.status === 'sold';

  const yoursAsk = mineCards.map((c) => c.priceCents ?? 0);
  const theirsAsk = theirs.map((t) => t.askCents);
  const t = settleTrade(yoursAsk, yoursPct, theirsAsk, theirsPct);

  /* Your side is leaving the case, so the floors that guard it apply here too —
     a trade is one of the easiest ways to give a card away under its floor. */
  const floors = checkFloors(
    // priceCents, not askCents — FloorInput reads the ask off priceCents, and
    // the wrong field name silently makes every ask zero, which never breaches.
    mineCards.map((c) => ({ priceCents: c.priceCents, floorCents: c.floorCents })),
    t.yoursCents,
  );

  const ready = mineCards.length > 0 && !busy;

  function addMine() {
    if (!match || sold || alreadyIn) return;
    setMine((m) => [...m, match.id]);
    setEntry('');
  }

  function addTheirs() {
    const cents = dollarsToCents(tValue);
    if (cents == null || cents <= 0) return;
    setTheirs((x) => [...x, { title: tName.trim() || 'Their card', askCents: cents }]);
    setTName('');
    setTValue('');
  }

  function commit() {
    if (!ready) return;
    setBusy(true);
    dispatch({
      type: 'deal/trade', id: newId(), cardIds: mine,
      yoursCents: t.yoursCents, yoursPct,
      incoming: theirs, theirsPct,
      cashDeltaCents: t.deltaCents,
      showId, now: nowIso(),
    });
    setDone({ delta: t.deltaCents, cardsIn: theirs.length });
    setMine([]); setTheirs([]); setEntry('');
    setBusy(false);
  }

  if (done) {
    return (
      <>
        <header className="screen-head">
          <div>
            <div className="eb">Trade</div>
            <h1>Traded</h1>
          </div>
        </header>
        <div className="stats two">
          <div className="stat money">
            <div className="k">{done.delta >= 0 ? 'They owe you' : 'You owe them'}</div>
            <div className="v">{formatCents(Math.abs(done.delta))}</div>
            <div className="s">{done.delta === 0 ? 'even trade' : 'in cash'}</div>
          </div>
          <div className="stat">
            <div className="k">Cards in</div>
            <div className="v">{done.cardsIn}</div>
            <div className="s">scan them in when stickered</div>
          </div>
        </div>
        <p className="claim" style={{ marginTop: 11 }}>
          What you took in is on the deal, not in the book yet — those cards have no
          sticker numbers. Scan them like any other card and they join the collection.
        </p>
        <button className="btn" style={{ marginTop: 14 }} onClick={() => setDone(null)}>
          Another trade
        </button>
        <button className="btn ghost sm" style={{ marginTop: 9 }} onClick={onDone}>
          Done trading
        </button>
      </>
    );
  }

  return (
    <>
      <header className="screen-head">
        <div>
          <div className="eb">Trade</div>
          <h1>Two piles</h1>
        </div>
      </header>

      {/* ---- your side ---- */}
      <h2><span>Yours, going out</span><span className="count">{mineCards.length}</span></h2>

      <div className="band">
        <div className="k">Sticker number</div>
        <div className="digits">{entry === '' ? <span className="ph">− − − −</span> : entry}</div>
        {entry !== '' && (
          <div className={`echo${match && !sold && !alreadyIn ? '' : ' bad'}`}>
            {!match ? `No card on ${normalizeNumber(entry)}`
              : sold ? 'That card is already gone'
              : alreadyIn ? 'Already in this trade'
              : <><b>{rowLabel(match, db.stacks.find((s) => s.id === match.stackId))}</b>
                  <span className="amt">{formatCents(match.priceCents ?? 0)}</span></>}
          </div>
        )}
      </div>

      <div className="pad">
        {['1','2','3','4','5','6','7','8','9'].map((d) => (
          <button className="key" key={d} onClick={() => setEntry((e) => e + d)}>{d}</button>
        ))}
        <button className="key sm" onClick={() => setEntry('')}>Clear</button>
        <button className="key" onClick={() => setEntry((e) => e + '0')}>0</button>
        <button className="key sm" onClick={() => setEntry((e) => e.slice(0, -1))}>⌫</button>
      </div>

      <button className="btn" style={{ marginTop: 10 }}
              disabled={!match || sold || alreadyIn} onClick={addMine}>
        Add to your side
      </button>

      {mineCards.length > 0 && (
        <>
          <div className="list" style={{ marginTop: 12 }}>
            {mineCards.map((c) => (
              <div className="row" key={c.id}>
                <span className="num">{c.number}</span>
                <span className="mid">
                  <span className="t">{rowLabel(c, db.stacks.find((s) => s.id === c.stackId))}</span>
                </span>
                <span className="amt">{formatCents(c.priceCents ?? 0)}</span>
                <button className="x" aria-label={`Take ${c.number} out of the trade`}
                        onClick={() => setMine((m) => m.filter((id) => id !== c.id))}>×</button>
              </div>
            ))}
          </div>

          <Dial label="Your side goes out at" pct={yoursPct} onChange={setYoursPct}
                askCents={t.yoursAskCents} valueCents={t.yoursCents} tone="money" />
        </>
      )}

      {/* ---- their side ---- */}
      <h2 style={{ marginTop: 22 }}>
        <span>Theirs, coming in</span><span className="count">{theirs.length}</span>
      </h2>

      <div className="card">
        <div className="grid2">
          <div className="field">
            <label htmlFor="t-name">What is it</label>
            <input id="t-name" type="text" value={tName} placeholder="Their rookie"
                   onChange={(e) => setTName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="t-val">Worth</label>
            <div className="money-in">
              <span>$</span>
              <input id="t-val" type="tel" inputMode="decimal" value={tValue} placeholder="0"
                     onChange={(e) => setTValue(e.target.value)}
                     onKeyDown={(e) => { if (e.key === 'Enter') addTheirs(); }} />
            </div>
          </div>
        </div>
        <button className="btn ghost sm" style={{ marginTop: 11 }}
                disabled={dollarsToCents(tValue) == null} onClick={addTheirs}>
          Add to their side
        </button>
        <p className="claim">
          Your read on what it is worth. The app has no way to know, and does not pretend to.
        </p>
      </div>

      {theirs.length > 0 && (
        <>
          <div className="list" style={{ marginTop: 12 }}>
            {theirs.map((line, i) => (
              <div className="row" key={`${line.title}-${i}`}>
                <span className="mid"><span className="t">{line.title}</span></span>
                <span className="amt">{formatCents(line.askCents)}</span>
                <button className="x" aria-label={`Remove ${line.title}`}
                        onClick={() => setTheirs((x) => x.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
          </div>

          <Dial label="Their side comes in at" pct={theirsPct} onChange={setTheirsPct}
                askCents={t.theirsAskCents} valueCents={t.theirsCents} tone="accent" />
        </>
      )}

      {/* ---- the settlement ---- */}
      {(mineCards.length > 0 || theirs.length > 0) && (
        <>
          <h2 style={{ marginTop: 22 }}><span>Who owes what</span></h2>
          <div className={`settle ${t.owed}`}>
            <div className="k">
              {t.owed === 'even' ? 'Even trade'
                : t.owed === 'them' ? 'They owe you' : 'You owe them'}
            </div>
            <div className="v">{formatCents(Math.abs(t.deltaCents))}</div>
            <div className="s">
              yours {formatCents(t.yoursCents)} · theirs {formatCents(t.theirsCents)}
            </div>
          </div>

          {floors.breached && (
            <p className="claim bad" style={{ marginTop: 10 }}>
              {formatCents(floors.shortfallCents)} under your floor. A trade is the
              easiest way to hand a card over for less than you said you would take.
            </p>
          )}

          <div className="sticky">
            <button className={floors.breached ? 'btn alert' : 'btn money'}
                    disabled={!ready} onClick={commit}>
              {floors.breached ? 'Trade below your floor' : 'Record the trade'}
              <span className="sub">
                {mineCards.length} out · {theirs.length} in
              </span>
            </button>
          </div>
        </>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

/** One dial. The percentage is the control; the money is the answer. */
function Dial({ label, pct, onChange, askCents, valueCents, tone }: {
  label: string; pct: number; onChange: (n: number) => void;
  askCents: number; valueCents: number; tone: 'money' | 'accent';
}) {
  return (
    <div className={`dial ${tone}`}>
      <div className="top">
        <span className="k">{label}</span>
        <span className="pct">{pct}%</span>
      </div>
      <input type="range" min={0} max={100} step={1} value={pct}
             aria-label={label}
             onChange={(e) => onChange(Number(e.target.value))} />
      <div className="s">
        {formatCents(askCents)} asking → <b>{formatCents(valueCents)}</b>
      </div>
    </div>
  );
}
