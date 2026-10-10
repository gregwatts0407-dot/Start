/**
 * Deterministic scanline rasteriser.
 *
 * Canvas 2D always anti-aliases path fills, which makes it impossible to read
 * back exact region IDs. Region detection is the backbone of the app, so we
 * rasterise vector shapes ourselves: a pixel belongs to a shape when its
 * centre lies inside the shape (non-zero or even-odd winding). Later shapes
 * overwrite earlier ones (painter's algorithm), producing a gap-free label map.
 */

import type { Polygon } from "./path";

interface Edge {
  yMin: number; // first scanline index (inclusive)
  yMax: number; // last scanline index (exclusive)
  x: number; // x at the centre of scanline yMin
  dxdy: number;
  dir: 1 | -1;
}

export type FillRule = "nonzero" | "evenodd";

/**
 * Fill polygons into `target` (row-major, width × height) with `value`.
 * Returns the number of pixels written.
 */
export function fillPolygons(
  polys: Polygon[],
  target: Uint16Array | Uint8Array | Int32Array,
  width: number,
  height: number,
  value: number,
  rule: FillRule = "nonzero",
): number {
  const edges: Edge[] = [];
  for (const p of polys) {
    const n = p.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      let x0 = p[i * 2], y0 = p[i * 2 + 1];
      let x1 = p[j * 2], y1 = p[j * 2 + 1];
      if (y0 === y1) continue;
      let dir: 1 | -1 = 1;
      if (y0 > y1) {
        [x0, x1] = [x1, x0];
        [y0, y1] = [y1, y0];
        dir = -1;
      }
      // Scanlines sample at pixel centres (y + 0.5). Half-open on top.
      const yMin = Math.max(0, Math.ceil(y0 - 0.5));
      const yMax = Math.min(height, Math.ceil(y1 - 0.5));
      if (yMax <= yMin) continue;
      const dxdy = (x1 - x0) / (y1 - y0);
      edges.push({ yMin, yMax, x: x0 + (yMin + 0.5 - y0) * dxdy, dxdy, dir });
    }
  }
  if (edges.length === 0) return 0;
  edges.sort((a, b) => a.yMin - b.yMin);

  let written = 0;
  const active: Edge[] = [];
  let next = 0;
  const startY = edges[0].yMin;
  const xs: number[] = [];
  const ds: number[] = [];

  for (let y = startY; y < height; y++) {
    while (next < edges.length && edges[next].yMin === y) active.push(edges[next++]);
    // Retire finished edges.
    for (let k = active.length - 1; k >= 0; k--) if (active[k].yMax <= y) active.splice(k, 1);
    if (active.length === 0) {
      if (next >= edges.length) break;
      y = edges[next].yMin - 1;
      continue;
    }
    // Gather crossings for this scanline, insertion-sorted by x.
    xs.length = 0;
    ds.length = 0;
    for (const e of active) {
      const x = e.x + (y - e.yMin) * e.dxdy;
      let k = xs.length;
      xs.push(x);
      ds.push(e.dir);
      while (k > 0 && xs[k - 1] > x) {
        xs[k] = xs[k - 1];
        ds[k] = ds[k - 1];
        k--;
      }
      xs[k] = x;
      ds[k] = e.dir;
    }
    const row = y * width;
    let winding = 0;
    for (let k = 0; k < xs.length - 1; k++) {
      winding += rule === "nonzero" ? ds[k] : 1;
      const inside = rule === "nonzero" ? winding !== 0 : (winding & 1) === 1;
      if (!inside) continue;
      // Pixel i is covered when xa <= i + 0.5 < xb.
      const xa = Math.max(0, Math.ceil(xs[k] - 0.5));
      const xb = Math.min(width, Math.ceil(xs[k + 1] - 0.5));
      for (let x = xa; x < xb; x++) target[row + x] = value;
      if (xb > xa) written += xb - xa;
    }
  }
  return written;
}
