import { useMemo, useRef, useState } from 'react';
import { useStore, newId, nowIso } from '../lib/store';
import { isDuplicate, isValidNumber, normalizeNumber } from '../lib/numbers';
import { composeTitle } from '../lib/title';
import { compsUrl } from '../lib/comps';
import { dollarsToCents, formatCents } from '../lib/money';
import type { Card, Stack } from '../types';

type Filter = 'all' | 'unpriced' | 'available' | 'sold';

/** How a group reads in a picker. */
function groupName(stack: Stack): string {
  return [stack.year, stack.product, stack.parallel.toLowerCase() === 'base' ? '' : stack.parallel]
    .filter(Boolean)
    .join(' ') || 'Untitled group';
}

export function Cards() {
  const { db } = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [declaring, setDeclaring] = useState(false);

  if (declaring) return <DeclareGroup onDone={() => setDeclaring(false)} />;

  if (editing) {
    const live = db.cards.find((c) => c.id === editing);
    if (live) {
      return <CardDetail card={live} onDone={() => setEditing(null)}
                         onNewGroup={() => setDeclaring(true)} />;
    }
  }
  return <CardList onEdit={setEditing} onNewGroup={() => setDeclaring(true)} />;
}

/* -------------------------------------------------------------------------- */

function DeclareGroup({ onDone }: { onDone: () => void }) {
  const { dispatch } = useStore();
  const [year, setYear] = useState('');
  const [product, setProduct] = useState('');
  const [parallel, setParallel] = useState('Base');

  return (
    <>
      <header className="screen-head">
        <div>
          <div className="eb">Cards</div>
          <h1>New group</h1>
        </div>
      </header>

      <p className="lede">
        A group supplies what the camera cannot read — year, product, parallel — to every card
        you put in it. Optional: cards work perfectly well without one.
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
        <button className="btn" disabled={product.trim() === '' && year.trim() === ''}
                onClick={() => {
                  dispatch({
                    type: 'stack/add', id: newId(), year: year.trim(), product: product.trim(),
                    parallel: parallel.trim() || 'Base', now: nowIso(),
                  });
                  onDone();
                }}>
          Create group
        </button>
        <button className="btn ghost sm" style={{ marginTop: 9 }} onClick={onDone}>Cancel</button>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function CardList({
  onEdit, onNewGroup,
}: { onEdit: (id: string) => void; onNewGroup: () => void }) {
  const { db, dispatch } = useStore();
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState<string>('');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [added, setAdded] = useState<string | null>(null);
  const numberField = useRef<HTMLInputElement>(null);

  const dup = isDuplicate(db.cards, number);
  // The number is the whole requirement. Name and group are filled in later,
  // which is what makes a fast intake pass possible: peel, stick, type, next.
  const ready = isValidNumber(number) && !dup;

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
    const clean = normalizeNumber(number);
    dispatch({
      type: 'card/add', id: newId(), number: clean, name: name.trim(),
      stackId: groupId || undefined, now: nowIso(),
    });
    setAdded(clean);
    setNumber('');
    setName('');
    // Straight back to the number field: the next card is already in hand.
    numberField.current?.focus();
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

      <div className="card">
        <div className="field">
          <label htmlFor="num">Sticker number</label>
          <input id="num" ref={numberField} type="tel" inputMode="numeric" value={number}
                 enterKeyHint="done" autoFocus placeholder="0455"
                 onChange={(e) => { setNumber(e.target.value); setAdded(null); }}
                 onKeyDown={(e) => e.key === 'Enter' && add()} />
        </div>

        <div className="field">
          <label htmlFor="name">Name <span className="muted">(optional — add it later)</span></label>
          <input id="name" type="text" value={name} enterKeyHint="done"
                 onChange={(e) => setName(e.target.value)} placeholder="Anthony Edwards"
                 onKeyDown={(e) => e.key === 'Enter' && add()} />
        </div>

        {db.stacks.length > 0 && (
          <div className="field">
            <label htmlFor="grp">Group</label>
            <select id="grp" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">No group</option>
              {db.stacks.map((s) => (
                <option key={s.id} value={s.id}>{groupName(s)}</option>
              ))}
            </select>
          </div>
        )}

        {dup && (
          <div className="flash bad">
            <div>
              <div className="b">{normalizeNumber(number)} is already on a card</div>
              <div className="s">One sticker number, one card. Peel the next one off the roll.</div>
            </div>
          </div>
        )}
        {added && !dup && number === '' && (
          <div className="flash ok">
            <div>
              <div className="b">{added} added</div>
              <div className="s">Price it and fill in the rest whenever you like.</div>
            </div>
          </div>
        )}

        <button className="btn" style={{ marginTop: 13 }} disabled={!ready} onClick={add}>
          Add card
          <span className="sub">The number is all it needs</span>
        </button>

        <button className="btn ghost sm" style={{ marginTop: 9 }} onClick={onNewGroup}>
          {db.stacks.length === 0 ? 'Use groups' : 'New group'}
        </button>
        {db.stacks.length === 0 && (
          <p className="claim">
            Groups fill in year, product and parallel for a whole stack at once. Turn them on
            when you want them — nothing needs one.
          </p>
        )}
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
                ? 'Peel a number, stick it on the sleeve, type it in. Everything else can wait.'
                : 'No card matches this filter.'}
            </div>
          </div>
        ) : shown.map((c) => {
          const stack = db.stacks.find((s) => s.id === c.stackId);
          return (
            <button className="row" key={c.id} onClick={() => onEdit(c.id)}>
              <span className="num">{c.number}</span>
              <span className="mid">
                {/* The number is already in the chip beside this, so an
                    unnamed card says what is MISSING rather than repeating it. */}
                <span className={`t${c.name.trim() === '' && !stack ? ' muted' : ''}`}>
                  {c.name.trim() !== '' ? c.name : stack ? groupName(stack) : 'Unnamed'}
                </span>
                <span className="s">
                  {c.status === 'unpriced' && <span className="pill unpriced">Unpriced</span>}
                  {c.status === 'sold' && <span className="pill sold">Sold</span>}
                  <span className="ctx">
                    {stack ? groupName(stack) : c.name.trim() === '' ? 'Tap to fill in' : ''}
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

function CardDetail({
  card, onDone, onNewGroup,
}: { card: Card; onDone: () => void; onNewGroup: () => void }) {
  const { db, dispatch } = useStore();

  const [name, setName] = useState(card.name);
  const [cardNumber, setCardNumber] = useState(card.cardNumber ?? '');
  const [groupId, setGroupId] = useState(card.stackId ?? '');
  const [price, setPrice] = useState(card.priceCents != null ? centsToInput(card.priceCents) : '');
  const [floor, setFloor] = useState(card.floorCents != null ? centsToInput(card.floorCents) : '');

  const stack = db.stacks.find((s) => s.id === groupId);
  const priceCents = dollarsToCents(price);
  const floorCents = floor.trim() === '' ? null : dollarsToCents(floor);
  const floorTooHigh = floorCents != null && priceCents != null && floorCents > priceCents;
  // A price is not required to save — naming or grouping a card is reason enough.
  const canSave = !floorTooHigh && (price.trim() === '' || (priceCents != null && priceCents > 0));

  const title = composeTitle(stack, name, cardNumber || undefined);

  function save() {
    if (!canSave) return;
    const now = nowIso();
    dispatch({
      type: 'card/edit', cardId: card.id, name: name.trim(),
      cardNumber: cardNumber.trim() || undefined,
      stackId: groupId === '' ? null : groupId, now,
    });
    if (priceCents != null && priceCents > 0) {
      dispatch({
        type: 'card/price', cardId: card.id, priceCents,
        floorCents: floorCents ?? undefined, now,
      });
    }
    onDone();
  }

  return (
    <>
      <header className="screen-head">
        <div>
          <div className="eb">Card {card.number}</div>
          <h1>{card.status === 'unpriced' ? 'Fill it in' : 'Edit card'}</h1>
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
          <input id="d-name" type="text" value={name} placeholder="Anthony Edwards"
                 onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="d-cn">Card number <span className="muted">(optional)</span></label>
          <input id="d-cn" type="text" inputMode="numeric" value={cardNumber}
                 onChange={(e) => setCardNumber(e.target.value)} placeholder="58" />
        </div>
        <div className="field">
          <label htmlFor="d-grp">Group</label>
          {db.stacks.length === 0 ? (
            <button className="btn ghost sm" onClick={onNewGroup}>Create a group</button>
          ) : (
            <select id="d-grp" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">No group</option>
              {db.stacks.map((s) => (
                <option key={s.id} value={s.id}>{groupName(s)}</option>
              ))}
            </select>
          )}
        </div>
        {title !== '' && <p className="claim">Title: {title}</p>}
      </div>

      {name.trim() !== '' && (
        <>
          <a className="evidence" href={compsUrl(stack, name, cardNumber || undefined)}
             target="_blank" rel="noopener noreferrer">
            <span>Check real eBay sold listings</span>
            <span aria-hidden>↗</span>
          </a>
          <p className="claim">
            Market evidence, not a figure this app can know. Read the last handful, then set yours.
          </p>
        </>
      )}

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
        {card.status === 'unpriced' && price.trim() === '' && (
          <p className="claim">
            A card needs a price before it can be sold. You can leave it and come back.
          </p>
        )}
      </div>

      <div className="sticky">
        <button className="btn money" disabled={!canSave} onClick={save}>
          Save {priceCents ? formatCents(priceCents) : ''}
          <span className="sub">
            {card.status === 'unpriced' && priceCents
              ? 'Puts it in the case, ready to sell'
              : 'Stickers are unaffected'}
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
