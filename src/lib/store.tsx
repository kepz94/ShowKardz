/**
 * Persistence and the React seam over it.
 *
 * v1 keeps the record in localStorage. The SRD's end state is Firestore as the
 * record with local as a cache — that swap lands here and nowhere else: replace
 * load/persist with a Firestore document read/write and run incoming remote
 * cards through mergeCard (lib/merge.ts), which already implements the
 * sold-wins rule this app syncs by.
 *
 * Writes are debounced, never per-keystroke: the reducer runs on every action,
 * but the record is written on a pause.
 */
import {
  createContext, useContext, useEffect, useReducer, useRef, useState,
  type ReactNode,
} from 'react';
import { EMPTY_DB, type DB } from '../types';
import { reducer, type Action } from './reducer';
import { changedDocs, withPushed, type SyncCollection } from './sync/changes';
// Type-only: erased at compile time, so it pulls no Firebase code into this chunk.
import type { User } from './firebase';

const KEY = 'showkardz.db.v1';
const PERSIST_DEBOUNCE_MS = 400;

/** Read the record. A corrupt or absent record cold-starts empty, never crashes. */
export function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY_DB;
    const parsed = JSON.parse(raw) as Partial<DB>;
    return {
      stacks: parsed.stacks ?? [],
      cards: parsed.cards ?? [],
      deals: parsed.deals ?? [],
      // Optional-first: a record written before receipts existed reads as a
      // book with no expenses, and behaves exactly as it did before.
      receipts: parsed.receipts ?? [],
      // Optional-first, same as receipts: a record written before shows existed
      // reads as a book with no shows and behaves exactly as it did before.
      shows: parsed.shows ?? [],
    };
  } catch {
    return EMPTY_DB;
  }
}

function persist(db: DB): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    // Quota or private-mode failure. The in-memory record still works for this
    // session; surfacing it is the job of the error banner when sync lands.
  }
}

export type SyncStatus =
  /** No account: records live on this device only. Fully usable. */
  | 'local'
  /** Signed in, listeners attached, writes flowing (or queued offline). */
  | 'synced'
  /** A write or listener failed. Never silent. */
  | 'error';

interface StoreValue {
  db: DB;
  dispatch: (action: Action) => void;
  user: User | null;
  status: SyncStatus;
  /** Set when status is 'error', for display. */
  syncError: string | null;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, dispatch] = useReducer(reducer, undefined, load);
  const first = useRef(true);

  const [user, setUser] = useState<User | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  /**
   * WHAT THE SERVER ACTUALLY HAS — built from the listener's own snapshots,
   * never from local state.
   *
   * The previous version tracked "the last state we believe is synced" and
   * seeded it from whatever was already on the device at launch. Two things
   * fell through that:
   *
   *   1. Signing in AFTER building a collection uploaded nothing. At the moment
   *      of sign-in the marker equalled the local record, so the comparison
   *      found no difference and every existing card stayed on one phone
   *      forever, while the bar said "Syncing".
   *   2. A local edit that landed in the same render as an incoming snapshot
   *      was treated as having come from the server, marked as already sent,
   *      and never pushed — with nothing failing.
   *
   * Comparing against the server's own answer removes both: a record the
   * server has never described is unsent, whatever else happened.
   */
  const serverHas = useRef<DB>(EMPTY_DB);
  /**
   * Collections the listener has actually reported on.
   *
   * Pushing before the first snapshot would send the whole book on every launch
   * — the server's copy is only "empty" because nothing has described it yet.
   * A snapshot arrives immediately from Firestore's local cache, offline
   * included, so this fills within a moment of signing in.
   */
  const described = useRef<Set<SyncCollection>>(new Set());

  useEffect(() => {
    // Don't write back the record we just read.
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => persist(db), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [db]);

  /**
   * Flush before the process can die.
   *
   * iOS kills PWA processes constantly and gives no warning beyond this: a card
   * entered and then backgrounded within the debounce window would otherwise be
   * gone. `pagehide` is the reliable signal on Safari — `beforeunload` is not —
   * and visibilitychange covers the app being swiped away without unloading.
   */
  useEffect(() => {
    const flush = () => persist(db);
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [db]);

  /**
   * Firebase is loaded AFTER first paint, never as part of it. The SDK is most
   * of a megabyte and the app is fully usable without it — records come from
   * localStorage, and sync is an enhancement that attaches a moment later.
   */
  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    void import('./firebase')
      .then(({ watchAuth }) => {
        if (!cancelled) off = watchAuth(setUser);
      })
      .catch(() => setSyncError('Could not load sync'));
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  // Pull: remote collections merge in under the rules in merge-db.ts.
  useEffect(() => {
    if (!user) {
      // A different account may sign in next, and nothing of this one's is on
      // its server. Forget what we knew rather than assume it carries over.
      serverHas.current = EMPTY_DB;
      described.current = new Set();
      return;
    }
    setSyncError(null);

    let off: (() => void) | undefined;
    let cancelled = false;
    void import('./sync/firestore')
      .then(({ watchRecords }) => {
        if (cancelled) return;
        off = watchRecords(
          user.uid,
          (name, partial) => {
            serverHas.current = { ...serverHas.current, [name]: partial[name] };
            described.current = new Set(described.current).add(name);
            dispatch({ type: 'db/merge', db: partial });
          },
          // A listener that is being denied is a sync failure like any other.
          (message) => setSyncError(message),
        );
      })
      .catch(() => setSyncError('Could not start syncing'));
    return () => {
      cancelled = true;
      off?.();
    };
  }, [user]);

  // Push: everything the server has not described, including records that
  // existed on this device long before anyone signed in.
  useEffect(() => {
    if (!user) return;

    const refs = changedDocs(serverHas.current, db)
      // Only collections the listener has reported on. Before that, "the server
      // does not have it" is an assumption rather than an answer.
      .filter((ref) => described.current.has(ref.collection));
    if (refs.length === 0) return;

    const pushing = db;
    void import('./sync/firestore')
      .then(({ pushDocs }) => pushDocs(user.uid, pushing, refs))
      .then(() => {
        serverHas.current = withPushed(serverHas.current, pushing, refs);
        setSyncError(null);
      })
      .catch((error: unknown) => {
        // serverHas is left alone, so these records are still unsent and the
        // next change retries them. Say so out loud rather than failing quietly.
        setSyncError(error instanceof Error ? error.message : 'Sync failed');
      });
  }, [db, user]);

  const status: SyncStatus = syncError ? 'error' : user ? 'synced' : 'local';

  return (
    <StoreContext.Provider value={{ db, dispatch, user, status, syncError }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useStore must be used inside StoreProvider');
  return v;
}

/** Ids are generated at the call site so the reducer stays pure. */
export function newId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
}

export function nowIso(): string {
  return new Date().toISOString();
}
