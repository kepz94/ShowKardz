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
  createContext, useContext, useEffect, useReducer, useRef, type ReactNode,
} from 'react';
import { EMPTY_DB, type DB } from '../types';
import { reducer, type Action } from './reducer';

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

interface StoreValue {
  db: DB;
  dispatch: (action: Action) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, dispatch] = useReducer(reducer, undefined, load);
  const first = useRef(true);

  useEffect(() => {
    // Don't write back the record we just read.
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => persist(db), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [db]);

  return <StoreContext.Provider value={{ db, dispatch }}>{children}</StoreContext.Provider>;
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
