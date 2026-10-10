/**
 * Local persistence.
 *
 * Paint layers are megabytes of binary data, far beyond localStorage's quota,
 * so they live in IndexedDB (gzip-compressed when the browser supports
 * CompressionStream). Lightweight metadata – progress percentages for the
 * gallery, preferences, tutorial state – stays in localStorage.
 */

const DB_NAME = "aquanumerica";
const DB_VERSION = 2;
const STORE = "paintings";
const THUMBS = "thumbnails";
export const META_KEY = "aquanumerica:progress:v1";
export const SAVE_FORMAT = 1;

export interface SavedPainting {
  id: string;
  format: number;
  width: number;
  height: number;
  /** Quantised density buffer (Uint16, 3 per pixel), possibly gzip-compressed. */
  data: Blob;
  compressed: boolean;
  updatedAt: number;
  elapsedMs: number;
}

export interface ProgressMeta {
  percent: number;
  regionsDone: number;
  regionsTotal: number;
  accuracy: number;
  updatedAt: number;
  finished: boolean;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(THUMBS)) db.createObjectStore(THUMBS);
    };
    req.onsuccess = () => {
      openHandle = req.result;
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
/** Resolved handle, so page-hide saves can start a transaction synchronously. */
let openHandle: IDBDatabase | null = null;
function db() {
  dbPromise ??= openDb().catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>, store = STORE): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req.result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

/** Warm up the database connection (call when a studio opens). */
export function prepareStorage() {
  return db().catch(() => null);
}

async function compress(data: Uint16Array): Promise<{ blob: Blob; compressed: boolean }> {
  const raw = new Blob([data.buffer as ArrayBuffer]);
  if (typeof CompressionStream === "undefined") return { blob: raw, compressed: false };
  try {
    const stream = raw.stream().pipeThrough(new CompressionStream("gzip"));
    return { blob: await new Response(stream).blob(), compressed: true };
  } catch {
    return { blob: raw, compressed: false };
  }
}

async function decompress(blob: Blob, compressed: boolean): Promise<Uint16Array> {
  let buf: ArrayBuffer;
  if (compressed) {
    const stream = blob.stream().pipeThrough(new DecompressionStream("gzip"));
    buf = await new Response(stream).arrayBuffer();
  } else {
    buf = await blob.arrayBuffer();
  }
  return new Uint16Array(buf);
}

interface PaintingInput {
  id: string;
  width: number;
  height: number;
  data: Uint16Array;
  elapsedMs: number;
}

export async function savePainting(p: PaintingInput & { thumbnail: Promise<Blob | null> | Blob | null }): Promise<void> {
  const { blob, compressed } = await compress(p.data);
  const record: SavedPainting = {
    id: p.id,
    format: SAVE_FORMAT,
    width: p.width,
    height: p.height,
    data: blob,
    compressed,
    updatedAt: Date.now(),
    elapsedMs: p.elapsedMs,
  };
  await tx("readwrite", (s) => s.put(record));
  const thumb = await Promise.resolve(p.thumbnail).catch(() => null);
  if (thumb) await tx("readwrite", (s) => s.put(thumb, p.id), THUMBS).catch(() => undefined);
}

/**
 * Best-effort save while the page is being hidden or unloaded: no awaits
 * before the write, so the transaction is queued before the page goes away.
 */
export function savePaintingNow(p: PaintingInput): boolean {
  if (!openHandle) return false;
  try {
    const record: SavedPainting = {
      id: p.id,
      format: SAVE_FORMAT,
      width: p.width,
      height: p.height,
      data: new Blob([p.data.buffer as ArrayBuffer]),
      compressed: false,
      updatedAt: Date.now(),
      elapsedMs: p.elapsedMs,
    };
    openHandle.transaction(STORE, "readwrite").objectStore(STORE).put(record);
    return true;
  } catch {
    return false;
  }
}

export async function loadPainting(
  id: string,
): Promise<{ data: Uint16Array; width: number; height: number; elapsedMs: number } | null> {
  try {
    const rec = (await tx("readonly", (s) => s.get(id))) as SavedPainting | undefined;
    if (!rec || rec.format !== SAVE_FORMAT) return null;
    const data = await decompress(rec.data, rec.compressed);
    return { data, width: rec.width, height: rec.height, elapsedMs: rec.elapsedMs ?? 0 };
  } catch {
    return null;
  }
}

export async function loadThumbnail(id: string): Promise<Blob | null> {
  try {
    return ((await tx("readonly", (s) => s.get(id), THUMBS)) as Blob | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function deletePainting(id: string): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(id));
    await tx("readwrite", (s) => s.delete(id), THUMBS);
  } catch {
    /* ignore */
  }
  const all = readProgressMeta();
  delete all[id];
  writeJSON(META_KEY, all);
}

// --- localStorage helpers ------------------------------------------------

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or privacy mode – progress still lives in IndexedDB */
  }
}

export function readProgressMeta(): Record<string, ProgressMeta> {
  return readJSON<Record<string, ProgressMeta>>(META_KEY, {});
}

export function writeProgressMeta(id: string, meta: ProgressMeta) {
  const all = readProgressMeta();
  all[id] = meta;
  writeJSON(META_KEY, all);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("aquanumerica:progress"));
}
