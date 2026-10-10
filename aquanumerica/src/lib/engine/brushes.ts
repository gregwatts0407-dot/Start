/**
 * Painting implements. Each tool is a small set of physical-ish parameters
 * that the watercolour surface interprets: footprint shape, edge hardness,
 * bristle streaking, how much water it carries and how strongly its edges
 * darken as they dry.
 */

export type ToolId = "watercolor" | "round" | "flat" | "liner" | "fill" | "eyedropper" | "eraser";

export interface ToolSettings {
  /** Brush diameter in canvas units. */
  size: number;
  /** Maximum coverage a single stroke can reach (0..1). */
  opacity: number;
  /** Paint delivered per dab (0..1) – low flow builds up gradually. */
  flow: number;
  /** Water carried (0..1): drying time, wet-in-wet bleeding and dry-brush texture. */
  wetness: number;
}

export interface ToolSpec {
  id: ToolId;
  name: string;
  short: string;
  description: string;
  shortcut: string;
  kind: "brush" | "fill" | "eyedropper" | "eraser";
  shape: "round" | "flat";
  /** Radius fraction that stays fully opaque (0 = very soft, 1 = hard). */
  hardness: number;
  /** Bristle streak strength (0..1). */
  bristle: number;
  /** Irregularity of the dab edge (0..1) – watercolour edges are never perfect. */
  edgeNoise: number;
  /** Dab spacing as a fraction of the radius. */
  spacing: number;
  /** Flat brush thickness relative to its width. */
  aspect: number;
  /** Strength of drying-edge darkening / pooling. */
  edgeDarken: number;
  /** Low-frequency pigment variation within the stroke. */
  variation: number;
  pressureSize: number;
  pressureOpacity: number;
  sizeRange: [number, number];
  defaults: ToolSettings;
  /** Which sliders apply to this tool. */
  controls: Array<keyof ToolSettings>;
}

export const TOOLS: Record<ToolId, ToolSpec> = {
  watercolor: {
    id: "watercolor",
    name: "Soft Watercolour",
    short: "Soft",
    description: "A generous, very wet mop brush. Soft feathered edges that bloom into damp paint.",
    shortcut: "B",
    kind: "brush",
    shape: "round",
    hardness: 0.6,
    bristle: 0.12,
    edgeNoise: 0.55,
    spacing: 0.12,
    aspect: 1,
    edgeDarken: 0.75,
    variation: 0.7,
    pressureSize: 0.5,
    pressureOpacity: 0.4,
    sizeRange: [6, 220],
    defaults: { size: 46, opacity: 0.85, flow: 0.55, wetness: 0.8 },
    controls: ["size", "opacity", "flow", "wetness"],
  },
  round: {
    id: "round",
    name: "Round Brush",
    short: "Round",
    description: "The everyday sable round – controlled strokes with a gentle bristle texture.",
    shortcut: "R",
    kind: "brush",
    shape: "round",
    hardness: 0.72,
    bristle: 0.32,
    edgeNoise: 0.25,
    spacing: 0.12,
    aspect: 1,
    edgeDarken: 0.6,
    variation: 0.5,
    pressureSize: 0.7,
    pressureOpacity: 0.3,
    sizeRange: [2, 120],
    defaults: { size: 18, opacity: 0.9, flow: 0.75, wetness: 0.55 },
    controls: ["size", "opacity", "flow", "wetness"],
  },
  flat: {
    id: "flat",
    name: "Flat Wash",
    short: "Flat",
    description: "A broad flat for laying even washes across large regions. Streaky bristle marks.",
    shortcut: "F",
    kind: "brush",
    shape: "flat",
    hardness: 0.74,
    bristle: 0.5,
    edgeNoise: 0.12,
    spacing: 0.1,
    aspect: 0.3,
    edgeDarken: 0.7,
    variation: 0.6,
    pressureSize: 0.3,
    pressureOpacity: 0.3,
    sizeRange: [8, 260],
    defaults: { size: 64, opacity: 0.8, flow: 0.7, wetness: 0.85 },
    controls: ["size", "opacity", "flow", "wetness"],
  },
  liner: {
    id: "liner",
    name: "Detail Liner",
    short: "Liner",
    description: "A fine rigger for crisp details and tight corners. Little water, lots of pigment.",
    shortcut: "L",
    kind: "brush",
    shape: "round",
    hardness: 0.82,
    bristle: 0.04,
    edgeNoise: 0.05,
    spacing: 0.18,
    aspect: 1,
    edgeDarken: 0.25,
    variation: 0.2,
    pressureSize: 0.8,
    pressureOpacity: 0.2,
    sizeRange: [1, 24],
    defaults: { size: 4, opacity: 1, flow: 1, wetness: 0.25 },
    controls: ["size", "opacity", "flow", "wetness"],
  },
  fill: {
    id: "fill",
    name: "Wash Fill",
    short: "Fill",
    description: "Floods a whole region with a flowing wash that pools softly at its edges.",
    shortcut: "G",
    kind: "fill",
    shape: "round",
    hardness: 0,
    bristle: 0,
    edgeNoise: 0,
    spacing: 1,
    aspect: 1,
    edgeDarken: 0.8,
    variation: 0.7,
    pressureSize: 0,
    pressureOpacity: 0,
    sizeRange: [1, 1],
    defaults: { size: 1, opacity: 0.9, flow: 0.6, wetness: 0.6 },
    controls: ["opacity", "flow", "wetness"],
  },
  eyedropper: {
    id: "eyedropper",
    name: "Eyedropper",
    short: "Pick",
    description: "Sample any colour from the painting. Hold Alt with a brush for a quick pick.",
    shortcut: "I",
    kind: "eyedropper",
    shape: "round",
    hardness: 1,
    bristle: 0,
    edgeNoise: 0,
    spacing: 1,
    aspect: 1,
    edgeDarken: 0,
    variation: 0,
    pressureSize: 0,
    pressureOpacity: 0,
    sizeRange: [1, 15],
    defaults: { size: 3, opacity: 1, flow: 1, wetness: 0 },
    controls: ["size"],
  },
  eraser: {
    id: "eraser",
    name: "Lifting Eraser",
    short: "Lift",
    description: "Lifts pigment like a damp sponge – wet paint lifts cleanly, dry paint gradually.",
    shortcut: "E",
    kind: "eraser",
    shape: "round",
    hardness: 0.3,
    bristle: 0.05,
    edgeNoise: 0.2,
    spacing: 0.15,
    aspect: 1,
    edgeDarken: 0,
    variation: 0,
    pressureSize: 0.5,
    pressureOpacity: 0.5,
    sizeRange: [4, 200],
    defaults: { size: 36, opacity: 0.8, flow: 0.6, wetness: 0.5 },
    controls: ["size", "opacity", "flow", "wetness"],
  },
};

export const TOOL_ORDER: ToolId[] = ["watercolor", "round", "flat", "liner", "fill", "eyedropper", "eraser"];

export const SETTING_LABELS: Record<keyof ToolSettings, { label: string; hint: string }> = {
  size: { label: "Size", hint: "Brush diameter" },
  opacity: { label: "Opacity", hint: "Strongest colour a single stroke can reach" },
  flow: { label: "Flow", hint: "Paint released per dab – lower builds colour gently" },
  wetness: { label: "Wetness", hint: "More water: longer drying, softer bleeding, fewer dry-brush gaps" },
};
