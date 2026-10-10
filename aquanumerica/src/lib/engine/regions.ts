/**
 * Region analysis: turns a vector canvas definition into a precise, gap-free
 * region map at painting resolution.
 *
 * Pipeline
 *  1. Rasterise every shape (painter's order) into a shape-index map.
 *  2. Split into 4-connected components – each visible area is a region.
 *  3. Merge slivers and specks that are too small/thin to paint into the
 *     neighbour they share the longest border with.
 *  4. Chamfer distance transform → per-pixel distance to the nearest border
 *     (used for anti-aliased region masks, magnetic edges and label placement).
 *  5. Label placement at each region's pole of inaccessibility.
 *  6. Trace region borders (crack edges) into smoothed vector polylines for a
 *     crisp, resolution-independent underdrawing.
 */

import type { CanvasDefinition } from "../canvases/types";
import { flattenPath } from "./path";
import { fillPolygons } from "./raster";

export const TILE_SIZE = 64;
/** Distance transform units per pixel (3-4 chamfer). */
export const DIST_UNIT = 3;

export interface RegionInfo {
  id: number;
  /** Palette number to paint this region with. */
  number: number;
  /** Pixel count at paint resolution. */
  area: number;
  /** Bounding box in paint pixels: [x0, y0, x1, y1) */
  bbox: [number, number, number, number];
  /** Label anchor (paint px) at the most interior point. */
  labelX: number;
  labelY: number;
  /** Radius of the largest inscribed circle (paint px). */
  labelRadius: number;
}

export interface RegionAnalysis {
  width: number;
  height: number;
  /** Paint pixels per canvas unit. */
  scale: number;
  regionMap: Uint16Array;
  /** Chamfer distance (×3 per px) to the nearest pixel of another region, clamped to 255. */
  edgeDist: Uint8Array;
  regions: RegionInfo[];
  /** Pixels grouped by region: indices for region r live in [pixelOffsets[r], pixelOffsets[r+1]). */
  pixelOffsets: Int32Array;
  pixelIndices: Int32Array;
  /** Region ids grouped by palette number. */
  numberRegions: Map<number, number[]>;
  /** Smoothed border polylines in paint px: [x0, y0, x1, y1, ...]. */
  outlines: Float32Array[];
  tilesX: number;
  tilesY: number;
  /** For each tile, the regions that have at least one pixel in it. */
  tileRegions: Uint16Array[];
  /** For each region, the tiles it occupies. */
  regionTiles: Int32Array[];
}

export interface AnalysisOptions {
  /** Long side of the painting surface in pixels. */
  longSide?: number;
  /** Components smaller than this fraction of the canvas are merged. */
  minAreaFraction?: number;
  /** Components whose inscribed radius is below this (px) are merged. */
  minThickness?: number;
}

const UNCOVERED = 0xffff;

