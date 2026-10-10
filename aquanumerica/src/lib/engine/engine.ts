/**
 * PaintEngine – owns the simulation, renderer, view and input handling for a
 * single canvas. React talks to it through plain method calls and callbacks so
 * per-frame work never goes through React state.
 */

import type { CanvasDefinition } from "../canvases/types";
import { TOOLS, type ToolId, type ToolSettings } from "./brushes";
import { deltaE, densityToRgb, hexToRgb, rgbToDensity, rgbToHex, type RGB } from "./color";
import type { HistorySummary, HistoryKind } from "./history";
import { buildPdf } from "./pdf";
import type { RegionAnalysis } from "./regions";
import { Renderer, type LayerSettings, type OverlayState, type View } from "./renderer";
import { WatercolorSurface, type FillJob, type StrokeOptions } from "./watercolor";

export type LockMode = "region" | "number" | "off";

export interface BrushState {
  tool: ToolId;
  settings: ToolSettings;
  color: string;
  activeNumber: number | null;
  lock: LockMode;
  strict: boolean;
  magnetic: boolean;
}

export interface DisplayState {
  showNumbers: boolean;
  showOutlines: boolean;
  showGrid: boolean;
  guide: boolean;
  finished: boolean;
}

export interface NumberProgress {
  total: number;
  complete: number;
  coverage: number;
}

export interface ProgressStats {
  totalRegions: number;
  completeRegions: number;
  /** Area-weighted painted coverage 0..100. */
  percent: number;
  /** Visual accuracy score 0..100 over completed regions. */
  accuracy: number;
  perNumber: Record<number, NumberProgress>;
}

export interface Hint {
  kind: "wrong-number" | "no-region" | "info";
  message: string;
  number?: number;
}

export interface HistoryState {
  entries: HistorySummary[];
  position: number;
  canUndo: boolean;
  canRedo: boolean;
}

export interface EngineCallbacks {
  onHistory?(h: HistoryState): void;
  onProgress?(p: ProgressStats): void;
  onColorPicked?(hex: string, number: number | null): void;
  onHint?(h: Hint): void;
  onRegionComplete?(region: number, screen: { x: number; y: number } | null): void;
  onViewChange?(zoom: number): void;
  onChange?(version: number): void;
  onWetChange?(wet: boolean): void;
}

export interface ExportOptions {
  scale: number;
  background: "paper" | "transparent" | "template";
  underdrawing: "none" | "soft" | "full";
  numbers: boolean;
  varnish: boolean;
}

interface StrokeState {
  last: { x: number; y: number };
  smooth: { x: number; y: number };
  dirX: number;
  dirY: number;
  pressure: number;
  startTime: number;
  pointerId: number;
}

const MIN_ZOOM_FACTOR = 0.35;
const MAX_SCALE = 10;

export class PaintEngine {
  readonly def: CanvasDefinition;
  readonly analysis: RegionAnalysis;
  readonly surface: WatercolorSurface;
  readonly renderer: Renderer;

  private canvas: HTMLCanvasElement;
  private overlay: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private octx: CanvasRenderingContext2D;
  private cssW = 1;
  private cssH = 1;
  private dpr = 1;
  view: View = { scale: 1, tx: 0, ty: 0 };
  private viewAnim: { from: View; to: View; t0: number; dur: number } | null = null;
  private fitted = false;

  brush: BrushState;
  display: DisplayState;
  private overlayState: OverlayState;
  private callbacks: EngineCallbacks;

  private raf = 0;
  private lastFrame = 0;
  private needsComposite = true;
  private cursorDirty = true;
  private cursor: { x: number; y: number; inside: boolean } = { x: 0, y: 0, inside: false };

  private fillJob: FillJob | null = null;
  private stroke: StrokeState | null = null;
  private allowMask: Uint8Array;
  private pointers = new Map<number, { x: number; y: number; type: string }>();
  private gesture: { mode: "pan" | "pinch"; startDist: number; startScale: number; cx: number; cy: number } | null = null;
  private spaceDown = false;
  private wasWet = false;
  private pickHandler: ((region: number) => void) | null = null;

  private regionCoverage: Float32Array;
  private regionAccuracy: Float32Array;
  private regionDone: Uint8Array;
  private regionDoneAt: Float64Array;
  private progressInitialised = false;
  private lastProgress = 0;
  private lastVersionEmitted = -1;
  private targetDensity = new Map<number, RGB>();
  private disposed = false;
  /** Smoothed composite cost (ms); slow devices skip the varnish glow mid-interaction. */
  private compositeCost = 0;
  private needsFullComposite = false;
  private listeners: Array<[EventTarget, string, EventListener, AddEventListenerOptions?]> = [];

