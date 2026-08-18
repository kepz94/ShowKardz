/**
 * The Firestore half of sync: listeners in, changed documents out.
 *
 * Layout is one document per record, under the signing-in user:
 *
 *   users/{uid}/stacks/{stackId}
 *   users/{uid}/cards/{cardId}
 *   users/{uid}/deals/{dealId}
 *   users/{uid}/receipts/{receiptId}
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

const COLLECTIONS: SyncCollection[] = ['stacks', 'cards', 'deals', 'receipts'];

/** Firestore rejects undefined field values; absent is expressed by omission. */
function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/**
 * Watch every collection. Each snapshot yields a whole-collection view, which is
 * merged into local state by the caller — the merge rules live in merge-db.ts,
 * not here.
 */
export function watchRecords(uid: string, onRemote: (partial: DB) => void): Unsubscribe {
  const unsubscribes = COLLECTIONS.map((name) =>
    onSnapshot(
      collection(firestore, 'users', uid, name),
      (snap) => {
        const records = snap.docs.map((d) => d.data());
        onRemote({ ...EMPTY_DB, [name]: records } as DB);
      },
      (error) => {
        // Never swallow a sync failure: an error written but never read closes
        // the incident while every surface keeps lying.
        console.error(`Sync listener failed for ${name}`, error);
      },
    ),
  );

  return () => unsubscribes.forEach((off) => off());
}

/** Write the named records. Offline, these queue in Firestore's cache. */
export async function pushDocs(uid: string, db: DB, refs: DocRef[]): Promise<void> {
  if (refs.length === 0) return;

  const batch = writeBatch(firestore);
  for (const ref of refs) {
    const record = (db[ref.collection] as { id: string }[]).find((r) => r.id === ref.id);
    if (!record) continue;
    batch.set(doc(firestore, 'users', uid, ref.collection, ref.id), stripUndefined(record));
  }
  await batch.commit();
}
