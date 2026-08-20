import { liveCards } from '../lib/cards';
import { useMemo, useRef, useState } from 'react';
import { useStore, newId, nowIso } from '../lib/store';
import { composeTitle } from '../lib/title';
import { compsUrl } from '../lib/comps';
import { dollarsToCents, formatCents } from '../lib/money';
import { cardsInGroup, groupName, groupRows, NO_GROUP, statsFor, totalInCase } from '../lib/groups';
import { isPacked } from '../lib/packing';
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
export function Book({ go, openCardId }: {
  go: (r: Route, cardId?: string) => void;
  /**
   * A card to open on arrival, carried in the URL by Prep. It is read as the
   * INITIAL editing state rather than watched, so closing the editor does not
   * fight the hash that opened it — and because it lives in the address, a
   * process kill mid-edit reopens the same card instead of the group list.
   */
  openCardId?: string;
}) {
  const { db } = useStore();
  const [editing, setEditing] = useState<string | null>(openCardId ?? null);
  const [declaring, setDeclaring] = useState(false);
  const [renaming, setRenaming] = useState<Stack | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  if (declaring) {
    return (
      <NewGroup onDone={(createdId) => {
        setDeclaring(false);
        if (createdId != null) setOpenGroup(createdId);
      }} />
    );
  }
  if (renaming) return <NewGroup existing={renaming} onDone={() => setRenaming(null)} />;

  if (editing) {
    const live = liveCards(db).find((c) => c.id === editing);
    if (live) return <CardDetail card={live} onDone={() => setEditing(null)} />;
  }

  if (openGroup != null) {
    return (
      <GroupDetail groupId={openGroup} onBack={() => setOpenGroup(null)}
                   onEdit={setEditing} onRename={setRenaming} />
    );
  }

  return (
    <Collection go={go} onEdit={setEditing} onNewGroup={() => setDeclaring(true)}
                onOpenGroup={setOpenGroup} />
  );
}

/* -------------------------------------------------------------------------- */

