/**
 * Procedural vector toolkit for authoring numbered canvases.
 *
 * Canvases are composed from simple primitives (smooth blobs, ridges, petals,
 * leaves, bands…) using a seeded RNG, so every scene is deterministic and the
 * source stays compact. All helpers return SVG path data in canvas units.
 */

import type { CanvasShape } from "./types";

export type Pt = [number, number];

export class Rand {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number) {
    return Math.floor(this.range(a, b + 1));
  }
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  /** v ± amt */
  jit(v: number, amt: number) {
    return v + (this.next() * 2 - 1) * amt;
  }
}

const f = (n: number) => (Math.round(n * 10) / 10).toString();

/** Collects shapes in painter's order. */
export class Scene {
  readonly shapes: CanvasShape[] = [];
  constructor(readonly width: number, readonly height: number) {}
  add(d: string, n: number, rule?: "nonzero" | "evenodd") {
    this.shapes.push(rule ? { d, n, rule } : { d, n });
    return this;
  }
  /** Full-canvas background rectangle. */
  background(n: number) {
    return this.add(rect(0, 0, this.width, this.height), n);
  }
}

export function poly(pts: Pt[]): string {
  return `M${pts.map((p) => `${f(p[0])} ${f(p[1])}`).join("L")}Z`;
}

export function rect(x: number, y: number, w: number, h: number): string {
  return poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
}

/** Closed Catmull-Rom spline through points → cubic Béziers. */
export function smooth(pts: Pt[], tension = 0.5): string {
  const n = pts.length;
  if (n < 3) return poly(pts);
  const k = tension / 3;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + "Z";
}

/**
 * Smooth outline where some vertices are sharp corners. `sharp[i]` true keeps
 * vertex i as a cusp (e.g. leaf tips, petal bases).
 */
