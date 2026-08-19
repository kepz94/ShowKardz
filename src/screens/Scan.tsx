import { useMemo, useRef, useState } from 'react';
import { useStore, newId, nowIso } from '../lib/store';
import { isDuplicate, isValidNumber, normalizeNumber } from '../lib/numbers';
import { liveCards } from '../lib/cards';
import { downscale, READING } from '../lib/images';
import { putPhoto } from '../lib/photos';
import { composeTitle } from '../lib/title';
import { compsUrl } from '../lib/comps';
import { dollarsToCents, formatCents } from '../lib/money';
import type { CardRead } from '../lib/vision';
import { groupName } from '../lib/groups';
import type { Stack } from '../types';
import type { Route } from '../App';

/**
 * Getting a card in — all of it, on one screen.
 *
 * This screen used to be intake only: type a number, file the card, then go to
 * the Book to name it, group it, price it and set a floor. That is two screens
 * and a navigation for every card, and the Book's form is the one that actually
 * finishes the job. So the form lives here now, and the Book is where you go to
 * FIND a card, never where you have to go to finish one.
 *
 * There is no "group scan" mode any more. It was a toggle that changed the
 * whole screen in order to do one thing — put every card in the same group —
 * which is just a field that remembers its last value. The group itself could
 * not be dropped: it supplies the year, product and parallel that the camera
 * cannot read, and those are what make the eBay comps query specific enough to
 * be worth looking at (lib/comps.ts). It carries to the next card until
 * changed, so a run through one stack is declared once and never again.
 *
 * The fast path survives all of it: a sticker number alone still files a card.
 * Every other field is optional and can be left for later.
 */