export function analyzeCanvas(def: CanvasDefinition, opts: AnalysisOptions = {}): RegionAnalysis {
  const longSide = opts.longSide ?? 1600;
  const scale = longSide / Math.max(def.width, def.height);
  const W = Math.round(def.width * scale);
  const H = Math.round(def.height * scale);
  const N = W * H;

  // 1. Rasterise shapes.
  const shapeMap = new Uint16Array(N).fill(UNCOVERED);
  def.shapes.forEach((shape, k) => {
    fillPolygons(flattenPath(shape.d, scale), shapeMap, W, H, k, shape.rule ?? "nonzero");
  });

  // 2. Connected components.
  const { comp, compShape, compSize } = connectedComponents(shapeMap, W, H);

  // 3. Merge slivers/specks.
  const minArea = Math.max(40, Math.round(N * (opts.minAreaFraction ?? 0.00005)));
  const minThick = (opts.minThickness ?? 3) * DIST_UNIT;
  const compDist = distanceTransform(comp, W, H);
  const compMaxDist = new Uint16Array(compSize.length);
  for (let i = 0; i < N; i++) {
    const c = comp[i];
    if (compDist[i] > compMaxDist[c]) compMaxDist[c] = compDist[i];
  }
  const root = mergeSmallComponents(comp, compShape, compSize, compMaxDist, W, H, minArea, minThick);

  // Relabel to consecutive region ids.
  const regionOf = new Int32Array(compSize.length).fill(-1);
  const regionShape: number[] = [];
  let R = 0;
  for (let c = 0; c < compSize.length; c++) {
    const r = root[c];
    if (regionOf[r] < 0) {
      regionOf[r] = R++;
      regionShape.push(compShape[r]);
    }
  }
  const regionMap = new Uint16Array(N);
  for (let i = 0; i < N; i++) regionMap[i] = regionOf[root[comp[i]]];

  // 4. Distance transform on final regions.
  const dist = distanceTransform(regionMap, W, H);
  const edgeDist = new Uint8Array(N);
  for (let i = 0; i < N; i++) edgeDist[i] = dist[i] > 255 ? 255 : dist[i];

  // 5. Region stats, pixel lists and labels.
  const area = new Int32Array(R);
  const bx0 = new Int32Array(R).fill(W), by0 = new Int32Array(R).fill(H);
  const bx1 = new Int32Array(R), by1 = new Int32Array(R);
  const best = new Int32Array(R).fill(-1);
  const bestD = new Int32Array(R).fill(-1);
  for (let y = 0, i = 0; y < H; y++) {
    for (let x = 0; x < W; x++, i++) {
      const r = regionMap[i];
      area[r]++;
      if (x < bx0[r]) bx0[r] = x;
      if (x >= bx1[r]) bx1[r] = x + 1;
      if (y < by0[r]) by0[r] = y;
      if (y >= by1[r]) by1[r] = y + 1;
      if (dist[i] > bestD[r]) {
        bestD[r] = dist[i];
        best[r] = i;
      }
    }
  }
  const pixelOffsets = new Int32Array(R + 1);
  for (let r = 0; r < R; r++) pixelOffsets[r + 1] = pixelOffsets[r] + area[r];
  const cursor = pixelOffsets.slice(0, R);
  const pixelIndices = new Int32Array(N);
  for (let i = 0; i < N; i++) pixelIndices[cursor[regionMap[i]]++] = i;

  const regions: RegionInfo[] = [];
  const numberRegions = new Map<number, number[]>();
  for (let r = 0; r < R; r++) {
    const shape = def.shapes[regionShape[r]];
    const number = shape ? shape.n : def.palette[0].number;
    const bi = best[r];
    regions.push({
      id: r,
      number,
      area: area[r],
      bbox: [bx0[r], by0[r], bx1[r], by1[r]],
      labelX: (bi % W) + 0.5,
      labelY: Math.floor(bi / W) + 0.5,
      labelRadius: bestD[r] / DIST_UNIT,
    });
    const list = numberRegions.get(number);
    if (list) list.push(r);
    else numberRegions.set(number, [r]);
  }

  // Tile ↔ region occupancy (used by history, progress and reset).
  const tilesX = Math.ceil(W / TILE_SIZE);
  const tilesY = Math.ceil(H / TILE_SIZE);
  const tileSets: Set<number>[] = Array.from({ length: tilesX * tilesY }, () => new Set<number>());
  for (let y = 0; y < H; y++) {
    const ty = (y / TILE_SIZE) | 0;
    let lastR = -1, lastT = -1;
    for (let x = 0; x < W; x++) {
      const r = regionMap[y * W + x];
      const t = ty * tilesX + ((x / TILE_SIZE) | 0);
      if (r !== lastR || t !== lastT) {
        tileSets[t].add(r);
        lastR = r;
        lastT = t;
      }
    }
  }
  const tileRegions = tileSets.map((s) => Uint16Array.from(s));
  const regionTileLists: number[][] = Array.from({ length: R }, () => []);
  tileRegions.forEach((rs, t) => rs.forEach((r) => regionTileLists[r].push(t)));
  const regionTiles = regionTileLists.map((l) => Int32Array.from(l));

  // 6. Vector outlines.
  const outlines = traceOutlines(regionMap, W, H);

  return {
    width: W,
    height: H,
    scale,
    regionMap,
    edgeDist,
    regions,
    pixelOffsets,
    pixelIndices,
    numberRegions,
    outlines,
    tilesX,
    tilesY,
    tileRegions,
    regionTiles,
  };
}

