import { useEffect, useRef, useState } from 'react';
import { useStore, newId, nowIso } from '../lib/store';
import { dollarsToCents, formatCents } from '../lib/money';
import { bookSummary } from '../lib/books';
import { liveReceipts } from '../lib/live';
import { downscale } from '../lib/images';
import { putPhoto, deletePhoto } from '../lib/photos';
import { PhotoThumb } from '../components/PhotoThumb';
import { readStorage, formatBytes, type StorageReport } from '../lib/storage';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../types';

/** Category → its label. Built as a typed record so every lookup is total. */
const LABELS: Record<ExpenseCategory, string> = EXPENSE_CATEGORIES.reduce(
  (acc, c) => ({ ...acc, [c.value]: c.label }),
  {} as Record<ExpenseCategory, string>,
);

/** Money going out. The other half of what a show actually made. */
export function Receipts() {
  const { db, dispatch } = useStore();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('table');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [storage, setStorage] = useState<StorageReport | null>(null);

  // Re-read after every filing, so the figure moves when a photo is added.
  useEffect(() => {
    let cancelled = false;
    readStorage().then((r) => { if (!cancelled) setStorage(r); });
    return () => { cancelled = true; };
  }, [db.receipts.length]);

  const s = bookSummary(db);
  const amountCents = dollarsToCents(amount);
  const ready = amountCents != null && amountCents > 0 && !busy;

  const receipts = liveReceipts(db.receipts).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  async function attach(file: File) {
    setBusy(true);
    setError(null);
    try {
      // Shrink before anything is held: a raw camera shot is several megabytes
      // and none of that detail is needed to read a slip of paper.
      const blob = await downscale(file);
      if (photo) URL.revokeObjectURL(photo.url);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setError('That photo could not be read. Try again, or file the amount without it.');
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
      note: note.trim(), photoId, now: nowIso(),
    });

    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto(null);
    setAmount('');
    setNote('');
    if (fileInput.current) fileInput.current.value = '';
    setBusy(false);
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

        <div className="field">
          <label htmlFor="r-note">Note <span className="muted">(optional)</span></label>
          <input id="r-note" type="text" value={note} onChange={(e) => setNote(e.target.value)}
                 placeholder="Saturday table, hall B" />
        </div>

        {/* capture="environment" opens the rear camera straight from the sheet
            on iOS, while still allowing a pick from the library. */}
        <input ref={fileInput} type="file" accept="image/*" capture="environment"
               style={{ display: 'none' }} aria-hidden tabIndex={-1}
               onChange={(e) => {
                 const file = e.target.files?.[0];
                 if (file) void attach(file);
               }} />

        {photo ? (
          <div className="row" style={{ padding: '12px 0 0' }}>
            <img className="thumb" src={photo.url} alt="The receipt you just photographed" />
            <span className="mid">
              <span className="t">Photo attached</span>
              <span className="s">Filed with this expense</span>
            </span>
            <button className="x" aria-label="Remove photo" onClick={() => {
              URL.revokeObjectURL(photo.url);
              setPhoto(null);
              if (fileInput.current) fileInput.current.value = '';
            }}>×</button>
          </div>
        ) : (
          <button className="btn ghost sm" style={{ marginTop: 12 }} disabled={busy}
                  onClick={() => fileInput.current?.click()}>
            {busy ? 'Working…' : 'Photograph the receipt'}
          </button>
        )}

        {error && (
          <div className="flash bad">
            <div><div className="b">{error}</div></div>
          </div>
        )}

        <button className="btn money" style={{ marginTop: 11 }} disabled={!ready} onClick={save}>
          File {amountCents ? formatCents(amountCents) : 'expense'}
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
