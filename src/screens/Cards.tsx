import { useMemo, useState } from 'react';
import { useStore, newId, nowIso } from '../lib/store';
import { isDuplicate, isValidNumber, normalizeNumber } from '../lib/numbers';
import { composeTitle } from '../lib/title';
import { compsUrl } from '../lib/comps';
import { dollarsToCents, formatCents } from '../lib/money';
import type { Card, Stack } from '../types';

type Filter = 'all' | 'unpriced' | 'available' | 'sold';

export function Cards() {
  const { db } = useStore();
  const stack = db.stacks[db.stacks.length - 1];
  const [editing, setEditing] = useState<Card | null>(null);
  const [declaring, setDeclaring] = useState(false);

  if (!stack || declaring) {
    return <DeclareStack existing={stack} onDone={() => setDeclaring(false)} />;
  }
  if (editing) {
    const live = db.cards.find((c) => c.id === editing.id);
    if (live) return <CardDetail card={live} onDone={() => setEditing(null)} />;
  }
  return <CardList stack={stack} onEdit={setEditing} onChangeStack={() => setDeclaring(true)} />;
}

/* -------------------------------------------------------------------------- */

function DeclareStack({ existing, onDone }: { existing?: Stack; onDone: () => void }) {
  const { dispatch } = useStore();
  const [year, setYear] = useState(existing?.year ?? '');
  const [product, setProduct] = useState(existing?.product ?? '');
  const [parallel, setParallel] = useState(existing?.parallel ?? 'Base');

  return (
    <>
      <header className="screen-head">
        <div>
          <div className="eb">Cards</div>
          <h1>Declare the stack</h1>
        </div>
      </header>

      <p className="lede">
        The camera can only read what is printed. Year, product and parallel are yours to declare
        once — every card entered under this stack inherits them, so titles compose themselves.
      </p>

      <div className="card">
        <div className="field">
          <label htmlFor="year">Year</label>
          <input id="year" type="text" inputMode="numeric" value={year}
                 onChange={(e) => setYear(e.target.value)} placeholder="2023" />
        </div>
        <div className="field">
          <label htmlFor="product">Product / set</label>
          <input id="product" type="text" value={product}
                 onChange={(e) => setProduct(e.target.value)} placeholder="Panini Prizm" />
        </div>
        <div className="field">
          <label htmlFor="parallel">Parallel</label>
          <input id="parallel" type="text" value={parallel}
                 onChange={(e) => setParallel(e.target.value)} placeholder="Base" />
          <p className="claim">Leave it as Base and it stays out of the card titles.</p>
        </div>
      </div>

      <div className="sticky">
        <button className="btn" disabled={product.trim() === ''} onClick={() => {
          dispatch({
            type: 'stack/add', id: newId(), year: year.trim(), product: product.trim(),
            parallel: parallel.trim() || 'Base', now: nowIso(),
          });
          onDone();
        }}>
          {existing ? 'Switch to this stack' : 'Start this stack'}
          <span className="sub">Cards you enter next inherit it</span>
        </button>
        {existing && (
          <button className="btn ghost sm" style={{ marginTop: 9 }} onClick={onDone}>Cancel</button>
        )}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function CardList({
  stack, onEdit, onChangeStack,
}: { stack: Stack; onEdit: (c: Card) => void; onChangeStack: () => void }) {
  const { db, dispatch } = useStore();
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const dup = isDuplicate(db.cards, number);
  const ready = isValidNumber(number) && name.trim() !== '' && !dup;

  const counts = useMemo(() => ({
    all: db.cards.length,
    unpriced: db.cards.filter((c) => c.status === 'unpriced').length,
    available: db.cards.filter((c) => c.status === 'available').length,
    sold: db.cards.filter((c) => c.status === 'sold').length,
  }), [db.cards]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.cards
      .filter((c) => (filter === 'all' ? true : c.status === filter))
      .filter((c) => q === '' || c.name.toLowerCase().includes(q) || c.number.includes(q))
      .slice()
      .reverse();
  }, [db.cards, filter, query]);

  function add() {
    if (!ready) return;
    dispatch({
      type: 'card/add', id: newId(), stackId: stack.id, number: normalizeNumber(number),
      name: name.trim(), now: nowIso(),
    });
    setNumber('');
    setName('');
  }

  return (
    <>
      <header className="screen-head">
        <div>
          <div className="eb">Cards</div>
          <h1>The book</h1>
        </div>
        <div className="aside">
          <div className="k">In the case</div>
          <div className="v">{counts.available}</div>
        </div>
      </header>

      <div className="band">
        <div className="stackline">
          <div>
            <div className="k">Entering under</div>
            <div className="v">
              {[stack.year, stack.product, stack.parallel].filter(Boolean).join(' · ')}
            </div>
          </div>
          <button className="chip" onClick={onChangeStack}>Change</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 11 }}>
        <div className="grid2">
          <div>
            <label htmlFor="num">Sticker no.</label>
            <input id="num" type="tel" inputMode="numeric" value={number}
                   onChange={(e) => setNumber(e.target.value)} placeholder="0455" />
          </div>
          <div>
            <label htmlFor="name">Name on card</label>
            <input id="name" type="text" value={name} enterKeyHint="done"
                   onChange={(e) => setName(e.target.value)} placeholder="Anthony Edwards"
                   onKeyDown={(e) => e.key === 'Enter' && add()} />
          </div>
        </div>

        {dup && (
          <div className="flash bad">
            <div>
              <div className="b">{normalizeNumber(number)} is already on a card</div>
              <div className="s">One sticker number, one card. Peel the next one off the roll.</div>
            </div>
          </div>
        )}

        <button className="btn sm" style={{ marginTop: 12 }} disabled={!ready} onClick={add}>
          Add card
        </button>
      </div>

      <h2>
        <span>The book</span>
        <span className="count">{counts.all}</span>
      </h2>

      <div className="seg" role="group" aria-label="Filter cards">
        {(['all', 'unpriced', 'available', 'sold'] as Filter[]).map((f) => (
          <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f === 'unpriced' ? 'Unpriced' : f === 'available' ? 'In case' : 'Sold'}
            {' '}{counts[f]}
          </button>
        ))}
      </div>

      {counts.all > 6 && (
        <div className="field" style={{ marginBottom: 11 }}>
          <input type="search" value={query} placeholder="Search a name or number"
                 aria-label="Search cards" onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}

      <div className="list">
        {shown.length === 0 ? (
          <div className="empty">
            <div className="t">{counts.all === 0 ? 'Nothing entered yet' : 'Nothing here'}</div>
            <div className="s">
              {counts.all === 0
                ? 'Peel a number, stick it on the sleeve, and type it in above.'
                : 'No card matches this filter.'}
            </div>
          </div>
        ) : shown.map((c) => {
          const cardStack = db.stacks.find((s) => s.id === c.stackId);
          return (
            <button className="row" key={c.id} onClick={() => onEdit(c)}>
              <span className="num">{c.number}</span>
              <span className="mid">
                <span className="t">{c.name}{c.cardNumber ? ` · ${c.cardNumber}` : ''}</span>
                <span className="s">
                  {c.status === 'unpriced' && <span className="pill unpriced">Unpriced</span>}
                  {c.status === 'sold' && <span className="pill sold">Sold</span>}
                  <span className="ctx">
                    {cardStack
                      ? [cardStack.year, cardStack.product,
                         cardStack.parallel.toLowerCase() === 'base' ? '' : cardStack.parallel]
                          .filter(Boolean).join(' ')
                      : ''}
                    {c.status === 'available' && c.floorCents != null
                      && ` · floor ${formatCents(c.floorCents)}`}
                  </span>
                </span>
              </span>
              <span className="amt">
                {c.status === 'sold' ? (
                  <>
                    {formatCents(c.realizedCents ?? 0)}
                    <span className="was">{formatCents(c.priceCents ?? 0)}</span>
                  </>
                ) : c.priceCents != null ? formatCents(c.priceCents) : '—'}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function CardDetail({ card, onDone }: { card: Card; onDone: () => void }) {
  const { db, dispatch } = useStore();
  const stack = db.stacks.find((s) => s.id === card.stackId);

  const [name, setName] = useState(card.name);
  const [cardNumber, setCardNumber] = useState(card.cardNumber ?? '');
  const [price, setPrice] = useState(card.priceCents != null ? centsToInput(card.priceCents) : '');
  const [floor, setFloor] = useState(card.floorCents != null ? centsToInput(card.floorCents) : '');

  const priceCents = dollarsToCents(price);
  const floorCents = floor.trim() === '' ? null : dollarsToCents(floor);
  const floorTooHigh = floorCents != null && priceCents != null && floorCents > priceCents;
  const canSave = priceCents != null && priceCents > 0 && !floorTooHigh && name.trim() !== '';

  const title = stack ? composeTitle(stack, name || card.name, cardNumber || undefined) : card.name;

  function save() {
    if (!canSave) return;
    const now = nowIso();
    dispatch({
      type: 'card/edit', cardId: card.id, name: name.trim(),
      cardNumber: cardNumber.trim() || undefined, now,
    });
    dispatch({
      type: 'card/price', cardId: card.id, priceCents,
      floorCents: floorCents ?? undefined, now,
    });
    onDone();
  }

  return (
    <>
      <header className="screen-head">
        <div>
          <div className="eb">Card {card.number}</div>
          <h1>{card.status === 'unpriced' ? 'Set a price' : 'Edit card'}</h1>
        </div>
        <div className="aside">
          <button className="btn ghost sm" onClick={onDone} style={{ width: 'auto' }}>Done</button>
        </div>
      </header>

      {card.status === 'sold' && (
        <div className="flash ok">
          <div>
            <div className="b">Sold for {formatCents(card.realizedCents ?? 0)}</div>
            <div className="s">Out of the case. Its record stays in the book and in Sales.</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="field">
          <label htmlFor="d-name">Name on card</label>
          <input id="d-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="d-cn">Card number <span className="muted">(optional)</span></label>
          <input id="d-cn" type="text" inputMode="numeric" value={cardNumber}
                 onChange={(e) => setCardNumber(e.target.value)} placeholder="58" />
        </div>
        <p className="claim">Title: {title}</p>
      </div>

      {stack && (
        <a className="evidence" href={compsUrl(stack, name || card.name, cardNumber || undefined)}
           target="_blank" rel="noopener noreferrer">
          <span>Check real eBay sold listings</span>
          <span aria-hidden>↗</span>
        </a>
      )}
      <p className="claim">
        Market evidence, not a figure this app can know. Read the last handful, then set yours.
      </p>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="grid2">
          <div>
            <label htmlFor="d-price">Your price</label>
            <div className="money-in">
              <span>$</span>
              <input id="d-price" type="tel" inputMode="decimal" value={price}
                     onChange={(e) => setPrice(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div>
            <label htmlFor="d-floor">Floor <span className="muted">(optional)</span></label>
            <div className="money-in">
              <span>$</span>
              <input id="d-floor" type="tel" inputMode="decimal" value={floor}
                     onChange={(e) => setFloor(e.target.value)} placeholder="0" />
            </div>
          </div>
        </div>
        {floorTooHigh && (
          <div className="flash bad">
            <div>
              <div className="b">The floor is above the price</div>
              <div className="s">A floor is the least you would take, so it sits at or below it.</div>
            </div>
          </div>
        )}
      </div>

      <div className="sticky">
        <button className="btn money" disabled={!canSave} onClick={save}>
          Save {priceCents ? formatCents(priceCents) : ''}
          <span className="sub">
            {card.status === 'unpriced' ? 'Puts it in the case, ready to sell' : 'Stickers are unaffected'}
          </span>
        </button>
      </div>
    </>
  );
}

/** Cents back into something a price field can hold. */
function centsToInput(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}
