// Lokale Speicherung: IndexedDB, Fallback localStorage.
const DB_NAME = 'overload';
const STORE = 'kv';
const KEY = 'state';
const LS_KEY = 'overload-state';

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('no idb'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise = null;
function db() {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

export async function loadState() {
  try {
    const d = await db();
    const val = await new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get(KEY);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    if (val) return val;
  } catch (e) { /* Fallback unten */ }
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export async function saveState(state) {
  const copy = JSON.parse(JSON.stringify(state));
  try {
    const d = await db();
    await new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(copy, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return;
  } catch (e) { /* Fallback */ }
  try { localStorage.setItem(LS_KEY, JSON.stringify(copy)); } catch (e) { /* nichts zu tun */ }
}

export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch (e) { /* ignorieren */ }
  return false;
}
