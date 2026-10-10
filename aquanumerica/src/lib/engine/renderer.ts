/**
 * Renderer: turns the pigment simulation into pixels and composites the
 * painting's layers – paper, paint, varnish, underdrawing, numbers, guides.
 *
 * Paint is rendered as a transmittance image (white = no paint) and drawn
 * with `multiply` over the paper, which is physically how a transparent
 * watercolour glaze modulates the paper beneath it.
 */

import { getPaperTexture, PAPER_MASK, PAPER_RGB } from "./paper";
import { DIST_UNIT, TILE_SIZE, type RegionAnalysis } from "./regions";
import type { WatercolorSurface } from "./watercolor";
import { hexToRgb, luminance, type RGB } from "./color";
import type { PaletteColor } from "../canvases/types";

export interface LayerState {
  visible: boolean;
  opacity: number;
}

export interface LayerSettings {
  underdrawing: LayerState;
  paint: LayerState;
  paper: LayerState;
  varnish: LayerState;
  /** Pigment granulation strength 0..1. */
  granulation: number;
  /** Paper cockling strength 0..1. */
  cockling: number;
}

export const DEFAULT_LAYERS: LayerSettings = {
  underdrawing: { visible: true, opacity: 0.85 },
  paint: { visible: true, opacity: 1 },
  paper: { visible: true, opacity: 1 },
  varnish: { visible: true, opacity: 0.45 },
  granulation: 0.45,
  cockling: 0.5,
};

export interface View {
  /** CSS pixels per paint pixel. */
  scale: number;
  tx: number;
  ty: number;
}

export interface OverlayState {
  showNumbers: boolean;
  showOutlines: boolean;
  showGrid: boolean;
  guide: boolean;
  finished: boolean;
  activeNumber: number | null;
  regionDone: Uint8Array;
  /** performance.now() when each region completed (for fade-outs). */
  regionDoneAt: Float64Array;
  hoverRegion: number;
}

const LUT_SIZE = 4096;
const LUT_MAX = 12;
const LUT_SCALE = LUT_SIZE / LUT_MAX;

type Canvas2D = HTMLCanvasElement | OffscreenCanvas;
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

