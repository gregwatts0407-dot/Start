"use client";

import { useCallback, useEffect, useState } from "react";
import { listSaves } from "@/lib/storage";
import type { SaveRecord } from "@/lib/puzzle/types";

/** Live list of saved puzzles (refreshes when saves change in this or another tab). */
export function useSaves() {
  const [saves, setSaves] = useState<SaveRecord[] | null>(null);

  const refresh = useCallback(() => {
    listSaves()
      .then(setSaves)
      .catch(() => setSaves([]));
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener("mosaicforge:saves-changed", onChange);
    window.addEventListener("focus", onChange);
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("mosaicforge");
      bc.onmessage = onChange;
    } catch {
      /* unsupported */
    }
    return () => {
      window.removeEventListener("mosaicforge:saves-changed", onChange);
      window.removeEventListener("focus", onChange);
      bc?.close();
    };
  }, [refresh]);

  return { saves, refresh };
}
