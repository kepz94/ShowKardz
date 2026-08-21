import { liveCards } from '../lib/cards';
import { useState } from 'react';
import type { Route } from '../App';
import { useStore } from '../lib/store';
import { formatCents, pctFromAmount } from '../lib/money';
import { bookSummary } from '../lib/books';
import { showsByDate } from '../lib/shows';
import { prettyDate } from './Shows';

/** The record: what sold, for what, and whether the case still adds up. */
export function Sales({ go }: { go: (r: Route, id?: string) => void }) {
  const { db } = useStore();
  const [counted, setCounted] = useState('');

  const s = bookSummary(db);

  /* Closed shows only: an open one has not finished making its number yet. */
  const closedShows = showsByDate(db).filter((sh) => sh.phase === 'done');

  /* What the calculator did, so the per-show rows and the total reconcile. */
  const unattached = {
    takenCents: db.deals.filter((d) => d.showId == null).reduce((t, d) => t + d.agreedCents, 0),
    dealCount: db.deals.filter((d) => d.showId == null).length,
  };
  const deals = [...db.deals].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const inCase = liveCards(db).filter((c) => c.status === 'available');

  const countedNum = counted.trim() === '' ? null : Number(counted.replace(/\D/g, ''));
  const shrink = countedNum == null ? null : inCase.length - countedNum;

  return (
    <>
      <header className="screen-head">
        <div>
          <div className="eb">Sales</div>
          <h1>The day, card by card</h1>
        </div>
      </header>

      <div className="stats">
        <div className="stat money">
          <div className="k">Taken</div>
          <div className="v">{formatCents(s.takenCents)}</div>
          {s.askedCents > 0 && (
            <div className="s">{pctFromAmount(s.takenCents, s.askedCents)}% of ask</div>
          )}
        </div>
        <div className="stat">
          <div className="k">Deals</div>
          <div className="v">{s.dealCount}</div>
          <div className="s">{s.cardsSold} {s.cardsSold === 1 ? 'card' : 'cards'}</div>
        </div>
        <div className="stat">
          <div className="k">In case</div>
          <div className="v">{inCase.length}</div>
          <div className="s">still to sell</div>
        </div>
      </div>

      {s.askedCents > 0 && (
        <p className="claim">
          Your realized percentage, on your own asking prices. Never shared, never aggregated,
          never sent anywhere.
        </p>
      )}

      {/*
        * Sales is the whole business; a show's own books live inside that show.
        * This is the bridge — one row per show with what it netted, tapping
        * through to the day it happened. Deals with no show are the calculator
        * and are counted in the totals above and in no row here.
        */}
      {closedShows.length > 0 && (
        <>
          <h2>
            <span>By show</span>
            <span className="count">{closedShows.length}</span>
          </h2>
          <div className="list">
            {closedShows.map((sh) => {
              const b = bookSummary(db, sh.id);
              return (
                <button className="grp" key={sh.id} onClick={() => go('shows', sh.id)}>
                  <span className="cnt">{b.cardsSold}</span>
                  <span className="mid">
                    <span className="t">{sh.name}</span>
                    <span className="s">
                      <span className="ctx">
                        {prettyDate(sh.date)} · took {formatCents(b.takenCents)}
                        {b.spentCents > 0 && <> · cost {formatCents(b.spentCents)}</>}
                      </span>
                    </span>
                  </span>
                  <span className={`amt${b.profitCents < 0 ? ' bad' : ''}`}>
                    {formatCents(b.profitCents)}
                  </span>
                </button>
              );
            })}
          </div>
          {unattached.dealCount > 0 && (
            <p className="claim" style={{ marginTop: 9 }}>
              Plus {formatCents(unattached.takenCents)} from {unattached.dealCount}{' '}
              {unattached.dealCount === 1 ? 'deal' : 'deals'} not at a show.
            </p>
          )}
        </>
      )}

      <h2>
        <span>Day log</span>
        <span className="count">{deals.length}</span>
      </h2>

      <div className="list">
        {deals.length === 0 ? (
          <div className="empty">
            <div className="t">No sales yet</div>
            <div className="s">Deals you ring up on the Show screen land here, card by card.</div>
            <button className="btn sm" style={{ marginTop: 14, width: 'auto', display: 'inline-flex' }}
                    onClick={() => go('shows')}>
              Go to Show
            </button>
          </div>
        ) : deals.map((d) => (
          <div key={d.id} style={{ padding: '14px 15px', borderTop: '1px solid var(--line)' }}>
            <div className="dl" style={{ fontWeight: 650, fontSize: 15 }}>
              <span>
                {new Date(d.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                <span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>
                  {' · '}{d.lines.length} {d.lines.length === 1 ? 'card' : 'cards'}
                </span>
              </span>
              <span>{formatCents(d.agreedCents)}</span>
            </div>
            <div className="claim" style={{ margin: '2px 0 9px' }}>
              Asked {formatCents(d.subtotalCents)} · took{' '}
              {pctFromAmount(d.agreedCents, d.subtotalCents)}%
            </div>
            {d.lines.map((l) => (
              <div className="dl b" key={l.cardId} style={{ fontSize: 13, marginTop: 5 }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
                               whiteSpace: 'nowrap' }}>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink2)' }}>{l.number}</span>
                  {' · '}{l.title}
                </span>
                <span style={{ whiteSpace: 'nowrap', paddingLeft: 10 }}>
                  {formatCents(l.askCents)}{' → '}
                  <b style={{ color: 'var(--ink)' }}>{formatCents(l.realizedCents)}</b>
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <h2>Case audit</h2>
      <p className="lede">
        What the app says is still in the case, against a physical count. This is the shrink check
        nobody runs today.
      </p>

      <div className="card">
        <div className="grid2">
          <div>
            <label>App says</label>
            <div style={{ fontSize: 27, fontWeight: 680, letterSpacing: '-.03em' }}>
              {inCase.length}
            </div>
          </div>
          <div>
            <label htmlFor="count">Your count</label>
            <input id="count" type="tel" inputMode="numeric" value={counted}
                   onChange={(e) => setCounted(e.target.value)} placeholder="0" />
          </div>
        </div>

        {shrink !== null && (
          <div className={`flash ${shrink === 0 ? 'ok' : 'bad'}`}>
            <div>
              <div className="b">
                {shrink === 0 ? 'The case adds up'
                  : shrink > 0 ? `${shrink} missing`
                  : `${Math.abs(shrink)} more than expected`}
              </div>
              <div className="s">
                {shrink === 0 ? 'Every card the app expects is on the table.'
                  : shrink > 0 ? 'Cards the app still has in the case were not counted.'
                  : 'Something on the table was never entered into the app.'}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
