// Offline listening: premium listeners can save a recording into the browser's
// Cache Storage. The player looks there first, so saved sessions start
// instantly and keep playing without a connection.

const CACHE = 'stillness-audio-v1';
const keyFor = (meditationId: string) => `/offline-audio/${meditationId}`;

export function offlineSupported() {
  return typeof window !== 'undefined' && 'caches' in window;
}

export async function isSavedOffline(meditationId: string) {
  if (!offlineSupported()) return false;
  const cache = await caches.open(CACHE);
  return Boolean(await cache.match(keyFor(meditationId)));
}

export async function saveOffline(meditationId: string, src: string) {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const cache = await caches.open(CACHE);
  await cache.put(keyFor(meditationId), response);
}

export async function removeOffline(meditationId: string) {
  if (!offlineSupported()) return;
  const cache = await caches.open(CACHE);
  await cache.delete(keyFor(meditationId));
}

/** A blob: URL for a saved recording, or null if it isn't saved. */
export async function offlineUrl(meditationId: string) {
  if (!offlineSupported()) return null;
  const cache = await caches.open(CACHE);
  const response = await cache.match(keyFor(meditationId));
  if (!response) return null;
  return URL.createObjectURL(await response.blob());
}

export async function listSavedOffline() {
  if (!offlineSupported()) return [];
  const cache = await caches.open(CACHE);
  const keys = await cache.keys();
  return keys.map((request) => new URL(request.url).pathname.split('/').pop()!).filter(Boolean);
}
