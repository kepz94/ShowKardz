/**
 * PREP — the first phase of a show, as three steps in the order they happen.
 *
 * This is one show's night-before screen, and it exists because the work before a show is
 * not "use the app" — it is a short, finite checklist: price what has no price,
 * put a floor under what needs one, and decide what goes in the car. Each step
 * carries the count that says whether it is done, so the screen answers "am I
 * ready?" without the dealer adding anything up.
 *
 * THE CASE IS PACKED BY GROUP, NOT BY CARD. At a thousand cards a per-card
 * checklist is unusable, and a group is the physical unit that gets picked up
 * and carried anyway. See lib/packing.ts.
 *
 * Every figure here is derived on render. Nothing about readiness is stored, so
 * pricing a card in the Book is reflected the moment you come back.
 */
import { useMemo, useState } from 'react';
import { useStore, nowIso } from '../lib/store';
import { liveCards } from '../lib/cards';
import { groupRows } from '../lib/groups';
import { isPacked, packedSummary } from '../lib/packing';
import { formatCents } from '../lib/money';
import { rowLabel } from '../lib/title';
import type { Card, Show, Stack } from '../types';
import type { Route } from '../lib/route';
import { prettyDate } from './Shows';

/** How many rows of a queue to show before it becomes a wall of text. */
const PREVIEW = 4;

