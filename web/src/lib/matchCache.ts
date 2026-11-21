// This device's copy of the Match data (IndexedDB, one entry per account), so opening the CRM shows Match at
// once and asks the server only for what changed since (lib/matchSync.ts). A copy that's missing, from another
// app version or too old simply isn't used — the app loads everything, as before. Never holds keys or tokens:
// only the same rows the screens show. "Sign out and clear this device" drops it (AuthContext).
import type { MatchRows } from "./matchSync";

const DB = "influenceflow-match";
const STORE = "copies";
/** Bump when the shape of the saved rows changes (a new column the screens need). */
export const CACHE_V = 1;
export type MatchCopy = { v: number; user: string; at: string; rows: MatchRows };

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null); // private mode / storage blocked: no copy, the app loads from the server
    }
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | null): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => { db.close(); resolve(req ? (req.result as T) : null); };
      tx.onerror = tx.onabort = () => { db.close(); resolve(null); };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

export async function readCopy(user: string): Promise<MatchCopy | null> {
  const c = await run<MatchCopy>("readonly", (s) => s.get(user));
  if (!c || c.v !== CACHE_V || c.user !== user || !c.rows || !Array.isArray(c.rows.links)) return null;
  return c;
}
export const saveCopy = (user: string, at: string, rows: MatchRows) => run("readwrite", (s) => s.put({ v: CACHE_V, user, at, rows } satisfies MatchCopy, user)).then(() => undefined);
export const dropCopy = (user: string) => run("readwrite", (s) => s.delete(user)).then(() => undefined);
