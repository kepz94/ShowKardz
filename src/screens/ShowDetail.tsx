/**
 * One show, on whichever phase it is in.
 *
 * The three phases are three different screens wearing one route, because they
 * are three different jobs on the same record: get ready, sell, close out. The
 * phase lives on the show rather than in component state, so a process kill at
 * the table reopens the register and not the packing list.
 *
 * Advancing is always the dealer's tap. Nothing here promotes a show on its own
 * — a screen that became a different screen mid-deal, with a buyer waiting,
 * would be the worst possible behaviour this app could have.
 */
import { useState } from 'react';
import { useStore, nowIso } from '../lib/store';
import { liveShows, showBooks, showLeftInCase } from '../lib/shows';
import { packedSummary } from '../lib/packing';
import { formatCents } from '../lib/money';
import { rowLabel } from '../lib/title';
import { liveCards } from '../lib/cards';
import { Prep } from './Prep';
import { Show as Register } from './Show';
import { prettyDate } from './Shows';
import type { Route } from '../lib/route';
import type { Show } from '../types';

export function ShowDetail({ showId, go, onBack, onOpenCard }: {
  showId: string;
  go: (r: Route, id?: string) => void;
  onBack: () => void;
  onOpenCard: (cardId: string) => void;
}) {
  const { db, dispatch } = useStore();
  const show = liveShows(db).find((s) => s.id === showId);

  // A show deleted on another device can land mid-view. Fall back rather than
  // render a screen with no subject.
  if (!show) {
    return (
      <>
        <p className="lede">That show is gone.</p>
        <button className="btn ghost sm" onClick={onBack}>Back to shows</button>
      </>
    );
  }

  const advance = () => dispatch({ type: 'show/advance', showId: show.id, now: nowIso() });

  if (show.phase === 'prep') {
    return (
      <>
        <button className="backlink" onClick={onBack}>← Shows</button>
        <Prep go={go} show={show} onOpenCard={onOpenCard} onDone={advance} />
      </>
    );
  }

  if (show.phase === 'live') {
    return <ShowTime show={show} go={go} onBack={onBack} onClose={advance} />;
  }

  return <PostShow show={show} onBack={onBack} />;
}

/* -------------------------------------------------------------------------- */

/**
 * The table. The register is the whole screen; closing out is deliberately at
 * the bottom, behind a confirmation, because it is the one action here that
 * cannot be undone by tapping again.
 */
