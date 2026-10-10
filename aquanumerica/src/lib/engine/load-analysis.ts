/**
 * Loads (and caches) the region analysis for a canvas, preferring a Web
 * Worker so the UI stays responsive while a canvas opens.
 */
import type { CanvasDefinition } from "../canvases/types";
import { hasPaperTexture, setPaperTexture, type PaperTexture } from "./paper";
import { analyzeCanvas, type RegionAnalysis } from "./regions";

/** Painting surface resolution (long side, px). Saved paintings depend on it. */
export const PAINT_LONG_SIDE = 1600;

const cache = new Map<string, Promise<RegionAnalysis>>();

function onMainThread(def: CanvasDefinition): Promise<RegionAnalysis> {
  // Yield first so the loading state can paint.
  return new Promise((resolve) => setTimeout(() => resolve(analyzeCanvas(def, { longSide: PAINT_LONG_SIDE })), 30));
}

export function loadAnalysis(def: CanvasDefinition): Promise<RegionAnalysis> {
  const hit = cache.get(def.id);
  if (hit) return hit;
  const promise = new Promise<RegionAnalysis>((resolve) => {
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL("./analysis.worker.ts", import.meta.url), { type: "module" });
    } catch {
      worker = null;
    }
    if (!worker) {
      onMainThread(def).then(resolve);
      return;
    }
    const w = worker;
    w.onmessage = (e: MessageEvent<{ ok: boolean; analysis?: RegionAnalysis; paper?: PaperTexture | null }>) => {
      w.terminate();
      if (e.data.ok && e.data.analysis) {
        if (e.data.paper && !hasPaperTexture()) setPaperTexture(e.data.paper);
        resolve(e.data.analysis);
      } else {
        onMainThread(def).then(resolve);
      }
    };
    w.onerror = () => {
      w.terminate();
      onMainThread(def).then(resolve);
    };
    w.postMessage({ id: def.id, longSide: PAINT_LONG_SIDE, wantPaper: !hasPaperTexture() });
  });
  cache.set(def.id, promise);
  return promise;
}
