/**
 * Standalone (Artifact) storage.
 *
 * Saves are written to two places:
 * - IndexedDB in this browser — fast, works offline, but can be cleared.
 * - The Artifact's `db`, in the viewer's private `data/users/<id>/` subtree —
 *   durable and available on any device where they open the page.
 * Reads merge both and keep the newest copy. Remote writes are skipped when
 * nothing but the clock changed, so the periodic timer save stays local.
 *
 * Uploaded images stay in IndexedDB only (they can be several MB).
 */
import * as local from "../src/lib/storage";
import type { SaveRecord } from "../src/lib/puzzle/types";
import { useCapability } from "./claude";

export {
  newId,
  putImage,
  getImage,
  deleteImage,
  listImages,
  requestPersistence,
  type StoredImage,
} from "../src/lib/storage";

interface DocSnap {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
interface DocRef {
  get(): Promise<DocSnap>;
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}
interface CollRef {
  doc(id: string): DocRef;
  limit(n: number): { get(): Promise<{ docs: DocSnap[] }> };
}
interface Db {
  doc(path: string): { collection(path: string): CollRef };
}
interface User {
  id(): Promise<string | null>;
}

let remotePromise: Promise<CollRef | null> | null = null;

/** The viewer's private saves collection, or null when unavailable. */
function remote(): Promise<CollRef | null> {
  if (!remotePromise) {
    remotePromise = (async () => {
      const [db, user] = await Promise.all([useCapability<Db>("db"), useCapability<User>("user")]);
      if (!db || !user) return null;
      const uid = await user.id().catch(() => null);
      if (!uid) return null;
      try {
        return db.doc(`data/users/${uid}/puzzles`).collection("saves");
      } catch {
        return null;
      }
    })();
  }
  return remotePromise;
}

function within<T>(p: Promise<T>, ms: number): Promise<T | "timeout"> {
  return Promise.race([p, new Promise<"timeout">((r) => setTimeout(() => r("timeout"), ms))]);
}

function changed() {
  window.dispatchEvent(new CustomEvent("mosaicforge:saves-changed"));
}

/** Everything except clock-only fields; used to skip redundant remote writes. */
function signature(r: SaveRecord): string {
  return JSON.stringify([r.state?.pieceGroup, r.state?.groups, r.moves, r.completed, r.progress, r.config]);
}
const remoteSig = new Map<string, string>();
let remoteWritable = true;

function fromDoc(d: DocSnap): SaveRecord | null {
  const v = d.exists ? (d.data() as unknown as SaveRecord | undefined) : undefined;
  return v && v.id && v.config ? v : null;
}

function newest(a?: SaveRecord | null, b?: SaveRecord | null): SaveRecord | undefined {
  if (!a) return b ?? undefined;
  if (!b) return a;
  return b.updatedAt > a.updatedAt ? b : a;
}

export async function listSaves(): Promise<SaveRecord[]> {
  const localList = await local.listSaves().catch(() => [] as SaveRecord[]);
  const fetchRemote = (async () => {
    const coll = await remote();
    if (!coll) return [] as SaveRecord[];
    const snap = await coll.limit(500).get();
    return snap.docs.map(fromDoc).filter((r): r is SaveRecord => !!r);
  })().catch(() => [] as SaveRecord[]);

  const r = await within(fetchRemote, 3500);
  if (r === "timeout") {
    // Show local saves now; refresh the lists once the remote copy arrives.
    void fetchRemote.then((list) => list.length && changed());
    return localList;
  }
  const byId = new Map<string, SaveRecord>();
  for (const s of localList) byId.set(s.id, s);
  for (const s of r) {
    const n = newest(byId.get(s.id), s)!;
    byId.set(s.id, n);
    if (n === s) remoteSig.set(s.id, signature(s));
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getSave(id: string): Promise<SaveRecord | undefined> {
  const [l, r] = await Promise.all([
    local.getSave(id).catch(() => undefined),
    within(
      (async () => {
        const coll = await remote();
        return coll ? fromDoc(await coll.doc(id).get()) : null;
      })().catch(() => null),
      6000,
    ),
  ]);
  const rr = r === "timeout" ? null : r;
  if (rr) remoteSig.set(id, signature(rr));
  return newest(l, rr);
}

export async function putSave(rec: SaveRecord): Promise<void> {
  let ok = false;
  try {
    await local.putSave(rec);
    ok = true;
  } catch {
    /* IndexedDB unavailable — rely on the remote copy */
  }
  const sig = signature(rec);
  if (remoteWritable && remoteSig.get(rec.id) !== sig) {
    const coll = await within(remote(), 4000);
    if (coll && coll !== "timeout") {
      try {
        // Plain JSON (drops undefined fields).
        await coll.doc(rec.id).set(JSON.parse(JSON.stringify(rec)));
        remoteSig.set(rec.id, sig);
        ok = true;
      } catch (e) {
        // A viewer without write access: keep saving locally only.
        if ((e as { code?: string })?.code === "invalid_argument") remoteWritable = false;
      }
    }
  } else if (remoteSig.get(rec.id) === sig) {
    ok = true;
  }
  if (!ok) throw new Error("Could not save progress");
  changed();
}

export async function deleteSave(id: string): Promise<void> {
  await local.deleteSave(id).catch(() => {});
  const coll = await within(remote(), 4000);
  if (coll && coll !== "timeout") await coll.doc(id).delete().catch(() => {});
  remoteSig.delete(id);
  changed();
}