  constructor(opts: {
    canvas: HTMLCanvasElement;
    overlay: HTMLCanvasElement;
    def: CanvasDefinition;
    analysis: RegionAnalysis;
    brush: BrushState;
    display: DisplayState;
    layers: LayerSettings;
    callbacks: EngineCallbacks;
  }) {
    this.def = opts.def;
    this.analysis = opts.analysis;
    this.canvas = opts.canvas;
    this.overlay = opts.overlay;
    this.ctx = this.canvas.getContext("2d", { alpha: true })!;
    this.octx = this.overlay.getContext("2d")!;
    this.brush = { ...opts.brush };
    this.display = { ...opts.display };
    this.callbacks = opts.callbacks;
    this.surface = new WatercolorSurface(this.analysis);
    this.renderer = new Renderer(this.analysis, this.def.palette);
    this.renderer.layers = structuredClone(opts.layers);
    this.renderer.setGuide(this.display.guide ? this.brush.activeNumber : null);
    const R = this.analysis.regions.length;
    this.allowMask = new Uint8Array(R);
    this.regionCoverage = new Float32Array(R);
    this.regionAccuracy = new Float32Array(R);
    this.regionDone = new Uint8Array(R);
    this.regionDoneAt = new Float64Array(R);
    for (const p of this.def.palette) this.targetDensity.set(p.number, rgbToDensity(hexToRgb(p.hex)));
    this.overlayState = {
      ...this.display,
      activeNumber: this.brush.activeNumber,
      regionDone: this.regionDone,
      regionDoneAt: this.regionDoneAt,
      hoverRegion: -1,
    };
    if (typeof document !== "undefined") {
      this.renderer.fontFamily = getComputedStyle(document.body).fontFamily || this.renderer.fontFamily;
    }
    this.bindInput();
    this.requestFrame();
  }

  // ---------------------------------------------------------------------
  // Lifecycle & view
  // ---------------------------------------------------------------------

  resize(cssW: number, cssH: number, dpr: number) {
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    this.dpr = dpr;
    for (const c of [this.canvas, this.overlay]) {
      c.width = Math.round(this.cssW * dpr);
      c.height = Math.round(this.cssH * dpr);
      c.style.width = `${this.cssW}px`;
      c.style.height = `${this.cssH}px`;
    }
    if (!this.fitted) {
      this.fit(false);
      this.fitted = true;
    }
    this.needsComposite = true;
    this.cursorDirty = true;
    this.requestFrame();
  }

  private fitView(): View {
    const margin = this.cssW < 640 ? 16 : 40;
    const W = this.analysis.width, H = this.analysis.height;
    const scale = Math.min((this.cssW - margin * 2) / W, (this.cssH - margin * 2) / H);
    return { scale, tx: (this.cssW - W * scale) / 2, ty: (this.cssH - H * scale) / 2 };
  }

  fit(animate = true) {
    this.setView(this.fitView(), animate);
  }

  /** Set zoom so one paint pixel = `scale` CSS pixels, keeping the centre. */
  setScale(scale: number, animate = true) {
    const cx = this.cssW / 2, cy = this.cssH / 2;
    this.zoomAt(scale / this.view.scale, cx, cy, animate);
  }

  get fitScale() {
    return this.fitView().scale;
  }

  zoomAt(factor: number, sx: number, sy: number, animate = false) {
    const base = this.viewAnim ? this.viewAnim.to : this.view;
    const min = this.fitScale * MIN_ZOOM_FACTOR;
    const scale = Math.min(MAX_SCALE, Math.max(min, base.scale * factor));
    const k = scale / base.scale;
    this.setView({ scale, tx: sx - (sx - base.tx) * k, ty: sy - (sy - base.ty) * k }, animate);
  }

  /** Zoom around the centre of the viewport. */
  zoomBy(factor: number) {
    this.zoomAt(factor, this.cssW / 2, this.cssH / 2, true);
  }

  panBy(dx: number, dy: number) {
    this.viewAnim = null;
    this.view = { ...this.view, tx: this.view.tx + dx, ty: this.view.ty + dy };
    this.clampView();
    this.needsComposite = true;
    this.requestFrame();
  }

  private clampView() {
    // Keep at least a quarter of the painting on screen.
    const v = this.view;
    const pw = this.analysis.width * v.scale, ph = this.analysis.height * v.scale;
    const minVisX = Math.min(pw, this.cssW) * 0.25, minVisY = Math.min(ph, this.cssH) * 0.25;
    v.tx = Math.min(this.cssW - minVisX, Math.max(minVisX - pw, v.tx));
    v.ty = Math.min(this.cssH - minVisY, Math.max(minVisY - ph, v.ty));
  }

  private setView(v: View, animate: boolean) {
    if (animate) {
      this.viewAnim = { from: { ...this.view }, to: v, t0: performance.now(), dur: 320 };
    } else {
      this.viewAnim = null;
      this.view = v;
      this.clampView();
    }
    this.callbacks.onViewChange?.(v.scale);
    this.needsComposite = true;
    this.requestFrame();
  }

  /** Zoom and centre on a region. */
  focusRegion(region: number) {
    const r = this.analysis.regions[region];
    if (!r) return;
    const [x0, y0, x1, y1] = r.bbox;
    const bw = Math.max(40, x1 - x0), bh = Math.max(40, y1 - y0);
    const scale = Math.min(MAX_SCALE, Math.max(this.fitScale, Math.min((this.cssW * 0.5) / bw, (this.cssH * 0.5) / bh)));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    this.setView({ scale, tx: this.cssW / 2 - cx * scale, ty: this.cssH / 2 - cy * scale }, true);
  }

  /** Find the next unfinished region with `number` (largest first) and focus it. */
  focusNextUnfinished(number: number): boolean {
    const ids = (this.analysis.numberRegions.get(number) ?? [])
      .filter((r) => !this.regionDone[r])
      .sort((a, b) => this.analysis.regions[b].area - this.analysis.regions[a].area);
    if (!ids.length) return false;
    this.focusRegion(ids[0]);
    return true;
  }

