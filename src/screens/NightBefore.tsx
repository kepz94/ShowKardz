import { useMemo, useState } from 'react';
import type { Route } from '../App';
import { Back } from '../components/Back';
import { useStore, newId, nowIso } from '../lib/store';
import { isDuplicate, isValidNumber, normalizeNumber } from '../lib/numbers';
import { composeTitle } from '../lib/title';
import { compsUrl } from '../lib/comps';
import { dollarsToCents, formatCents } from '../lib/money';
import type { Card, Stack } from '../types';

type Pass = 'intake' | 'price';

export function NightBefore({ go }: { go: (r: Route) => void }) {
  const { db } = useStore();
  const [pass, setPass] = useState<Pass>('intake');

  const stack = db.stacks[db.stacks.length - 1];
  const [declaring, setDeclaring] = useState(!stack);

  if (!stack || declaring) {
    return <DeclareStack go={go} onDone={() => setDeclaring(false)} />;
  }

  return (
    <>
      <Back go={go} />
      <div className="eb">Step 1 · Night before</div>
      <h1>{pass === 'intake' ? 'Scan the stack' : 'Price pass'}</h1>

      <div className="band">
        <div className="l">Stack</div>
        <div className="v">
          {[stack.year, stack.product, stack.parallel].filter(Boolean).join(' · ')}
        </div>
        <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => setDeclaring(true)}>
          Change stack
        </button>
      </div>

      <div className="row two" style={{ marginTop: 14 }}>
        <button className={pass === 'intake' ? 'btn' : 'btn ghost'} onClick={() => setPass('intake')}>
          Intake
        </button>
        <button className={pass === 'price' ? 'btn' : 'btn ghost'} onClick={() => setPass('price')}>
          Price pass
        </button>
      </div>

      {pass === 'intake'
        ? <Intake stack={stack} />
        : <PricePass stack={stack} />}
    </>
  );
}

function DeclareStack({ go, onDone }: { go: (r: Route) => void; onDone: () => void }) {
  const { dispatch } = useStore();
  const [year, setYear] = useState('');
  const [product, setProduct] = useState('');
  const [parallel, setParallel] = useState('Base');

  const ready = product.trim() !== '';

  return (
    <>
      <Back go={go} />
      <div className="eb">Step 1 · Night before</div>
      <h1>Declare the stack</h1>
      <p className="lede">
        The camera can only read what is printed. Year, product and parallel are yours to
        declare once — every card entered under this stack inherits them.
      </p>

      <div className="card stack-grid" style={{ marginTop: 16 }}>
        <div>
          <label htmlFor="year">Year</label>
          <input id="year" type="text" inputMode="numeric" value={year}
                 onChange={(e) => setYear(e.target.value)} placeholder="2023" />
        </div>
        <div>
          <label htmlFor="product">Product / set</label>
          <input id="product" type="text" value={product}
                 onChange={(e) => setProduct(e.target.value)} placeholder="Panini Prizm" />
        </div>
        <div>
          <label htmlFor="parallel">Parallel</label>
          <input id="parallel" type="text" value={parallel}
                 onChange={(e) => setParallel(e.target.value)} placeholder="Base" />
          <p className="claim">Leave as Base and it stays out of the card titles.</p>
        </div>
      </div>

      <div className="sticky">
        <button className="btn" disabled={!ready} onClick={() => {
          dispatch({
            type: 'stack/add', id: newId(), year: year.trim(),
            product: product.trim(), parallel: parallel.trim() || 'Base', now: nowIso(),
          });
          onDone();
        }}>
          Start this stack
        </button>
      </div>
    </>
  );
}