interface OutlineBucket {
  path: Path2D;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export class Renderer {
  readonly W: number;
  readonly H: number;
  readonly paintCanvas: HTMLCanvasElement;
  private readonly paintCtx: CanvasRenderingContext2D;
  private readonly paintImage: ImageData;
  /** Baked guide: regions of the active number stay bright, others are dimmed. */
  private guideActive: Uint8Array | null = null;
  private guideAccent: [number, number, number] = [74, 110, 160];
  private softCanvas: HTMLCanvasElement;
  private readonly expLUT: Float32Array;
  private buckets: OutlineBucket[] = [];
  /** Radial vignette weight at 1/4 resolution (baked into the paint pass). */
  private vignette: Float32Array | null = null;
  layers: LayerSettings = structuredClone(DEFAULT_LAYERS);
  fontFamily = "ui-sans-serif, system-ui, sans-serif";

  constructor(
    private readonly analysis: RegionAnalysis,
    private readonly palette: PaletteColor[],
  ) {
    this.W = analysis.width;
    this.H = analysis.height;
    this.paintCanvas = makeCanvas(this.W, this.H);
    this.paintCtx = this.paintCanvas.getContext("2d", { willReadFrequently: false })!;
    this.paintImage = this.paintCtx.createImageData(this.W, this.H);
    this.paintImage.data.fill(255);
    this.paintCtx.putImageData(this.paintImage, 0, 0);
    this.softCanvas = makeCanvas(8, 8);
    this.expLUT = new Float32Array(LUT_SIZE + 1);
    for (let k = 0; k <= LUT_SIZE; k++) this.expLUT[k] = Math.exp(-k / LUT_SCALE);
    this.buildOutlineBuckets();
  }

  // ---------------------------------------------------------------------
  // Paint pass
  // ---------------------------------------------------------------------

  private ensureVignette() {
    if (this.vignette) return this.vignette;
    const vw = Math.ceil(this.W / 4), vh = Math.ceil(this.H / 4);
    const v = new Float32Array(vw * vh);
    const cx = vw / 2, cy = vh / 2;
    const r0 = Math.min(vw, vh) * 0.35, r1 = Math.hypot(vw, vh) * 0.62;
    for (let y = 0; y < vh; y++) {
      for (let x = 0; x < vw; x++) {
        const t = Math.min(1, Math.max(0, (Math.hypot(x - cx, y - cy) - r0) / (r1 - r0)));
        v[y * vw + x] = t * t * (3 - 2 * t);
      }
    }
    this.vignette = v;
    return v;
  }

  /**
   * Re-render dirty tiles. The paint layer is composited with the paper
   * texture (and the varnish vignette) right here, so the screen only needs a
   * single opaque image per frame – far cheaper than stacking blend modes.
   */
  updatePaint(surface: WatercolorSurface, force = false): boolean {
    const dirty = surface.renderDirty;
    const tilesX = surface.tilesX;
    let any = false;
    for (let t = 0; t < dirty.length; t++) {
      if (!dirty[t] && !force) continue;
      dirty[t] = 0;
      any = true;
      const tx = t % tilesX, ty = (t / tilesX) | 0;
      const x0 = tx * TILE_SIZE, y0 = ty * TILE_SIZE;
      const x1 = Math.min(this.W, x0 + TILE_SIZE), y1 = Math.min(this.H, y0 + TILE_SIZE);
      this.shade(surface, x0, y0, x1, y1, this.paintImage.data, this.W, 1, true, this.guideActive);
      this.paintCtx.putImageData(this.paintImage, 0, 0, x0, y0, x1 - x0, y1 - y0);
    }
    return any;
  }

  /**
   * Shade output pixels [ox0, ox1) × [oy0, oy1) of `data` (row stride
   * `outW`), sampling the surface at `inv` source pixels per output pixel.
   * With `onPaper` the output is the finished colour (paper × paint ×
   * vignette); otherwise it is pure paint transmittance.
   */
  private shade(
    surface: WatercolorSurface, ox0: number, oy0: number, ox1: number, oy1: number,
    data: Uint8ClampedArray, outW: number, inv: number, onPaper: boolean, guide: Uint8Array | null = null,
  ) {
    const L = this.layers;
    const paper = getPaperTexture();
    const { height, fine, cockle, shade } = paper;
    const cs = paper.cockleSize;
    const cmask = cs - 1;
    const grainOn = L.paper.visible ? L.paper.opacity : 0;
    const paperOn = onPaper ? grainOn : 0;
    const paintA = onPaper ? (L.paint.visible ? L.paint.opacity : 0) : 1;
    const G = L.granulation * 0.9 * (0.35 + 0.65 * grainOn);
    const C = L.cockling * 0.07;
    const vigA = onPaper && L.varnish.visible ? 0.55 * L.varnish.opacity : 0;
    const vig = vigA > 0 ? this.ensureVignette() : null;
    const vw = Math.ceil(this.W / 4);
    const lut = this.expLUT;
    const W = this.W;
    const [P0, P1, P2] = onPaper ? PAPER_RGB : [255, 255, 255];
    const dry = surface.dry, wet = surface.wet, water = surface.water;
    const regionMap = this.analysis.regionMap, edgeDist = this.analysis.edgeDist;
    const [gr, gg, gb] = this.guideAccent;
    const [pr, pg, pb] = PAPER_RGB;
    const DIM = 0.36;

    const H = this.H;
    for (let oy = oy0; oy < oy1; oy++) {
      const y = inv === 1 ? oy : Math.min(H - 1, (oy * inv) | 0);
      const prow = (y & PAPER_MASK) << 10;
      const crow = ((y >> 2) & cmask) * cs;
      const vrow = (y >> 2) * vw;
      let o = (oy * outW + ox0) * 4;
      for (let ox = ox0; ox < ox1; ox++, o += 4) {
        const x = inv === 1 ? ox : Math.min(W - 1, (ox * inv) | 0);
        const i = y * W + x;
        const pi = prow | (x & PAPER_MASK);
        // Paper tone, tooth lighting and a warm vignette (multiplicative, like the varnish).
        let b0 = P0, b1 = P1, b2 = P2;
        if (paperOn > 0) {
          const sh = 1 + (shade[pi] - 1) * paperOn;
          b0 *= sh; b1 *= sh; b2 *= sh;
        }
        if (vig) {
          const g = vigA * vig[vrow + (x >> 2)];
          b0 *= 1 - g * 0.114; b1 *= 1 - g * 0.161; b2 *= 1 - g * 0.231;
        }
        const i3 = i * 3;
        const w = water[i];
        const wf = 1 + 0.16 * w; // wet paint reads darker; it dries lighter
        let d0 = dry[i3] + wet[i3] * wf;
        let d1 = dry[i3 + 1] + wet[i3 + 1] * wf;
        let d2 = dry[i3 + 2] + wet[i3 + 2] * wf;
        const sum = d0 + d1 + d2;
        let r0: number, r1: number, r2: number;
        if ((sum < 0.0005 && w === 0) || paintA === 0) {
          r0 = b0; r1 = b1; r2 = b2;
        } else {
        // Granulation: pigment settles into the paper's valleys as it dries.
        let g = 1 + G * ((0.5 - height[pi]) * 1.3 + (fine[pi] - 0.5) * 0.55) * (1 - 0.7 * w);
        if (g < 0.5) g = 0.5;
        d0 *= g; d1 *= g; d2 *= g;
        // Cockling: paint and water make the paper undulate slightly.
        const amt = sum * 0.45 + w * 1.4;
        const ck = 1 + C * cockle[crow + ((x >> 2) & cmask)] * (amt > 1 ? 1 : amt);
        let k0 = d0 * LUT_SCALE, k1 = d1 * LUT_SCALE, k2 = d2 * LUT_SCALE;
        if (k0 > LUT_SIZE) k0 = LUT_SIZE;
        if (k1 > LUT_SIZE) k1 = LUT_SIZE;
        if (k2 > LUT_SIZE) k2 = LUT_SIZE;
        const t0 = lut[k0 | 0] * ck, t1 = lut[k1 | 0] * ck, t2 = lut[k2 | 0] * ck;
        const keep = 1 - paintA;
        r0 = b0 * (keep + paintA * t0);
        r1 = b1 * (keep + paintA * t1);
        r2 = b2 * (keep + paintA * t2);
        }
        if (guide) {
          if (!guide[regionMap[i]]) {
            // Dim everything except the active number's regions.
            r0 += (pr - r0) * DIM; r1 += (pg - r1) * DIM; r2 += (pb - r2) * DIM;
          } else {
            const e = edgeDist[i];
            if (e <= DIST_UNIT * 2) {
              const k = e <= DIST_UNIT ? 0.8 : 0.4;
              r0 += (gr - r0) * k; r1 += (gg - r1) * k; r2 += (gb - r2) * k;
            }
          }
        }
        data[o] = r0; data[o + 1] = r1; data[o + 2] = r2; data[o + 3] = 255;
      }
    }
  }

  /** Display colour of the paint at a pixel (paper × transmittance). */
  colorAt(surface: WatercolorSurface, i: number): RGB {
    const d = surface.densityAt(i, [0, 0, 0]);
    return [PAPER_RGB[0] * Math.exp(-d[0]), PAPER_RGB[1] * Math.exp(-d[1]), PAPER_RGB[2] * Math.exp(-d[2])];
  }

  // ---------------------------------------------------------------------
  // Guide
  // ---------------------------------------------------------------------

  /** Set (or clear) the guide number. Returns true if the paint layer must be re-rendered. */
  setGuide(number: number | null): boolean {
    const current = this.guideActive ? this.guideNumberValue : null;
    if (current === number) return false;
    if (number == null) {
      this.guideActive = null;
      this.guideNumberValue = null;
      return true;
    }
    const active = new Uint8Array(this.analysis.regions.length);
    for (const r of this.analysis.numberRegions.get(number) ?? []) active[r] = 1;
    const target = hexToRgb(this.palette.find((p) => p.number === number)?.hex ?? "#4a7ab0");
    this.guideAccent = luminance(target) > 0.55 ? [74, 110, 160] : target;
    this.guideActive = active;
    this.guideNumberValue = number;
    return true;
  }
  private guideNumberValue: number | null = null;

  // ---------------------------------------------------------------------
  // Outlines
  // ---------------------------------------------------------------------

  private buildOutlineBuckets() {
    const cell = 192;
    const cols = Math.ceil(this.W / cell), rows = Math.ceil(this.H / cell);
    const map = new Map<number, OutlineBucket>();
    for (const line of this.analysis.outlines) {
      if (line.length < 4) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let k = 0; k < line.length; k += 2) {
        const x = line[k], y = line[k + 1];
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      const cx = Math.min(cols - 1, Math.floor((x0 + x1) / 2 / cell));
      const cy = Math.min(rows - 1, Math.floor((y0 + y1) / 2 / cell));
      const key = cy * cols + cx;
      let b = map.get(key);
      if (!b) {
        b = { path: new Path2D(), x0, y0, x1, y1 };
        map.set(key, b);
      }
      b.path.moveTo(line[0], line[1]);
      for (let k = 2; k < line.length; k += 2) b.path.lineTo(line[k], line[k + 1]);
      b.x0 = Math.min(b.x0, x0);
      b.y0 = Math.min(b.y0, y0);
      b.x1 = Math.max(b.x1, x1);
      b.y1 = Math.max(b.y1, y1);
    }
    this.buckets = Array.from(map.values());
  }

  private strokeOutlines(ctx: Ctx2D, vx0: number, vy0: number, vx1: number, vy1: number) {
    for (const b of this.buckets) {
      if (b.x1 < vx0 || b.x0 > vx1 || b.y1 < vy0 || b.y0 > vy1) continue;
      ctx.stroke(b.path);
    }
  }

  // ---------------------------------------------------------------------
  // Compositing
  // ---------------------------------------------------------------------

  /**
   * Draw the full painting into `ctx`. `toDevice` maps paint px → device px
   * (scale, offset). Used for both the on-screen view and exports.
   */
  composite(
    ctx: Ctx2D,
    s: number,
    ox: number,
    oy: number,
    viewW: number,
    viewH: number,
    overlay: OverlayState,
    surface: WatercolorSurface | null,
    opts: { shadow?: boolean; exportMode?: boolean; numbersOverride?: boolean; now?: number; skipVarnish?: boolean } = {},
  ) {
    const L = this.layers;
    const W = this.W, H = this.H;
    const now = opts.now ?? performance.now();
    // Visible region in paint px.
    const vx0 = Math.max(0, -ox / s), vy0 = Math.max(0, -oy / s);
    const vx1 = Math.min(W, (viewW - ox) / s), vy1 = Math.min(H, (viewH - oy) / s);
    const px = Math.round(ox), py = Math.round(oy);
    const pw = Math.round(W * s), ph = Math.round(H * s);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = s < 1 ? "high" : "medium";

    // Paper card with a soft gallery shadow (nine-slice sprite: blurred once,
    // stretched every frame – shadowBlur on a large rect is very costly).
    if (opts.shadow) this.drawShadow(ctx, px, py + 8, pw, ph);
    ctx.fillStyle = `rgb(${PAPER_RGB.join(",")})`;
    ctx.fillRect(px, py, pw, ph);
    ctx.setTransform(s, 0, 0, s, ox, oy);
    // Paper and paint arrive pre-composited (see updatePaint).
    ctx.drawImage(this.paintCanvas, 0, 0);

    const lineWidthScreen = overlay.finished ? 1.1 : Math.min(2.2, Math.max(0.7, 0.55 + s * 0.45));
    const underOpacity = L.underdrawing.visible ? L.underdrawing.opacity : 0;

    // Finished mode: faint graphite that reads as if it sits under the transparent paint.
    if (overlay.finished && overlay.showOutlines && underOpacity > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = `rgba(92, 94, 104, ${0.22 * underOpacity})`;
      ctx.lineWidth = (lineWidthScreen * 1.4) / s;
      this.strokeOutlines(ctx, vx0, vy0, vx1, vy1);
      ctx.restore();
    }

    // Varnish / soft-focus: a gentle glow from a blurred copy plus a vignette.
    if (L.varnish.visible && L.varnish.opacity > 0 && !opts.skipVarnish) {
      this.applyVarnish(ctx, s, ox, oy, L.varnish.opacity);
    }

    // Working-mode underdrawing drawn crisp on top.
    if (!overlay.finished && overlay.showOutlines && underOpacity > 0) {
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = `rgba(64, 66, 78, ${0.62 * underOpacity})`;
      ctx.lineWidth = lineWidthScreen / s;
      this.strokeOutlines(ctx, vx0, vy0, vx1, vy1);
    }


    if (overlay.showGrid && !opts.exportMode) {
      const step = 50 * this.analysis.scale;
      ctx.strokeStyle = "rgba(90, 110, 150, 0.16)";
      ctx.lineWidth = 1 / s;
      ctx.beginPath();
      for (let x = step; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = step; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
    }

    // Numbers, drawn in device space so text stays crisp at any zoom.
    const showNumbers = opts.numbersOverride ?? (overlay.showNumbers && !overlay.finished);
    if (showNumbers && underOpacity > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.drawNumbers(ctx, s, ox, oy, vx0, vy0, vx1, vy1, overlay, surface, underOpacity, now, opts.exportMode ?? false);
    }
    ctx.restore();
  }

  private shadowSprite: HTMLCanvasElement | null = null;

  private drawShadow(ctx: Ctx2D, x: number, y: number, w: number, h: number) {
    const R = 32; // shadow reach in device px
    if (!this.shadowSprite) {
      // A 2R×2R rect, blurred once: corners hold the falloff, the centre is solid.
      const c = makeCanvas(R * 4, R * 4);
      const sctx = c.getContext("2d")!;
      sctx.shadowColor = "rgba(20, 24, 40, 0.34)";
      sctx.shadowBlur = R * 0.9;
      sctx.shadowOffsetX = 4000;
      sctx.fillStyle = "#000";
      sctx.fillRect(R - 4000, R, R * 2, R * 2);
      this.shadowSprite = c;
    }
    if (w < R * 2 || h < R * 2) return;
    const sp = this.shadowSprite;
    const src = [0, R * 2 - 1, R * 2 + 1, R * 4];
    const dx = [x - R, x + R - 1, x + w - R + 1, x + w + R];
    const dy = [y - R, y + R - 1, y + h - R + 1, y + h + R];
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        if (i === 1 && j === 1) continue; // hidden under the paper
        ctx.drawImage(sp, src[i], src[j], src[i + 1] - src[i], src[j + 1] - src[j], dx[i], dy[j], dx[i + 1] - dx[i], dy[j + 1] - dy[j]);
      }
    }
  }

