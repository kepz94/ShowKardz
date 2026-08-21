import { useEffect, useRef, useState } from 'react';
import { useStore, newId, nowIso } from '../lib/store';
import { currentShow, showsByDate } from '../lib/shows';
import { prettyDate } from './Shows';
import { dollarsToCents, formatCents } from '../lib/money';
import { bookSummary } from '../lib/books';
import { liveReceipts } from '../lib/live';
import { downscale } from '../lib/images';
import { putPhoto, deletePhoto } from '../lib/photos';
import { PhotoThumb } from '../components/PhotoThumb';
import { readStorage, formatBytes, type StorageReport } from '../lib/storage';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../types';

/** Category → its label. Built as a typed record so every lookup is total. */
/** Where an attached image came from. Affects wording only. */
type PhotoSource = 'camera' | 'upload';

const LABELS: Record<ExpenseCategory, string> = EXPENSE_CATEGORIES.reduce(
  (acc, c) => ({ ...acc, [c.value]: c.label }),
  {} as Record<ExpenseCategory, string>,
);

/** Money going out. The other half of what a show actually made. */
export function Receipts() {
  const { db, dispatch } = useStore();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('table');
  /**
   * Which show this expense belongs to, '' for none.
   *
   * Defaults to the show you are on, because the overwhelming case is a table
   * fee paid on arrival at the show you are standing in. An expense with no
   * show is a standing business cost and stays out of every show's profit.
   */
  const [showId, setShowId] = useState('');

  /*
   * Shows worth charging an expense to: everything still open, plus the most
   * recent closed one — a receipt is often logged the evening after, and the
   * show it belongs to has already been closed out by then.
   */
  const shows = showsByDate(db);
  const open = shows.filter((sh) => sh.phase !== 'done');
  const lastClosed = shows.filter((sh) => sh.phase === 'done').slice(-1);
  const chargeable = [...open, ...lastClosed];
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<{ blob: Blob; url: string; source: PhotoSource } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Two inputs, not one. On iOS the `capture` attribute sends you straight to
  // the camera with no way to reach the photo library, so a screenshot is
  // unreachable through a capture input no matter how it is labelled.
  const cameraInput = useRef<HTMLInputElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);

  const [storage, setStorage] = useState<StorageReport | null>(null);

  // Re-read after every filing, so the figure moves when a photo is added.
  useEffect(() => {
    let cancelled = false;
    readStorage().then((r) => { if (!cancelled) setStorage(r); });
    return () => { cancelled = true; };
  }, [db.receipts.length]);

  const s = bookSummary(db);
  /* Preselect the show you are on. Runs on id change only, so it never
     overwrites a choice the dealer made by hand. */
  const currentId = currentShow(db)?.id;
  useEffect(() => { if (currentId) setShowId(currentId); }, [currentId]);

  const amountCents = dollarsToCents(amount);
  const ready = amountCents != null && amountCents > 0 && !busy;

  const receipts = liveReceipts(db.receipts).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  async function attach(file: File, source: PhotoSource) {
    setBusy(true);
    setError(null);
    try {
      // Shrink before anything is held: a camera shot is several megabytes and
      // a full-resolution screenshot is not much better, and none of that
      // detail is needed to read a total off a receipt.
      const blob = await downscale(file);
      if (photo) URL.revokeObjectURL(photo.url);
      setPhoto({ blob, url: URL.createObjectURL(blob), source });
    } catch (err) {
      setError(err instanceof Error
        ? `${err.message}. File the amount without it, or try a different file.`
        : 'That image could not be read. File the amount without it.');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!ready || amountCents == null) return;
    setBusy(true);
    setError(null);

    let photoId: string | undefined;
    try {
      if (photo) {
        photoId = newId();
        await putPhoto(photoId, photo.blob);
      }
    } catch {
      // Storing the image failed; the expense itself is still worth keeping,
      // so it is filed without the picture rather than lost.
      photoId = undefined;
      setError('The photo could not be stored, so the amount was filed without it.');
    }

    dispatch({
      type: 'receipt/add', id: newId(), amountCents, category,
      note: note.trim(), photoId, showId: showId || undefined, now: nowIso(),
    });

    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto(null);
    setAmount('');
    setNote('');
    clearInputs();
    setBusy(false);
  }

  /** Reset both pickers, or re-choosing the same file fires no change event. */
  function clearInputs() {
    if (cameraInput.current) cameraInput.current.value = '';
    if (uploadInput.current) uploadInput.current.value = '';
  }

  function remove(id: string, photoId?: string) {
    dispatch({ type: 'receipt/delete', id, now: nowIso() });
    if (photoId) deletePhoto(photoId).catch(() => {});
  }

  return (
    <>
      <header className="screen-head">
        <div>
          <div className="eb">Receipts</div>
          <h1>What the day cost</h1>
        </div>
      </header>

      <div className="stats">
        <div className="stat">
          <div className="k">Spent</div>
          <div className="v">{formatCents(s.spentCents)}</div>
          <div className="s">{receipts.length} logged</div>
        </div>
        <div className="stat">
          <div className="k">Taken</div>
          <div className="v">{formatCents(s.takenCents)}</div>
          <div className="s">{s.cardsSold} sold</div>
        </div>
        <div className={`stat ${s.profitCents < 0 ? 'loss' : 'money'}`}>
          <div className="k">{s.profitCents < 0 ? 'Down' : 'Profit'}</div>
          <div className="v">{formatCents(s.profitCents)}</div>
          <div className="s">taken − spent</div>
        </div>
      </div>

      <h2>Add an expense</h2>

      <div className="card">
        <div className="grid2">
          <div>
            <label htmlFor="r-amount">Amount</label>
            <div className="money-in">
              <span>$</span>
              <input id="r-amount" type="tel" inputMode="decimal" value={amount}
                     onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div>
            <label htmlFor="r-cat">What for</label>
            <select id="r-cat" value={category}
                    onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/*
          * Only when there are shows to charge it to. A picker with one dead
          * option is a control that teaches the dealer to ignore controls.
          */}
        {chargeable.length > 0 && (
          <div className="field">
            <label htmlFor="r-show">Charge it to</label>
            <select id="r-show" value={showId} onChange={(e) => setShowId(e.target.value)}>
              <option value="">No show — a standing cost</option>
              {chargeable.map((sh) => (
                <option key={sh.id} value={sh.id}>
                  {sh.name} · {prettyDate(sh.date)}
                </option>
              ))}
            </select>
            <p className="claim">
              {showId === ''
                ? 'Counts in Sales, and against no show.'
                : 'Comes off that show\u2019s profit, where it was actually spent.'}
            </p>
          </div>
        )}

        <div className="field">
          <label htmlFor="r-note">Note <span className="muted">(optional)</span></label>
          <input id="r-note" type="text" value={note} onChange={(e) => setNote(e.target.value)}
                 placeholder="Saturday table, hall B" />
        </div>

        {/* capture="environment" goes straight to the rear camera. */}
        <input ref={cameraInput} type="file" accept="image/*" capture="environment"
               style={{ display: 'none' }} aria-hidden tabIndex={-1}
               onChange={(e) => {
                 const file = e.target.files?.[0];
                 if (file) void attach(file, 'camera');
               }} />
        {/* No capture attribute, so iOS offers Photo Library and Files — which
            is where a screenshot or an emailed receipt actually lives. */}
        <input ref={uploadInput} type="file" accept="image/*"
               style={{ display: 'none' }} aria-hidden tabIndex={-1}
               onChange={(e) => {
                 const file = e.target.files?.[0];
                 if (file) void attach(file, 'upload');
               }} />

        {photo ? (
          <div className="row" style={{ padding: '12px 0 0' }}>
            <img className="thumb" src={photo.url} alt="The receipt you just photographed" />
            <span className="mid">
              <span className="t">
                {photo.source === 'camera' ? 'Photo attached' : 'Image attached'}
              </span>
              <span className="s">
                <span className="ctx">Filed with this expense</span>
              </span>
            </span>
            <button className="x" aria-label="Remove image" onClick={() => {
              URL.revokeObjectURL(photo.url);
              setPhoto(null);
              clearInputs();
            }}>×</button>
          </div>
        ) : (
          <div className="grid2 mt3">
            <button className="btn ghost sm" disabled={busy}
                    onClick={() => cameraInput.current?.click()}>
              {busy ? 'Working…' : 'Take a photo'}
            </button>
            <button className="btn ghost sm" disabled={busy}
                    onClick={() => uploadInput.current?.click()}>
              {busy ? 'Working…' : 'Pick a screenshot'}
            </button>
          </div>
        )}
        {!photo && (
          <p className="claim">
            A paper slip, or a screenshot of a digital receipt from your photos or files.
          </p>
        )}

        {error && (
          <div className="flash bad">
            <div><div className="b">{error}</div></div>
          </div>
        )}

        <button className="btn money mt3" disabled={!ready} onClick={save}>
          {amountCents ? `Log ${formatCents(amountCents)} expense` : 'Log the expense'}
          <span className="sub">{LABELS[category]}</span>
        </button>
      </div>

      {s.byCategory.length > 1 && (
        <>
          <h2>Where it went</h2>
          <div className="list">
            {s.byCategory.map((c) => (
              <div className="row" key={c.category}>
                <span className="mid"><span className="t">{LABELS[c.category]}</span></span>
                <span className="amt">{formatCents(c.totalCents)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {storage?.supported && storage.usageBytes != null && (
        <>
          <h2>On this phone</h2>
          <div className="card">
            <div className="dl">
              <span className="muted">Photos and records</span>
              <span>{formatBytes(storage.usageBytes)}</span>
            </div>
            {storage.quotaBytes != null && (
              <div className="dl b">
                <span>Room available</span>
                <span>{formatBytes(storage.quotaBytes)}</span>
              </div>
            )}
            <p className="claim">
              {storage.persisted
                ? 'Photos stay on this phone and are not synced. This device has been granted persistent storage, so they are not evicted for being unused.'
                : 'Photos stay on this phone and are not synced. Persistent storage was not granted — add the app to your Home Screen and use it at least every seven days, or the photos can be cleared.'}
            </p>
          </div>
        </>
      )}

      <h2>
        <span>Logged</span>
        <span className="count">{receipts.length}</span>
      </h2>

      <div className="list">
        {receipts.length === 0 ? (
          <div className="empty">
            <div className="t">Nothing logged</div>
            <div className="s">
              Table fees, gas, cards you bought. Photograph the paper slip and the amount is
              yours to type once.
            </div>
          </div>
        ) : receipts.map((r) => (
          <div className="row" key={r.id}>
            {r.photoId
              ? <PhotoThumb photoId={r.photoId} alt={`Receipt for ${LABELS[r.category]}`} />
              : <span className="num">{LABELS[r.category].slice(0, 3).toUpperCase()}</span>}
            <span className="mid">
              <span className="t">{r.note.trim() === '' ? LABELS[r.category] : r.note}</span>
              <span className="s">
                <span className="ctx">
                  {/* Don't say "Table fee · Table fee" when there is no note. */}
                  {r.note.trim() === '' ? '' : `${LABELS[r.category]} · `}
                  {new Date(r.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                </span>
              </span>
            </span>
            <span className="amt">{formatCents(r.amountCents)}</span>
            <button className="x" aria-label={`Delete ${formatCents(r.amountCents)} expense`}
                    onClick={() => remove(r.id, r.photoId)}>×</button>
          </div>
        ))}
      </div>
    </>
  );
}
