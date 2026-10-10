"use client";

import { useSyncExternalStore } from "react";
import { META_KEY, type ProgressMeta } from "@/lib/storage";

const EMPTY: Record<string, ProgressMeta> = {};
let cachedRaw: string | null = null;
let cached: Record<string, ProgressMeta> = EMPTY;

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener("aquanumerica:progress", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("aquanumerica:progress", cb);
  };
}

function getSnapshot() {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(META_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cached = raw ? (JSON.parse(raw) as Record<string, ProgressMeta>) : EMPTY;
    } catch {
      cached = EMPTY;
    }
  }
  return cached;
}

/** Reactive view of saved progress for all canvases (empty during SSR). */
export function useProgressMeta(): Record<string, ProgressMeta> {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