function Intake({ stack }: { stack: Stack }) {
  const { db, dispatch } = useStore();
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [flash, setFlash] = useState<{ ok: boolean; text: string; sub?: string } | null>(null);

  const inStack = db.cards.filter((c) => c.stackId === stack.id);
  const dup = isDuplicate(db.cards, number);
  const ready = isValidNumber(number) && name.trim() !== '' && !dup;

  function add() {
    if (!ready) return;
    dispatch({
      type: 'card/add', id: newId(), stackId: stack.id,
      number: normalizeNumber(number), name: name.trim(),
      cardNumber: cardNumber.trim() || undefined, now: nowIso(),
    });
    setFlash({
      ok: true,
      text: `${normalizeNumber(number)} entered`,
      sub: composeTitle(stack, name.trim(), cardNumber.trim() || undefined),
    });
    setNumber('');
    setName('');
    setCardNumber('');
  }

  return (
    <>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="row">
          <div>
            <label htmlFor="num">Sticker number</label>
            <input id="num" type="tel" inputMode="numeric" value={number}
                   onChange={(e) => { setNumber(e.target.value); setFlash(null); }}
                   placeholder="0455" />
          </div>
          <div>
            <label htmlFor="name">Name on the card</label>
            <input id="name" type="text" value={name}
                   onChange={(e) => setName(e.target.value)} placeholder="Anthony Edwards" />
          </div>
          <div>
            <label htmlFor="cn">Card number <span className="muted">(optional)</span></label>
            <input id="cn" type="text" inputMode="numeric" value={cardNumber}
                   onChange={(e) => setCardNumber(e.target.value)} placeholder="58" />
          </div>
        </div>

        {dup && (
          <div className="flash bad">
            {normalizeNumber(number)} is already on a card
            <span>One sticker number, one card. Peel the next number instead.</span>
          </div>
        )}
        {flash && !dup && (
          <div className={`flash ${flash.ok ? 'ok' : 'bad'}`}>
            {flash.text}
            {flash.sub && <span>{flash.sub}</span>}
          </div>
        )}

        <button className="btn" style={{ marginTop: 12 }} disabled={!ready} onClick={add}>
          Add card
          <span className="sub">Lands unpriced — pricing is the second pass</span>
        </button>
      </div>

      <h2>In this stack · {inStack.length}</h2>
      <div className="list">
        {inStack.length === 0 && <div className="empty">Nothing entered yet.</div>}
        {[...inStack].reverse().map((c) => (
          <div className="line" key={c.id}>
            <div className="no">{c.number}</div>
            <div className="mid">
              <div className="nm">{composeTitle(stack, c.name, c.cardNumber)}</div>
              <div className="mt">
                {c.status === 'unpriced' ? 'Unpriced' :
                 c.status === 'sold' ? 'Sold' : formatCents(c.priceCents ?? 0)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function PricePass({ stack }: { stack: Stack }) {
  const { db, dispatch } = useStore();
  const queue = useMemo(() => db.cards.filter((c) => c.status === 'unpriced'), [db.cards]);
  const card = queue[0];

  if (!card) {
    return (
      <div className="card" style={{ marginTop: 14 }}>
        <div className="flash ok">Every card is priced.<span>Nothing left in the queue.</span></div>
      </div>
    );
  }
  return <PriceOne key={card.id} card={card} stack={stack} remaining={queue.length}
                   onSave={(priceCents, floorCents) => dispatch({
                     type: 'card/price', cardId: card.id, priceCents, floorCents, now: nowIso(),
                   })} />;
}

function PriceOne({
  card, stack, remaining, onSave,
}: {
  card: Card; stack: Stack; remaining: number;
  onSave: (priceCents: number, floorCents?: number) => void;
}) {
  const [price, setPrice] = useState('');
  const [floor, setFloor] = useState('');

  const priceCents = dollarsToCents(price);
  const floorCents = floor.trim() === '' ? undefined : dollarsToCents(floor);
  const ready = priceCents !== null && priceCents > 0;
  const floorTooHigh = floorCents != null && priceCents != null && floorCents > priceCents;

  const title = composeTitle(stack, card.name, card.cardNumber);

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="eb">{remaining} left to price</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700, marginTop: 6 }}>
        {card.number}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{title}</div>

      <a className="evidence" href={compsUrl(stack, card.name, card.cardNumber)}
         target="_blank" rel="noopener noreferrer">
        Check real eBay sold listings ↗
      </a>
      <p className="claim">
        Market evidence, not a number this app can know. Eyeball the last handful, then set yours.
      </p>

      <div className="row two" style={{ marginTop: 14 }}>
        <div>
          <label htmlFor="price">Your price</label>
          <input id="price" type="tel" inputMode="decimal" value={price}
                 onChange={(e) => setPrice(e.target.value)} placeholder="$" />
        </div>
        <div>
          <label htmlFor="floor">Floor <span className="muted">(optional)</span></label>
          <input id="floor" type="tel" inputMode="decimal" value={floor}
                 onChange={(e) => setFloor(e.target.value)} placeholder="$" />
        </div>
      </div>

      {floorTooHigh && (
        <div className="flash bad">
          The floor is above the price
          <span>The floor is the least you would take, so it sits at or below your price.</span>
        </div>
      )}

      <button className="btn" style={{ marginTop: 12 }} disabled={!ready || floorTooHigh}
              onClick={() => ready && onSave(priceCents, floorCents ?? undefined)}>
        Set price {priceCents ? formatCents(priceCents) : ''}
      </button>
    </div>
  );
}

