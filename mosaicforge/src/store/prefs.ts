"use client";

/**
 * Persisted user preferences (localStorage). Small and synchronous — puzzle
 * saves themselves live in IndexedDB.
 */
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { StartMode } from "@/lib/puzzle/types";
import type { PieceCount } from "@/lib/difficulty";

/** localStorage wrapper that never throws (private mode, sandboxed frames). */
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

interface PrefsState {
  sound: boolean;
  showTimer: boolean;
  showMoves: boolean;
  ghostOpacity: number;
  panelOpen: boolean;
  snapToBoard: boolean;
  lastPieceCount: PieceCount;
  lastRotation: boolean;
  lastStartMode: StartMode;
  set: (p: Partial<Omit<PrefsState, "set">>) => void;
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      sound: true,
      showTimer: true,
      showMoves: true,
      ghostOpacity: 0.25,
      panelOpen: true,
      snapToBoard: true,
      lastPieceCount: 250,
      lastRotation: false,
      lastStartMode: "scatter",
      set: (p) => set(p),
    }),
    { name: "mosaicforge-prefs", version: 1, storage: createJSONStorage(() => safeStorage) },
  ),
);