export function Prep({ go, show, onOpenCard, onDone }: {
  go: (r: Route, id?: string) => void;
  show: Show;
  onOpenCard: (cardId: string) => void;
  /** Prep is finished — open the doors. */
  onDone: () => void;
}) {
  const { db, dispatch } = useStore();
  const [showAllUnpriced, setShowAllUnpriced] = useState(false);
  const [showAllFloors, setShowAllFloors] = useState(false);

  const cards = useMemo(() => liveCards(db), [db]);

  /* Step 1: a card with no price cannot be sold, and that is invisible at a table. */
  const unpriced = useMemo(() => cards.filter((c) => c.status === 'unpriced'), [cards]);

  /*
   * Step 2: priced, but with nothing underneath it. A floor is optional by
   * design — this step is a prompt, never a blocker, so it is "done" in the
   * sense of "nothing left to look at", not "every card must have one".
   */
  const needFloors = useMemo(
    () => cards.filter((c) => c.status === 'available' && c.floorCents == null),
    [cards],
  );

  const priced = cards.length - unpriced.length;
  const rows = useMemo(() => groupRows(db), [db]);
  const summary = useMemo(() => packedSummary(db, show.packedStackIds), [db, show.packedStackIds]);

  const pct = cards.length === 0 ? 0 : Math.round((priced / cards.length) * 100);

  /*
   * The step you are actually on: the first one with work left, and step 3 once
   * the first two are clear. It is computed rather than styled as "the first
   * card", because once step 1 is done the highlight has to MOVE — a tint stuck
   * on a finished step points at the wrong thing.
   */
  const activeStep = unpriced.length > 0 ? 1 : needFloors.length > 0 ? 2 : 3;

  return (
    <>
      <header className="screen-head">
        <div>
          <div className="eb">Prep · {prettyDate(show.date)}</div>
          <h1>{show.name}</h1>
        </div>
        <div className="aside">
          <div className="k">Priced</div>
          <div className="v">{priced}/{cards.length}</div>
        </div>
      </header>

      {/* One bar, whole book. The steps below say what to do about it. */}
      <div className="readybar" role="img"
           aria-label={`${priced} of ${cards.length} cards priced`}>
        <div className="fill" style={{ width: `${pct}%` }} />
      </div>

      {cards.length === 0 ? (
        <div className="empty">
          <div className="t">Nothing in the book yet</div>
          <div className="s">Scan a card and it shows up here.</div>
          <button className="btn" onClick={() => go('scan')}>Scan a card</button>
        </div>
      ) : (
        <>
          <Step n={1} title="Price the unpriced"
                count={unpriced.length}
                done="Everything has a price"
                tone="alert" active={activeStep === 1}>
            <Queue cards={unpriced} expanded={showAllUnpriced}
                   onExpand={() => setShowAllUnpriced(true)}
                   onOpen={onOpenCard}
                   stacks={db.stacks}
                   right={() => <span className="need">No price</span>} />
          </Step>

          <Step n={2} title="Set floors"
                count={needFloors.length}
                done="Every priced card has a floor"
                tone="mut" active={activeStep === 2}>
            <p className="stepnote">
              A floor is the least you would take. Optional — skip any you do not want one on.
            </p>
            <Queue cards={needFloors} expanded={showAllFloors}
                   onExpand={() => setShowAllFloors(true)}
                   onOpen={onOpenCard}
                   stacks={db.stacks}
                   right={(c) => <span className="ask">{formatCents(c.priceCents ?? 0)}</span>} />
          </Step>

          <Step n={3} title="Load the case"
                count={rows.length === 0 ? 0 : summary.names.length}
                countLabel="packed"
                done="Nothing packed yet"
                tone="money"
                active={activeStep === 3}
                alwaysOpen>
            {rows.length === 0 ? (
              <p className="stepnote">
                No groups yet. Make one in your collection and it becomes something you can pack.
              </p>
            ) : (
              <div className="packlist">
                {rows.map((r) => {
                  const on = isPacked(show.packedStackIds, r.id);
                  return (
                    <button key={r.id} className={`packrow${on ? ' on' : ''}`}
                            aria-pressed={on}
                            onClick={() => dispatch({
                              type: 'show/pack', showId: show.id, stackId: r.id, now: nowIso(),
                            })}>
                      <span className="tick" aria-hidden>{on ? '✓' : ''}</span>
                      <span className="grow">
                        <span className="nm">{r.name}</span>
                        <span className="sub">
                          {r.cardCount} {r.cardCount === 1 ? 'card' : 'cards'}
                          {r.unpricedCount > 0 && <> · {r.unpricedCount} unpriced</>}
                        </span>
                      </span>
                      <span className="val">{formatCents(r.valueCents)}</span>
                      <span className="where">{on ? 'in the case' : 'staying home'}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </Step>

          {/* What is actually going with you, once the decisions above are made. */}
          <section className="incar" aria-labelledby="incar-t">
            <h2 id="incar-t">Going in the car</h2>
            {summary.cardCount === 0 ? (
              <p className="none">
                Nothing packed. Tick a group above and it shows up here.
              </p>
            ) : (
              <>
                <div className="figs">
                  <div>
                    <div className="k">Cards</div>
                    <div className="v">{summary.cardCount}</div>
                  </div>
                  <div>
                    <div className="k">Worth</div>
                    <div className="v money">{formatCents(summary.valueCents)}</div>
                  </div>
                </div>
                <div className="names">
                  {summary.names.map((n) => <span className="chip" key={n}>{n}</span>)}
                </div>
                {/*
                  * Scoped to the packed groups on purpose. The whole book's
                  * unpriced total is a night-before number; this is the one that
                  * costs a sale, because it is a card you brought and cannot price.
                  */}
                {summary.unpricedCount > 0 && (
                  <p className="warn">
                    <b>{summary.unpricedCount}</b>{' '}
                    {summary.unpricedCount === 1 ? 'card is' : 'cards are'} going with no price on
                    {summary.unpricedCount === 1 ? ' it' : ' them'}. You cannot sell what you
                    cannot price.
                  </p>
                )}
              </>
            )}
          </section>

          {/*
            * Opening the doors is a deliberate act, and it is allowed with an
            * empty case: a dealer who wants to sell straight off the pile
            * should not be blocked by a checklist. The warning above is the
            * honest version of that, not a gate.
            */}
          <button className="btn money wide" onClick={onDone}>
            Open the doors
            <span className="sub">
              {summary.cardCount > 0
                ? `${summary.cardCount} cards · ${formatCents(summary.valueCents)}`
                : 'Nothing packed yet'}
            </span>
          </button>
          <button className="btn ghost wide" onClick={() => go('scan')}>
            Scan more cards
          </button>
        </>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One numbered step. Collapsed to a single done line when its count is zero,
 * because a finished step should take up the space of a tick and no more.
 */
function Step({
  n, title, count, done, tone, countLabel, alwaysOpen, active, children,
}: {
  n: number; title: string; count: number; done: string;
  tone: 'alert' | 'money' | 'mut'; countLabel?: string; alwaysOpen?: boolean;
  /** The step being worked right now — tinted so the eye lands on it first. */
  active?: boolean;
  children: React.ReactNode;
}) {
  const settled = count === 0 && !alwaysOpen;
  return (
    <section className={`step${settled ? ' settled' : ''}${active && !settled ? ' active' : ''}`}>
      <div className="shead">
        <span className="n" aria-hidden>{settled ? '✓' : n}</span>
        <span className="grow">
          <span className="t">{title}</span>
          <span className={`c ${tone}`}>
            {count === 0 ? done : `${count} ${countLabel ?? (count === 1 ? 'card' : 'cards')}`}
          </span>
        </span>
      </div>
      {!settled && <div className="sbody">{children}</div>}
    </section>
  );
}

/** A short list of cards to work through, with the rest behind one tap. */
function Queue({
  cards, stacks, expanded, onExpand, onOpen, right,
}: {
  cards: Card[]; stacks: Stack[]; expanded: boolean; onExpand: () => void;
  onOpen: (id: string) => void; right: (c: Card) => React.ReactNode;
}) {
  const shown = expanded ? cards : cards.slice(0, PREVIEW);
  const hidden = cards.length - shown.length;
  return (
    <div className="queue">
      {shown.map((c) => (
        <button key={c.id} className="qrow" onClick={() => onOpen(c.id)}>
          <span className="num">{c.number}</span>
          <span className="nm">{rowLabel(c, stacks.find((s) => s.id === c.stackId))}</span>
          {right(c)}
        </button>
      ))}
      {hidden > 0 && (
        <button className="more" onClick={onExpand}>
          Show {hidden} more
        </button>
      )}
    </div>
  );
}
