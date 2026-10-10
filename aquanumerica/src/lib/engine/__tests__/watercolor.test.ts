import { describe, expect, it } from "vitest";
import { analyzeCanvas } from "../regions";
import { WatercolorSurface, type StrokeOptions } from "../watercolor";
import { TOOLS } from "../brushes";
import { hexToRgb, rgbToDensity, densityToRgb } from "../color";
import type { CanvasDefinition } from "../../canvases/types";

const def: CanvasDefinition = {
  id: "t", title: "t", description: "", category: "abstract", difficulty: "easy",
  width: 200, height: 100, tags: [],
  palette: [
    { number: 1, name: "Sky", hex: "#8fb8de" },
    { number: 2, name: "Leaf", hex: "#5a8f4e" },
  ],
  shapes: [
    { d: "M0 0 H200 V100 H0 Z", n: 1 },
    { d: "M100 0 H200 V100 H100 Z", n: 2 },
  ],
};

const analysis = analyzeCanvas(def, { longSide: 200 });
const left = analysis.regionMap[50 * 200 + 10];
const right = analysis.regionMap[50 * 200 + 190];

function opts(surface: WatercolorSurface, region: number, tool = TOOLS.round): StrokeOptions {
  const allow = new Uint8Array(analysis.regions.length);
  allow[region] = 1;
  return {
    tool, opacity: 1, flow: 1, wetness: 0.6,
    density: rgbToDensity(hexToRgb("#8fb8de")),
    allow, magnetic: true, seed: 3,
  };
}

const total = (s: WatercolorSurface, i: number) => {
  const d = s.densityAt(i, [0, 0, 0]);
  return d[0] + d[1] + d[2];
};

