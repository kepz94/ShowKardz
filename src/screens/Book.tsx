import { useMemo, useRef, useState } from 'react';
import { useStore, newId, nowIso } from '../lib/store';
import { composeTitle } from '../lib/title';
import { compsUrl } from '../lib/comps';
import { dollarsToCents, formatCents } from '../lib/money';
import { groupName } from '../lib/groups';
import { downscale } from '../lib/images';
import { putPhoto } from '../lib/photos';
import { PhotoThumb } from '../components/PhotoThumb';
import type { Card, Stack } from '../types';
import type { Route } from '../App';

type Filter = 'all' | 'unpriced' | 'available' | 'sold';

/**
 * The collection. Everything that has ever been scanned lives here, and this is
 * where it gets named, priced, photographed, grouped and found again.
 *
 * Scanning deliberately happens elsewhere: that screen is for getting cards in,
 * this one is for making sense of them.
 */
export function Book({ go }: { go: (r: Route) => void }) {
  const { db } = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [declaring, setDeclaring] = useState(false);

  if (declaring) return <NewGroup onDone={() => setDeclaring(false)} />;

  if (editing) {
    const live = db.cards.find((c) => c.id === editing);
    if (live) return <CardDetail card={live} onDone={() => setEditing(null)} />;
  }
  return <Collection go={go} onEdit={setEditing} onNewGroup={() => setDeclaring(true)} />;
}

/* -------------------------------------------------------------------------- */

