"use client";

/**
 * Transient state for the puzzle workspace UI. The engine pushes stats here;
 * React components subscribe to just the slices they render.
 */
import { create } from "zustand";
import type { EngineStats, PieceFilter } from "@/lib/puzzle/types";

export type SaveStatus = "idle" | "saving" | "saved" | "unsaved" | "error";

interface WorkspaceState {
  status: "loading" | "ready" | "error";
  error?: string;
  loadLabel: string;
  loadProgress: number;
  stats: EngineStats;
  elapsedMs: number;
  saveStatus: SaveStatus;
  lastSavedAt?: number;
  ghost: boolean;
  filter: PieceFilter;
  showCompletion: boolean;
  set: (p: Partial<Omit<WorkspaceState, "set" | "reset">>) => void;
  reset: () => void;
}

const initialStats: EngineStats = {
  progress: 0,
  joined: 0,
  totalJoins: 1,
  placed: 0,
  moves: 0,
  canUndo: false,
  canRedo: false,
  completed: false,
  zoom: 1,
};

const initial = {
  status: "loading" as const,
  error: undefined,
  loadLabel: "Loading image",
  loadProgress: 0,
  stats: initialStats,
  elapsedMs: 0,
  saveStatus: "idle" as SaveStatus,
  lastSavedAt: undefined,
  ghost: false,
  filter: "all" as PieceFilter,
  showCompletion: false,
};

export const useWorkspace = create<WorkspaceState>()((set) => ({
  ...initial,
  set: (p) => set(p),
  reset: () => set(initial),
}));
