/**
 * The Firestore half of sync: listeners in, changed documents out.
 *
 * Layout is one document per record, under the signing-in user:
 *
 *   users/{uid}/stacks/{stackId}
 *   users/{uid}/cards/{cardId}
 *   users/{uid}/deals/{dealId}
 *   users/{uid}/receipts/{receiptId}
 *   users/{uid}/shows/{showId}
 *
 * Never one document for the inventory. Firestore's hard ceiling is 1 MiB per
 * document, and Scribal crossed it on a single-doc payload — writes 400'd for
 * days while the UI reported "Synced". Five hundred cards in one document walks
 * into the same wall.
 *
 * Photographs are not here at all. Images stay in this device's IndexedDB by
 * decision (ADR-001); only the reference travels.
 */
import {
  collection, doc, onSnapshot, writeBatch, type Unsubscribe,
} from 'firebase/firestore';
import { firestore } from '../firebase';
import { EMPTY_DB, type DB } from '../../types';
import type { DocRef, SyncCollection } from './changes';

const COLLECTIONS: SyncCollection[] = ['stacks', 'cards', 'deals', 'receipts', 'shows'];

/** Firestore rejects undefined field values; absent is expressed by omission. */
function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/**
 * Watch every collection. Each snapshot yields a whole-collection view, which is
 * merged into local state by the caller — the merge rules live in merge-db.ts,
 * not here.
 */
export function watchRecords(
  uid: string,
  onRemote: (collection: SyncCollection, partial: DB) => void,
  onError: (message: string) => void,
): Unsubscribe {
  const unsubscribes = COLLECTIONS.map((name) =>
    onSnapshot(
      collection(firestore, 'users', uid, name),
      (snap) => {
        const records = snap.docs.map((d) => d.data());
        // The collection name rides along: the caller has to know WHICH
        // collection the server just described, and inferring it from which
        // array is non-empty is wrong the moment a collection is legitimately
        // empty — which is every collection on a new account.
        onRemote(name, { ...EMPTY_DB, [name]: records } as DB);
      },
      (error) => {
        // A read that is being DENIED must reach the screen. Logging it to the
        // console closes the incident while the sync bar keeps saying "Syncing"
        // — which is exactly what happened twice while the rules were wrong.
        console.error(`Sync listener failed for ${name}`, error);
        onError(error instanceof Error ? error.message : `Could not read ${name}`);
      },
    ),
  );

  return () => unsubscribes.forEach((off) => off());
}

/**
 * Firestore commits at most 500 operations in one batch, and rejects the whole
 * batch past that. A first upload of an existing collection is exactly the case
 * that crosses it — one card is one document, so a 600-card book is 600 writes.
 */
const BATCH_LIMIT = 500;

/** Write the named records. Offline, these queue in Firestore's cache. */
export async function pushDocs(uid: string, db: DB, refs: DocRef[]): Promise<void> {
  if (refs.length === 0) return;

  // Sequential, not Promise.all: a first upload can be several batches, and
  // firing them together is how a burst of writes turns into a rate-limit
  // rejection at the exact moment the whole book is trying to land.
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(firestore);
    for (const ref of refs.slice(i, i + BATCH_LIMIT)) {
      const record = (db[ref.collection] as { id: string }[]).find((r) => r.id === ref.id);
      if (!record) continue;
      batch.set(doc(firestore, 'users', uid, ref.collection, ref.id), stripUndefined(record));
    }
    await batch.commit();
  }
}
