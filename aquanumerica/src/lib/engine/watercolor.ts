/**
 * The watercolour surface – a lightweight pigment/water simulation.
 *
 * Per pixel we store
 *  • dry   – pigment density stained into the paper (RGB optical density)
 *  • wet   – pigment density still suspended in water
 *  • water – how wet the paper is (0..1)
 *
 * Behaviour
 *  • Brush dabs deposit pigment into the wet layer. On damp paper new pigment
 *    displaces/mixes with the wash (wet-in-wet); on dry paper it glazes on top.
 *  • Wet pigment diffuses between neighbouring wet pixels – but never across
 *    region borders, so bleeding stays inside the region.
 *  • Water evaporates; as a pixel dries its pigment settles into the dry layer.
 *  • When a stroke ends, pigment migrates to its edges (and to region borders)
 *    producing the characteristic darker rims of real watercolour.
 *  • Every write respects the region-lock mask with soft, anti-aliased edges.
 *
 * All buffers are typed arrays; the class has no DOM dependencies.
 */

import type { ToolSpec } from "./brushes";
import type { RGB } from "./color";
import { History, type TileSnapshot, type TileStore } from "./history";
import { getNoise, clamp } from "./noise";
import { getPaperTexture, PAPER_MASK } from "./paper";
import { DIST_UNIT, TILE_SIZE, type RegionAnalysis } from "./regions";

export interface StrokeOptions {
  tool: ToolSpec;
  opacity: number;
  flow: number;
  wetness: number;
  /** Pigment density of the brush colour at full strength. */
  density: RGB;
  /** Paintable regions (by region id) or null for free painting. */
  allow: Uint8Array | null;
  /** Extend the footprint toward nearby region borders. */
  magnetic: boolean;
  seed: number;
}

export interface Dab {
  x: number;
  y: number;
  /** Radius in paint pixels. */
  radius: number;
  /** Stroke direction in radians. */
  angle: number;
  /** Pen pressure 0..1 (1 for mouse/touch). */
  pressure: number;
}

export interface FillJob {
  region: number;
  order: Int32Array;
  keys: Int32Array;
  pos: number;
  front: number;
  speed: number;
  opts: StrokeOptions;
  centerY: number;
  spanY: number;
  done: boolean;
}

const Q_SCALE = 4096; // density quantisation for snapshots / saves
const ACTIVE_FRAMES = 150; // diffusion keeps running this many steps after activity
const WET_EPS = 0.02;

export class WatercolorSurface implements TileStore {
  readonly W: number;
  readonly H: number;
  readonly N: number;
  readonly tilesX: number;
  readonly tilesY: number;
  readonly analysis: RegionAnalysis;

  readonly dry: Float32Array;
  readonly wet: Float32Array;
  readonly water: Float32Array;
  /** Per-stroke coverage accumulator. */
  private readonly cov: Float32Array;
  private readonly scratch: Float32Array;

  readonly tileWater: Uint8Array;
  private readonly tileActive: Uint8Array;
  readonly renderDirty: Uint8Array;
  readonly progressDirty: Uint8Array;

  history: History;
  /** Anti-aliasing weight by edge distance (soft region borders). */
  private readonly aaLUT: Float32Array;

  /** Drying speed multiplier (1 = natural). */
  dryingSpeed = 1;
  /** Bumped on every write (including drying) – drives redraws. */
  version = 0;
  /** Bumped only by edits (strokes, fills, resets, history) – drives autosave. */
  editVersion = 0;

  private stroke: StrokeOptions | null = null;
  private strokeBox = [0, 0, 0, 0];
  private strokeRadiusSum = 0;
  private strokeDabs = 0;
  private dryAccumulator = 0;

  constructor(analysis: RegionAnalysis) {
    this.analysis = analysis;
    this.W = analysis.width;
    this.H = analysis.height;
    this.N = this.W * this.H;
    this.tilesX = analysis.tilesX;
    this.tilesY = analysis.tilesY;
    const T = this.tilesX * this.tilesY;
    this.dry = new Float32Array(this.N * 3);
    this.wet = new Float32Array(this.N * 3);
    this.water = new Float32Array(this.N);
    this.cov = new Float32Array(this.N);
    this.scratch = new Float32Array(this.N);
    this.tileWater = new Uint8Array(T);
    this.tileActive = new Uint8Array(T);
    this.renderDirty = new Uint8Array(T).fill(1);
    this.progressDirty = new Uint8Array(T).fill(1);
    this.history = new History(this);
    this.aaLUT = new Float32Array(256);
    for (let d = 0; d < 256; d++) {
      // d is in chamfer units (3 per px). Border pixels (1 px) get partial coverage.
      const px = d / DIST_UNIT;
      this.aaLUT[d] = px <= 1 ? 0.72 : px <= 2 ? 0.94 : 1;
    }
  }