function Collection({
  go, onEdit, onNewGroup, onOpenGroup,
}: {
  go: (r: Route) => void;
  onEdit: (id: string) => void;
  onNewGroup: () => void;
  onOpenGroup: (id: string) => void;
}) {
  const { db } = useStore();
  /*
   * THE BOOK IS GROUPS. A group is what gets carried, packed and totalled, so
   * it is the only thing this screen lists.
   *
   * SEARCH IS THE EXCEPTION, and it is not a second view — it is the answer to
   * the one question groups cannot answer: "where is 455". You cannot drill
   * into a group to find a card whose group you do not know, so typing here
   * searches every card in the book and the list becomes those cards until the
   * box is cleared.
   */
  const [query, setQuery] = useState('');

  // Deleted cards stay in db.cards as tombstones so the sync merge can see
  // them. Everything below counts and lists only the live ones — lib/cards.ts.
  const cards = useMemo(() => liveCards(db), [db]);

  const q = query.trim().toLowerCase();
  const searching = q !== '';

  const hits = useMemo(() => {
    if (q === '') return [];
    return cards
      .filter((c) => c.name.toLowerCase().includes(q) || c.number.includes(q))
      .slice()
      .reverse();
  }, [cards, q]);

  return (
    <>
      <header className="screen-head">
        <div>
          <div className="eb">Book</div>
          <h1>Your groups</h1>
        </div>
        {/* What the case is WORTH, since that is what every row below adds up to. */}
        <div className="aside">
          <div className="k">In the case</div>
          <div className="v">{formatCents(totalInCase(db))}</div>
        </div>
      </header>

      {cards.length === 0 ? (
        <div className="list">
          <div className="empty">
            <div className="t">Nothing in the book yet</div>
            <div className="s">
              Cards you add land here, ready to search, reprice and sell from.
            </div>
            <button className="btn sm" style={{ marginTop: 14, width: 'auto', display: 'inline-flex' }}
                    onClick={() => go('scan')}>
              Add your first card
            </button>
          </div>
        </div>
      ) : (
        <>
          {/*
            * Always present, never behind a tab. A dealer looking for one card
            * does not know which group it is in — that is the whole reason they
            * are looking — so the way to find it cannot be inside a group.
            */}
          <div className="field">
            <input type="search" value={query} placeholder="Find a card by name or number"
                   aria-label="Find a card in the book"
                   onChange={(e) => setQuery(e.target.value)} />
          </div>

          {searching ? (
            <>
              <h2>
                <span>Matches</span>
                <span className="count">{hits.length}</span>
              </h2>
              <div className="list">
                {hits.length === 0 ? (
                  <div className="empty">
                    <div className="t">No card matches “{query.trim()}”</div>
                    <div className="s">Try part of a name, or the number off the sticker.</div>
                  </div>
                ) : hits.map((c) => <CardRow key={c.id} card={c} onEdit={onEdit} />)}
              </div>
              <button className="btn ghost sm" style={{ marginTop: 12 }} onClick={() => setQuery('')}>
                Back to groups
              </button>
            </>
          ) : (
            <GroupList onOpen={onOpenGroup} onNewGroup={onNewGroup} />
          )}
        </>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One card, as a row. Shared by the collection and by a group's card list so the
 * two cannot drift — the same card has to read identically wherever it appears.
 */
function CardRow({ card: c, onEdit, inGroup }: {
  card: Card;
  onEdit: (id: string) => void;
  /**
   * Rendered inside a group, where naming the group on every row says the same
   * thing as the heading above it. The floor goes there instead — the number
   * that actually changes how the card gets sold.
   */
  inGroup?: boolean;
}) {
  const { db } = useStore();
  const stack = db.stacks.find((s) => s.id === c.stackId);
  return (
    <button className="row" onClick={() => onEdit(c.id)}>
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
            {inGroup
              ? (c.floorCents != null
                  ? `Floor ${formatCents(c.floorCents)}`
                  : c.status === 'available' ? 'No floor' : '')
              : stack ? groupName(stack) : c.name.trim() === '' ? 'Tap to fill in' : ''}
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
}

/* -------------------------------------------------------------------------- */

/**
 * Every group with what it holds.
 *
 * The money on a row is what that group is still worth IN THE CASE — a sold card
 * drops out of both the count and the total, because its money is realized and
 * belongs on the sales screen. See lib/groups.ts.
 */
function GroupList({ onOpen, onNewGroup }: { onOpen: (id: string) => void; onNewGroup: () => void }) {
  const { db } = useStore();
  const rows = useMemo(() => groupRows(db), [db]);

  return (
    <>
      <p className="lede" style={{ marginTop: 11 }}>
        {rows.length} {rows.length === 1 ? 'group' : 'groups'} · tap one to see its cards
      </p>

      <h2>
        <span>Groups</span>
        <span className="count">{rows.length}</span>
      </h2>

      <div className="list">
        {rows.length === 0 ? (
          <div className="empty">
            <div className="t">No groups yet</div>
            <div className="s">
              A group is a name over a run of cards — “2023 Prizm”, “Dollar box” — so you can
              total them together.
            </div>
          </div>
        ) : rows.map((r) => {
          const packed = isPacked(db.packedStackIds, r.id);
          return (
            <button className={`grp${packed ? ' packed' : ''}`}
                    key={r.id === '' ? '__none' : r.id} onClick={() => onOpen(r.id)}>
              <span className={`cnt${packed ? ' on' : ''}`}>{r.cardCount}</span>
              <span className="mid">
                <span className={`t${r.ungrouped ? ' muted' : ''}`}>{r.name}</span>
                {/*
                  * BOTH OF THESE ARE PILLS, not subline text. Packed state was
                  * tried in the subline and it clipped behind the value on a
                  * narrow phone — a state you cannot see is a state you do not
                  * have. A pill keeps its own box and wraps instead of hiding.
                  */}
                <span className="s">
                  {packed && <span className="pill packed">Packed</span>}
                  {r.unpricedCount > 0 && (
                    <span className="pill unpriced">{r.unpricedCount} unpriced</span>
                  )}
                  <span className="ctx">{r.cardCount} in case</span>
                </span>
              </span>
              <span className="amt">{formatCents(r.valueCents)}</span>
            </button>
          );
        })}
      </div>

      <button className="btn ghost sm" style={{ marginTop: 12 }} onClick={onNewGroup}>
        + New group
      </button>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One group: what it is worth, then what is in it.
 *
 * The ungrouped bucket lands here too. It cannot be renamed and cards cannot be
 * added TO it — "no group" is the absence of a group, not a place — so those two
 * controls are simply absent rather than present and dead.
 */
function GroupDetail({
  groupId, onBack, onEdit, onRename,
}: {
  groupId: string;
  onBack: () => void;
  onEdit: (id: string) => void;
  onRename: (s: Stack) => void;
}) {
  const { db } = useStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [assigning, setAssigning] = useState(false);

  const stack = db.stacks.find((s) => s.id === groupId);
  const ungrouped = groupId === NO_GROUP;

  // A group deleted on another device can land mid-view. Fall back rather than
  // render a screen with no subject.
  if (!ungrouped && !stack) return <><p className="lede">That group is gone.</p>
    <button className="btn ghost sm" onClick={onBack}>Back to groups</button></>;

  const cards = cardsInGroup(db, groupId);
  const stats = statsFor(cards);
  const counts = {
    all: cards.length,
    unpriced: cards.filter((c) => c.status === 'unpriced').length,
    available: cards.filter((c) => c.status === 'available').length,
    sold: cards.filter((c) => c.status === 'sold').length,
  };
  const shown = cards
    .filter((c) => (filter === 'all' ? true : c.status === filter))
    .slice()
    .reverse();

  if (assigning && stack) {
    return <AssignCards stack={stack} onDone={() => setAssigning(false)} />;
  }

  return (
    <>
      {/* At the top, where a back control is looked for — the one at the bottom
          is a long scroll away once a group has any cards in it. */}
      <button className="backlink" onClick={onBack}>← Groups</button>

      <header className="screen-head">
        <div>
          <div className="eb">Book · group</div>
          <h1>{ungrouped ? 'No group' : groupName(stack!)}</h1>
        </div>
      </header>

      <div className="tot two">
        <div>
          <div className="k">In case</div>
          <div className="v money">{formatCents(stats.valueCents)}</div>
        </div>
        <div>
          <div className="k">Cards</div>
          <div className="v">{stats.cardCount}</div>
        </div>
      </div>

      {stats.unpricedCount > 0 && (
        <p className="claim" style={{ marginTop: 9 }}>
          {stats.unpricedCount} still unpriced, so the total is short.
        </p>
      )}

      <div className="seg" role="group" aria-label="Filter by state" style={{ marginTop: 12 }}>
        {(['all', 'unpriced', 'available', 'sold'] as Filter[]).map((f) => (
          <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f === 'unpriced' ? 'Unpriced' : f === 'available' ? 'In case' : 'Sold'}
            {' '}{counts[f]}
          </button>
        ))}
      </div>

      <h2>
        <span>Cards</span>
        <span className="count">{shown.length}</span>
      </h2>

      <div className="list">
        {cards.length === 0 ? (
          /* Truly empty, so the answer is "put something in it". A filter that
             matched nothing is a different situation and gets a different line. */
          <div className="empty dashed">
            <div className="t">This group is empty</div>
            <div className="s">Nothing is filed under {ungrouped ? 'no group' : 'this name'} yet.</div>
            {!ungrouped && (
              <button className="btn sm" style={{ marginTop: 14, width: 'auto', display: 'inline-flex' }}
                      onClick={() => setAssigning(true)}>
                Add a card to this group
              </button>
            )}
          </div>
        ) : shown.length === 0 ? (
          <div className="empty">
            <div className="t">Nothing here</div>
            <div className="s">No card in this group matches the filter.</div>
          </div>
        ) : shown.map((c) => <CardRow key={c.id} card={c} onEdit={onEdit} inGroup />)}
      </div>

      {!ungrouped && (
        <>
          <button className="btn ghost sm" style={{ marginTop: 12 }} onClick={() => setAssigning(true)}>
            Add cards to this group
          </button>
          <button className="btn ghost sm" style={{ marginTop: 9 }} onClick={() => onRename(stack!)}>
            Rename group
          </button>
        </>
      )}
      <button className="btn ghost sm" style={{ marginTop: 9 }} onClick={onBack}>
        Back to groups
      </button>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * File a pile of cards into a group in one pass.
 *
 * A card's group can already be changed one at a time by opening it, which is
 * right when you are looking at that card. This is for the other case: a stack
 * that was scanned first and filed after, where doing it card by card means
 * leaving and re-entering the same screen thirty times.
 *
 * Cards already in this group are not listed. They are the answer to a question
 * nobody is asking here, and every row shown is a row that has to be read.
 */
function AssignCards({ stack, onDone }: { stack: Stack; onDone: () => void }) {
  const { db, dispatch } = useStore();
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const candidates = useMemo(
    () => liveCards(db).filter((c) => c.stackId !== stack.id).slice().reverse(),
    [db, stack.id],
  );

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <header className="screen-head">
        <div>
          <div className="eb">Book · group</div>
          <h1>Add to {groupName(stack)}</h1>
        </div>
        <div className="aside">
          <div className="k">Picked</div>
          <div className="v">{picked.size}</div>
        </div>
      </header>

      {candidates.length === 0 ? (
        <>
          <div className="list">
            <div className="empty">
              <div className="t">Every card is already in this group</div>
              <div className="s">There is nothing left to add.</div>
            </div>
          </div>
          <button className="btn ghost sm" style={{ marginTop: 12 }} onClick={onDone}>Back</button>
        </>
      ) : (
        <>
          <p className="lede">Every card not already in this group. Tick what belongs.</p>

          <div className="list">
            {candidates.map((c) => {
              const from = db.stacks.find((s) => s.id === c.stackId);
              const on = picked.has(c.id);
              return (
                <button className="chk" key={c.id} onClick={() => toggle(c.id)}
                        aria-pressed={on}>
                  <span className={`box${on ? ' on' : ''}`} aria-hidden="true">{on ? '✓' : ''}</span>
                  <span className="mid">
                    <span className="t">
                      {c.name.trim() !== '' ? c.name : `Card ${c.number}`}
                    </span>
                    <span className="s">
                      {c.number} · {from ? groupName(from) : 'No group'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="sticky">
            <button className="btn money" disabled={picked.size === 0}
                    onClick={() => {
                      dispatch({
                        type: 'cards/assign', cardIds: [...picked],
                        stackId: stack.id, now: nowIso(),
                      });
                      onDone();
                    }}>
              {picked.size === 0
                ? 'Pick some cards'
                : `File ${picked.size} ${picked.size === 1 ? 'card' : 'cards'} into ${groupName(stack)}`}
            </button>
            <button className="btn ghost sm" style={{ marginTop: 9 }} onClick={() => onDone()}>Cancel</button>
          </div>
        </>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Making a group. One field, because a group is one thing: a name.
 *
 * It used to ask for year, product and parallel as three separate boxes, on the
 * theory that a group supplies what the camera cannot read. That forced a year
 * and a product onto every group whether or not either applied, and made
 * "Dollar box" impossible to say. See the note on Stack in types.ts.
 */
function NewGroup({ onDone, existing }: {
  /** Called with the new group's id on create, so the caller can open it. */
  onDone: (createdId?: string) => void;
  existing?: Stack;
}) {
  const { dispatch } = useStore();
  const [name, setName] = useState(existing ? groupName(existing) : '');
  const renaming = existing != null;

  function submit() {
    if (name.trim() === '') return;
    if (renaming) {
      dispatch({ type: 'stack/rename', stackId: existing.id, name: name.trim(), now: nowIso() });
      onDone();
      return;
    }
    // Making a group is never the goal — filling it is. Hand the id back so the
    // caller drops straight into it instead of returning to a list to find it.
    const id = newId();
    dispatch({ type: 'stack/add', id, name: name.trim(), now: nowIso() });
    onDone(id);
  }

  return (
    <>
      <header className="screen-head">
        <div>
          <div className="eb">Book</div>
          <h1>{renaming ? 'Rename group' : 'New group'}</h1>
        </div>
      </header>

      <p className="lede">
        A group is a name you put on a run of cards, so you can find them and total them together.
      </p>

      <div className="card">
        <div className="field">
          <label htmlFor="g-name">Group name</label>
          <input id="g-name" type="text" value={name} autoFocus
                 onChange={(e) => setName(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                 placeholder="Saturday table" />
          <p className="claim">Anything you would actually say — 2023 Prizm, Dollar box, Case 2.</p>
        </div>
      </div>

      <div className="sticky">
        <button className="btn" disabled={name.trim() === ''} onClick={submit}>
          {renaming ? 'Save name' : 'Create group'}
        </button>
        <button className="btn ghost sm" style={{ marginTop: 9 }} onClick={() => onDone()}>Cancel</button>
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
  const [newGroup, setNewGroup] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const stack: Stack | undefined = db.stacks.find((s) => s.id === groupId);
  const priceCents = dollarsToCents(price);
  const floorCents = floor.trim() === '' ? null : dollarsToCents(floor);
  const floorTooHigh = floorCents != null && priceCents != null && floorCents > priceCents;
  const canSave = !floorTooHigh && (price.trim() === '' || (priceCents != null && priceCents > 0))
    && !busy;

  // The blocks kept at scan time travel with the card, so the title and the
  // eBay link here match what Scan showed. Without this they silently differ.
  const title = composeTitle(stack, name, cardNumber || undefined, card.printed);
  // Anything at all to search on: the printed name, or the group's product.
  const searchable = name.trim() !== '' || stack !== undefined;

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
          <h1>Edit card</h1>
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

          {newGroup != null ? (
            <div className="subform">
              <label htmlFor="ng-name">Group name</label>
              <input id="ng-name" type="text" value={newGroup} autoFocus
                     onChange={(e) => setNewGroup(e.target.value)}
                     placeholder="Saturday table" />
              <div className="grid2" style={{ marginTop: 11 }}>
                <button className="btn ghost sm" onClick={() => setNewGroup(null)}>Cancel</button>
                <button className="btn sm" disabled={newGroup.trim() === ''}
                        onClick={() => {
                          const id = newId();
                          dispatch({ type: 'stack/add', id, name: newGroup.trim(), now: nowIso() });
                          setGroupId(id);
                          setNewGroup(null);
                        }}>
                  Create
                </button>
              </div>
            </div>
          ) : (
            <button className="btn ghost sm" style={{ marginTop: db.stacks.length > 0 ? 9 : 0 }}
                    onClick={() => setNewGroup('')}>
              {db.stacks.length === 0 ? 'Create a group' : 'New group'}
            </button>
          )}
        </div>
        {title !== '' && <p className="claim">Title: {title}</p>}
      </div>

      {/* ALWAYS on screen. Hiding this until a name was typed made it invisible
          on every freshly scanned card — which, now that scanning creates cards
          from the number alone, is most of them. With nothing to search on it
          says what it needs, rather than vanishing and reading as "not built". */}
      {searchable ? (
        <a className="evidence" href={compsUrl(stack, name, cardNumber || undefined, card.printed)}
           target="_blank" rel="noopener noreferrer">
          <span>Check real eBay sold listings</span>
          <span aria-hidden>↗</span>
        </a>
      ) : (
        <div className="evidence disabled">
          <span>Check real eBay sold listings</span>
          <span className="why">Add a name or a group first</span>
        </div>
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
        {card.status === 'unpriced' && price.trim() === '' && (
          <p className="claim">
            A card needs a price before it can be sold. You can leave it and come back.
          </p>
        )}
      </div>

      <div className="sticky addrow">
        <button className="discard" aria-label="Delete this card"
                onClick={() => setConfirmDelete(true)}>⌫</button>
        <button className="btn money" disabled={!canSave} onClick={() => void save()}>
          Save card
          <span className="sub">
            {card.status === 'unpriced' && priceCents
              ? `Priced at ${formatCents(priceCents)} — goes in the case`
              : priceCents
                ? `Priced at ${formatCents(priceCents)} — the sticker is unaffected`
                : 'Stays unpriced until you give it a price'}
          </span>
        </button>
      </div>

      {confirmDelete && (
        <>
          <div className="scrim" onClick={() => setConfirmDelete(false)} />
          <div className="dlg" role="dialog" aria-modal="true" aria-labelledby="del-t">
            <h4 id="del-t">Delete this card?</h4>
            <div className="card-line">
              <span className="n">{card.number}</span>
              <span className="t">{name.trim() === '' ? 'Unnamed' : name.trim()}</span>
              {card.priceCents ? <span className="a">{formatCents(card.priceCents)}</span> : null}
            </div>
            <p>
              It leaves the book and the case audit, and{' '}
              <b>sticker number {card.number} becomes free to use again</b>.
              {card.status === 'sold'
                ? ' This card already sold — that sale keeps its own record in Sales either way.'
                : ''}
            </p>
            <div className="acts">
              <button className="btn ghost" onClick={() => setConfirmDelete(false)}>Keep it</button>
              <button className="btn danger" onClick={() => {
                dispatch({ type: 'card/delete', cardId: card.id, now: nowIso() });
                setConfirmDelete(false);
                onDone();
              }}>Delete card</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/** Cents back into something a price field can hold. */
function centsToInput(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}
