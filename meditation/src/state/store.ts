import { useSyncExternalStore } from 'react';
import {
  clearAllData,
  DEFAULT_SETTINGS,
  loadHistory,
  loadSettings,
  mergeHistory,
  newId,
  saveHistory,
  saveSettings,
} from '../lib/storage';
import type { SessionRecord, Settings } from '../lib/types';

/** A tiny observable value persisted to localStorage on every change. */
function createStore<T>(initial: T, persist: (value: T) => void) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      persist(next);
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const settingsStore = createStore<Settings>(loadSettings(), saveSettings);
const historyStore = createStore<SessionRecord[]>(loadHistory(), saveHistory);

export function useSettings(): Settings {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.get);
}

export function getSettings(): Settings {
  return settingsStore.get();
}

export function updateSettings(patch: Partial<Settings>): void {
  settingsStore.set({ ...settingsStore.get(), ...patch });
}

export function useHistory(): SessionRecord[] {
  return useSyncExternalStore(historyStore.subscribe, historyStore.get);
}

export function addSession(session: Omit<SessionRecord, 'id'>): SessionRecord {
  const record = { ...session, id: newId() };
  historyStore.set([...historyStore.get(), record]);
  return record;
}

export function updateSession(id: string, patch: Partial<SessionRecord>): void {
  historyStore.set(historyStore.get().map((s) => (s.id === id ? { ...s, ...patch } : s)));
}

export function deleteSession(id: string): void {
  historyStore.set(historyStore.get().filter((s) => s.id !== id));
}

export function importSessions(sessions: SessionRecord[]): number {
  const { history, added } = mergeHistory(historyStore.get(), sessions);
  historyStore.set(history);
  return added;
}

export function resetAll(): void {
  clearAllData();
  historyStore.set([]);
  settingsStore.set(structuredClone(DEFAULT_SETTINGS));
}
