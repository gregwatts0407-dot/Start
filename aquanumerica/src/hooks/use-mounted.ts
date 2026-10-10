"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** True only on the client after hydration. */
export function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}
