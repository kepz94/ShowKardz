import { useRef, useState } from 'react';
import { useStore, newId, nowIso } from '../lib/store';
import { isDuplicate, isValidNumber, normalizeNumber } from '../lib/numbers';
import { downscale, READING } from '../lib/images';
import { putPhoto } from '../lib/photos';
import type { CardRead } from '../lib/vision';
import { groupName } from '../lib/groups';
import type { Route } from '../App';

/**
 * Scanning, and nothing else.
 *
 * This screen exists to get cards into the book as fast as a hand can move:
 * peel, stick, type, next. It deliberately shows no collection, no filters and
 * no totals — everything that is not the next card is a reason to look up.
 *
 * The one exception is a GROUP SCAN, where the running batch is the point: you
 * are working a stack under one declaration and need to see what has gone in.
 */
export function Scan({ go }: { go: (r: Route) => void }) {
  const { db, dispatch } = useStore();

  const [number, setNumber] = useState('');
  const [groupScan, setGroupScan] = useState(false);
  const [groupId, setGroupId] = useState('');
  const [batch, setBatch] = useState<string[]>([]);
  const [last, setLast] = useState<string | null>(null);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [read, setRead] = useState<CardRead | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const numberField = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const dup = isDuplicate(db.cards, number);
  const ready = isValidNumber(number) && !dup && !busy;

  const batchCards = batch
    .map((id) => db.cards.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => c !== undefined);

  async function capture(file: File) {
    setBusy(true);
    setError(null);
    setRead(null);
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
    // the photo is safely in hand, and a failure never blocks scanning — the
    // name is typeable, and the number and price never came from here anyway.
    setReading(true);
    try {
      // Give the reader a better image than the one we keep: the stored copy is
      // compressed for a storage budget, and those artefacts are what break a
      // low-contrast foil name. Built from the ORIGINAL file, never from the
      // already-compressed blob — recompressing a compression is worse than either.
      const forReading = await downscale(file, READING);

      /*
       * Vision FIRST when a key exists, on-device only as the no-key fallback.
       *
       * This order is from a real result, not a preference: on actual cards the
       * on-device engine returned about three incoherent letters across five
       * scans. That is what Tesseract is: a DOCUMENT OCR engine, built for flat
       * high-contrast text on paper. A photograph of a card is scene text —
       * textured background, perspective, glare, display fonts — which is a
       * different problem, and the one Vision's TEXT_DETECTION is built for.
       *
       * So the on-device reader no longer runs ahead of Vision, costing a second
       * and a battery hit to produce nothing.
       */
      let result: CardRead | null = null;
      let firstFailure = '';

      const { readCard, visionConfigured } = await import('../lib/vision-api');
      const haveVision = visionConfigured();

      if (haveVision) {
        try {
          result = await readCard(forReading);
        } catch (err) {
          firstFailure = err instanceof Error ? err.message : 'The card could not be read';
        }
      }

      if (!result?.name) {
        try {
          const { readCardOnDevice } = await import('../lib/ocr');
          const local = await readCardOnDevice(forReading);
          if (local.name || (!haveVision && local.cardNumber)) result = local;
        } catch (err) {
          firstFailure ||= err instanceof Error ? err.message : '';
        }
      }

      if (result?.name || result?.cardNumber) {
        setRead(result);
      } else {
        setReadError(firstFailure
          || 'Nothing readable on that photo — fill the frame with the card, '
           + 'flat light, no flash. Or just type the name.');
      }
    } catch (err) {
      setReadError(err instanceof Error ? err.message : 'The card could not be read');
    } finally {
      setReading(false);
    }
  }

  async function add() {
    if (!ready) return;
    setBusy(true);
    const clean = normalizeNumber(number);
    const id = newId();

    let photoId: string | undefined;
    if (photo) {
      photoId = newId();
      try {
        await putPhoto(photoId, photo.blob);
      } catch {
        // The card matters more than its picture: file it either way.
        photoId = undefined;
        setError('The photo could not be stored, so the card was scanned without it.');
      }
    }

    dispatch({
      type: 'card/add', id, number: clean,
      // Whatever the camera could read. Wrong is cosmetic here and fixable in
      // the Book; the number and the price never come from this.
      name: read?.name ?? '',
      cardNumber: read?.cardNumber || undefined,
      stackId: groupScan && groupId ? groupId : undefined,
      photoId, now: nowIso(),
    });

    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto(null);
    setRead(null);
    setReadError(null);
    if (cameraInput.current) cameraInput.current.value = '';
    if (groupScan) setBatch((b) => [id, ...b]);
    setLast(clean);
    setNumber('');
    setBusy(false);
    numberField.current?.focus();
  }

  return (
    <>
      <header className="screen-head">
        <div>
          <div className="eb">Scan</div>
          <h1>{groupScan ? 'Group scan' : 'Scan a card'}</h1>
        </div>
        {groupScan && (
          <div className="aside">
            <div className="k">This batch</div>
            <div className="v">{batchCards.length}</div>
          </div>
        )}
      </header>

      <div className="band">
        <div className="k">Sticker number</div>
        <input id="scan-num" ref={numberField} className="band-input" type="tel"
               inputMode="numeric" value={number} autoFocus enterKeyHint="done"
               placeholder="0455" aria-label="Sticker number"
               onChange={(e) => { setNumber(e.target.value); setLast(null); }}
               onKeyDown={(e) => e.key === 'Enter' && void add()} />
        {dup && <div className="echo bad">{normalizeNumber(number)} is already on a card</div>}
        {last && number === '' && !dup && (
          <div className="echo"><b>{last}</b> scanned<span className="amt">✓</span></div>
        )}
      </div>

      <input ref={cameraInput} type="file" accept="image/*" capture="environment"
             style={{ display: 'none' }} aria-hidden tabIndex={-1}
             onChange={(e) => {
               const file = e.target.files?.[0];
               if (file) void capture(file);
             }} />

      <div className="card" style={{ marginTop: 11 }}>
        {photo ? (
          <div className="row" style={{ padding: 0 }}>
            <img className="thumb" src={photo.url} alt="The card you just photographed" />
            <span className="mid">
              {/* Every outcome says which one it is. A read that found a number
                  but no name used to fall through to "Photo ready", which is
                  indistinguishable from no read at all. */}
              <span className="t">
                {reading ? 'Reading the card…'
                  : read?.name ? read.name
                  : read?.cardNumber ? `Card #${read.cardNumber} — no name found`
                  : 'Photo ready'}
              </span>
              <span className="s">
                <span className="ctx">
                  {reading ? 'Reading the card'
                    : read?.name ? `Read from the card${read.cardNumber ? ` · #${read.cardNumber}` : ''}`
                    : 'Files with this card'}
                </span>
              </span>
            </span>
            <button className="x" aria-label="Remove photo" onClick={() => {
              URL.revokeObjectURL(photo.url);
              setPhoto(null);
              if (cameraInput.current) cameraInput.current.value = '';
            }}>×</button>
          </div>
        ) : (
          <button className="btn ghost sm" disabled={busy}
                  onClick={() => cameraInput.current?.click()}>
            {busy ? 'Working…' : 'Photograph the card — reads the name'}
          </button>
        )}

        {error && (
          <div className="flash bad"><div><div className="b">{error}</div></div></div>
        )}
        {readError && (
          <div className="flash bad">
            <div>
              <div className="b">Could not read the card</div>
              <div className="s">{readError} — the card still scans in, name it in the Book.</div>
            </div>
          </div>
        )}

        <button className="btn" style={{ marginTop: 12 }} disabled={!ready} onClick={() => void add()}>
          Scan it in
          <span className="sub">
            {read?.name ? `As ${read.name}` : 'Number is all it needs — the rest comes later'}
          </span>
        </button>
      </div>

      <div className="card" style={{ marginTop: 11 }}>
        <label className="switch">
          <input type="checkbox" checked={groupScan}
                 onChange={(e) => {
                   setGroupScan(e.target.checked);
                   if (!e.target.checked) setBatch([]);
                 }} />
          <span>
            <span className="t">Group scan</span>
            <span className="s">Everything scanned goes into one group, and the batch stays on screen</span>
          </span>
        </label>

        {groupScan && (
          db.stacks.length === 0 ? (
            <p className="claim">
              No groups yet. Create one in the Book, then come back — or keep scanning without one.
            </p>
          ) : (
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="scan-grp">Scanning into</label>
              <select id="scan-grp" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">No group</option>
                {db.stacks.map((s) => (
                  <option key={s.id} value={s.id}>{groupName(s)}</option>
                ))}
              </select>
            </div>
          )
        )}
      </div>

      {/* The batch is the ONLY collection this screen ever shows, and only
          during a group scan, where seeing what has gone in is the point. */}
      {groupScan && (
        <>
          <h2>
            <span>This batch</span>
            <span className="count">{batchCards.length}</span>
          </h2>
          <div className="list">
            {batchCards.length === 0 ? (
              <div className="empty">
                <div className="t">Nothing scanned yet</div>
                <div className="s">Cards you scan in this batch appear here.</div>
              </div>
            ) : batchCards.map((c) => (
              <div className="row" key={c.id}>
                <span className="num">{c.number}</span>
                <span className="mid">
                  <span className="t muted">Unnamed</span>
                  <span className="s"><span className="ctx">Scanned just now</span></span>
                </span>
              </div>
            ))}
          </div>
          {batchCards.length > 0 && (
            <button className="btn ghost sm" style={{ marginTop: 11 }} onClick={() => go('book')}>
              Fill these in, in the Book
            </button>
          )}
        </>
      )}
    </>
  );
}
