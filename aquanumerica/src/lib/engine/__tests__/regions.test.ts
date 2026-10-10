import { describe, expect, it } from "vitest";
import { flattenPath } from "../path";
import { fillPolygons } from "../raster";
import { analyzeCanvas } from "../regions";
import type { CanvasDefinition } from "../../canvases/types";

describe("flattenPath", () => {
  it("parses absolute and relative commands with implicit repeats", () => {
    const polys = flattenPath("M0 0 L10 0 10 10 l-10 0 z M20 20 h5 v5 h-5 Z");
    expect(polys).toHaveLength(2);
    expect(polys[0].slice(0, 8)).toEqual([0, 0, 10, 0, 10, 10, 0, 10]);
    expect(polys[1]).toEqual([20, 20, 25, 20, 25, 25, 20, 25]);
  });

  it("flattens arcs into a closed circle", () => {
    const [poly] = flattenPath("M 50 10 A 40 40 0 1 1 50 90 A 40 40 0 1 1 50 10 Z", 1);
    for (let i = 0; i < poly.length; i += 2) {
      expect(Math.hypot(poly[i] - 50, poly[i + 1] - 50)).toBeCloseTo(40, 3);
    }
  });
});

describe("fillPolygons", () => {
  it("covers exactly the pixel centres inside a rectangle", () => {
    const W = 20, H = 20;
    const map = new Uint8Array(W * H);
    const n = fillPolygons(flattenPath("M2 3 H12 V9 H2 Z"), map, W, H, 1);
    expect(n).toBe(10 * 6);
    expect(map[3 * W + 2]).toBe(1);
    expect(map[2 * W + 2]).toBe(0);
    expect(map[8 * W + 11]).toBe(1);
    expect(map[9 * W + 11]).toBe(0);
  });

  it("respects even-odd holes", () => {
    const W = 30, H = 30;
    const map = new Uint8Array(W * H);
    fillPolygons(flattenPath("M0 0 H30 V30 H0 Z M10 10 H20 V20 H10 Z"), map, W, H, 1, "evenodd");
    expect(map[15 * W + 15]).toBe(0);
    expect(map[5 * W + 5]).toBe(1);
  });
});

const testCanvas: CanvasDefinition = {
  id: "test",
  title: "Test",
  description: "",
  category: "abstract",
  difficulty: "easy",
  width: 200,
  height: 100,
  tags: [],
  palette: [
    { number: 1, name: "A", hex: "#ff0000" },
    { number: 2, name: "B", hex: "#00ff00" },
    { number: 3, name: "C", hex: "#0000ff" },
  ],
  shapes: [
    { d: "M0 0 H200 V100 H0 Z", n: 1 },
    // A bar that splits the background into two regions.
    { d: "M90 0 H110 V100 H90 Z", n: 2 },
    { d: "M20 20 H60 V60 H20 Z", n: 3 },
    // A speck far too small to paint – must be merged away.
    { d: "M150 50 H150.6 V50.6 H150 Z", n: 3 },
  ],
};

describe("analyzeCanvas", () => {
  const a = analyzeCanvas(testCanvas, { longSide: 400 });

  it("produces a gap-free map at the requested resolution", () => {
    expect(a.width).toBe(400);
    expect(a.height).toBe(200);
    expect(a.regionMap.length).toBe(400 * 200);
    expect(a.pixelOffsets[a.regions.length]).toBe(400 * 200);
  });

  it("splits occluded shapes into connected regions", () => {
    // left background, right background, bar, square
    expect(a.regions).toHaveLength(4);
    expect(a.numberRegions.get(1)).toHaveLength(2);
    expect(a.numberRegions.get(3)).toHaveLength(1);
  });

  it("places labels inside their regions", () => {
    for (const r of a.regions) {
      const i = Math.floor(r.labelY) * a.width + Math.floor(r.labelX);
      expect(a.regionMap[i]).toBe(r.id);
      expect(r.labelRadius).toBeGreaterThan(2);
    }
    const square = a.regions.find((r) => r.number === 3)!;
    expect(square.labelX).toBeCloseTo(80, -1);
    expect(square.labelY).toBeCloseTo(80, -1);
  });

  it("traces outlines along region borders", () => {
    expect(a.outlines.length).toBeGreaterThan(0);
    for (const line of a.outlines) {
      for (let k = 0; k < line.length; k += 2) {
        expect(line[k]).toBeGreaterThanOrEqual(0);
        expect(line[k]).toBeLessThanOrEqual(a.width);
      }
    }
  });

  it("indexes tiles for each region", () => {
    for (const r of a.regions) expect(a.regionTiles[r.id].length).toBeGreaterThan(0);
  });
});
