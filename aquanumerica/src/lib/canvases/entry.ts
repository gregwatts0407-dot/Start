import type { CanvasMeta, CanvasShape } from "./types";
import type { Scene } from "./shapes";

export interface CanvasEntry {
  meta: CanvasMeta;
  /** Draws the scene's shapes (painter's order) into the provided Scene. */
  build: (scene: Scene) => void;
}

/** Palette helper: ["Name", "#hex"] tuples numbered from 1. */
export function palette(entries: Array<[string, string]>) {
  return entries.map(([name, hex], i) => ({ number: i + 1, name, hex }));
}

export type { CanvasShape };
