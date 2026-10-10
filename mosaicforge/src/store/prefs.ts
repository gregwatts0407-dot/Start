"use client";

/**
 * Persisted user preferences (localStorage). Small and synchronous — puzzle
 * saves themselves live in IndexedDB.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { StartMode } from "@/lib/puzzle/types";
import type { PieceCount } from "@/lib/difficulty";

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
    { name: "mosaicforge-prefs", version: 1 },
  ),
);