/** 4-connected component labelling via iterative flood fill. */
export function connectedComponents(labels: Uint16Array, W: number, H: number) {
  const N = W * H;
  const comp = new Int32Array(N).fill(-1);
  const queue = new Int32Array(N);
  const compShape: number[] = [];
  const compSize: number[] = [];
  for (let start = 0; start < N; start++) {
    if (comp[start] >= 0) continue;
    const id = compShape.length;
    const label = labels[start];
    compShape.push(label);
    let head = 0, tail = 0;
    queue[tail++] = start;
    comp[start] = id;
    while (head < tail) {
      const i = queue[head++];
      const x = i % W;
      if (x > 0 && comp[i - 1] < 0 && labels[i - 1] === label) { comp[i - 1] = id; queue[tail++] = i - 1; }
      if (x < W - 1 && comp[i + 1] < 0 && labels[i + 1] === label) { comp[i + 1] = id; queue[tail++] = i + 1; }
      if (i >= W && comp[i - W] < 0 && labels[i - W] === label) { comp[i - W] = id; queue[tail++] = i - W; }
      if (i < N - W && comp[i + W] < 0 && labels[i + W] === label) { comp[i + W] = id; queue[tail++] = i + W; }
    }
    compSize.push(tail);
  }
  return { comp, compShape, compSize };
}

/**
 * Two-pass 3-4 chamfer distance to the nearest pixel with a different label.
 * Pixels on a label border (or the image border) get distance 3 (= 1 px).
 */
export function distanceTransform(labels: ArrayLike<number>, W: number, H: number): Uint16Array {
  const N = W * H;
  const d = new Uint16Array(N);
  const INF = 0xfff0;
  for (let y = 0, i = 0; y < H; y++) {
    for (let x = 0; x < W; x++, i++) {
      const l = labels[i];
      const border =
        x === 0 || y === 0 || x === W - 1 || y === H - 1 ||
        labels[i - 1] !== l || labels[i + 1] !== l || labels[i - W] !== l || labels[i + W] !== l;
      d[i] = border ? DIST_UNIT : INF;
    }
  }
  // Forward pass.
  for (let y = 1; y < H; y++) {
    for (let x = 1, i = y * W + 1; x < W - 1; x++, i++) {
      let v = d[i];
      if (v <= DIST_UNIT) continue;
      const a = d[i - 1] + 3, b = d[i - W] + 3, c = d[i - W - 1] + 4, e = d[i - W + 1] + 4;
      if (a < v) v = a;
      if (b < v) v = b;
      if (c < v) v = c;
      if (e < v) v = e;
      d[i] = v;
    }
  }
  // Backward pass.
  for (let y = H - 2; y >= 0; y--) {
    for (let x = W - 2, i = y * W + W - 2; x >= 1; x--, i--) {
      let v = d[i];
      if (v <= DIST_UNIT) continue;
      const a = d[i + 1] + 3, b = d[i + W] + 3, c = d[i + W + 1] + 4, e = d[i + W - 1] + 4;
      if (a < v) v = a;
      if (b < v) v = b;
      if (c < v) v = c;
      if (e < v) v = e;
      d[i] = v;
    }
  }
  return d;
}

/**
 * Merge components that are too small or too thin into the neighbour with the
 * longest shared border. Returns a root-component lookup.
 */