export function Scan({ go }: { go: (r: Route) => void }) {
  const { db, dispatch } = useStore();

  const [number, setNumber] = useState('');
  /** Sticky across cards: a run through one stack is declared once. */
  const [groupId, setGroupId] = useState('');
  const [name, setName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [price, setPrice] = useState('');
  const [floor, setFloor] = useState('');

  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  /** Whether the name currently in the field came from the camera, not the dealer. */
  const [nameFromRead, setNameFromRead] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<{ id: string; number: string; label: string } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const numberField = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const cards = useMemo(() => liveCards(db), [db]);
  const dup = isDuplicate(cards, number);
  const priceCents = dollarsToCents(price);
  const floorCents = floor.trim() === '' ? null : dollarsToCents(floor);
  const floorTooHigh = floorCents != null && priceCents != null && floorCents > priceCents;

  const stack: Stack | undefined = db.stacks.find((s) => s.id === groupId);
  const title = composeTitle(stack, name, cardNumber || undefined);
  const searchable = name.trim() !== '' || stack !== undefined;

  const ready = isValidNumber(number) && !dup && !busy && !floorTooHigh
    && (price.trim() === '' || (priceCents != null && priceCents > 0));

  async function capture(file: File) {
    setBusy(true);
    setError(null);
    setReadError(null);

    let blob: Blob;
    try {
      blob = await downscale(file);
      if (photo) URL.revokeObjectURL(photo.url);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That image could not be read');
      setBusy(false);
      return;
    }
    setBusy(false);

    // The read is a bonus on top of a card that already exists. It runs after
    // the photo is safely in hand, and a failure never blocks anything — every
    // field it fills is typeable, and the number and price never came from here.
    setReading(true);
    try {
      // Give the reader a better image than the one we keep: the stored copy is
      // compressed for a storage budget, and those artefacts are what break a
      // low-contrast foil name. Built from the ORIGINAL file, never from the
      // already-compressed blob — recompressing a compression is worse than either.
      const forReading = await downscale(file, READING);

      const { readCard, visionConfigured } = await import('../lib/vision-api');

      if (!visionConfigured()) {
        // Say so plainly. Silence here reads as "the feature is broken".
        setReadError('Card reading is not set up on this build — the photo is saved, type the name');
        return;
      }

      let result: CardRead | null = null;
      let failure = '';
      try {
        result = await readCard(forReading);
      } catch (err) {
        failure = err instanceof Error ? err.message : 'The card could not be read';
      }

      // A read only ever FILLS an empty field. It never overwrites something
      // already typed — a correction has to survive a retake.
      let fromRead = false;
      if (result?.name && name.trim() === '') {
        setName(result.name);
        fromRead = true;
      }
      // Captured silently: there is no card-number field on this screen, so this
      // only ever feeds the composed title and the comps query.
      if (result?.cardNumber && cardNumber.trim() === '') setCardNumber(result.cardNumber);
      setNameFromRead(fromRead);

      if (!result?.name && !result?.cardNumber) {
        setReadError(failure
          || 'Nothing readable on that photo — fill the frame with the card, flat light, '
           + 'no flash. Or just type the name.');
      }
    } catch (err) {
      setReadError(err instanceof Error ? err.message : 'The card could not be read');
    } finally {
      setReading(false);
    }
  }

  function clearForm() {
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto(null);
    setName('');
    setCardNumber('');
    setPrice('');
    setFloor('');
    setNameFromRead(false);
    setReadError(null);
    setError(null);
    if (cameraInput.current) cameraInput.current.value = '';
    // groupId is deliberately NOT cleared: the next card is almost always from
    // the same stack, and re-declaring it every time is the friction this
    // screen exists to remove.
    setNumber('');
    numberField.current?.focus();
  }

  async function add() {
    if (!ready) return;
    setBusy(true);
    const clean = normalizeNumber(number);
    const id = newId();
    const now = nowIso();

    let photoId: string | undefined;
    if (photo) {
      photoId = newId();
      try {
        await putPhoto(photoId, photo.blob);
      } catch {
        // The card matters more than its picture: file it either way.
        photoId = undefined;
        setError('The photo could not be stored, so the card went in without it.');
      }
    }

    dispatch({
      type: 'card/add', id, number: clean,
      name: name.trim(),
      cardNumber: cardNumber.trim() || undefined,
      stackId: groupId || undefined,
      photoId, now,
    });

    // Pricing is a second action because it is what moves a card from
    // 'unpriced' to 'available'. Leaving it blank files an unpriced card, which
    // is a legitimate way to get through a stack fast.
    if (priceCents != null && priceCents > 0) {
      dispatch({
        type: 'card/price', cardId: id, priceCents,
        floorCents: floorCents ?? undefined, now,
      });
    }

    setJustAdded({
      id, number: clean,
      label: name.trim() !== '' ? name.trim() : 'Unnamed',
    });
    clearForm();
    setBusy(false);
  }

  function undoLast() {
    if (!justAdded) return;
    dispatch({ type: 'card/delete', cardId: justAdded.id, now: nowIso() });
    setJustAdded(null);
    numberField.current?.focus();
  }

  const pending = number !== '' || name !== '' || price !== '' || floor !== '' || photo !== null;

  return (
    <>
      <header className="screen-head">
        <div>
          <div className="eb">Scan</div>
          <h1>Add a card</h1>
        </div>
        <div className="aside">
          <div className="k">In the book</div>
          <div className="v">{cards.length}</div>
        </div>
      </header>

      {/* The group, pinned. Declared once and carried to every card after it. */}
      <div className="stackbar">
        <div className="grow">
          <div className="k">Filing into</div>
          <div className="v">{stack ? groupName(stack) : 'No group'}</div>
        </div>
        {db.stacks.length > 0 ? (
          <select className="stack-pick" aria-label="Group to file into"
                  value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">No group</option>
            {db.stacks.map((s) => (
              <option key={s.id} value={s.id}>{groupName(s)}</option>
            ))}
          </select>
        ) : (
          <button className="ch" onClick={() => go('book')}>Make one</button>
        )}
      </div>

      <input ref={cameraInput} type="file" accept="image/*" capture="environment"
             style={{ display: 'none' }} aria-hidden tabIndex={-1}
             onChange={(e) => {
               const file = e.target.files?.[0];
               if (file) void capture(file);
             }} />

      {/* The number and the camera side by side: the two ways a card starts. */}
      <div className="console">
        <div className="fld">
          <label htmlFor="scan-num" className="k">Sticker number</label>
          <input id="scan-num" ref={numberField} className="band-input" type="tel"
                 inputMode="numeric" value={number} autoFocus enterKeyHint="next"
                 placeholder="0455"
                 onChange={(e) => { setNumber(e.target.value); setJustAdded(null); }} />
          <div className={`echo${dup ? ' bad' : ''}`}>
            {dup ? `${normalizeNumber(number)} is already on a card`
              : number === '' ? 'Type it off the sticker'
              : <><b>Free</b> — no card on this number</>}
          </div>
        </div>

        <button className={`lens${photo ? '' : ' empty'}`} disabled={busy}
                onClick={() => cameraInput.current?.click()}
                aria-label={photo ? 'Retake the photo' : 'Take a photo of the card'}>
          {photo
            ? <><img src={photo.url} alt="" /><span className="lbl">Retake</span></>
            : <><span className="ico" aria-hidden>◎</span>{busy ? 'Working…' : 'Take photo'}</>}
        </button>
      </div>

      {reading && (
        <div className="flash"><div><div className="b">Reading the card…</div></div></div>
      )}
      {error && (
        <div className="flash bad"><div><div className="b">{error}</div></div></div>
      )}
      {readError && !reading && (
        <div className="flash bad">
          <div>
            <div className="b">Could not read the card</div>
            <div className="s">{readError}</div>
          </div>
        </div>
      )}

      {/* Everything the Book's card form has, so the Book is never a required stop. */}
      <div className="titleprev">
        <div className="k">Listing title</div>
        <div className={`v${title.trim() === '' ? ' muted' : ''}`}>
          {title.trim() === '' ? 'Fills in from the group and the name' : title}
        </div>
      </div>

      <div className="card">
        <div className="field">
          <label htmlFor="s-name">Name on card</label>
          <input id="s-name" type="text" value={name} placeholder="Type the name"
                 className={nameFromRead ? 'from-read' : undefined}
                 onChange={(e) => { setName(e.target.value); setNameFromRead(false); }} />
        </div>

        {/*
         * There is no card-number field here on purpose.
         *
         * Two numbers on one screen read as the same number twice. The sticker
         * number is the card's identity and the dealer types it; the
         * manufacturer's number (#58) is printed on the BACK of most modern
         * base cards, so a front-facing photo never has it in frame, and
         * whether it improves the eBay results at all is still an open
         * question in docs/open-questions.md, waiting on a browser run.
         *
         * So it is captured silently when the read happens to see it, and
         * corrected in the Book on the rare card where it matters. It does not
         * get a box on the screen used two hundred times a night.
         */}

        <div className="grid2">
          <div className="field">
            <label htmlFor="s-price">Your price</label>
            <div className="money-in">
              <span>$</span>
              <input id="s-price" type="tel" inputMode="decimal" value={price} placeholder="0"
                     onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="s-floor">Floor <span className="muted">(least you would take)</span></label>
            <div className="money-in">
              <span>$</span>
              <input id="s-floor" type="tel" inputMode="decimal" value={floor} placeholder="0"
                     onChange={(e) => setFloor(e.target.value)} />
            </div>
          </div>
        </div>

        {floorTooHigh && (
          <div className="claim bad">A floor above your own price would warn on every deal.</div>
        )}

        {searchable ? (
          <a className="evidence" href={compsUrl(stack, name, cardNumber || undefined)}
             target="_blank" rel="noreferrer">
            <span>See eBay solds</span>
            <span className="why">real listings, new tab</span>
          </a>
        ) : (
          <div className="evidence disabled">
            <span>See eBay solds</span>
            <span className="why">needs a name or a group</span>
          </div>
        )}
      </div>

      <div className="addrow">
        {pending && (
          <button className="discard" onClick={() => setConfirmDiscard(true)}
                  aria-label="Discard this card">⌫</button>
        )}
        <button className={`btn${priceCents ? ' money' : ''}`} disabled={!ready}
                onClick={() => void add()}>
          {priceCents ? `Add card — ${formatCents(priceCents)}` : 'Add card'}
          <span className="sub">
            {dup ? 'That sticker number is taken'
              : !isValidNumber(number) ? 'Needs a sticker number'
              : name.trim() !== '' ? `${name.trim()} → the book`
              : 'Unnamed — you can fill it in later'}
          </span>
        </button>
      </div>

      {justAdded && (
        <div className="flash ok justadded">
          <div>
            <div className="b">{justAdded.number} · {justAdded.label} — in the book</div>
            <div className="s">Next card, or undo if that was wrong.</div>
          </div>
          <button className="undo" onClick={undoLast}>Undo</button>
        </div>
      )}

      {confirmDiscard && (
        <>
          <div className="scrim" onClick={() => setConfirmDiscard(false)} />
          <div className="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-t">
            <h4 id="dlg-t">Discard this card?</h4>
            <div className="card-line">
              <span className="n">{number === '' ? '—' : normalizeNumber(number)}</span>
              <span className="t">{name.trim() === '' ? 'Unnamed' : name.trim()}</span>
              {priceCents ? <span className="a">{formatCents(priceCents)}</span> : null}
            </div>
            <p>
              Nothing is filed yet, so this only clears the form
              {photo ? ', including the photo you just took' : ''}. The sticker number stays free.
            </p>
            <div className="acts">
              <button className="btn ghost" onClick={() => setConfirmDiscard(false)}>Keep filling it in</button>
              <button className="btn danger" onClick={() => { clearForm(); setConfirmDiscard(false); }}>
                Discard
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