export function smoothSharp(pts: Pt[], sharp: boolean[], tension = 0.5): string {
  const n = pts.length;
  const k = tension / 3;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const t1 = sharp[i] ? [0, 0] : [(p2[0] - p0[0]) * k, (p2[1] - p0[1]) * k];
    const t2 = sharp[(i + 1) % n] ? [0, 0] : [(p3[0] - p1[0]) * k, (p3[1] - p1[1]) * k];
    d += `C${f(p1[0] + t1[0])} ${f(p1[1] + t1[1])} ${f(p2[0] - t2[0])} ${f(p2[1] - t2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + "Z";
}

export function ellipsePts(cx: number, cy: number, rx: number, ry: number, rot = 0, n = 32): Pt[] {
  const c = Math.cos(rot), s = Math.sin(rot);
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    pts.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return pts;
}

export function ellipse(cx: number, cy: number, rx: number, ry: number, rot = 0): string {
  return smooth(ellipsePts(cx, cy, rx, ry, rot, 16));
}

export function circle(cx: number, cy: number, r: number): string {
  return ellipse(cx, cy, r, r);
}

/** Ring (annulus) – use with the even-odd rule. */
export function ring(cx: number, cy: number, r1: number, r2: number): string {
  return circle(cx, cy, r2) + circle(cx, cy, r1);
}

/** Irregular organic blob. */
export function blobPts(
  cx: number, cy: number, r: number, rnd: Rand,
  o: { n?: number; jitter?: number; sx?: number; sy?: number; rot?: number } = {},
): Pt[] {
  const n = o.n ?? 10, jit = o.jitter ?? 0.22, sx = o.sx ?? 1, sy = o.sy ?? 1, rot = o.rot ?? 0;
  const c = Math.cos(rot), s = Math.sin(rot);
  const pts: Pt[] = [];
  const phase = rnd.next() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    const rr = r * (1 + (rnd.next() * 2 - 1) * jit);
    const x = Math.cos(a) * rr * sx, y = Math.sin(a) * rr * sy;
    pts.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return pts;
}

export function blob(cx: number, cy: number, r: number, rnd: Rand, o: Parameters<typeof blobPts>[4] = {}): string {
  return smooth(blobPts(cx, cy, r, rnd, o));
}

/** Points along a ridge line using midpoint displacement. */
export function ridgePts(x0: number, x1: number, y0: number, y1: number, rnd: Rand, rough: number, depth = 6): Pt[] {
  let pts: Pt[] = [[x0, y0], [x1, y1]];
  let amp = rough;
  for (let d = 0; d < depth; d++) {
    const next: Pt[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      next.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + rnd.jit(0, amp)], b);
    }
    pts = next;
    amp *= 0.55;
  }
  return pts;
}

/** Close a top edge (left → right) down to `bottom`. */
export function closeDown(top: Pt[], bottom: number): Pt[] {
  return [...top, [top[top.length - 1][0], bottom], [top[0][0], bottom]];
}

/** Region between two left→right polylines. */
export function between(top: Pt[], bottom: Pt[]): Pt[] {
  return [...top, ...bottom.slice().reverse()];
}

/** Sampled sine-ish wave line (left → right). */
export function wave(x0: number, x1: number, y: number, amp: number, wavelength: number, phase = 0, segs = 24): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= segs; i++) {
    const x = x0 + ((x1 - x0) * i) / segs;
    pts.push([x, y + Math.sin((x / wavelength) * Math.PI * 2 + phase) * amp]);
  }
  return pts;
}

/** Open smooth curve through points returned as resampled points (for bands). */
export function resampleSmooth(pts: Pt[], per = 6): Pt[] {
  const out: Pt[] = [];
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const q = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([q(p0[0], p1[0], p2[0], p3[0]), q(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[n - 1]);
  return out;
}

/** Rotate & translate local points. */
export function place(pts: Pt[], x: number, y: number, angle: number, scale = 1): Pt[] {
  const c = Math.cos(angle), s = Math.sin(angle);
  return pts.map(([px, py]) => [x + (px * c - py * s) * scale, y + (px * s + py * c) * scale]);
}

/**
 * Petal / teardrop growing from a base point along `angle`.
 * `round` 0 = pointed tip, 1 = broad rounded tip.
 */
export function petalPts(x: number, y: number, angle: number, len: number, width: number, round = 0.5, ruffle = 0, rnd?: Rand): Pt[] {
  const local: Pt[] = [];
  const n = 14;
  // Right side from base to tip, then left side back.
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const w = Math.sin(Math.PI * Math.pow(t, 0.8 + round * 0.5)) * (1 - (1 - round) * Math.pow(t, 3) * 0.6);
    local.push([t * len, w * width * 0.5]);
  }
  for (let i = n - 1; i >= 1; i--) local[n + (n - i)] = [local[i][0], -local[i][1]];
  let pts = place(local, x, y, angle);
  if (ruffle > 0 && rnd) {
    pts = pts.map(([px, py], i) => {
      const t = i / pts.length;
      const r = ruffle * Math.sin(t * Math.PI) * width * 0.08;
      return [px + rnd.jit(0, r), py + rnd.jit(0, r)];
    });
  }
  return pts;
}

export function petal(x: number, y: number, angle: number, len: number, width: number, round = 0.5, ruffle = 0, rnd?: Rand): string {
  const pts = petalPts(x, y, angle, len, width, round, ruffle, rnd);
  const sharp = pts.map((_, i) => i === 0);
  return smoothSharp(pts, sharp);
}

/**
 * Leaf split along its midrib into two halves (returned separately so they can
 * carry light/shadow colours). `bend` curves the midrib.
 */
export function leafHalves(x: number, y: number, angle: number, len: number, width: number, bend = 0.15): [string, string] {
  const n = 12;
  const rib: Pt[] = [];
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const bx = t * len;
    const by = Math.sin(t * Math.PI) * bend * len;
    rib.push([bx, by]);
    const w = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.9) * width * 0.5;
    left.push([bx, by - w]);
    right.push([bx, by + w]);
  }
  const L = place([...left, ...rib.slice(1, -1).reverse()], x, y, angle);
  const R = place([...right, ...rib.slice(1, -1).reverse()], x, y, angle);
  const sharpL = L.map((_, i) => i === 0 || i === n);
  const sharpR = R.map((_, i) => i === 0 || i === n);
  return [smoothSharp(L, sharpL, 0.4), smoothSharp(R, sharpR, 0.4)];
}

export function leaf(x: number, y: number, angle: number, len: number, width: number, bend = 0.15): string {
  const n = 12;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([t * len, Math.sin(t * Math.PI) * bend * len - Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.9) * width * 0.5]);
  }
  for (let i = n - 1; i >= 1; i--) {
    const t = i / n;
    pts.push([t * len, Math.sin(t * Math.PI) * bend * len + Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.9) * width * 0.5]);
  }
  const P = place(pts, x, y, angle);
  return smoothSharp(P, P.map((_, i) => i === 0 || i === n), 0.4);
}

/** Thick curved stroke (stem, branch) as a closed shape. */
export function stem(pts: Pt[], w0: number, w1: number): string {
  const path = resampleSmooth(pts, 6);
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < path.length; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const w = (w0 + (w1 - w0) * (i / (path.length - 1))) / 2;
    left.push([path[i][0] + nx * w, path[i][1] + ny * w]);
    right.push([path[i][0] - nx * w, path[i][1] - ny * w]);
  }
  return poly([...left, ...right.reverse()]);
}

export function star(cx: number, cy: number, r1: number, r2: number, n: number, rot = 0): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? r2 : r1;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

/** Annular sector (ring segment) from angle a0 to a1. */
export function sector(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number, segs = 12): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = a0 + ((a1 - a0) * i) / segs;
    pts.push([cx + Math.cos(a) * r1, cy + Math.sin(a) * r1]);
  }
  for (let i = segs; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / segs;
    pts.push([cx + Math.cos(a) * r0, cy + Math.sin(a) * r0]);
  }
  return pts;
}

/** Sutherland–Hodgman: clip any polygon against a convex polygon (CCW or CW). */
export function clipConvex(subject: Pt[], clip: Pt[]): Pt[] {
  let out = subject;
  // Orientation of the clip polygon.
  let area = 0;
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const sign = area > 0 ? 1 : -1;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    const inside = (p: Pt) => sign * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) >= 0;
    const inter = (p: Pt, q: Pt): Pt => {
      const x1 = p[0], y1 = p[1], x2 = q[0], y2 = q[1];
      const x3 = a[0], y3 = a[1], x4 = b[0], y4 = b[1];
      const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / (den || 1e-9);
      return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
    };
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j], q = input[(j + 1) % input.length];
      const pin = inside(p), qin = inside(q);
      if (pin) {
        out.push(p);
        if (!qin) out.push(inter(p, q));
      } else if (qin) {
        out.push(inter(p, q));
      }
    }
  }
  return out;
}

/** Lloyd-relaxed Voronoi cells clipped to a rectangle. */
export function voronoi(sites: Pt[], w: number, h: number, relax = 2): Pt[][] {
  let s = sites.map((p) => [...p] as Pt);
  const bounds: Pt[] = [[0, 0], [w, 0], [w, h], [0, h]];
  let cells: Pt[][] = [];
  for (let iter = 0; iter <= relax; iter++) {
    cells = s.map((p, i) => {
      let cell = bounds;
      for (let j = 0; j < s.length && cell.length; j++) {
        if (i === j) continue;
        const q = s[j];
        // Half-plane of points closer to p than q, as a big convex quad.
        const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
        const dx = q[0] - p[0], dy = q[1] - p[1];
        const len = Math.hypot(dx, dy) || 1;
        const nx = dx / len, ny = dy / len; // towards q
        const tx = -ny, ty = nx;
        const B = (w + h) * 4;
        const half: Pt[] = [
          [mx + tx * B, my + ty * B],
          [mx - tx * B, my - ty * B],
          [mx - tx * B - nx * B, my - ty * B - ny * B],
          [mx + tx * B - nx * B, my + ty * B - ny * B],
        ];
        cell = clipConvex(cell, half);
      }
      return cell;
    });
    if (iter < relax) {
      s = cells.map((c, i) => (c.length ? centroid(c) : s[i]));
    }
  }
  return cells;
}

export function centroid(pts: Pt[]): Pt {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const cr = p[0] * q[1] - q[0] * p[1];
    a += cr;
    cx += (p[0] + q[0]) * cr;
    cy += (p[1] + q[1]) * cr;
  }
  if (Math.abs(a) < 1e-9) return pts[0];
  return [cx / (3 * a), cy / (3 * a)];
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpPt = (a: Pt, b: Pt, t: number): Pt => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

/** Pointed horizontal lens (water streak, cloud wisp, bark mark). */
export function lens(x0: number, x1: number, y: number, thick: number, bend = 0, angle = 0): string {
  const n = 8;
  const top: Pt[] = [];
  const bottom: Pt[] = [];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const b = Math.sin(t * Math.PI) * bend;
    const w = Math.sin(t * Math.PI) * thick * 0.5;
    top.push([x, y - w + b]);
    bottom.push([x, y + w + b]);
  }
  let pts: Pt[] = [[x0, y], ...top, [x1, y], ...bottom.reverse()];
  if (angle) {
    const cx = (x0 + x1) / 2;
    pts = place(pts.map(([px, py]) => [px - cx, py - y] as Pt), cx, y, angle);
  }
  return smoothSharp(pts, pts.map((_, i) => i === 0 || i === n), 0.5);
}

/** Squash points vertically around cy (simple perspective tilt). */
export function squash(pts: Pt[], cy: number, k: number): Pt[] {
  return pts.map(([x, y]) => [x, cy + (y - cy) * k]);
}

/** Lobed, cauliflower-edged cluster (foliage, clouds, blossom heads). */
export function cluster(
  cx: number, cy: number, r: number, rnd: Rand,
  o: { lobes?: number; depth?: number; sx?: number; sy?: number; rot?: number } = {},
): string {
  const lobes = o.lobes ?? 9, depth = o.depth ?? 0.16, sx = o.sx ?? 1, sy = o.sy ?? 1, rot = o.rot ?? 0;
  const c = Math.cos(rot), s = Math.sin(rot);
  const n = lobes * 2;
  const phase = rnd.next() * Math.PI * 2;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2 + rnd.jit(0, 0.08);
    const rr = r * (i % 2 === 0 ? 1 + rnd.jit(0, 0.12) : 1 - depth + rnd.jit(0, 0.05));
    const x = Math.cos(a) * rr * sx, y = Math.sin(a) * rr * sy;
    pts.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return smooth(pts, 0.55);
}

/** Closed Catmull-Rom curve resampled to a dense polygon (shared edges stay exact). */
export function resampleClosed(pts: Pt[], per = 8): Pt[] {
  const n = pts.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const q = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([q(p0[0], p1[0], p2[0], p3[0]), q(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

/** Longest contiguous run (wrapping) of a closed outline whose points satisfy `keep`. */
export function outlineRun(outline: Pt[], keep: (p: Pt) => boolean): Pt[] {
  const n = outline.length;
  let start = -1;
  for (let i = 0; i < n; i++) if (!keep(outline[i]) && keep(outline[(i + 1) % n])) { start = (i + 1) % n; break; }
  if (start < 0) return outline.filter(keep);
  let best: Pt[] = [];
  let cur: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const p = outline[(start + k) % n];
    if (keep(p)) cur.push(p);
    else {
      if (cur.length > best.length) best = cur;
      cur = [];
    }
  }
  return cur.length > best.length ? cur : best;
}