function Collection({
  go, onEdit, onNewGroup,
}: { go: (r: Route) => void; onEdit: (id: string) => void; onNewGroup: () => void }) {
  const { db } = useStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [query, setQuery] = useState('');

  const counts = useMemo(() => ({
    all: db.cards.length,
    unpriced: db.cards.filter((c) => c.status === 'unpriced').length,
    available: db.cards.filter((c) => c.status === 'available').length,
    sold: db.cards.filter((c) => c.status === 'sold').length,
  }), [db.cards]);

  const perGroup = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of db.cards) map.set(c.stackId ?? '', (map.get(c.stackId ?? '') ?? 0) + 1);
    return map;
  }, [db.cards]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.cards
      .filter((c) => (filter === 'all' ? true : c.status === filter))
      .filter((c) => groupFilter === 'all' ? true
        : groupFilter === 'none' ? c.stackId == null
        : c.stackId === groupFilter)
      .filter((c) => q === '' || c.name.toLowerCase().includes(q) || c.number.includes(q))
      .slice()
      .reverse();
  }, [db.cards, filter, groupFilter, query]);

  return (
    <>
      <header className="screen-head">
        <div>
          <div className="eb">Book</div>
          <h1>Your collection</h1>
        </div>
        <div className="aside">
          <div className="k">In the case</div>
          <div className="v">{counts.available}</div>
        </div>
      </header>

      {counts.all === 0 ? (
        <div className="list">
          <div className="empty">
            <div className="t">Nothing in the book yet</div>
            <div className="s">
              Scanned cards land here, ready to be named, priced and grouped.
            </div>
            <button className="btn sm" style={{ marginTop: 14, width: 'auto', display: 'inline-flex' }}
                    onClick={() => go('scan')}>
              Go to Scan
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="seg" role="group" aria-label="Filter by state">
            {(['all', 'unpriced', 'available', 'sold'] as Filter[]).map((f) => (
              <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f === 'unpriced' ? 'Unpriced' : f === 'available' ? 'In case' : 'Sold'}
                {' '}{counts[f]}
              </button>
            ))}
          </div>

          <div className="field">
            <label htmlFor="grp-filter">Group</label>
            <select id="grp-filter" value={groupFilter}
                    onChange={(e) => setGroupFilter(e.target.value)}>
              <option value="all">Every group ({counts.all})</option>
              <option value="none">No group ({perGroup.get('') ?? 0})</option>
              {db.stacks.map((s) => (
                <option key={s.id} value={s.id}>
                  {groupName(s)} ({perGroup.get(s.id) ?? 0})
                </option>
              ))}
            </select>
          </div>

          <button className="btn ghost sm" style={{ marginTop: 11 }} onClick={onNewGroup}>
            {db.stacks.length === 0 ? 'Create a group' : 'New group'}
          </button>

          {counts.all > 6 && (
            <div className="field" style={{ marginTop: 11 }}>
              <input type="search" value={query} placeholder="Search a name or number"
                     aria-label="Search the book" onChange={(e) => setQuery(e.target.value)} />
            </div>
          )}

          <h2>
            <span>Cards</span>
            <span className="count">{shown.length}</span>
          </h2>

          <div className="list">
            {shown.length === 0 ? (
              <div className="empty">
                <div className="t">Nothing here</div>
                <div className="s">No card matches this filter.</div>
              </div>
            ) : shown.map((c) => {
              const stack = db.stacks.find((s) => s.id === c.stackId);
              return (
                <button className="row" key={c.id} onClick={() => onEdit(c.id)}>
                  {c.photoId
                    ? <PhotoThumb photoId={c.photoId} alt={`Card ${c.number}`} />
                    : <span className="num">{c.number}</span>}
                  <span className="mid">
                    <span className={`t${c.name.trim() === '' && !stack ? ' muted' : ''}`}>
                      {c.name.trim() !== '' ? c.name : stack ? groupName(stack) : 'Unnamed'}
                    </span>
                    <span className="s">
                      {c.status === 'unpriced' && <span className="pill unpriced">Unpriced</span>}
                      {c.status === 'sold' && <span className="pill sold">Sold</span>}
                      <span className="ctx">
                        {c.photoId ? `${c.number} · ` : ''}
                        {stack ? groupName(stack) : c.name.trim() === '' ? 'Tap to fill in' : ''}
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
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

function NewGroup({ onDone }: { onDone: () => void }) {
  const { dispatch } = useStore();
  const [year, setYear] = useState('');
  const [product, setProduct] = useState('');
  const [parallel, setParallel] = useState('Base');

  return (
    <>
      <header className="screen-head">
        <div>
          <div className="eb">Book</div>
          <h1>New group</h1>
        </div>
      </header>

      <p className="lede">
        A group supplies what a camera cannot read — year, product, parallel — to every card in
        it, so titles compose themselves. Optional: cards work perfectly well without one.
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

function CardDetail({ card, onDone }: { card: Card; onDone: () => void }) {
  const { db, dispatch } = useStore();

  const [name, setName] = useState(card.name);
  const [cardNumber, setCardNumber] = useState(card.cardNumber ?? '');
  const [groupId, setGroupId] = useState(card.stackId ?? '');
  const [price, setPrice] = useState(card.priceCents != null ? centsToInput(card.priceCents) : '');
  const [floor, setFloor] = useState(card.floorCents != null ? centsToInput(card.floorCents) : '');
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  /**
   * Making a group happens INLINE, never by navigating away. Leaving this
   * screen unmounts it and takes every unsaved field with it — the same class
   * of loss the constraints doc warns about for the price pass.
   */
  const [newGroup, setNewGroup] = useState<{ year: string; product: string } | null>(null);

  const stack: Stack | undefined = db.stacks.find((s) => s.id === groupId);
  const priceCents = dollarsToCents(price);
  const floorCents = floor.trim() === '' ? null : dollarsToCents(floor);
  const floorTooHigh = floorCents != null && priceCents != null && floorCents > priceCents;
  const canSave = !floorTooHigh && (price.trim() === '' || (priceCents != null && priceCents > 0))
    && !busy;

  const title = composeTitle(stack, name, cardNumber || undefined);

  async function attach(file: File) {
    setBusy(true);
    try {
      const blob = await downscale(file);
      if (photo) URL.revokeObjectURL(photo.url);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
    } catch {
      /* handled by leaving the existing photo in place */
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!canSave) return;
    setBusy(true);
    const now = nowIso();

    let photoId: string | undefined;
    if (photo) {
      photoId = newId();
      try {
        await putPhoto(photoId, photo.blob);
      } catch {
        photoId = undefined;
      }
    }

    dispatch({
      type: 'card/edit', cardId: card.id, name: name.trim(),
      cardNumber: cardNumber.trim() || undefined,
      stackId: groupId === '' ? null : groupId, photoId, now,
    });
    if (priceCents != null && priceCents > 0) {
      dispatch({
        type: 'card/price', cardId: card.id, priceCents,
        floorCents: floorCents ?? undefined, now,
      });
    }
    if (photo) URL.revokeObjectURL(photo.url);
    setBusy(false);
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

      <input ref={photoInput} type="file" accept="image/*" capture="environment"
             style={{ display: 'none' }} aria-hidden tabIndex={-1}
             onChange={(e) => {
               const file = e.target.files?.[0];
               if (file) void attach(file);
             }} />

      <div className="card">
        <div className="row" style={{ padding: 0 }}>
          {photo
            ? <img className="thumb" src={photo.url} alt="The card you just photographed" />
            : card.photoId
              ? <PhotoThumb photoId={card.photoId} alt={`Card ${card.number}`} />
              : <span className="thumb absent">No photo</span>}
          <span className="mid">
            <span className="t">{photo ? 'New photo ready' : card.photoId ? 'Photographed' : 'No photo'}</span>
            <span className="s"><span className="ctx">Stays on this device</span></span>
          </span>
          <button className="btn ghost sm" style={{ width: 'auto' }} disabled={busy}
                  onClick={() => photoInput.current?.click()}>
            {card.photoId || photo ? 'Replace' : 'Add'}
          </button>
        </div>
      </div>

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
          {db.stacks.length > 0 && (
            <select id="d-grp" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">No group</option>
              {db.stacks.map((s) => (
                <option key={s.id} value={s.id}>{groupName(s)}</option>
              ))}
            </select>
          )}

          {newGroup ? (
            <div className="subform">
              <div className="grid2">
                <div>
                  <label htmlFor="ng-year">Year</label>
                  <input id="ng-year" type="text" inputMode="numeric" value={newGroup.year}
                         onChange={(e) => setNewGroup({ ...newGroup, year: e.target.value })}
                         placeholder="2023" />
                </div>
                <div>
                  <label htmlFor="ng-product">Product</label>
                  <input id="ng-product" type="text" value={newGroup.product}
                         onChange={(e) => setNewGroup({ ...newGroup, product: e.target.value })}
                         placeholder="Panini Prizm" />
                </div>
              </div>
              <div className="grid2" style={{ marginTop: 11 }}>
                <button className="btn ghost sm" onClick={() => setNewGroup(null)}>Cancel</button>
                <button className="btn sm"
                        disabled={newGroup.year.trim() === '' && newGroup.product.trim() === ''}
                        onClick={() => {
                          const id = newId();
                          dispatch({
                            type: 'stack/add', id, year: newGroup.year.trim(),
                            product: newGroup.product.trim(), parallel: 'Base', now: nowIso(),
                          });
                          setGroupId(id);
                          setNewGroup(null);
                        }}>
                  Create
                </button>
              </div>
            </div>
          ) : (
            <button className="btn ghost sm" style={{ marginTop: db.stacks.length > 0 ? 9 : 0 }}
                    onClick={() => setNewGroup({ year: '', product: '' })}>
              {db.stacks.length === 0 ? 'Create a group' : 'New group'}
            </button>
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
        <button className="btn money" disabled={!canSave} onClick={() => void save()}>
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
