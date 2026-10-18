/** Minimal IndexedDB key-value store. Songs carry audio files, too big for localStorage. */

const DB_NAME = 'syncopate'
const STORE = 'kv'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const localdb = {
  get: <T>(key: string) => run<T | undefined>('readonly', (s) => s.get(key)),
  set: (key: string, value: unknown) => run('readwrite', (s) => s.put(value, key)),
  remove: (key: string) => run('readwrite', (s) => s.delete(key)),
  keys: () => run<IDBValidKey[]>('readonly', (s) => s.getAllKeys()).then((k) => k.map(String)),
}
