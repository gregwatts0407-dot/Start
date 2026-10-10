"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useStore } from "zustand";
import type { StudioActions, StudioState, StudioStore } from "@/lib/store/studio-store";

const StudioContext = createContext<StudioStore | null>(null);

export function StudioProvider({ store, children }: { store: StudioStore; children: ReactNode }) {
  return <StudioContext.Provider value={store}>{children}</StudioContext.Provider>;
}

export function useStudioStore(): StudioStore {
  const store = useContext(StudioContext);
  if (!store) throw new Error("useStudioStore must be used inside <StudioProvider>");
  return store;
}

/** Subscribe to a slice of studio state. Select primitives or stable references. */
export function useStudio<T>(selector: (s: StudioState & StudioActions) => T): T {
  return useStore(useStudioStore(), selector);
}