describe("WatercolorSurface", () => {
  it("never paints outside the locked region", () => {
    const s = new WatercolorSurface(analysis);
    s.history.begin("stroke", "test");
    s.beginStroke(opts(s, left));
    for (let x = 60; x <= 140; x += 2) s.dab({ x, y: 50, radius: 12, angle: 0, pressure: 1 });
    s.endStroke();
    expect(total(s, 50 * 200 + 80)).toBeGreaterThan(0.2);
    for (let x = 100; x < 200; x++) expect(total(s, 50 * 200 + x)).toBe(0);
  });

  it("dries wet pigment into the dry layer and conserves it", () => {
    const s = new WatercolorSurface(analysis);
    s.history.begin("stroke", "test");
    s.beginStroke(opts(s, left));
    s.dab({ x: 50, y: 50, radius: 15, angle: 0, pressure: 1 });
    s.endStroke();
    const before = total(s, 50 * 200 + 50);
    expect(s.isWet).toBe(true);
    for (let k = 0; k < 400 && s.step(1 / 30); k++);
    expect(s.isWet).toBe(false);
    expect(s.wet[(50 * 200 + 50) * 3]).toBe(0);
    expect(Math.abs(total(s, 50 * 200 + 50) - before)).toBeLessThan(0.25);
  });

  it("fills a whole region with a wash that reaches the target colour", () => {
    const s = new WatercolorSurface(analysis);
    s.history.begin("fill", "fill");
    const job = s.beginFill(right, opts(s, right, TOOLS.fill), 150, 50);
    let guard = 0;
    while (!s.stepFill(job, 1 / 60) && guard++ < 1000);
    s.dryAll();
    let painted = 0;
    const a = analysis;
    for (let p = a.pixelOffsets[right]; p < a.pixelOffsets[right + 1]; p++) {
      if (total(s, a.pixelIndices[p]) > 0.2) painted++;
    }
    expect(painted / a.regions[right].area).toBeGreaterThan(0.99);
    const centre = densityToRgb(s.densityAt(50 * 200 + 150, [0, 0, 0]));
    const target = hexToRgb("#8fb8de");
    for (let c = 0; c < 3; c++) expect(Math.abs(centre[c] - target[c])).toBeLessThan(40);
    expect(total(s, 50 * 200 + 50)).toBe(0);
  });

  it("dries every tile a spreading wash reaches, including late ones", () => {
    // Larger surface so the wavefront takes several drying batches to cross it.
    const big = analyzeCanvas(def, { longSide: 800 });
    const region = big.regionMap[200 * 800 + 790];
    const s = new WatercolorSurface(big);
    const job = s.beginFill(region, { ...opts(s, region, TOOLS.fill), allow: null }, 405, 5);
    for (let f = 0; f < 900; f++) {
      s.stepFill(job, 1 / 60);
      s.step(1 / 60);
    }
    expect(job.done).toBe(true);
    expect(s.isWet).toBe(false);
    for (let p = big.pixelOffsets[region]; p < big.pixelOffsets[region + 1]; p += 97) {
      const i = big.pixelIndices[p];
      expect(s.water[i]).toBe(0);
      expect(s.wet[i * 3]).toBe(0);
      expect(s.dry[i * 3] + s.dry[i * 3 + 1] + s.dry[i * 3 + 2]).toBeGreaterThan(0.1);
    }
  });

  it("undoes and redoes strokes exactly (within quantisation)", () => {
    const s = new WatercolorSurface(analysis);
    s.history.begin("stroke", "a");
    s.beginStroke(opts(s, left));
    s.dab({ x: 40, y: 40, radius: 10, angle: 0, pressure: 1 });
    s.endStroke();
    s.dryAll();
    const afterA = total(s, 40 * 200 + 40);
    s.history.begin("stroke", "b");
    s.beginStroke(opts(s, left));
    s.dab({ x: 40, y: 40, radius: 10, angle: 0, pressure: 1 });
    s.endStroke();
    s.dryAll();
    const afterB = total(s, 40 * 200 + 40);
    expect(afterB).toBeGreaterThan(afterA); // glazing darkens
    s.history.undo();
    expect(total(s, 40 * 200 + 40)).toBeCloseTo(afterA, 2);
    s.history.undo();
    expect(total(s, 40 * 200 + 40)).toBe(0);
    s.history.redo();
    s.history.redo();
    expect(total(s, 40 * 200 + 40)).toBeCloseTo(afterB, 2);
  });

  it("keeps at least 50 undo steps", () => {
    const s = new WatercolorSurface(analysis);
    for (let k = 0; k < 60; k++) {
      s.history.begin("stroke", `s${k}`);
      s.beginStroke(opts(s, left));
      s.dab({ x: 20 + k, y: 50, radius: 8, angle: 0, pressure: 1 });
      s.endStroke();
    }
    let undone = 0;
    while (s.history.undo()) undone++;
    expect(undone).toBeGreaterThanOrEqual(50);
  });

  it("lifts pigment with the eraser", () => {
    const s = new WatercolorSurface(analysis);
    s.history.begin("stroke", "a");
    s.beginStroke(opts(s, left));
    s.dab({ x: 50, y: 50, radius: 14, angle: 0, pressure: 1 });
    s.endStroke();
    s.dryAll();
    const before = total(s, 50 * 200 + 50);
    s.history.begin("erase", "lift");
    s.beginStroke({ ...opts(s, left, TOOLS.eraser), wetness: 1 });
    for (let k = 0; k < 4; k++) s.dab({ x: 50, y: 50, radius: 14, angle: 0, pressure: 1 });
    s.endStroke();
    expect(total(s, 50 * 200 + 50)).toBeLessThan(before * 0.2);
  });

  it("serializes and restores paint", () => {
    const s = new WatercolorSurface(analysis);
    s.history.begin("stroke", "a");
    s.beginStroke(opts(s, left));
    s.dab({ x: 50, y: 50, radius: 14, angle: 0, pressure: 1 });
    s.endStroke();
    const saved = s.serialize();
    const t = new WatercolorSurface(analysis);
    t.deserialize(saved);
    expect(total(t, 50 * 200 + 50)).toBeCloseTo(total(s, 50 * 200 + 50), 2);
  });
});