  private applyVarnish(ctx: Ctx2D, s: number, ox: number, oy: number, amount: number) {
    const W = this.W, H = this.H;
    // Downsample paper+paint into a small canvas, then upscale: a cheap, portable blur.
    const sw = Math.max(8, Math.round(W / 10)), sh = Math.max(8, Math.round(H / 10));
    if (this.softCanvas.width !== sw || this.softCanvas.height !== sh) {
      this.softCanvas.width = sw;
      this.softCanvas.height = sh;
    }
    const sctx = this.softCanvas.getContext("2d")!;
    sctx.drawImage(this.paintCanvas, 0, 0, sw, sh);
    // Soft-focus glow; the warm vignette is baked into the paint pass.
    ctx.save();
    ctx.setTransform(s, 0, 0, s, ox, oy);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = 0.55 * amount;
    ctx.drawImage(this.softCanvas, 0, 0, W, H);
    ctx.restore();
  }

  private drawNumbers(
    ctx: Ctx2D, s: number, ox: number, oy: number,
    vx0: number, vy0: number, vx1: number, vy1: number,
    overlay: OverlayState, surface: WatercolorSurface | null, opacity: number, now: number, exportMode: boolean,
  ) {
    const regions = this.analysis.regions;
    const W = this.W;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const minPx = exportMode ? 4 : 7;
    for (const r of regions) {
      if (r.labelX < vx0 - 20 || r.labelX > vx1 + 20 || r.labelY < vy0 - 20 || r.labelY > vy1 + 20) continue;
      const active = overlay.activeNumber === r.number;
      let size = Math.min(exportMode ? 40 * s : 26, r.labelRadius * s * 0.95);
      if (active && !exportMode) size = Math.min(size * 1.12, r.labelRadius * s * 1.05);
      if (size < minPx) continue;
      let alpha = opacity;
      if (overlay.regionDone[r.id]) {
        const t = (now - overlay.regionDoneAt[r.id]) / 700;
        if (t >= 1 || exportMode) continue;
        alpha *= 1 - t;
      }
      const x = ox + r.labelX * s, y = oy + r.labelY * s;
      let dark = false;
      if (surface) {
        const i = Math.floor(r.labelY) * W + Math.floor(r.labelX);
        dark = luminance(this.colorAt(surface, i)) < 0.22;
      }
      ctx.font = `${active ? 650 : 500} ${size.toFixed(1)}px ${this.fontFamily}`;
      if (active && overlay.guide && !exportMode) {
        ctx.fillStyle = dark ? `rgba(255,255,255,${alpha})` : `rgba(38, 74, 128, ${alpha})`;
      } else {
        ctx.fillStyle = dark ? `rgba(245,245,250,${0.85 * alpha})` : `rgba(70, 72, 84, ${0.78 * alpha})`;
      }
      ctx.fillText(String(r.number), x, y + size * 0.04);
    }
  }