function mergeSmallComponents(
  comp: Int32Array,
  compShape: number[],
  compSize: number[],
  compMaxDist: Uint16Array,
  W: number,
  H: number,
  minArea: number,
  minThick: number,
): Int32Array {
  const C = compSize.length;
  const parent = new Int32Array(C);
  for (let c = 0; c < C; c++) parent[c] = c;
  const find = (c: number) => {
    while (parent[c] !== c) {
      parent[c] = parent[parent[c]];
      c = parent[c];
    }
    return c;
  };

  const isSmall = (c: number) =>
    compShape[c] === UNCOVERED || compSize[c] < minArea || compMaxDist[c] < minThick;

  const small: number[] = [];
  for (let c = 0; c < C; c++) if (isSmall(c)) small.push(c);
  if (small.length === 0) return parent;
  if (small.length === C) return parent; // degenerate canvas: keep as is

  // Pixel lists for small components only.
  const smallIndex = new Int32Array(C).fill(-1);
  small.forEach((c, k) => (smallIndex[c] = k));
  const offsets = new Int32Array(small.length + 1);
  for (let k = 0; k < small.length; k++) offsets[k + 1] = offsets[k] + compSize[small[k]];
  const fill = offsets.slice(0, small.length);
  const pixels = new Int32Array(offsets[small.length]);
  const N = W * H;
  for (let i = 0; i < N; i++) {
    const k = smallIndex[comp[i]];
    if (k >= 0) pixels[fill[k]++] = i;
  }

  const size = compSize.slice();
  const order = small.map((c, k) => k).sort((a, b) => compSize[small[a]] - compSize[small[b]]);
  const counts = new Map<number, number>();
  for (const k of order) {
    const c = small[k];
    const self = find(c);
    // Re-check: absorbing earlier specks may have made this component big enough.
    if (compShape[c] !== UNCOVERED && size[self] >= minArea && compMaxDist[c] >= minThick) continue;
    counts.clear();
    for (let p = offsets[k]; p < offsets[k + 1]; p++) {
      const i = pixels[p];
      const x = i % W;
      const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i >= W ? i - W : -1, i < N - W ? i + W : -1];
      for (const j of nb) {
        if (j < 0) continue;
        const r = find(comp[j]);
        if (r === self) continue;
        counts.set(r, (counts.get(r) ?? 0) + 1);
      }
    }
    let target = -1, bestCount = 0;
    counts.forEach((n, r) => {
      // Prefer real (covered) neighbours.
      const weight = compShape[r] === UNCOVERED ? n * 0.01 : n;
      if (weight > bestCount) {
        bestCount = weight;
        target = r;
      }
    });
    if (target < 0) continue;
    parent[self] = target;
    size[target] += size[self];
  }
  const root = new Int32Array(C);
  for (let c = 0; c < C; c++) root[c] = find(c);
  return root;
}

const UP = 1, RIGHT = 2, DOWN = 4, LEFT = 8;

/**
 * Trace the borders between regions as polylines along pixel cracks, then
 * smooth away the staircase and simplify. Image borders are not outlined.
 */
export function traceOutlines(regionMap: Uint16Array, W: number, H: number): Float32Array[] {
  const LW = W + 1;
  const lat = new Uint8Array(LW * (H + 1));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const r = regionMap[i];
      if (x > 0 && regionMap[i - 1] !== r) {
        // vertical crack at lattice x from y → y+1
        lat[y * LW + x] |= DOWN;
        lat[(y + 1) * LW + x] |= UP;
      }
      if (y > 0 && regionMap[i - W] !== r) {
        // horizontal crack at lattice y from x → x+1
        lat[y * LW + x] |= RIGHT;
        lat[y * LW + x + 1] |= LEFT;
      }
    }
  }
  const degree = new Uint8Array(lat.length);
  for (let p = 0; p < lat.length; p++) {
    const v = lat[p];
    degree[p] = (v & 1) + ((v >> 1) & 1) + ((v >> 2) & 1) + ((v >> 3) & 1);
  }

  const step = (p: number, dir: number) =>
    dir === UP ? p - LW : dir === DOWN ? p + LW : dir === LEFT ? p - 1 : p + 1;
  const opposite = (dir: number) =>
    dir === UP ? DOWN : dir === DOWN ? UP : dir === LEFT ? RIGHT : LEFT;

  const raw: number[][] = [];
  const walk = (start: number, firstDir: number, closed: boolean) => {
    const pts: number[] = [start % LW, (start / LW) | 0];
    let p = start;
    let dir = firstDir;
    for (;;) {
      lat[p] &= ~dir;
      const q = step(p, dir);
      lat[q] &= ~opposite(dir);
      pts.push(q % LW, (q / LW) | 0);
      p = q;
      if (closed ? p === start : degree[p] !== 2) break;
      const rem = lat[p];
      if (rem === 0) break;
      dir = rem & UP ? UP : rem & RIGHT ? RIGHT : rem & DOWN ? DOWN : LEFT;
    }
    raw.push(pts);
  };

  // Open chains between junctions first.
  for (let p = 0; p < lat.length; p++) {
    if (degree[p] === 2 || degree[p] === 0) continue;
    while (lat[p]) {
      const v = lat[p];
      walk(p, v & UP ? UP : v & RIGHT ? RIGHT : v & DOWN ? DOWN : LEFT, false);
    }
  }
  // Remaining closed loops.
  for (let p = 0; p < lat.length; p++) {
    while (lat[p]) {
      const v = lat[p];
      walk(p, v & UP ? UP : v & RIGHT ? RIGHT : v & DOWN ? DOWN : LEFT, true);
    }
  }

  return raw.map((pts) => smoothPolyline(pts));
}

