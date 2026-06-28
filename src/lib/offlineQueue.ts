// Lightweight offline outbound queue (IndexedDB-backed).
// Stores arbitrary payloads while offline; flushes them when back online.

const DB_NAME = "doclocker_offline";
const STORE = "outbox";
const VERSION = 1;

export interface QueuedItem {
  id?: number;
  kind: string;          // e.g. "document_upload", "security_update"
  payload: any;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueue(item: Omit<QueuedItem, "id" | "createdAt">) {
  try {
    const db = await openDb();
    return await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const req = tx.objectStore(STORE).add({ ...item, createdAt: Date.now() });
      req.onsuccess = () => resolve(req.result as number);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("offline enqueue fallback to localStorage", e);
    const arr: QueuedItem[] = JSON.parse(localStorage.getItem("doclocker_outbox") || "[]");
    arr.push({ ...item, createdAt: Date.now() });
    localStorage.setItem("doclocker_outbox", JSON.stringify(arr));
    return arr.length;
  }
}

export async function readAll(): Promise<QueuedItem[]> {
  try {
    const db = await openDb();
    return await new Promise<QueuedItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as QueuedItem[]);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return JSON.parse(localStorage.getItem("doclocker_outbox") || "[]");
  }
}

export async function remove(id: number) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const req = tx.objectStore(STORE).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch { /* ignore */ }
}

type Handler = (item: QueuedItem) => Promise<boolean>;
const handlers: Record<string, Handler> = {};

export function registerHandler(kind: string, h: Handler) {
  handlers[kind] = h;
}

let flushing = false;
export async function flush() {
  if (flushing) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  flushing = true;
  try {
    const items = await readAll();
    for (const item of items) {
      const h = handlers[item.kind];
      if (!h) continue;
      try {
        const ok = await h(item);
        if (ok && item.id != null) await remove(item.id);
      } catch { /* leave queued */ }
    }
  } finally {
    flushing = false;
  }
}

export function initOfflineSync() {
  window.addEventListener("online", () => { flush(); });
  // Periodic best-effort flush
  setInterval(() => { if (navigator.onLine) flush(); }, 60_000);
  // Initial attempt
  if (navigator.onLine) setTimeout(flush, 2000);
}