  /**
   * Transparent export: render pure paint transmittance and convert it to
   * straight alpha ("white to alpha") so the pigment sits on any background.
   */
  paintToAlphaCanvas(surface: WatercolorSurface): HTMLCanvasElement {
    const c = makeCanvas(this.W, this.H);
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(this.W, this.H);
    const d = img.data;
    this.shade(surface, 0, 0, this.W, this.H, d, this.W, 1, false);
    for (let o = 0; o < d.length; o += 4) {
      const r = d[o] / 255, g = d[o + 1] / 255, b = d[o + 2] / 255;
      const a = 1 - Math.min(r, g, b);
      if (a < 0.004) {
        d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 0;
        continue;
      }
      d[o] = ((r - (1 - a)) / a) * 255;
      d[o + 1] = ((g - (1 - a)) / a) * 255;
      d[o + 2] = ((b - (1 - a)) / a) * 255;
      d[o + 3] = a * 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  /**
   * Small finished-look preview (no guide, numbers or UI), shaded directly at
   * the target size – used for gallery thumbnails.
   */
  renderPreview(surface: WatercolorSurface, maxSide: number): HTMLCanvasElement {
    const k = maxSide / Math.max(this.W, this.H);
    const w = Math.max(1, Math.round(this.W * k)), h = Math.max(1, Math.round(this.H * k));
    const c = makeCanvas(w, h);
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(w, h);
    this.shade(surface, 0, 0, w, h, img.data, w, 1 / k, true);
    ctx.putImageData(img, 0, 0);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.globalCompositeOperation = "multiply";
    ctx.strokeStyle = "rgba(92, 94, 104, 0.25)";
    ctx.lineWidth = 1 / k;
    this.strokeOutlines(ctx, 0, 0, this.W, this.H);
    return c;
  }

  /** Outline-only printable template (white paper, graphite lines). */
  drawTemplate(ctx: Ctx2D, s: number) {
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, this.W * s, this.H * s);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(60, 62, 70, 0.9)";
    ctx.lineWidth = 1.1 / Math.min(s, 1.5);
    this.strokeOutlines(ctx, 0, 0, this.W, this.H);
    ctx.restore();
  }

  dispose() {
    // Release large backing stores promptly (helps iOS memory limits).
    for (const c of [this.paintCanvas, this.softCanvas] as (Canvas2D | null)[]) {
      if (c) {
        c.width = 1;
        c.height = 1;
      }
    }
  }
}
