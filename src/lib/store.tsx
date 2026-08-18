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
import { changedDocs } from './sync/changes';
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
   * The last state that is known to match the server. Comparing against it is
   * what decides the push set — and it is advanced WITHOUT pushing when a
   * change arrived from the server, so an inbound merge cannot echo straight
   * back out as an outbound write.
   */
  const synced = useRef<DB>(db);
  const applyingRemote = useRef(false);

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
    if (!user) return;
    setSyncError(null);

    let off: (() => void) | undefined;
    let cancelled = false;
    void import('./sync/firestore').then(({ watchRecords }) => {
      if (cancelled) return;
      off = watchRecords(user.uid, (partial) => {
        applyingRemote.current = true;
        dispatch({ type: 'db/merge', db: partial });
      });
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, [user]);

  // Push: whatever changed since the last known-server state.
  useEffect(() => {
    const wasRemote = applyingRemote.current;
    applyingRemote.current = false;

    if (!user) {
      synced.current = db;
      return;
    }
    if (wasRemote) {
      // Arrived from the server; it is already there.
      synced.current = db;
      return;
    }

    const refs = changedDocs(synced.current, db);
    if (refs.length === 0) return;

    const pushing = db;
    void import('./sync/firestore')
      .then(({ pushDocs }) => pushDocs(user.uid, pushing, refs))
      .then(() => {
        synced.current = pushing;
        setSyncError(null);
      })
      .catch((error: unknown) => {
        // Leave synced.current alone so the same records retry on the next
        // change, and say so out loud rather than failing quietly.
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
