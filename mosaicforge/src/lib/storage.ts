/**
 * Local persistence (IndexedDB via idb-keyval).
 *
 * - `saves`: one SaveRecord per puzzle in progress / completed. The board
 *   state is compact (group index per piece + 4 numbers per group), so even
 *   2000-piece saves are small; IndexedDB avoids localStorage's 5 MB cap.
 * - `images`: user-uploaded images stored as Blobs.
 */
import { createStore, del, get, set, values, type UseStore } from "idb-keyval";
import type { SaveRecord } from "./puzzle/types";

let savesStore: UseStore | null = null;
let imagesStore: UseStore | null = null;

function saves(): UseStore {
  if (!savesStore) savesStore = createStore("mosaicforge-saves", "saves");
  return savesStore;
}

function images(): UseStore {
  if (!imagesStore) imagesStore = createStore("mosaicforge-images", "images");
  return imagesStore;
}

/** Notify other components/tabs that saves changed. */
function broadcast() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("mosaicforge:saves-changed"));
  try {
    const bc = new BroadcastChannel("mosaicforge");
    bc.postMessage("saves-changed");
    bc.close();
  } catch {
    /* BroadcastChannel unsupported */
  }
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function getSave(id: string): Promise<SaveRecord | undefined> {
  return get<SaveRecord>(id, saves());
}

export async function putSave(rec: SaveRecord): Promise<void> {
  await set(rec.id, rec, saves());
  broadcast();
}

export async function deleteSave(id: string): Promise<void> {
  await del(id, saves());
  broadcast();
}

/** All saves, most recently played first. */
export async function listSaves(): Promise<SaveRecord[]> {
  const all = await values<SaveRecord>(saves());
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export interface StoredImage {
  id: string;
  title: string;
  blob: Blob;
  thumb: Blob;
  width: number;
  height: number;
  createdAt: number;
}

export async function putImage(img: StoredImage): Promise<void> {
  await set(img.id, img, images());
  window.dispatchEvent(new CustomEvent("mosaicforge:images-changed"));
}

export async function getImage(id: string): Promise<StoredImage | undefined> {
  return get<StoredImage>(id, images());
}

export async function deleteImage(id: string): Promise<void> {
  await del(id, images());
  window.dispatchEvent(new CustomEvent("mosaicforge:images-changed"));
}

export async function listImages(): Promise<StoredImage[]> {
  const all = await values<StoredImage>(images());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* ignore */
  }
}