  // ---------------------------------------------------------------------
  // Tile bookkeeping
  // ---------------------------------------------------------------------

  private touch(t: number) {
    this.history.touch(t);
    this.renderDirty[t] = 1;
    this.progressDirty[t] = 1;
  }

  private touchRect(x0: number, y0: number, x1: number, y1: number, allow: Uint8Array | null, wetting: boolean) {
    const tx0 = (x0 / TILE_SIZE) | 0, tx1 = ((x1 - 1) / TILE_SIZE) | 0;
    const ty0 = (y0 / TILE_SIZE) | 0, ty1 = ((y1 - 1) / TILE_SIZE) | 0;
    const tr = this.analysis.tileRegions;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = ty * this.tilesX + tx;
        if (allow) {
          const rs = tr[t];
          let ok = false;
          for (let k = 0; k < rs.length; k++) if (allow[rs[k]]) { ok = true; break; }
          if (!ok) continue;
        }
        this.touch(t);
        if (wetting) {
          this.tileWater[t] = 1;
          this.tileActive[t] = ACTIVE_FRAMES;
        }
      }
    }
  }

  private tileBounds(t: number) {
    const tx = t % this.tilesX, ty = (t / this.tilesX) | 0;
    const x0 = tx * TILE_SIZE, y0 = ty * TILE_SIZE;
    return [x0, y0, Math.min(this.W, x0 + TILE_SIZE), Math.min(this.H, y0 + TILE_SIZE)] as const;
  }

  // ---------------------------------------------------------------------
  // Strokes
  // ---------------------------------------------------------------------

  beginStroke(opts: StrokeOptions) {
    this.stroke = opts;
    this.strokeBox = [this.W, this.H, 0, 0];
    this.strokeRadiusSum = 0;
    this.strokeDabs = 0;
  }

  get stroking() {
    return this.stroke !== null;
  }

  dab(d: Dab) {
    const o = this.stroke;
    if (!o) return;
    const tool = o.tool;
    const W = this.W, H = this.H;
    const r = Math.max(0.6, d.radius);
    const snap = o.magnetic && o.allow ? Math.min(14, 0.35 * r + 2) : 0;
    const reach = r * (tool.shape === "flat" ? 1.05 : 1) * (1 + tool.edgeNoise * 0.3) + snap + 1;
    const x0 = Math.max(0, Math.floor(d.x - reach)), x1 = Math.min(W, Math.ceil(d.x + reach));
    const y0 = Math.max(0, Math.floor(d.y - reach)), y1 = Math.min(H, Math.ceil(d.y + reach));
    if (x0 >= x1 || y0 >= y1) return;

    const erase = tool.kind === "eraser";
    this.touchRect(x0, y0, x1, y1, o.allow, !erase || o.wetness > 0);
    const sb = this.strokeBox;
    if (x0 < sb[0]) sb[0] = x0;
    if (y0 < sb[1]) sb[1] = y0;
    if (x1 > sb[2]) sb[2] = x1;
    if (y1 > sb[3]) sb[3] = y1;
    this.strokeRadiusSum += r;
    this.strokeDabs++;
    this.version++;
    this.editVersion++;

    const opacity = o.opacity * (1 - tool.pressureOpacity * (1 - d.pressure));
    const flow = o.flow;
    const cos = Math.cos(d.angle), sin = Math.sin(d.angle);
    const invR = 1 / r;
    const hard = tool.hardness;
    const flat = tool.shape === "flat";
    const invAspect = 1 / tool.aspect;
    const edgeNoise = tool.edgeNoise;
    const bristle = tool.bristle;
    const noise = getNoise();
    const paper = getPaperTexture().height;
    const seed = o.seed;
    const sx = (seed % 251) * 3.1, sy = (seed % 241) * 2.7;
    // Dry-brush: with little water the paint skips the paper's valleys.
    const thr = tool.kind === "brush" ? (1 - o.wetness) * (1 - o.wetness) * 0.55 : 0;
    const variation = tool.variation;
    const P0 = o.density[0], P1 = o.density[1], P2 = o.density[2];
    const wetAmt = o.wetness;
    const regionMap = this.analysis.regionMap;
    const edgeDist = this.analysis.edgeDist;
    const allow = o.allow;
    const aa = this.aaLUT;
    const cov = this.cov, wet = this.wet, dry = this.dry, water = this.water;
    const noiseScale = 1.1;
    const varScale = 1 / 22;
    const bristleFreq = 10 + r * 0.15;

    for (let y = y0; y < y1; y++) {
      const dy = y + 0.5 - d.y;
      let i = y * W + x0;
      for (let x = x0; x < x1; x++, i++) {
        if (allow !== null && allow[regionMap[i]] === 0) continue;
        const dx = x + 0.5 - d.x;
        const u = dx * cos + dy * sin;
        const v = -dx * sin + dy * cos;
        let dist: number;
        if (flat) {
          const au = Math.abs(u) * invR * invAspect, av = Math.abs(v) * invR;
          const au2 = au * au, av2 = av * av;
          dist = Math.sqrt(Math.sqrt(au2 * au2 + av2 * av2));
        } else {
          dist = Math.sqrt(dx * dx + dy * dy) * invR;
        }
        if (edgeNoise > 0 && dist > 0.5) {
          // Two scales of wobble: a ragged deckle plus slow undulation of the edge.
          const n = noise.sample(x * noiseScale + sx, y * noiseScale + sy) * 0.6 + noise.sample(x * 0.18 + sy, y * 0.18 + sx) * 0.4;
          dist *= 1 + edgeNoise * (n - 0.5) * 0.7;
        }
        if (snap > 0) {
          const e = edgeDist[i] / DIST_UNIT;
          if (e < snap) dist -= (snap - e) * invR;
        }
        if (dist >= 1) continue;
        let a: number;
        if (dist <= hard) a = 1;
        else {
          const t = (dist - hard) / (1 - hard);
          a = 1 - t * t * (3 - 2 * t);
        }
        if (bristle > 0) {
          // Streaks run along the stroke: high frequency across, low along.
          const b = noise.sample(v * invR * bristleFreq + sx, u * invR * 0.8 + sy);
          a *= 1 - bristle * b;
        }
        if (allow !== null) a *= aa[edgeDist[i]];
        if (thr > 0) {
          const h = paper[((y & PAPER_MASK) << 10) | (x & PAPER_MASK)];
          const tooth = (h - thr) * 5 + 0.6;
          a *= tooth <= 0 ? 0 : tooth >= 1 ? 1 : tooth;
        }
        a *= flow;
        if (a <= 0.002) continue;

        const S = cov[i];
        if (S >= opacity) continue;
        const Snew = S + a * (opacity - S);
        const dS = Snew - S;
        cov[i] = Snew;
        const i3 = i * 3;

        if (erase) {
          const wetL = Math.min(1, dS * 1.3);
          const dryL = dS * (0.35 + 0.55 * wetAmt);
          wet[i3] *= 1 - wetL; wet[i3 + 1] *= 1 - wetL; wet[i3 + 2] *= 1 - wetL;
          dry[i3] *= 1 - dryL; dry[i3 + 1] *= 1 - dryL; dry[i3 + 2] *= 1 - dryL;
          if (dry[i3] + dry[i3 + 1] + dry[i3 + 2] < 0.004) dry[i3] = dry[i3 + 1] = dry[i3 + 2] = 0;
          const wv = water[i] * (1 - wetL);
          const damp = 0.12 * wetAmt * Snew;
          water[i] = wv > damp ? wv : damp;
          continue;
        }

        // Natural pigment variation: gentle value + hue drift across the stroke.
        let vl = 1, vh = 0;
        if (variation > 0) {
          vl = 1 + variation * (noise.sample(x * varScale + sx, y * varScale + sy) - 0.5) * 0.42;
          vh = variation * (noise.sample(x * varScale * 0.7 + sy, y * varScale * 0.7 + sx) - 0.5) * 0.22;
        }
        const p0 = P0 * vl * (1 + vh), p1 = P1 * vl, p2 = P2 * vl * (1 - vh);
        const wv = water[i];
        // λ: 0 on dry paper (glaze), 1 on wet paper (mix into the wash).
        const lam = wv <= 0.03 ? 0 : wv >= 0.25 ? 1 : (wv - 0.03) / 0.22;
        const t = dS / (opacity - S);
        const keep = 1 - t;
        const to = opacity * t;
        let w0 = wet[i3], w1 = wet[i3 + 1], w2 = wet[i3 + 2];
        w0 = lam * (w0 * keep + p0 * to) + (1 - lam) * (w0 + p0 * dS);
        w1 = lam * (w1 * keep + p1 * to) + (1 - lam) * (w1 + p1 * dS);
        w2 = lam * (w2 * keep + p2 * to) + (1 - lam) * (w2 + p2 * dS);
        wet[i3] = w0; wet[i3 + 1] = w1; wet[i3 + 2] = w2;
        const nw = (wetAmt * Snew) / opacity;
        if (nw > wv) water[i] = nw > 1 ? 1 : nw;
      }
    }
  }

  /** Finish the stroke: edge darkening, then reset the coverage buffer. */
  endStroke() {
    const o = this.stroke;
    if (!o) return;
    this.stroke = null;
    const [x0, y0, x1, y1] = this.strokeBox;
    if (x1 <= x0 || y1 <= y0) return;
    const avgR = this.strokeDabs ? this.strokeRadiusSum / this.strokeDabs : 4;
    const strength = o.tool.edgeDarken * (0.45 + 0.55 * o.wetness) * 2.1;
    if (o.tool.kind !== "eraser" && strength > 0) {
      const rb = Math.round(clamp(avgR * 0.2, 2, 9));
      this.edgeDarken(x0, y0, x1, y1, rb, o.density, strength);
    }
    // Clear the coverage accumulator.
    const W = this.W;
    for (let y = y0; y < y1; y++) this.cov.fill(0, y * W + x0, y * W + x1);
  }

  /**
   * Pigment migrates towards the edge of a drying wash. We approximate it as
   * coverage minus its blur (positive just inside every edge, including the
   * clipped region border) and add that much extra pigment.
   */
  private edgeDarken(x0: number, y0: number, x1: number, y1: number, rb: number, P: RGB, k: number) {
    const W = this.W, H = this.H;
    const bx0 = Math.max(0, x0 - rb * 2), by0 = Math.max(0, y0 - rb * 2);
    const bx1 = Math.min(W, x1 + rb * 2), by1 = Math.min(H, y1 + rb * 2);
    const bw = bx1 - bx0, bh = by1 - by0;
    const buf = this.scratch; // reuse: bw*bh ≤ N
    const tmp = new Float32Array(Math.max(bw, bh));
    for (let y = 0; y < bh; y++) {
      const src = (by0 + y) * W + bx0;
      for (let x = 0; x < bw; x++) buf[y * bw + x] = this.cov[src + x];
    }
    // Two separable box-blur passes ≈ Gaussian.
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < bh; y++) boxBlurLine(buf, y * bw, 1, bw, rb, tmp);
      for (let x = 0; x < bw; x++) boxBlurLine(buf, x, bw, bh, rb, tmp);
    }
    const wet = this.wet, cov = this.cov;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * W + x;
        const c = cov[i];
        if (c < 0.01) continue;
        const e = c - buf[(y - by0) * bw + (x - bx0)];
        if (e <= 0.003) continue;
        const add = e * k;
        const i3 = i * 3;
        wet[i3] += P[0] * add;
        wet[i3 + 1] += P[1] * add;
        wet[i3 + 2] += P[2] * add;
      }
    }
  }

  // ---------------------------------------------------------------------
  // Region fill (flowing wash)
  // ---------------------------------------------------------------------

  /**
   * Prepare a flowing wash for `region`, spreading outward from (ox, oy) along
   * geodesic distance inside the region with an organic, noisy wavefront.
   */
  beginFill(region: number, opts: StrokeOptions, ox: number, oy: number): FillJob {
    const a = this.analysis;
    const W = this.W;
    const start = a.pixelOffsets[region], end = a.pixelOffsets[region + 1];
    const count = end - start;
    const pix = a.pixelIndices;
    const regionMap = a.regionMap;
    // Geodesic chamfer distance via Dial's bucket queue (weights 3/4).
    const dist = new Int32Array(count).fill(-1);
    // Map global index → local index through a temporary lookup in scratch.
    const local = this.scratch;
    for (let k = 0; k < count; k++) local[pix[start + k]] = k;
    let seed = Math.round(oy) * W + Math.round(ox);
    if (seed < 0 || seed >= this.N || regionMap[seed] !== region) seed = pix[start];
    const buckets: number[][] = [[], [], [], [], []];
    dist[local[seed]] = 0;
    buckets[0].push(seed);
    let pending = 1, d = 0, maxD = 0;
    const H = this.H;
    while (pending > 0) {
      const bucket = buckets[d % 5];
      while (bucket.length) {
        const i = bucket.pop()!;
        pending--;
        const li = local[i];
        if (dist[li] !== d) continue;
        if (d > maxD) maxD = d;
        const x = i % W, y = (i / W) | 0;
        for (let oy2 = -1; oy2 <= 1; oy2++) {
          const ny = y + oy2;
          if (ny < 0 || ny >= H) continue;
          for (let ox2 = -1; ox2 <= 1; ox2++) {
            if (!ox2 && !oy2) continue;
            const nx = x + ox2;
            if (nx < 0 || nx >= W) continue;
            const j = ny * W + nx;
            if (regionMap[j] !== region) continue;
            const lj = local[j];
            const nd = d + (ox2 && oy2 ? 4 : 3);
            if (dist[lj] < 0 || nd < dist[lj]) {
              dist[lj] = nd;
              buckets[nd % 5].push(j);
              pending++;
            }
          }
        }
      }
      d++;
    }
    // Organic wavefront: perturb distances with smooth noise, then counting-sort.
    const noise = getNoise();
    const amp = Math.min(90, 12 + Math.sqrt(count) * 0.35);
    const keysRaw = new Int32Array(count);
    let maxKey = 0;
    const sx = (opts.seed % 97) * 5.3;
    for (let k = 0; k < count; k++) {
      const i = pix[start + k];
      const x = i % W, y = (i / W) | 0;
      const n = noise.sample(x * 0.035 + sx, y * 0.035) - 0.5;
      const key = Math.max(0, Math.round(dist[k] + n * amp * DIST_UNIT));
      keysRaw[k] = key;
      if (key > maxKey) maxKey = key;
    }
    const counts = new Int32Array(maxKey + 2);
    for (let k = 0; k < count; k++) counts[keysRaw[k] + 1]++;
    for (let q = 1; q < counts.length; q++) counts[q] += counts[q - 1];
    const order = new Int32Array(count);
    const keys = new Int32Array(count);
    for (let k = 0; k < count; k++) {
      const pos = counts[keysRaw[k]]++;
      order[pos] = pix[start + k];
      keys[pos] = keysRaw[k];
    }
    const [, by0, , by1] = a.regions[region].bbox;
    const duration = clamp(0.45 + Math.sqrt(count / this.N) * 1.6, 0.45, 1.6);
    this.touchRegion(region, true);
    return {
      region,
      order,
      keys,
      pos: 0,
      front: 0,
      speed: (maxKey + 1) / duration,
      opts,
      centerY: (by0 + by1) / 2,
      spanY: Math.max(1, by1 - by0),
      done: count === 0,
    };
  }

  /** Advance a fill animation by dt seconds. Returns true when complete. */
  stepFill(job: FillJob, dt: number): boolean {
    if (job.done) return true;
    job.front += job.speed * dt;
    const limit = job.front;
    const { order, keys } = job;
    const o = job.opts;
    const P = o.density;
    const W = this.W;
    const edgeDist = this.analysis.edgeDist;
    const aa = this.aaLUT;
    const noise = getNoise();
    const wet = this.wet, water = this.water;
    const opacity = o.opacity;
    const variation = o.tool.variation;
    const pool = o.tool.edgeDarken * (0.5 + 0.5 * o.wetness) * 0.42;
    const sx = (o.seed % 251) * 3.1, sy = (o.seed % 241) * 2.7;
    const flow = 0.75 + o.flow * 0.25; // flow → evenness of the wash
    const tilesX = this.tilesX;
    let lastTile = -1;
    let pos = job.pos;
    while (pos < order.length && keys[pos] <= limit) {
      const i = order[pos++];
      const x = i % W, y = (i / W) | 0;
      // Flag tiles as the wavefront reaches them: a tile flagged only at the
      // start could be "dried" before the wash arrives and then never dry.
      const t = ((y / TILE_SIZE) | 0) * tilesX + ((x / TILE_SIZE) | 0);
      if (t !== lastTile) {
        lastTile = t;
        this.tileWater[t] = 1;
        this.tileActive[t] = ACTIVE_FRAMES;
        this.renderDirty[t] = 1;
        this.progressDirty[t] = 1;
      }
      const e = edgeDist[i] / DIST_UNIT;
      // Wash coverage with soft border, gentle bead toward the bottom.
      const bead = 1 + 0.07 * ((y - job.centerY) / job.spanY);
      const vl = 1 + variation * (noise.sample(x / 26 + sx, y / 26 + sy) - 0.5) * 0.36 * (2 - flow);
      const vh = variation * (noise.sample(x / 40 + sy, y / 40 + sx) - 0.5) * 0.16;
      const rim = 1 + pool * Math.exp(-(e - 1) / 2.4);
      const cover = opacity * aa[edgeDist[i]];
      const k = cover * vl * bead * rim;
      const p0 = P[0] * k * (1 + vh), p1 = P[1] * k, p2 = P[2] * k * (1 - vh);
      const i3 = i * 3;
      const wv = water[i];
      const lam = wv <= 0.03 ? 0 : wv >= 0.25 ? 1 : (wv - 0.03) / 0.22;
      // Mix into an existing wash (λ) or glaze over dry paint.
      wet[i3] = lam * (wet[i3] * (1 - cover) + p0) + (1 - lam) * (wet[i3] + p0);
      wet[i3 + 1] = lam * (wet[i3 + 1] * (1 - cover) + p1) + (1 - lam) * (wet[i3 + 1] + p1);
      wet[i3 + 2] = lam * (wet[i3 + 2] * (1 - cover) + p2) + (1 - lam) * (wet[i3 + 2] + p2);
      const nw = o.wetness * (0.85 + 0.15 * Math.min(1, e / 4));
      if (nw > wv) water[i] = nw;
    }
    job.pos = pos;
    this.version++;
    this.editVersion++;
    if (pos >= order.length) job.done = true;
    return job.done;
  }

  finishFill(job: FillJob) {
    if (!job.done) {
      job.front = Infinity;
      this.stepFill(job, 0);
    }
  }

  // ---------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------

  /** Advance diffusion + drying. Returns true while anything is still wet. */
  step(dt: number): boolean {
    const T = this.tilesX * this.tilesY;
    let anyWet = false;
    // Diffusion runs every frame on recently active tiles – several passes when
    // few tiles are moving, so wet-in-wet blends visibly bloom.
    let activeCount = 0;
    for (let t = 0; t < T; t++) if (this.tileActive[t] > 0 && this.tileWater[t]) activeCount++;
    const passes = activeCount === 0 ? 0 : activeCount < 60 ? 3 : activeCount < 160 ? 2 : 1;
    for (let pass = 0; pass < passes; pass++) {
      for (let t = 0; t < T; t++) {
        if (this.tileActive[t] > 0 && this.tileWater[t]) {
          const moved = this.diffuseTile(t);
          if (pass === passes - 1) {
            this.tileActive[t] = moved ? Math.max(this.tileActive[t] - 1, 1) : this.tileActive[t] > 20 ? 20 : this.tileActive[t] - 1;
          }
        }
      }
    }
    // Drying is batched at ~12 Hz to keep redraws cheap.
    this.dryAccumulator += dt;
    if (this.dryAccumulator >= 0.08) {
      const amount = this.dryAccumulator * 0.24 * this.dryingSpeed;
      this.dryAccumulator = 0;
      for (let t = 0; t < T; t++) {
        if (!this.tileWater[t]) continue;
        if (this.dryTile(t, amount)) anyWet = true;
      }
    } else {
      for (let t = 0; t < T; t++) if (this.tileWater[t]) { anyWet = true; break; }
    }
    return anyWet;
  }

  get isWet() {
    for (let t = 0; t < this.tileWater.length; t++) if (this.tileWater[t]) return true;
    return false;
  }

  /** Pairwise, pigment-conserving diffusion inside one tile (and across its right/bottom seams). */
  private diffuseTile(t: number): boolean {
    const [x0, y0, x1, y1] = this.tileBounds(t);
    const W = this.W, H = this.H;
    const wet = this.wet, water = this.water, rm = this.analysis.regionMap;
    const D = 0.2;
    let maxFlux = 0;
    let touchedRight = false, touchedDown = false;
    this.touch(t);
    for (let y = y0; y < y1; y++) {
      let i = y * W + x0;
      for (let x = x0; x < x1; x++, i++) {
        const wi = water[i];
        if (wi < WET_EPS) continue;
        const r = rm[i];
        const i3 = i * 3;
        // Right neighbour.
        if (x + 1 < W) {
          const j = i + 1;
          const wj = water[j];
          if (wj >= WET_EPS && rm[j] === r) {
            if (x + 1 === x1 && !touchedRight) {
              this.touch(t + 1);
              touchedRight = true;
            }
            const k = D * (wi < wj ? wi : wj);
            const j3 = j * 3;
            const f0 = k * (wet[j3] - wet[i3]);
            const f1 = k * (wet[j3 + 1] - wet[i3 + 1]);
            const f2 = k * (wet[j3 + 2] - wet[i3 + 2]);
            wet[i3] += f0; wet[j3] -= f0;
            wet[i3 + 1] += f1; wet[j3 + 1] -= f1;
            wet[i3 + 2] += f2; wet[j3 + 2] -= f2;
            const m = Math.abs(f0) + Math.abs(f1) + Math.abs(f2);
            if (m > maxFlux) maxFlux = m;
          }
        }
        // Bottom neighbour.
        if (y + 1 < H) {
          const j = i + W;
          const wj = water[j];
          if (wj >= WET_EPS && rm[j] === r) {
            if (y + 1 === y1 && !touchedDown) {
              this.touch(t + this.tilesX);
              touchedDown = true;
            }
            const k = D * (wi < wj ? wi : wj);
            const j3 = j * 3;
            const f0 = k * (wet[j3] - wet[i3]);
            const f1 = k * (wet[j3 + 1] - wet[i3 + 1]);
            const f2 = k * (wet[j3 + 2] - wet[i3 + 2]);
            wet[i3] += f0; wet[j3] -= f0;
            wet[i3 + 1] += f1; wet[j3 + 1] -= f1;
            wet[i3 + 2] += f2; wet[j3 + 2] -= f2;
            const m = Math.abs(f0) + Math.abs(f1) + Math.abs(f2);
            if (m > maxFlux) maxFlux = m;
          }
        }
      }
    }
    // Keep neighbours alive when pigment is crossing the seams.
    if (maxFlux > 2e-4) {
      if (touchedRight) this.tileActive[t + 1] = Math.max(this.tileActive[t + 1], 40);
      if (touchedDown) this.tileActive[t + this.tilesX] = Math.max(this.tileActive[t + this.tilesX], 40);
    }
    return maxFlux > 2e-4;
  }

  /** Evaporate water in a tile; settle pigment where it dries. Returns true if still wet. */
  private dryTile(t: number, amount: number): boolean {
    const [x0, y0, x1, y1] = this.tileBounds(t);
    const W = this.W;
    const water = this.water, wet = this.wet, dry = this.dry;
    this.touch(t);
    let still = false;
    for (let y = y0; y < y1; y++) {
      let i = y * W + x0;
      for (let x = x0; x < x1; x++, i++) {
        const w = water[i];
        if (w <= 0) continue;
        const nw = w - amount;
        if (nw > 0) {
          water[i] = nw;
          still = true;
        } else {
          water[i] = 0;
          const i3 = i * 3;
          dry[i3] += wet[i3]; dry[i3 + 1] += wet[i3 + 1]; dry[i3 + 2] += wet[i3 + 2];
          wet[i3] = wet[i3 + 1] = wet[i3 + 2] = 0;
        }
      }
    }
    if (!still) {
      this.tileWater[t] = 0;
      this.tileActive[t] = 0;
    }
    this.version++;
    return still;
  }

  /** Instantly dry everything (hair-dryer). */
  dryAll() {
    for (let t = 0; t < this.tileWater.length; t++) {
      if (this.tileWater[t]) this.dryTile(t, 2);
    }
  }

  // ---------------------------------------------------------------------
  // Region operations
  // ---------------------------------------------------------------------

  private touchRegion(region: number, wetting: boolean) {
    const tiles = this.analysis.regionTiles[region];
    for (let k = 0; k < tiles.length; k++) {
      const t = tiles[k];
      this.touch(t);
      if (wetting) {
        this.tileWater[t] = 1;
        this.tileActive[t] = ACTIVE_FRAMES;
      }
    }
  }

  /** Remove all paint from a region. */
  clearRegion(region: number) {
    this.touchRegion(region, false);
    const a = this.analysis;
    for (let p = a.pixelOffsets[region]; p < a.pixelOffsets[region + 1]; p++) {
      const i = a.pixelIndices[p];
      const i3 = i * 3;
      this.dry[i3] = this.dry[i3 + 1] = this.dry[i3 + 2] = 0;
      this.wet[i3] = this.wet[i3 + 1] = this.wet[i3 + 2] = 0;
      this.water[i] = 0;
    }
    this.version++;
    this.editVersion++;
  }

  /** Remove all paint everywhere. */
  clearAll() {
    for (let t = 0; t < this.tileWater.length; t++) this.touch(t);
    this.dry.fill(0);
    this.wet.fill(0);
    this.water.fill(0);
    this.tileWater.fill(0);
    this.tileActive.fill(0);
    this.version++;
    this.editVersion++;
  }

  // ---------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------

  /** Total optical density (dry + wet) at a pixel. */
  densityAt(i: number, out: number[] | Float32Array) {
    const i3 = i * 3;
    out[0] = this.dry[i3] + this.wet[i3];
    out[1] = this.dry[i3 + 1] + this.wet[i3 + 1];
    out[2] = this.dry[i3 + 2] + this.wet[i3 + 2];
    return out;
  }

  /** Average paint density in a square neighbourhood (for the eyedropper). */
  sampleDensity(x: number, y: number, radius: number): RGB {
    const r = Math.max(0, Math.round(radius));
    const acc: RGB = [0, 0, 0];
    let n = 0;
    const tmp = [0, 0, 0];
    for (let yy = Math.max(0, y - r); yy <= Math.min(this.H - 1, y + r); yy++) {
      for (let xx = Math.max(0, x - r); xx <= Math.min(this.W - 1, x + r); xx++) {
        this.densityAt(yy * this.W + xx, tmp);
        acc[0] += tmp[0]; acc[1] += tmp[1]; acc[2] += tmp[2];
        n++;
      }
    }
    if (n) { acc[0] /= n; acc[1] /= n; acc[2] /= n; }
    return acc;
  }

  // ---------------------------------------------------------------------
  // Snapshots (TileStore) & persistence
  // ---------------------------------------------------------------------

  captureTile(tile: number): TileSnapshot {
    const [x0, y0, x1, y1] = this.tileBounds(tile);
    const W = this.W;
    const tw = x1 - x0, th = y1 - y0;
    const hasWet = this.tileWater[tile] === 1 || this.tileHasWetPigment(x0, y0, x1, y1);
    const stride = hasWet ? 7 : 3;
    const data = new Uint16Array(tw * th * stride);
    let o = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * W + x, i3 = i * 3;
        data[o++] = quant(this.dry[i3]);
        data[o++] = quant(this.dry[i3 + 1]);
        data[o++] = quant(this.dry[i3 + 2]);
        if (hasWet) {
          data[o++] = quant(this.wet[i3]);
          data[o++] = quant(this.wet[i3 + 1]);
          data[o++] = quant(this.wet[i3 + 2]);
          data[o++] = Math.round(Math.min(1, this.water[i]) * 65535);
        }
      }
    }
    return { tile, data, hasWet };
  }

  restoreTile(snap: TileSnapshot) {
    const [x0, y0, x1, y1] = this.tileBounds(snap.tile);
    const W = this.W;
    const d = snap.data;
    let o = 0;
    let wetLeft = false;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * W + x, i3 = i * 3;
        this.dry[i3] = d[o++] / Q_SCALE;
        this.dry[i3 + 1] = d[o++] / Q_SCALE;
        this.dry[i3 + 2] = d[o++] / Q_SCALE;
        if (snap.hasWet) {
          this.wet[i3] = d[o++] / Q_SCALE;
          this.wet[i3 + 1] = d[o++] / Q_SCALE;
          this.wet[i3 + 2] = d[o++] / Q_SCALE;
          const w = d[o++] / 65535;
          this.water[i] = w;
          if (w > 0) wetLeft = true;
        } else {
          this.wet[i3] = this.wet[i3 + 1] = this.wet[i3 + 2] = 0;
          this.water[i] = 0;
        }
      }
    }
    this.tileWater[snap.tile] = wetLeft ? 1 : 0;
    this.tileActive[snap.tile] = wetLeft ? ACTIVE_FRAMES : 0;
    this.renderDirty[snap.tile] = 1;
    this.progressDirty[snap.tile] = 1;
    this.version++;
    this.editVersion++;
  }

  private tileHasWetPigment(x0: number, y0: number, x1: number, y1: number) {
    const W = this.W;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i3 = (y * W + x) * 3;
        if (this.wet[i3] !== 0 || this.wet[i3 + 1] !== 0 || this.wet[i3 + 2] !== 0) return true;
      }
    }
    return false;
  }

  /** Flatten (dry + wet) into a quantised buffer for saving. */
  serialize(): Uint16Array {
    const out = new Uint16Array(this.N * 3);
    for (let k = 0; k < out.length; k++) out[k] = quant(this.dry[k] + this.wet[k]);
    return out;
  }

  deserialize(data: Uint16Array) {
    if (data.length !== this.N * 3) throw new Error("Saved painting does not match canvas size");
    for (let k = 0; k < data.length; k++) this.dry[k] = data[k] / Q_SCALE;
    this.wet.fill(0);
    this.water.fill(0);
    this.tileWater.fill(0);
    this.tileActive.fill(0);
    this.renderDirty.fill(1);
    this.progressDirty.fill(1);
    this.history.clear();
    this.version++;
  }

  /** Mark everything for re-render (e.g. after display settings change). */
  invalidateAll() {
    this.renderDirty.fill(1);
  }
}

function quant(v: number) {
  const q = Math.round(v * Q_SCALE);
  return q < 0 ? 0 : q > 65535 ? 65535 : q;
}

/** In-place running-sum box blur on a strided line. */
function boxBlurLine(buf: Float32Array, offset: number, stride: number, len: number, r: number, tmp: Float32Array) {
  for (let k = 0; k < len; k++) tmp[k] = buf[offset + k * stride];
  const inv = 1 / (2 * r + 1);
  let acc = 0;
  for (let k = -r; k <= r; k++) acc += tmp[Math.min(len - 1, Math.max(0, k))];
  for (let k = 0; k < len; k++) {
    buf[offset + k * stride] = acc * inv;
    const add = tmp[Math.min(len - 1, k + r + 1)];
    const sub = tmp[Math.max(0, k - r)];
    acc += add - sub;
  }
}
