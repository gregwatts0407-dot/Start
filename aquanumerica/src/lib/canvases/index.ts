/**
 * Canvas catalogue. Each canvas is authored procedurally (see ./defs) and
 * built on demand; definitions are cached for the session.
 */

import type { CanvasEntry } from "./entry";
import { Scene } from "./shapes";
import type { CanvasDefinition, CanvasMeta } from "./types";
import { alpineDawn, autumnBirches, harbourDusk, lavenderFields } from "./defs/landscapes";
import { peonyBloom, sunflowerTrio, wildPoppies } from "./defs/florals";
import { hummingbird, koiPond, littleFox } from "./defs/animals";
import { lemonTea, pearsOnLinen } from "./defs/stilllife";
import { rippleBands, shardsOfSpring, tidalMandala } from "./defs/abstract";

export const CANVAS_ENTRIES: CanvasEntry[] = [
  alpineDawn, wildPoppies, pearsOnLinen, rippleBands,
  lavenderFields, peonyBloom, koiPond, littleFox, lemonTea, shardsOfSpring, sunflowerTrio,
  harbourDusk, hummingbird, autumnBirches, tidalMandala,
];

export const CANVASES: CanvasMeta[] = CANVAS_ENTRIES.map((e) => e.meta);

const cache = new Map<string, CanvasDefinition>();

export function getCanvasMeta(id: string): CanvasMeta | undefined {
  return CANVASES.find((c) => c.id === id);
}

export function getCanvas(id: string): CanvasDefinition | null {
  const hit = cache.get(id);
  if (hit) return hit;
  const entry = CANVAS_ENTRIES.find((e) => e.meta.id === id);
  if (!entry) return null;
  const scene = new Scene(entry.meta.width, entry.meta.height);
  entry.build(scene);
  const def: CanvasDefinition = { ...entry.meta, shapes: scene.shapes };
  cache.set(id, def);
  return def;
}
