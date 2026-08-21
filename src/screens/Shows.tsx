/**
 * Shows: the ones you have done, the one you are getting ready for, and a
 * calculator for everything that is not a show.
 *
 * A SHOW IS A RECORD, NOT A MODE. This screen exists because "what did
 * Riverside make" has to be answerable in October. Every show is a row with a
 * name and a date; tap it and you get whichever phase it is in — prep the night
 * before, the register at the table, the books once it is closed.
 *
 * THE CALCULATOR IS DELIBERATELY OUTSIDE ALL OF THAT. A dealer sells cards away
 * from shows, and forcing those through a fake show would put junk in the show
 * list forever. Its deals carry no showId, so they count toward Sales and
 * toward no show.
 */
import { useState } from 'react';
import { useStore, newId, nowIso } from '../lib/store';
import { showsByDate } from '../lib/shows';
import { bookSummary } from '../lib/books';
import { packedSummary } from '../lib/packing';
import { formatCents } from '../lib/money';
import type { Show, ShowPhase } from '../types';
import type { Route } from '../lib/route';

/** Today as YYYY-MM-DD in the dealer's own calendar, not UTC. */
export function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** How a date reads in a list. Parsed as local parts — never `new Date(str)`,
 *  which treats a bare YYYY-MM-DD as UTC and shows yesterday west of Greenwich. */
export function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

const PHASE_LABEL: Record<ShowPhase, string> = {
  prep: 'Getting ready',
  live: 'Selling now',
  done: 'Closed',
};

export function Shows({ go, onOpen }: {
  go: (r: Route, id?: string) => void;
  onOpen: (showId: string) => void;
}) {
  const { db } = useStore();
  const [adding, setAdding] = useState(false);

  const shows = showsByDate(db);
  const upcoming = shows.filter((s) => s.phase !== 'done');
  const past = shows.filter((s) => s.phase === 'done');

  if (adding) {
    return <NewShow onDone={(id) => { setAdding(false); if (id) onOpen(id); }} />;
  }

  return (
    <>
      <header className="screen-head">
        <div>
          <div className="eb">Shows</div>
          <h1>Your shows</h1>
        </div>
        <div className="aside">
          <div className="k">Done</div>
          <div className="v">{past.length}</div>
        </div>
      </header>

      <button className="btn" onClick={() => setAdding(true)}>Add a show</button>

      {upcoming.length > 0 && (
        <>
          <h2><span>Coming up</span><span className="count">{upcoming.length}</span></h2>
          <div className="list">
            {upcoming.map((s) => <ShowRow key={s.id} show={s} onOpen={onOpen} />)}
          </div>
        </>
      )}

      {past.length > 0 && (
        <>
          <h2><span>Done</span><span className="count">{past.length}</span></h2>
          <div className="list">
            {/* Most recent first: last weekend is the one you look up. */}
            {[...past].reverse().map((s) => <ShowRow key={s.id} show={s} onOpen={onOpen} />)}
          </div>
        </>
      )}

      {shows.length === 0 && (
        <div className="empty dashed" style={{ marginTop: 14 }}>
          <div className="t">No shows yet</div>
          <div className="s">
            Add one and it walks you through getting ready, selling, and closing out.
          </div>
        </div>
      )}

      {/*
        * Not a show, on purpose. A sale away from a table still needs the deal
        * math, and routing it through an invented show would leave junk in the
        * list above forever.
        */}
      <h2 style={{ marginTop: 26 }}><span>Not at a show</span></h2>
      <button className="grp" onClick={() => go('shows', 'calculator')}>
        <span className="cnt">$</span>
        <span className="mid">
          <span className="t">Deal calculator</span>
          <span className="s">
            <span className="ctx">The same register, with nothing attached to it</span>
          </span>
        </span>
      </button>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function ShowRow({ show, onOpen }: { show: Show; onOpen: (id: string) => void }) {
  const { db } = useStore();
  const books = bookSummary(db, show.id);
  const packed = packedSummary(db, show.packedStackIds);
  const closed = show.phase === 'done';

  return (
    <button className={`grp show-${show.phase}`} onClick={() => onOpen(show.id)}>
      <span className={`cnt${show.phase === 'live' ? ' on' : ''}`}>
        {closed ? books.cardsSold : packed.cardCount}
      </span>
      <span className="mid">
        <span className="t">{show.name}</span>
        <span className="s">
          <span className={`pill phase-${show.phase}`}>{PHASE_LABEL[show.phase]}</span>
          <span className="ctx">{prettyDate(show.date)}</span>
        </span>
      </span>
      {/* A closed show shows what it TOOK; an open one shows what it is carrying. */}
      <span className="amt">
        {closed ? formatCents(books.takenCents) : formatCents(packed.valueCents)}
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */

function NewShow({ onDone }: { onDone: (createdId?: string) => void }) {
  const { dispatch } = useStore();
  const [name, setName] = useState('');
  const [date, setDate] = useState(todayLocal());

  function submit() {
    if (name.trim() === '') return;
    // Hand the id back so the caller drops straight into prep. Making a show is
    // never the goal; getting ready for it is.
    const id = newId();
    dispatch({ type: 'show/add', id, name: name.trim(), date, now: nowIso() });
    onDone(id);
  }

  return (
    <>
      <header className="screen-head">
        <div>
          <div className="eb">Shows</div>
          <h1>Add a show</h1>
        </div>
      </header>

      <p className="lede">
        Name it the way you would say it out loud. The date is what you will search by later.
      </p>

      <div className="card">
        <div className="field">
          <label htmlFor="sh-name">Show name</label>
          <input id="sh-name" type="text" value={name} autoFocus
                 placeholder="Riverside Hall B"
                 onChange={(e) => setName(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        </div>
        <div className="field">
          <label htmlFor="sh-date">Date</label>
          <input id="sh-date" type="date" value={date}
                 onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div className="sticky">
        <button className="btn" disabled={name.trim() === ''} onClick={submit}>
          Start getting ready
        </button>
        <button className="btn ghost sm" style={{ marginTop: 9 }} onClick={() => onDone()}>
          Cancel
        </button>
      </div>
    </>
  );
}