function ShowTime({ show, go, onBack, onClose }: {
  show: Show; go: (r: Route, id?: string) => void; onBack: () => void; onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const { db } = useStore();
  const books = showBooks(db, show.id);

  return (
    <>
      <button className="backlink" onClick={onBack}>← Shows</button>
      <Register go={go} showId={show.id} />

      <h2 style={{ marginTop: 26 }}><span>End of the day</span></h2>
      {confirming ? (
        <div className="card">
          <p className="lede" style={{ marginBottom: 12 }}>
            Close <b>{show.name}</b>? It stops being the table and becomes the record —
            {books.dealCount === 0
              ? ' nothing has been sold at it yet.'
              : ` ${books.dealCount} ${books.dealCount === 1 ? 'deal' : 'deals'}, ${formatCents(books.takenCents)}.`}
          </p>
          <button className="btn money" onClick={onClose}>Close the show</button>
          <button className="btn ghost sm" style={{ marginTop: 9 }}
                  onClick={() => setConfirming(false)}>Not yet</button>
        </div>
      ) : (
        <button className="btn ghost wide" onClick={() => setConfirming(true)}>
          Close out this show
        </button>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * What the day actually did.
 *
 * Every figure is derived from the deals stamped with this show's id, so it
 * reads the same in October as it did at the table. The case audit is the
 * question dealers cannot answer today: what does the app think should still be
 * in the case, against what is physically there.
 */
function PostShow({ show, onBack }: { show: Show; onBack: () => void }) {
  const { db } = useStore();
  const books = showBooks(db, show.id);
  const left = showLeftInCase(db, show.id);
  const packed = packedSummary(db, show.packedStackIds);
  const [counted, setCounted] = useState('');

  const countedNum = counted.trim() === '' ? null : Number(counted.trim());
  const missing = countedNum == null || Number.isNaN(countedNum) ? null : left.length - countedNum;

  return (
    <>
      <button className="backlink" onClick={onBack}>← Shows</button>

      <header className="screen-head">
        <div>
          <div className="eb">Closed · {prettyDate(show.date)}</div>
          <h1>{show.name}</h1>
        </div>
      </header>

      <div className="stats two">
        <div className="stat money">
          <div className="k">Took</div>
          <div className="v">{formatCents(books.takenCents)}</div>
          <div className="s">{books.dealCount} {books.dealCount === 1 ? 'deal' : 'deals'}</div>
        </div>
        <div className="stat">
          <div className="k">Cards sold</div>
          <div className="v">{books.cardsSold}</div>
          <div className="s">out of {packed.cardCount + books.cardsSold} carried</div>
        </div>
      </div>

      {/*
        * The day's real discount rate: what was taken against what was ASKED
        * for the cards that actually sold. Dividing by the whole case value
        * would fold in stock that never left the case and label the result a
        * discount rate — a number that means nothing, presented as if it did.
        */}
      {books.askedCents > 0 && (
        <p className="claim" style={{ marginTop: 11 }}>
          Sold at {Math.round((books.takenCents / books.askedCents) * 100)}% of what you
          asked for them.
        </p>
      )}

      <h2>The day, card by card</h2>
      <div className="list">
        {books.dealCount === 0 ? (
          <div className="empty">
            <div className="t">Nothing sold at this show</div>
            <div className="s">It is still a record — the case and the date are kept.</div>
          </div>
        ) : (
          db.deals
            .filter((d) => d.showId === show.id)
            .slice()
            .reverse()
            .flatMap((d) => d.lines.map((l) => {
              /*
               * The LIVE card's name when it still exists, the snapshot title
               * when it does not. The snapshot is the honest record of what was
               * sold, but it is a composed title — group prefix and all — so in
               * a row it renders as "2023 Panini Prizm Anth…" and identifies
               * nothing. Preferring the live name keeps the row readable; the
               * snapshot is what survives a deleted card, which is the case it
               * was stored for.
               */
              const still = liveCards(db).find((c) => c.id === l.cardId);
              const label = still
                ? rowLabel(still, db.stacks.find((s) => s.id === still.stackId))
                : (l.title || 'Unnamed');
              return (
              <div className="row" key={`${d.id}-${l.cardId}`}>
                <span className="num">{l.number}</span>
                <span className="mid">
                  <span className="t">{label}</span>
                  <span className="s"><span className="ctx">asked {formatCents(l.askCents)}</span></span>
                </span>
                <span className="amt">{formatCents(l.realizedCents)}</span>
              </div>
              );
            }))
        )}
      </div>

      {/*
        * The shrink check. The app knows what it thinks is left; only the dealer
        * can count what is actually there, and the difference is the number
        * nobody has today.
        */}
      <h2>Case audit</h2>
      <div className="card">
        <div className="tot two" style={{ marginBottom: 12 }}>
          <div>
            <div className="k">Should be left</div>
            <div className="v">{left.length}</div>
          </div>
          <div>
            <div className="k">Worth</div>
            <div className="v money">
              {formatCents(left.reduce((s, c) => s + (c.priceCents ?? 0), 0))}
            </div>
          </div>
        </div>
        <div className="field">
          <label htmlFor="audit">Count what is physically there</label>
          <input id="audit" type="tel" inputMode="numeric" value={counted}
                 placeholder={String(left.length)}
                 onChange={(e) => setCounted(e.target.value)} />
        </div>
        {missing != null && (
          <p className={`claim${missing > 0 ? ' bad' : ''}`} style={{ marginTop: 10 }}>
            {missing === 0
              ? 'Everything is accounted for.'
              : missing > 0
                ? `${missing} ${missing === 1 ? 'card is' : 'cards are'} unaccounted for.`
                : `${-missing} more than expected — something sold was not marked.`}
          </p>
        )}
      </div>

      {left.length > 0 && (
        <>
          <h2>Still in the case</h2>
          <div className="list">
            {left.map((c) => (
              <div className="row" key={c.id}>
                <span className="num">{c.number}</span>
                <span className="mid">
                  <span className="t">
                    {rowLabel(c, db.stacks.find((s) => s.id === c.stackId))}
                  </span>
                </span>
                <span className="amt">{formatCents(c.priceCents ?? 0)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
