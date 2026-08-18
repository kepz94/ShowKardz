/**
 * Receipt photo storage.
 *
 * Images live in IndexedDB, not in the localStorage record: the record is a
 * single JSON string against a ~5 MB budget, and one photo would eat most of
 * it. The record holds only a photo id, so an image that fails to load leaves
 * the expense itself perfectly readable.
 */
const DB_NAME = 'showkardz.photos';
const STORE = 'photos';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

export function putPhoto(id: string, blob: Blob): Promise<unknown> {
  return tx('readwrite', (s) => s.put(blob, id));
}

export function getPhoto(id: string): Promise<Blob | undefined> {
  return tx<Blob | undefined>('readonly', (s) => s.get(id));
}

export function deletePhoto(id: string): Promise<unknown> {
  return tx('readwrite', (s) => s.delete(id));
}
