import { useMemo, useRef, useState } from 'react';
import { useStore, newId, nowIso } from '../lib/store';
import { isDuplicate, isValidNumber, normalizeNumber } from '../lib/numbers';
import { liveCards } from '../lib/cards';
import { downscale, READING } from '../lib/images';
import { putPhoto } from '../lib/photos';
import { prettyBlock } from '../lib/title';
import { orderByStar, toggleStar } from '../lib/stars';
import { stickerCandidate, titleBlocks } from '../lib/stickers';
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
 * which is just a field that remembers its last value, so that is what it is.
 *
 * WHAT THE CAMERA READ IS NOT PARSED. Vision returns each block of text with
 * its own box, so a confirmation sheet lists the blocks and the dealer unticks
 * what they do not want, edits what needs it, and puts them in the order they
 * want. An earlier version sorted them into Year / Product / Team fields, and
 * that is guesswork: deciding which line is the team is wrong on every card
 * whose layout differs, while the person holding the card can see it.
 *
 * Confirming WRITES the kept blocks, in order, into the card name — and the
 * sheet closes for good. They are not left on the form afterwards, because the
 * decision has been made and its answer is sitting in the field. From there the
 * name is an ordinary field the dealer owns and nothing re-derives it behind
 * their back. To revisit the read, retake or re-upload the photo.
 *
 * The group still exists as a fallback for a card typed in with no photo, and
 * for a parallel, which is the one thing a front rarely prints.
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

  /**
   * Every block of text the camera found, in printed order.
   *
   * `kept` starts TRUE on all of them: a good read should cost zero taps, and
   * cleaning up a bad one costs a couple. The other way round would be a tap
   * per line on every card of the night.
   *
   * These are not parsed into year / product / team. That was tried, and
   * deciding which line is the team is guesswork that is wrong on every card
   * whose layout differs — while the dealer is looking straight at the card.
   */
  const [sections, setSections] = useState<
    { id: string; text: string; kept: boolean; star: number | null }[]
  >([]);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  /**
   * The read lands in a confirmation sheet rather than straight onto the form.
   * A read is a claim about the card, and it is worth one deliberate look
   * before it becomes the title — otherwise a bad read is only noticed later,
   * in the Book, on a card you can no longer see.
   */
  const [confirmRead, setConfirmRead] = useState(false);

  /**
   * The block the dealer pointed at as the sticker number, if any.
   *
   * The sticker is on the sleeve when the photo is taken, so its number is
   * usually sitting right there in the read. Tapping # on it beats retyping
   * digits that are already on screen.
   */
  const [numberFrom, setNumberFrom] = useState<string | null>(null);

  /* Starred first in the order they were starred, then printed order. lib/stars.ts. */
  const ordered = orderByStar(sections);

  /**
   * The blocks that are still part of the card's title.
   *
   * A sticker number is how this card is FOUND, not what it IS, so the block
   * that became one drops out here — and because the name, the blocks saved on
   * the record and the eBay query are all built from keptText below, it drops
   * out of all three at once.
   */
  const titled = titleBlocks(ordered, numberFrom);

  const keptText = titled.filter((s) => s.kept).map((s) => s.text.trim()).filter(Boolean);

  /** The name the kept blocks make, in starred-then-printed order. */
  const composedName = keptText.map(prettyBlock).filter(Boolean).join(' ');

  const starCount = titled.filter((s) => s.star != null).length;
  const star = (id: string) => setSections((all) => toggleStar(all, id));

  /**
   * Point at a block to make it the sticker number. One sticker, one card, so
   * assigning a second block releases the first.
   */
  const assignNumber = (id: string, text: string) => {
    setNumberFrom(id);
    setNumber(stickerCandidate(text).digits);
  };

  /** Give the block back to the title, and empty the field it filled. */
  const releaseNumber = () => {
    setNumberFrom(null);
    setNumber('');
  };

  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  /**
   * Whether the name field currently holds what the CAMERA read rather than
   * what the dealer typed. Drives the green styling and nothing else.
   */
  const [read, setRead] = useState({ name: false });
  const [readError, setReadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<{ number: string; label: string } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const numberField = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);

  const cards = useMemo(() => liveCards(db), [db]);
  const dup = isDuplicate(cards, number);
  const priceCents = dollarsToCents(price);
  const floorCents = floor.trim() === '' ? null : dollarsToCents(floor);
  const floorTooHigh = floorCents != null && priceCents != null && floorCents > priceCents;

  const stack: Stack | undefined = db.stacks.find((s) => s.id === groupId);
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

      // Every block it found, all switched on. The dealer unticks what they do
      // not want and edits what needs editing — nothing here decides for them.
      setSections((result?.lines ?? []).map((text, i) => ({
        id: `${Date.now()}-${i}`, text, kept: true, star: null,
      })));
      // A retake builds new blocks with new ids, so any sticker assignment made
      // against the old read is pointing at nothing. Drop it rather than let it
      // silently miss — the number it filled in stays, and is now typed.
      setNumberFrom(null);
      setEditingSection(null);
      if (result?.lines?.length) setConfirmRead(true);

      // The name is the one value the read still fills into a field, because
      // the Book and every list row need one short label per card and a pile of
      // kept blocks is not that. It only ever fills an EMPTY field, so a typed
      // correction survives a retake.
      if (result?.name && name.trim() === '') {
        setName(result.name);
        setRead({ name: true });
      }
      if (result?.cardNumber && cardNumber.trim() === '') setCardNumber(result.cardNumber);

      if (!result?.lines?.length) {
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
    setSections([]);
    setNumberFrom(null);
    setEditingSection(null);
    setConfirmRead(false);
    setRead({ name: false });
    setReadError(null);
    setError(null);
    if (cameraInput.current) cameraInput.current.value = '';
    if (uploadInput.current) uploadInput.current.value = '';
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
      // The blocks the dealer kept, so the title and the eBay query stay
      // specific whether or not the card was filed into a group.
      printed: keptText.length > 0 ? keptText : undefined,
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
      number: clean,
      label: name.trim() !== '' ? name.trim() : 'Unnamed',
    });
    clearForm();
    setBusy(false);
  }

  const pending = number !== '' || name !== '' || price !== '' || floor !== '' || photo !== null;

  /**
   * One row of the read. Rendered in the confirmation sheet and again in the
   * list on the form, so the two can never drift apart — the sheet is the same
   * control, seen once deliberately.
   *
   * The row says "Edit" in words. A tappable-looking string of text is not an
   * obvious edit affordance on a screen where most text is just text.
   */
  const sectionRow = (s: typeof sections[number]) => (
    editingSection === s.id ? (
      <div className="rd edit" key={s.id}>
        <input autoFocus value={s.text} aria-label="Edit what was read"
               onChange={(e) => setSections((xs) => xs.map((x) =>
                 x.id === s.id ? { ...x, text: e.target.value } : x))}
               onKeyDown={(e) => e.key === 'Enter' && setEditingSection(null)} />
        <button className="done" onClick={() => setEditingSection(null)}>Done</button>
      </div>
    ) : s.id === numberFrom ? (
      /*
       * This block is the sticker number now, so it is no longer a piece of the
       * card's title — and the row says so by losing every control that only
       * makes sense for one. There is nothing to keep, nothing to order, and
       * nothing to drop: it belongs to the number at the top of the screen.
       *
       * Edit survives, because a misread is fixed here rather than worked
       * around. What the field will actually hold is the digits, shown full
       * size in the band, so a wrong read is visible before the card is filed.
       */
      <div className="rd assigned" key={s.id}>
        <span className="mark" aria-hidden>#</span>
        <button className="txt" onClick={() => setEditingSection(s.id)}>{s.text}</button>
        <span className="tag">Sticker</span>
        <button className="pen" aria-label={`Edit ${s.text}`}
                onClick={() => setEditingSection(s.id)}>Edit</button>
        <button className="undo" onClick={releaseNumber}
                aria-label={`Stop using ${s.text} as the sticker number`}>Undo</button>
      </div>
    ) : (
      <div className={`rd${s.kept ? ' on' : ' off'}`} key={s.id}>
        <button className="tick" aria-pressed={s.kept}
                aria-label={s.kept ? `Drop ${s.text}` : `Keep ${s.text}`}
                onClick={() => setSections((xs) => xs.map((x) =>
                  x.id === s.id ? { ...x, kept: !x.kept } : x))}>✓</button>
        <button className="txt" onClick={() => setEditingSection(s.id)}>{s.text}</button>
        {/* One tap to put a block in front. The number only appears once there
            is more than one star, because that is when order is ambiguous. */}
        <button className={`star${s.star != null ? ' on' : ''}`}
                aria-pressed={s.star != null}
                aria-label={s.star != null ? `Unstar ${s.text}` : `Put ${s.text} first`}
                onClick={() => star(s.id)}>
          {s.star != null ? '★' : '☆'}
          {s.star != null && starCount > 1 && (
            <span className="ord">{titled.filter((x) => x.star != null).findIndex((x) => x.id === s.id) + 1}</span>
          )}
        </button>
        {/*
          * The sticker is on the sleeve when the photo is taken, so its number
          * is usually right here in the read. Tap # and it becomes the card's
          * number instead of something to retype.
          *
          * Only blocks with a digit in them get one, and a row without it gets
          * no spacer standing in — see styles.css. Holding the column open cost
          * 37px of block text and clipped a two-word player name at 390px.
          */}
        {stickerCandidate(s.text).offerable && (
          <button className="hash" onClick={() => assignNumber(s.id, s.text)}
                  aria-label={`Use ${s.text} as the sticker number`}>#</button>
        )}
        <button className="pen" aria-label={`Edit ${s.text}`}
                onClick={() => setEditingSection(s.id)}>Edit</button>
        <button className="x" aria-label={`Delete ${s.text}`}
                onClick={() => setSections((xs) => xs.filter((x) => x.id !== s.id))}>×</button>
      </div>
    )
  );

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
          <button className="ch" onClick={() => go('collection')}>Make one</button>
        )}
      </div>

      {/*
       * TWO inputs, deliberately.
       *
       * `capture="environment"` does not mean "prefer the camera" on iOS — it
       * means the photo library is unreachable from that input entirely. One
       * input cannot offer both, however the button is labelled. Receipts hit
       * this exact wall and was fixed the same way.
       */}
      <input ref={cameraInput} type="file" accept="image/*" capture="environment"
             style={{ display: 'none' }} aria-hidden tabIndex={-1}
             onChange={(e) => {
               const file = e.target.files?.[0];
               if (file) void capture(file);
             }} />
      <input ref={uploadInput} type="file" accept="image/*"
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
                 onChange={(e) => {
                   setNumber(e.target.value);
                   setJustAdded(null);
                   // Typing wins. If a block was standing in for this number it
                   // is not the sticker any more, so it goes back to the title.
                   setNumberFrom(null);
                 }} />
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

      <button className="btn ghost sm mt2" disabled={busy}
              onClick={() => uploadInput.current?.click()}>
        {photo ? 'Choose a different photo' : 'Upload a photo instead'}
      </button>

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

      {/*
       * WHAT THE CAMERA FOUND, as it found it.
       *
       * Vision returns each block of text with its own box, so there is nothing
       * to infer: the blocks are listed, all switched on, and the dealer unticks
       * the ones they do not want and edits the ones that need it. What stays on
       * is what the title and the eBay search are built from, which is why the
       * search line below updates as they toggle.
       */}
      {/*
       * The blocks live in the confirmation sheet and nowhere else. Once
       * confirmed they ARE the name field, so leaving a list of ticked boxes on
       * the form would be asking the same question twice — the decision is
       * already made and visible in the field below.
       *
       * To revisit it, retake or re-upload the photo: the sheet comes back.
       */}

      <div className="card">
        <div className="field">
          <label htmlFor="s-name">Card name</label>
          {/*
           * A textarea, not an input. Once the read is confirmed this holds
           * everything printed on the card — "Anthony Edwards 2023 Panini Prizm
           * Timberwolves 58" — and a single-line box shows about half of that
           * with the rest scrolled out of sight, which is the worst possible
           * shape for a field the dealer is meant to check and correct.
           */}
          <textarea id="s-name" rows={2} value={name} placeholder="Type the name"
                    className={read.name ? 'from-read' : undefined}
                    onChange={(e) => { setName(e.target.value); setRead({ name: false }); }} />
        </div>

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
          <a className="evidence" href={compsUrl(stack, name, cardNumber || undefined, keptText)}
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
          </div>
        </div>
      )}

      {/*
       * The read, confirmed once before it becomes the title.
       *
       * Everything arrives ticked, so a good read is one tap on "Keep these".
       * The point is that the dealer looks at it while the card is still in
       * their hand — a wrong read noticed later, in the Book, is a card they
       * can no longer see.
       */}
      {confirmRead && (
        <>
          {/* Tapping outside applies what is shown, rather than silently
              dropping the read while leaving the blocks ticked behind it. */}
          <div className="scrim" onClick={() => {
            if (composedName !== '') { setName(composedName); setRead({ name: true }); }
            setConfirmRead(false);
          }} />
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="rd-t">
            <div className="shead">
              <div>
                <h4 id="rd-t">What did it read?</h4>
                <p className="sub">
                  Everything is kept. Untick what you don’t want, tap Edit to fix a line.
                </p>
              </div>
              <span className="cnt">{keptText.length}/{titled.length}</span>
            </div>

            <div className="sbody">
              <div className="reads">{ordered.map(sectionRow)}</div>

              <div className="searchprev mt3">
                <div className="k">Becomes the card name</div>
                <div className={`v${composedName === '' ? ' muted' : ''}`}>
                  {composedName === '' ? 'Nothing kept' : composedName}
                </div>
              </div>
            </div>

            <div className="sfoot">
              <button className="btn ghost" onClick={() => {
                setSections([]);
                setConfirmRead(false);
              }}>Use none</button>
              {/*
               * Confirming WRITES the blocks into the name field, in the order
               * they are in. From here the name is an ordinary field the dealer
               * owns: editing it is not undone by anything re-deriving a title
               * from the blocks behind their back.
               */}
              <button className="btn money" disabled={composedName === ''}
                      onClick={() => {
                        setName(composedName);
                        setRead({ name: true });
                        setConfirmRead(false);
                      }}>
                Keep these
                <span className="sub">{keptText.length} of {titled.length}</span>
              </button>
            </div>
          </div>
        </>
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