  dispose() {
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const [t, type, fn, o] of this.listeners) t.removeEventListener(type, fn, o);
    this.listeners = [];
    this.renderer.dispose();
  }

  // ---------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------

  setBrush(patch: Partial<BrushState>) {
    const prevNumber = this.brush.activeNumber;
    this.brush = { ...this.brush, ...patch, settings: { ...this.brush.settings, ...patch.settings } };
    if (this.brush.activeNumber !== prevNumber) {
      this.overlayState.activeNumber = this.brush.activeNumber;
      this.syncGuide();
      this.needsComposite = true;
    }
    this.cursorDirty = true;
    this.requestFrame();
  }

  setDisplay(patch: Partial<DisplayState>) {
    this.display = { ...this.display, ...patch };
    Object.assign(this.overlayState, this.display);
    this.syncGuide();
    this.needsComposite = true;
    this.requestFrame();
  }

  private syncGuideForce() {
    this.renderer.setGuide(this.display.guide && !this.display.finished ? this.brush.activeNumber : null);
    this.surface.invalidateAll();
    this.renderer.updatePaint(this.surface, true);
  }

  /** The guide is baked into the paint pass; re-render when it changes. */
  private syncGuide() {
    const n = this.display.guide && !this.display.finished ? this.brush.activeNumber : null;
    if (this.renderer.setGuide(n)) this.surface.invalidateAll();
  }

  setLayers(layers: LayerSettings) {
    const prev = this.renderer.layers;
    this.renderer.layers = structuredClone(layers);
    // Everything except the underdrawing is baked into the paint pass.
    const baked = (l: LayerSettings) =>
      [l.granulation, l.cockling, l.paper.visible, l.paper.opacity, l.paint.visible, l.paint.opacity, l.varnish.visible, l.varnish.opacity].join();
    if (baked(prev) !== baked(layers)) this.surface.invalidateAll();
    this.needsComposite = true;
    this.requestFrame();
  }

  setDryingSpeed(speed: number) {
    this.surface.dryingSpeed = speed;
  }

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------

  undo() {
    this.settleForHistory();
    if (this.surface.history.undo()) this.afterHistoryJump();
  }

  redo() {
    this.settleForHistory();
    if (this.surface.history.redo()) this.afterHistoryJump();
  }

  /** Jump to a history position (number of applied entries). */
  jumpTo(position: number) {
    this.settleForHistory();
    let guard = 500;
    while (this.surface.history.position > position && guard--) this.surface.history.undo();
    while (this.surface.history.position < position && guard--) this.surface.history.redo();
    this.afterHistoryJump();
  }

  private settleForHistory() {
    if (this.stroke) this.endStroke();
    if (this.fillJob) {
      this.surface.finishFill(this.fillJob);
      this.fillJob = null;
    }
    // Dry pending paint so the action being undone captures a settled state.
    this.surface.dryAll();
  }

  private afterHistoryJump() {
    // Restored snapshots may contain wet paint; settle it (history is closed).
    this.surface.dryAll();
    this.emitHistory();
    this.requestFrame();
  }

  resetRegion(region: number) {
    if (region < 0 || region >= this.analysis.regions.length) return;
    this.settleForHistory();
    const r = this.analysis.regions[region];
    this.surface.history.begin("reset", `Reset region ${r.number}`, { number: r.number });
    this.surface.clearRegion(region);
    this.surface.history.close();
    this.emitHistory();
    this.requestFrame();
  }

  /** Reset every region painted with `number`. */
  resetNumber(number: number) {
    const ids = this.analysis.numberRegions.get(number) ?? [];
    if (!ids.length) return;
    this.settleForHistory();
    this.surface.history.begin("reset", `Reset all ${number}s`, { number });
    for (const r of ids) this.surface.clearRegion(r);
    this.surface.history.close();
    this.emitHistory();
    this.requestFrame();
  }

  clearAll() {
    this.settleForHistory();
    this.surface.history.begin("clear", "Clear painting");
    this.surface.clearAll();
    this.surface.history.close();
    this.emitHistory();
    this.requestFrame();
  }

  dryNow() {
    this.surface.dryAll();
    this.requestFrame();
  }

  load(data: Uint16Array) {
    this.surface.deserialize(data);
    this.progressInitialised = false;
    this.emitHistory();
    this.requestFrame();
  }

  serialize(): Uint16Array {
    // A wash that is still spreading would otherwise be saved half-finished.
    if (this.fillJob) {
      this.surface.finishFill(this.fillJob);
      this.fillJob = null;
    }
    return this.surface.serialize();
  }

  /** Changes whenever the painting is edited (not on drying). */
  get version() {
    return this.surface.editVersion;
  }

  /** The next click on the canvas reports a region instead of painting. */
  pickRegionOnce(handler: ((region: number) => void) | null) {
    this.pickHandler = handler;
  }

  /** Paint-pixel region id at a screen point, or -1. */
  regionAtScreen(sx: number, sy: number): number {
    const p = this.toPaint(sx, sy);
    return this.regionAtPaint(p.x, p.y);
  }

  // ---------------------------------------------------------------------
  // Frame loop
  // ---------------------------------------------------------------------

  private requestFrame() {
    if (!this.raf && !this.disposed) this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (this.disposed) return;
    const dt = this.lastFrame ? Math.min(0.05, (now - this.lastFrame) / 1000) : 1 / 60;
    this.lastFrame = now;
    let keepGoing = false;

    if (this.viewAnim) {
      const a = this.viewAnim;
      const t = Math.min(1, (now - a.t0) / a.dur);
      const e = 1 - Math.pow(1 - t, 3);
      this.view = {
        scale: a.from.scale + (a.to.scale - a.from.scale) * e,
        tx: a.from.tx + (a.to.tx - a.from.tx) * e,
        ty: a.from.ty + (a.to.ty - a.from.ty) * e,
      };
      if (t >= 1) {
        this.viewAnim = null;
        this.clampView();
      }
      this.needsComposite = true;
      this.cursorDirty = true;
      keepGoing = true;
    }

    if (this.fillJob) {
      if (this.surface.stepFill(this.fillJob, dt)) this.fillJob = null;
      keepGoing = true;
    }

    const wet = this.surface.step(dt);
    if (wet) keepGoing = true;
    if (wet !== this.wasWet) {
      this.wasWet = wet;
      this.callbacks.onWetChange?.(wet);
    }

    if (this.renderer.updatePaint(this.surface)) this.needsComposite = true;

    // Fade-outs of completed region numbers.
    for (let r = 0; r < this.regionDone.length; r++) {
      if (this.regionDone[r] && now - this.regionDoneAt[r] < 750) {
        this.needsComposite = true;
        keepGoing = true;
        break;
      }
    }

    const busy = keepGoing || !!this.stroke || !!this.gesture;
    if (this.needsComposite) {
      // On slow (software-rendered) canvases, drop the varnish glow while things move.
      const light = busy && this.compositeCost > 14;
      const t0 = performance.now();
      this.composite(now, light);
      const cost = performance.now() - t0;
      if (!light) this.compositeCost = this.compositeCost ? this.compositeCost * 0.8 + cost * 0.2 : cost;
      this.needsComposite = false;
      this.needsFullComposite = light;
    } else if (this.needsFullComposite && !busy) {
      this.composite(now, false);
      this.needsFullComposite = false;
    }
    if (this.needsFullComposite) keepGoing = true;
    if (this.cursorDirty) {
      this.drawCursor();
      this.cursorDirty = false;
    }

    if (now - this.lastProgress > 350) {
      this.lastProgress = now;
      this.updateProgress(now);
    } else if (this.surface.progressDirty.some((v) => v === 1)) {
      keepGoing = true;
    }

    if (this.surface.editVersion !== this.lastVersionEmitted) {
      this.lastVersionEmitted = this.surface.editVersion;
      this.callbacks.onChange?.(this.surface.editVersion);
    }

    if (keepGoing || this.stroke) this.requestFrame();
  };

  private composite(now: number, light = false) {
    const ctx = this.ctx;
    const d = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.renderer.composite(
      ctx,
      this.view.scale * d,
      this.view.tx * d,
      this.view.ty * d,
      this.canvas.width,
      this.canvas.height,
      this.overlayState,
      this.surface,
      { shadow: true, now, skipVarnish: light },
    );
  }

  private drawCursor() {
    const ctx = this.octx;
    const d = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    if (!this.cursor.inside || this.gesture || this.spaceDown) return;
    const tool = TOOLS[this.brush.tool];
    if (tool.kind === "fill" || tool.kind === "eyedropper") return;
    const r = (this.brush.settings.size / 2) * this.analysis.scale * this.view.scale;
    const x = this.cursor.x, y = this.cursor.y;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.lineWidth = 1;
    const drawShape = () => {
      ctx.beginPath();
      if (tool.shape === "flat") {
        const angle = this.stroke ? Math.atan2(this.stroke.dirY, this.stroke.dirX) : Math.PI / 4;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        const hw = Math.max(1.5, r * tool.aspect), hh = Math.max(2, r);
        ctx.roundRect(-hw, -hh, hw * 2, hh * 2, Math.min(hw, 4));
        ctx.restore();
      } else {
        ctx.arc(x, y, Math.max(1.5, r), 0, Math.PI * 2);
      }
    };
    drawShape();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    drawShape();
    ctx.strokeStyle = tool.kind === "eraser" ? "rgba(120,60,60,0.9)" : "rgba(30,36,52,0.85)";
    ctx.lineWidth = 1;
    ctx.stroke();
    // Small centre dot for precision.
    ctx.beginPath();
    ctx.arc(x, y, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = this.brush.color;
    ctx.fill();
  }

  // ---------------------------------------------------------------------
  // Progress
  // ---------------------------------------------------------------------

  private updateProgress(now: number) {
    const dirty = this.surface.progressDirty;
    const regions = new Set<number>();
    const tileRegions = this.analysis.tileRegions;
    for (let t = 0; t < dirty.length; t++) {
      if (!dirty[t]) continue;
      dirty[t] = 0;
      const rs = tileRegions[t];
      for (let k = 0; k < rs.length; k++) regions.add(rs[k]);
    }
    if (!regions.size && this.progressInitialised) return;
    const silent = !this.progressInitialised;
    const a = this.analysis;
    const tmp = [0, 0, 0];
    for (const r of regions) {
      const info = a.regions[r];
      const target = this.targetDensity.get(info.number) ?? [0.3, 0.3, 0.3];
      const tsum = target[0] + target[1] + target[2];
      const thr = Math.max(0.03, tsum * 0.3);
      let painted = 0;
      const acc = [0, 0, 0];
      for (let p = a.pixelOffsets[r]; p < a.pixelOffsets[r + 1]; p++) {
        this.surface.densityAt(a.pixelIndices[p], tmp);
        const s = tmp[0] + tmp[1] + tmp[2];
        if (s >= thr) {
          painted++;
          acc[0] += tmp[0]; acc[1] += tmp[1]; acc[2] += tmp[2];
        }
      }
      const coverage = painted / info.area;
      this.regionCoverage[r] = coverage;
      if (painted) {
        const avg = densityToRgb([acc[0] / painted, acc[1] / painted, acc[2] / painted]);
        const de = deltaE(avg, densityToRgb(target));
        this.regionAccuracy[r] = Math.max(0, Math.min(1, 1 - (de - 2) / 45));
      } else this.regionAccuracy[r] = 0;
      const wasDone = this.regionDone[r] === 1;
      const isDone = wasDone ? coverage >= 0.84 : coverage >= 0.9;
      if (isDone && !wasDone) {
        this.regionDone[r] = 1;
        this.regionDoneAt[r] = silent ? now - 10000 : now;
        if (!silent) {
          const v = this.view;
          this.callbacks.onRegionComplete?.(r, {
            x: v.tx + info.labelX * v.scale,
            y: v.ty + info.labelY * v.scale,
          });
        }
        this.needsComposite = true;
      } else if (!isDone && wasDone) {
        this.regionDone[r] = 0;
        this.needsComposite = true;
      }
    }
    this.progressInitialised = true;
    this.callbacks.onProgress?.(this.computeStats());
    this.requestFrame();
  }

  computeStats(): ProgressStats {
    const a = this.analysis;
    const perNumber: Record<number, NumberProgress> = {};
    let complete = 0, coveredArea = 0, accSum = 0, accArea = 0;
    const totalArea = a.width * a.height;
    for (const r of a.regions) {
      const pn = (perNumber[r.number] ??= { total: 0, complete: 0, coverage: 0 });
      pn.total++;
      if (this.regionDone[r.id]) {
        pn.complete++;
        complete++;
        accSum += this.regionAccuracy[r.id] * r.area;
        accArea += r.area;
      }
      pn.coverage += this.regionCoverage[r.id] * r.area;
      coveredArea += Math.min(1, this.regionCoverage[r.id] / 0.9) * r.area;
    }
    for (const [num, pn] of Object.entries(perNumber)) {
      const area = (a.numberRegions.get(Number(num)) ?? []).reduce((s, id) => s + a.regions[id].area, 0);
      pn.coverage = area ? pn.coverage / area : 0;
    }
    return {
      totalRegions: a.regions.length,
      completeRegions: complete,
      percent: (coveredArea / totalArea) * 100,
      accuracy: accArea ? (accSum / accArea) * 100 : 0,
      perNumber,
    };
  }

  isRegionDone(region: number) {
    return this.regionDone[region] === 1;
  }

  // ---------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------

  private on<K extends keyof HTMLElementEventMap>(
    target: EventTarget, type: K | string, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions,
  ) {
    target.addEventListener(type, fn as EventListener, opts);
    this.listeners.push([target, type, fn as EventListener, opts]);
  }

  private bindInput() {
    const el = this.overlay;
    el.style.touchAction = "none";
    this.on(el, "pointerdown", (e: PointerEvent) => this.onPointerDown(e));
    this.on(el, "pointermove", (e: PointerEvent) => this.onPointerMove(e));
    this.on(el, "pointerup", (e: PointerEvent) => this.onPointerUp(e));
    this.on(el, "pointercancel", (e: PointerEvent) => this.onPointerUp(e, true));
    this.on(el, "pointerleave", () => {
      this.cursor.inside = false;
      this.cursorDirty = true;
      this.requestFrame();
    });
    this.on(el, "pointerenter", () => {
      this.cursor.inside = true;
    });
    this.on(el, "wheel", (e: WheelEvent) => this.onWheel(e), { passive: false });
    this.on(el, "contextmenu", (e: Event) => e.preventDefault());
    this.on(window, "keydown", (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping(e)) {
        if (!this.spaceDown) {
          this.spaceDown = true;
          this.overlay.style.cursor = "grab";
          this.cursorDirty = true;
          this.requestFrame();
        }
        e.preventDefault();
      }
    });
    this.on(window, "keyup", (e: KeyboardEvent) => {
      if (e.code === "Space") {
        this.spaceDown = false;
        this.overlay.style.cursor = "";
        this.cursorDirty = true;
        this.requestFrame();
      }
    });
    this.on(window, "blur", () => {
      this.spaceDown = false;
      if (this.stroke) this.endStroke();
    });
  }

  private local(e: PointerEvent | WheelEvent) {
    const rect = this.overlay.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  toPaint(sx: number, sy: number) {
    return { x: (sx - this.view.tx) / this.view.scale, y: (sy - this.view.ty) / this.view.scale };
  }

  private regionAtPaint(x: number, y: number): number {
    const xi = Math.floor(x), yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= this.analysis.width || yi >= this.analysis.height) return -1;
    return this.analysis.regionMap[yi * this.analysis.width + xi];
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const p = this.local(e);
    const isMouseWheel = e.deltaMode === 1 || (Math.abs(e.deltaY) >= 50 && e.deltaX === 0 && Number.isInteger(e.deltaY));
    if (e.ctrlKey || e.metaKey || isMouseWheel) {
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      this.zoomAt(Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0018)), p.x, p.y);
    } else {
      this.panBy(-e.deltaX, -e.deltaY);
    }
    this.cursor = { ...p, inside: true };
    this.cursorDirty = true;
  }

  private onPointerDown(e: PointerEvent) {
    const p = this.local(e);
    this.cursor = { ...p, inside: true };
    this.overlay.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { ...p, type: e.pointerType });

    // Second finger: switch to pinch-zoom, cancelling a just-started stroke.
    if (this.pointers.size === 2 && e.pointerType === "touch") {
      if (this.stroke) {
        const young = performance.now() - this.stroke.startTime < 300;
        this.cancelStroke(young);
      }
      const [a, b] = Array.from(this.pointers.values());
      this.gesture = {
        mode: "pinch",
        startDist: Math.hypot(a.x - b.x, a.y - b.y),
        startScale: this.view.scale,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
      };
      return;
    }
    if (this.pointers.size > 2) return;

    if (e.button === 1 || e.button === 2 || this.spaceDown) {
      this.gesture = { mode: "pan", startDist: 0, startScale: 0, cx: p.x, cy: p.y };
      this.overlay.style.cursor = "grabbing";
      return;
    }
    if (e.button !== 0) return;

    const tool = TOOLS[this.brush.tool];
    const pt = this.toPaint(p.x, p.y);
    if (this.pickHandler) {
      const handler = this.pickHandler;
      this.pickHandler = null;
      handler(this.regionAtPaint(pt.x, pt.y));
      return;
    }
    if (tool.kind === "eyedropper" || e.altKey) {
      this.pickColor(pt.x, pt.y);
      return;
    }
    if (tool.kind === "fill") {
      this.startFill(pt.x, pt.y);
      return;
    }
    this.startStroke(e, pt);
  }

  private onPointerMove(e: PointerEvent) {
    const p = this.local(e);
    this.cursor = { ...p, inside: true };
    this.cursorDirty = true;
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { ...p, type: e.pointerType });

    if (this.gesture?.mode === "pinch" && this.pointers.size >= 2) {
      const [a, b] = Array.from(this.pointers.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const g = this.gesture;
      this.panBy(cx - g.cx, cy - g.cy);
      const target = g.startScale * (dist / Math.max(1, g.startDist));
      this.zoomAt(target / this.view.scale, cx, cy);
      g.cx = cx;
      g.cy = cy;
      return;
    }
    if (this.gesture?.mode === "pan") {
      this.panBy(p.x - this.gesture.cx, p.y - this.gesture.cy);
      this.gesture.cx = p.x;
      this.gesture.cy = p.y;
      return;
    }
    if (this.stroke && e.pointerId === this.stroke.pointerId) {
      const events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
      const list = events.length ? events : [e];
      for (const ev of list) {
        const lp = this.local(ev);
        this.continueStroke(this.toPaint(lp.x, lp.y), pressureOf(ev));
      }
    }
    this.requestFrame();
  }

  private onPointerUp(e: PointerEvent, cancelled = false) {
    this.pointers.delete(e.pointerId);
    if (this.gesture) {
      if (this.pointers.size === 0) {
        this.gesture = null;
        this.overlay.style.cursor = this.spaceDown ? "grab" : "";
      } else if (this.gesture.mode === "pinch" && this.pointers.size === 1) {
        // Continue as a pan with the remaining finger.
        const [rem] = Array.from(this.pointers.values());
        this.gesture = { mode: "pan", startDist: 0, startScale: 0, cx: rem.x, cy: rem.y };
      }
      return;
    }
    if (this.stroke && e.pointerId === this.stroke.pointerId) {
      if (!cancelled) {
        const p = this.local(e);
        this.continueStroke(this.toPaint(p.x, p.y), this.stroke.pressure, true);
      }
      this.endStroke();
    }
  }

  // ---------------------------------------------------------------------
  // Strokes
  // ---------------------------------------------------------------------

  private radiusFor(pressure: number) {
    const tool = TOOLS[this.brush.tool];
    const base = (this.brush.settings.size / 2) * this.analysis.scale;
    return base * (1 - tool.pressureSize * (1 - pressure));
  }

  /**
   * Resolve which regions a stroke may touch. Returns null for unrestricted,
   * a mask, or "reject" when strict numbering forbids painting here.
   */
  private resolveAllow(x: number, y: number, radius: number, forFill = false): Uint8Array | null | "reject" {
    const { lock, strict, activeNumber } = this.brush;
    const isEraser = TOOLS[this.brush.tool].kind === "eraser";
    const mask = this.allowMask;
    mask.fill(0);
    const here = this.regionAtPaint(x, y);
    if (lock === "off" && !forFill) return null;
    if (lock === "number" && !forFill) {
      const num = activeNumber ?? (here >= 0 ? this.analysis.regions[here].number : null);
      if (num == null) return "reject";
      for (const r of this.analysis.numberRegions.get(num) ?? []) mask[r] = 1;
      return mask;
    }
    // Region lock (and fills).
    if (here >= 0 && (isEraser || !strict || activeNumber == null || this.analysis.regions[here].number === activeNumber)) {
      mask[here] = 1;
      return mask;
    }
    if (forFill) return "reject";
    // Magnetic snap: nearest region with the active number within reach.
    if (activeNumber != null && this.brush.magnetic) {
      const reach = radius + Math.min(14, radius * 0.35 + 2);
      const found = this.nearestRegionWithNumber(x, y, reach, activeNumber);
      if (found >= 0) {
        mask[found] = 1;
        return mask;
      }
    }
    return "reject";
  }

  private nearestRegionWithNumber(x: number, y: number, reach: number, number: number): number {
    const a = this.analysis;
    const W = a.width, H = a.height;
    let best = -1, bestD = Infinity;
    const step = reach > 30 ? 2 : 1;
    for (let yy = Math.max(0, Math.floor(y - reach)); yy < Math.min(H, Math.ceil(y + reach)); yy += step) {
      for (let xx = Math.max(0, Math.floor(x - reach)); xx < Math.min(W, Math.ceil(x + reach)); xx += step) {
        const d = (xx - x) ** 2 + (yy - y) ** 2;
        if (d > reach * reach || d >= bestD) continue;
        const r = a.regionMap[yy * W + xx];
        if (a.regions[r].number === number) {
          bestD = d;
          best = r;
        }
      }
    }
    return best;
  }

  private rejectHint(x: number, y: number) {
    const here = this.regionAtPaint(x, y);
    if (here < 0) return;
    const num = this.analysis.regions[here].number;
    const swatch = this.def.palette.find((p) => p.number === num);
    this.callbacks.onHint?.({
      kind: "wrong-number",
      number: num,
      message: `This area is number ${num}${swatch ? ` · ${swatch.name}` : ""}.`,
    });
  }

  private strokeOptions(allow: Uint8Array | null): StrokeOptions {
    const tool = TOOLS[this.brush.tool];
    const s = this.brush.settings;
    return {
      tool,
      opacity: s.opacity,
      flow: s.flow,
      wetness: s.wetness,
      density: rgbToDensity(hexToRgb(this.brush.color)),
      allow,
      magnetic: this.brush.magnetic,
      seed: (Math.random() * 1e6) | 0,
    };
  }

  private startStroke(e: PointerEvent, pt: { x: number; y: number }) {
    if (this.fillJob) {
      this.surface.finishFill(this.fillJob);
      this.fillJob = null;
    }
    const pressure = pressureOf(e);
    const radius = this.radiusFor(pressure);
    const allow = this.resolveAllow(pt.x, pt.y, radius);
    if (allow === "reject") {
      this.rejectHint(pt.x, pt.y);
      return;
    }
    const tool = TOOLS[this.brush.tool];
    const kind: HistoryKind = tool.kind === "eraser" ? "erase" : "stroke";
    const label = tool.kind === "eraser" ? "Lift" : `${tool.name}`;
    this.surface.history.begin(kind, label, {
      color: tool.kind === "eraser" ? undefined : this.brush.color,
      number: this.brush.activeNumber ?? undefined,
    });
    this.surface.beginStroke(this.strokeOptions(allow));
    this.stroke = {
      last: { ...pt },
      smooth: { ...pt },
      dirX: Math.SQRT1_2,
      dirY: Math.SQRT1_2,
      pressure,
      startTime: performance.now(),
      pointerId: e.pointerId,
    };
    this.surface.dab({ x: pt.x, y: pt.y, radius, angle: Math.PI / 4, pressure });
    this.emitHistory();
    this.requestFrame();
  }

  private continueStroke(raw: { x: number; y: number }, pressure: number, final = false) {
    const s = this.stroke;
    if (!s) return;
    const tool = TOOLS[this.brush.tool];
    // Light positional smoothing for calm, even strokes.
    const k = final ? 1 : 0.55;
    s.smooth.x += (raw.x - s.smooth.x) * k;
    s.smooth.y += (raw.y - s.smooth.y) * k;
    s.pressure += (pressure - s.pressure) * 0.5;
    const dx = s.smooth.x - s.last.x, dy = s.smooth.y - s.last.y;
    let dist = Math.hypot(dx, dy);
    if (dist < 0.01) return;
    const ux = dx / dist, uy = dy / dist;
    s.dirX = s.dirX * 0.75 + ux * 0.25;
    s.dirY = s.dirY * 0.75 + uy * 0.25;
    const angle = Math.atan2(s.dirY, s.dirX);
    const radius = this.radiusFor(s.pressure);
    let spacing = Math.max(0.5, radius * tool.spacing);
    if (tool.shape === "flat") spacing = Math.max(0.5, Math.min(spacing, radius * tool.aspect * 0.5));
    while (dist >= spacing) {
      s.last.x += ux * spacing;
      s.last.y += uy * spacing;
      dist -= spacing;
      this.surface.dab({ x: s.last.x, y: s.last.y, radius, angle, pressure: s.pressure });
    }
    this.cursorDirty = true;
  }

  private endStroke() {
    if (!this.stroke) return;
    this.stroke = null;
    this.surface.endStroke();
    this.emitHistory();
    this.requestFrame();
  }

  private cancelStroke(discard: boolean) {
    this.stroke = null;
    this.surface.endStroke();
    if (discard) {
      this.surface.history.undo();
      this.surface.history.discardRedo();
      this.surface.dryAll();
    }
    this.emitHistory();
    this.requestFrame();
  }

  private startFill(x: number, y: number) {
    const here = this.regionAtPaint(x, y);
    if (here < 0) return;
    const allow = this.resolveAllow(x, y, 0, true);
    if (allow === "reject") {
      this.rejectHint(x, y);
      return;
    }
    if (this.fillJob) {
      this.surface.finishFill(this.fillJob);
      this.fillJob = null;
    }
    const num = this.analysis.regions[here].number;
    this.surface.history.begin("fill", `Wash fill · ${num}`, { color: this.brush.color, number: num });
    this.fillJob = this.surface.beginFill(here, this.strokeOptions(null), x, y);
    this.emitHistory();
    this.requestFrame();
  }

  private pickColor(x: number, y: number) {
    const here = this.regionAtPaint(x, y);
    if (here < 0) return;
    const xi = Math.floor(x), yi = Math.floor(y);
    const radius = Math.max(0, Math.round(((this.brush.settings.size - 1) / 2) * this.analysis.scale));
    const d = this.surface.sampleDensity(xi, yi, TOOLS[this.brush.tool].kind === "eyedropper" ? radius : 1);
    const region = this.analysis.regions[here];
    if (d[0] + d[1] + d[2] < 0.03) {
      // Unpainted: pick the region's intended colour and number.
      const sw = this.def.palette.find((p) => p.number === region.number);
      if (sw) this.callbacks.onColorPicked?.(sw.hex, sw.number);
      return;
    }
    this.callbacks.onColorPicked?.(rgbToHex(densityToRgb(d)), null);
  }

  private emitHistory() {
    const h = this.surface.history;
    this.callbacks.onHistory?.({
      entries: h.summaries(),
      position: h.position,
      canUndo: h.canUndo,
      canRedo: h.canRedo,
    });
  }

  // ---------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------

  /** Render the painting offscreen at `scale` × paint resolution. */
  renderExport(opts: ExportOptions): HTMLCanvasElement {
    this.surface.dryAll();
    this.renderer.updatePaint(this.surface);
    const W = this.analysis.width, H = this.analysis.height;
    const s = opts.scale;
    const c = document.createElement("canvas");
    c.width = Math.round(W * s);
    c.height = Math.round(H * s);
    const ctx = c.getContext("2d")!;
    if (opts.background === "template") {
      this.renderer.drawTemplate(ctx, s);
      this.drawNumbersOnly(ctx, s);
      return c;
    }
    if (opts.background === "transparent") {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(this.renderer.paintToAlphaCanvas(this.surface), 0, 0, c.width, c.height);
      return c;
    }
    const saved = this.renderer.layers;
    this.renderer.layers = {
      ...saved,
      paper: { visible: true, opacity: saved.paper.visible ? Math.max(0.6, saved.paper.opacity) : 0.6 },
      paint: { visible: true, opacity: 1 },
      varnish: { visible: opts.varnish, opacity: opts.varnish ? Math.max(0.35, saved.varnish.opacity) : 0 },
      underdrawing: { visible: opts.underdrawing !== "none" || opts.numbers, opacity: 0.9 },
    };
    this.renderer.setGuide(null);
    this.renderer.updatePaint(this.surface, true);
    const overlay: OverlayState = {
      ...this.overlayState,
      showOutlines: opts.underdrawing !== "none",
      finished: opts.underdrawing === "soft",
      guide: false,
      showGrid: false,
      showNumbers: opts.numbers,
      regionDone: opts.numbers ? new Uint8Array(this.regionDone.length) : this.regionDone,
    };
    this.renderer.composite(ctx, s, 0, 0, c.width, c.height, overlay, this.surface, {
      exportMode: true,
      numbersOverride: opts.numbers,
    });
    this.renderer.layers = saved;
    this.syncGuideForce();
    return c;
  }

  private drawNumbersOnly(ctx: CanvasRenderingContext2D, s: number) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(60, 62, 70, 0.95)";
    for (const r of this.analysis.regions) {
      const size = Math.min(40 * s, r.labelRadius * s * 0.95);
      if (size < 4) continue;
      ctx.font = `500 ${size.toFixed(1)}px ${this.renderer.fontFamily}`;
      ctx.fillText(String(r.number), r.labelX * s, r.labelY * s + size * 0.04);
    }
  }

  async exportPNG(opts: ExportOptions): Promise<Blob> {
    const c = this.renderExport(opts);
    return canvasToBlob(c, "image/png");
  }

  async exportPDF(opts: ExportOptions & { title: string; caption: string }): Promise<Blob> {
    const c = this.renderExport({ ...opts, background: opts.background === "transparent" ? "paper" : opts.background });
    const jpeg = await canvasToBlob(c, "image/jpeg", 0.93);
    const bytes = new Uint8Array(await jpeg.arrayBuffer());
    return buildPdf(bytes, c.width, c.height, { title: opts.title, caption: opts.caption });
  }

  /** Small preview image for the gallery card (composed synchronously, encoded async). */
  thumbnail(maxSide = 480): Promise<Blob> {
    const c = this.renderer.renderPreview(this.surface, maxSide);
    return canvasToBlob(c, "image/webp", 0.82);
  }
}

function pressureOf(e: PointerEvent): number {
  if (e.pointerType === "pen") return e.pressure > 0 ? Math.min(1, Math.max(0.05, e.pressure)) : 0.5;
  return 1;
}

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}

function canvasToBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // Browsers without WebP encoding fall back to PNG, which is fine for thumbnails.
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("Image encoding failed"))), type, quality);
  });
}
