import { useState } from 'react';
import type { Route } from '../App';
import { Back } from '../components/Back';
import { useStore } from '../lib/store';
import { formatCents, pctFromAmount } from '../lib/money';

export function CloseOut({ go }: { go: (r: Route) => void }) {
  const { db } = useStore();
  const [counted, setCounted] = useState('');

  const deals = [...db.deals].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const inCase = db.cards.filter((c) => c.status === 'available');
  const unpriced = db.cards.filter((c) => c.status === 'unpriced');

  // Every figure here is derived from the records. Nothing is read off a counter.
  const takenCents = deals.reduce((sum, d) => sum + d.agreedCents, 0);
  const askedCents = deals.reduce((sum, d) => sum + d.subtotalCents, 0);
  const cardsSold = deals.reduce((sum, d) => sum + d.lines.length, 0);

  const expected = inCase.length;
  const countedNum = counted.trim() === '' ? null : Number(counted.replace(/\D/g, ''));
  const shrink = countedNum == null ? null : expected - countedNum;

  return (
    <>
      <Back go={go} />
      <div className="eb">Step 3 · Close out</div>
      <h1>The day, card by card</h1>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="dl"><span className="muted">Deals</span><span>{deals.length}</span></div>
        <div className="dl"><span className="muted">Cards sold</span><span>{cardsSold}</span></div>
        <div className="dl"><span className="muted">Asked</span><span>{formatCents(askedCents)}</span></div>
        <div className="dl" style={{ fontWeight: 600, fontSize: 16 }}>
          <span>Taken</span><span>{formatCents(takenCents)}</span>
        </div>
        {askedCents > 0 && (
          <p className="claim">
            {pctFromAmount(takenCents, askedCents)}% of your asking prices. Yours alone — never shared,
            never aggregated.
          </p>
        )}
      </div>

      <h2>Day log</h2>
      <div className="list">
        {deals.length === 0 && <div className="empty">No sales yet today.</div>}
        {deals.map((d) => (
          <div key={d.id} style={{ padding: '13px 15px', borderTop: '1px solid var(--hair)' }}>
            <div className="dl" style={{ fontWeight: 600 }}>
              <span>{new Date(d.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
              <span>{formatCents(d.agreedCents)}</span>
            </div>
            <div className="claim" style={{ marginTop: 0, marginBottom: 6 }}>
              {d.lines.length} {d.lines.length === 1 ? 'card' : 'cards'} · asked {formatCents(d.subtotalCents)}
              {' · '}{pctFromAmount(d.agreedCents, d.subtotalCents)}%
            </div>
            {d.lines.map((l) => (
              <div className="dl b" key={l.cardId} style={{ fontSize: 13 }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ fontFamily: 'var(--mono)' }}>{l.number}</span> · {l.title}
                </span>
                <span style={{ whiteSpace: 'nowrap', paddingLeft: 8 }}>
                  {formatCents(l.askCents)} → <b style={{ color: 'var(--ink)' }}>{formatCents(l.realizedCents)}</b>
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <h2>Case audit</h2>
      <p className="lede">
        What the app thinks is still in the case. Count the physical cards and compare — this is
        the shrink check nobody runs today.
      </p>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="dl">
          <span className="muted">App says in the case</span>
          <span style={{ fontWeight: 600 }}>{expected}</span>
        </div>
        {unpriced.length > 0 && (
          <p className="claim">Plus {unpriced.length} entered but never priced.</p>
        )}
        <div style={{ marginTop: 12 }}>
          <label htmlFor="count">Your physical count</label>
          <input id="count" type="tel" inputMode="numeric" value={counted}
                 onChange={(e) => setCounted(e.target.value)} placeholder="0" />
        </div>

        {shrink !== null && (
          <div className={`flash ${shrink === 0 ? 'ok' : 'bad'}`}>
            {shrink === 0
              ? 'The case adds up.'
              : shrink > 0
                ? `${shrink} missing`
                : `${Math.abs(shrink)} more than the app expects`}
            <span>
              {shrink === 0
                ? 'Every card the app expects is on the table.'
                : shrink > 0
                  ? 'Cards the app still has in the case were not counted.'
                  : 'Something on the table was never entered into the app.'}
            </span>
          </div>
        )}
      </div>

      <h2>Still in the case · {inCase.length}</h2>
      <div className="list">
        {inCase.length === 0 && <div className="empty">The case is empty.</div>}
        {inCase.map((c) => (
          <div className="line" key={c.id}>
            <div className="no">{c.number}</div>
            <div className="mid"><div className="nm">{c.name}</div></div>
            <div className="pr">{formatCents(c.priceCents ?? 0)}</div>
          </div>
        ))}
      </div>
    </>
  );
}