/** Midpoint de-staircasing + Laplacian smoothing + Douglas–Peucker simplification. */
function smoothPolyline(pts: number[]): Float32Array {
  const n = pts.length / 2;
  const closed = n > 2 && pts[0] === pts[pts.length - 2] && pts[1] === pts[pts.length - 1];
  if (n < 3) return Float32Array.from(pts);

  // Midpoints of each unit crack (keep chain endpoints so junctions meet).
  let xs: number[] = [];
  let ys: number[] = [];
  if (!closed) {
    xs.push(pts[0]);
    ys.push(pts[1]);
  }
  for (let k = 0; k < n - 1; k++) {
    xs.push((pts[k * 2] + pts[k * 2 + 2]) / 2);
    ys.push((pts[k * 2 + 1] + pts[k * 2 + 3]) / 2);
  }
  if (!closed) {
    xs.push(pts[pts.length - 2]);
    ys.push(pts[pts.length - 1]);
  }

  // Two passes of [1 2 1]/4 smoothing.
  for (let pass = 0; pass < 2; pass++) {
    const m = xs.length;
    const nx = xs.slice(), ny = ys.slice();
    for (let k = 0; k < m; k++) {
      if (!closed && (k === 0 || k === m - 1)) continue;
      const a = (k - 1 + m) % m, b = (k + 1) % m;
      nx[k] = (xs[a] + 2 * xs[k] + xs[b]) / 4;
      ny[k] = (ys[a] + 2 * ys[k] + ys[b]) / 4;
    }
    xs = nx;
    ys = ny;
  }
  if (closed) {
    xs.push(xs[0]);
    ys.push(ys[0]);
  }
  const keep = douglasPeucker(xs, ys, 0.3);
  const out = new Float32Array(keep.length * 2);
  keep.forEach((k, j) => {
    out[j * 2] = xs[k];
    out[j * 2 + 1] = ys[k];
  });
  return out;
}

function douglasPeucker(xs: number[], ys: number[], eps: number): number[] {
  const m = xs.length;
  if (m <= 2) return xs.map((_, i) => i);
  const keep = new Uint8Array(m);
  keep[0] = keep[m - 1] = 1;
  const stack: [number, number][] = [[0, m - 1]];
  const eps2 = eps * eps;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = xs[a], ay = ys[a], bx = xs[b], by = ys[b];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1, idx = -1;
    for (let k = a + 1; k < b; k++) {
      let d2: number;
      if (len2 === 0) {
        d2 = (xs[k] - ax) ** 2 + (ys[k] - ay) ** 2;
      } else {
        const cross = (xs[k] - ax) * dy - (ys[k] - ay) * dx;
        d2 = (cross * cross) / len2;
      }
      if (d2 > maxD) {
        maxD = d2;
        idx = k;
      }
    }
    if (maxD > eps2 && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out: number[] = [];
  for (let k = 0; k < m; k++) if (keep[k]) out.push(k);
  return out;
}
