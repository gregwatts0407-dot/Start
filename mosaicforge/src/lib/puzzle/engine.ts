/**
 * PuzzleEngine — the imperative heart of MosaicForge.
 *
 * Owns a <canvas>, the piece geometry, the sprite atlas and the live board
 * state, and handles rendering and all pointer/touch/wheel input. React only
 * talks to it through a small method API and receives callbacks.
 *
 * ## State model
 * Every piece belongs to exactly one *group*. A group has a rigid transform
 * `world = R(rot) · local + (x, y)` where `local` is the piece's position in
 * the solved image ("puzzle coordinates"). Because all pieces of a group share
 * the solved-image frame, two groups are correctly aligned exactly when they
 * have the same rotation and (nearly) the same (x, y). That makes snap
 * detection O(pieces in the dropped group): for each neighbour across a cut
 * edge, compare two group origins. No spatial index is required.
 *
 * Pieces dropped onto their true position on the board (rot 0, origin ≈ 0,0)
 * lock into the single "board" group, which is drawn below everything and
 * cannot be dragged.
 *
 * ## Rendering
 * One `setTransform` per group, then one `drawImage` per visible piece from a
 * pre-rendered atlas (with mip levels chosen by zoom). Groups and, for large
 * groups, individual pieces are culled against the viewport. Frames are only
 * drawn when something changed or an animation is running.
 */
import { generateCut, type CutLayout, type PieceGeom } from "./geometry";
import { computeSlots, angleAround, rgbToHsl, type Rect, type Point } from "./layout";
import { shuffle } from "./rng";
import { SpriteAtlas, SHADOW_SCALE } from "./sprites";
import { playComplete, playSnap } from "./sound";
import type {
  EngineSettings,
  EngineStats,
  OrganizeMode,
  PuzzleConfig,
  SavedCamera,
  SerializedState,
  StartMode,
} from "./types";

/* ------------------------------------------------------------------------ */
/* Small 2D affine helpers ([a, b, c, d, e, f] as in CanvasRenderingContext2D) */
/* ------------------------------------------------------------------------ */

type Mat = [number, number, number, number, number, number];

function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/** Rotation about a point (px, py) by angle a. */
function rotAbout(px: number, py: number, a: number): Mat {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, s, -s, c, px - c * px + s * py, py - s * px - c * py];
}

// cos/sin for quarter turns (clockwise on screen, since y points down).
const COS = [1, 0, -1, 0];
const SIN = [0, 1, 0, -1];
const QUARTER = Math.PI / 2;

const easeOut = (u: number) => 1 - Math.pow(1 - u, 3);

/* ------------------------------------------------------------------------ */

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

interface Group {
  id: number;
  x: number;
  y: number;
  rot: number; // 0..3 quarter turns
  locked: boolean;
  pieces: number[];
  // Bounds of the group in grid cells (inclusive) — for culling & hit tests.
  c0: number;
  c1: number;
  r0: number;
  r1: number;
  // Visual animation "residuals": the group is drawn offset/rotated by these
  // amounts, which decay to zero. Logic always uses the real transform.
  aDX0: number;
  aDY0: number;
  aAng0: number;
  pivX: number; // rotation pivot in local (puzzle) coordinates
  pivY: number;
  aStart: number;
  aDur: number;
  flash?: { pieces: number[]; start: number };
}

interface Snapshot {
  pieceGroup: Int32Array;
  groups: Float64Array; // [x, y, rot, locked] per group in z-order
}

export interface EngineCallbacks {
  onStats?(stats: EngineStats): void;
  /** Board state changed — schedule an autosave. */
  onChange?(): void;
  onComplete?(): void;
  onLoadProgress?(label: string, fraction: number): void;
}

export interface LoadOptions {
  image: HTMLImageElement | ImageBitmap;
  config: PuzzleConfig;
  state?: SerializedState;
  completed?: boolean;
  signal?: AbortSignal;
}

/** Upper bound on level-0 atlas pixels (≈80 MB RGBA) to keep 2000-piece boards practical. */
const ATLAS_PIXEL_BUDGET = 20_000_000;
/** Largest piece size (world px) — beyond this extra resolution is wasted. */
const MAX_CELL = 200;
const FLASH_MS = 650;
const UNDO_LIMIT = 80;

export class PuzzleEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly hitCtx: CanvasRenderingContext2D;
  private cb: EngineCallbacks;

  private dpr = 1;
  private viewW = 1;
  private viewH = 1;
  private raf = 0;
  private dirty = true;
  private ready = false;
  private destroyed = false;
  private resizeObs?: ResizeObserver;

  // Geometry & resources
  private cut!: CutLayout;
  private pieces: PieceGeom[] = [];
  private rows = 0;
  private cols = 0;
  private W = 0;
  private H = 0;
  private cw = 0;
  private ch = 0;
  private pad = 0;
  private atlas?: SpriteAtlas;
  private ghost?: HTMLCanvasElement;
  private fullImage?: HTMLImageElement | ImageBitmap;
  /** h, s, l per piece — for colour sorting. */
  private colours!: Float32Array;
  private rotationEnabled = false;

  // Board state
  private pieceGroup!: Int32Array;
  private groups = new Map<number, Group>();
  private z: number[] = [];
  private nextGid = 1;
  private boardGid: number | null = null;
  private moves = 0;
  private completed = false;
  private completeT0 = 0;

  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];

  // Camera: screen = world * zoom + (x, y)   (CSS pixels)
  private cam: Camera = { x: 0, y: 0, zoom: 1 };
  private camAnim: { from: Camera; to: Camera; t0: number; dur: number } | null = null;
  private minZoom = 0.05;
  private maxZoom = 4;
  private pendingCamera?: SavedCamera;

  private animating = new Set<Group>();

  /**
   * Static-layer cache used while dragging: everything except the dragged
   * group is rendered once into `layer`, so each drag frame is a single blit
   * plus the moving group — smooth even with 2000 pieces in view.
   */
  private layer?: HTMLCanvasElement;
  private layerKey = "";

  // Interaction
  private pointers = new Map<number, Point>();
  private mode: "none" | "drag" | "pan" | "pinch" = "none";
  private drag: {
    gid: number;
    pointerId: number;
    lastSX: number;
    lastSY: number;
    startSX: number;
    startSY: number;
    t0: number;
    moved: boolean;
    rotated: boolean;
    /** Edge auto-pan only arms once the pointer has been away from the edges. */
    panArmed: boolean;
    before: Snapshot;
  } | null = null;
  private pinch: { dist: number; mid: Point; zoom: number } | null = null;
  private lastPointer: Point | null = null;
  private spaceDown = false;

  settings: EngineSettings = {
    ghost: false,
    ghostOpacity: 0.25,
    filter: "all",
    snapToBoard: true,
    sound: true,
    theme: "dark",
  };

  constructor(canvas: HTMLCanvasElement, callbacks: EngineCallbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: true })!;
    const hc = document.createElement("canvas");
    hc.width = hc.height = 1;
    this.hitCtx = hc.getContext("2d")!;
    this.cb = callbacks;

    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);

    if (canvas.parentElement && typeof ResizeObserver !== "undefined") {
      this.resizeObs = new ResizeObserver(() => this.resize());
      this.resizeObs.observe(canvas.parentElement);
    }
    this.resize();
    this.raf = requestAnimationFrame(this.tick);
  }

  setCallbacks(cb: EngineCallbacks) {
    this.cb = cb;
  }

  /* ====================================================================== */
  /* Loading                                                                */
  /* ====================================================================== */

  async load({ image, config, state, completed, signal }: LoadOptions): Promise<void> {
    const imgW = image.width;
    const imgH = image.height;
    const { rows, cols } = config;
    const n = rows * cols;
    this.rows = rows;
    this.cols = cols;
    this.rotationEnabled = config.rotation;
    this.fullImage = image;

    // Choose world scale: cap piece resolution and total atlas memory.
    const cellSrc = Math.max(imgW / cols, imgH / rows);
    const slotFactor = Math.pow(1 + 2 * 0.33, 2);
    const atlasPx = n * cellSrc * cellSrc * slotFactor;
    const scale = Math.min(1, MAX_CELL / cellSrc, Math.sqrt(ATLAS_PIXEL_BUDGET / atlasPx));
    this.W = Math.round(imgW * scale);
    this.H = Math.round(imgH * scale);

    this.cb.onLoadProgress?.("Cutting pieces", 0);
    this.cut = generateCut(rows, cols, this.W, this.H, config.seed);
    this.pieces = this.cut.pieces;
    this.cw = this.cut.cw;
    this.ch = this.cut.ch;
    this.pad = this.cut.pad;

    // Source scaled to world size.
    let source: CanvasImageSource = image;
    if (scale < 1) {
      const c = document.createElement("canvas");
      c.width = this.W;
      c.height = this.H;
      const cx = c.getContext("2d")!;
      cx.imageSmoothingQuality = "high";
      cx.drawImage(image, 0, 0, this.W, this.H);
      source = c;
    }

    // Ghost/preview image (≤2048 px) for the board underlay.
    const gs = Math.min(1, 2048 / Math.max(imgW, imgH));
    this.ghost = document.createElement("canvas");
    this.ghost.width = Math.round(imgW * gs);
    this.ghost.height = Math.round(imgH * gs);
    const gctx = this.ghost.getContext("2d")!;
    gctx.imageSmoothingQuality = "high";
    gctx.drawImage(image, 0, 0, this.ghost.width, this.ghost.height);

    this.computeColours(image);

    this.atlas = new SpriteAtlas(this.cut);
    await this.atlas.build(
      source,
      this.W,
      this.H,
      (f) => this.cb.onLoadProgress?.("Cutting pieces", f),
      signal,
    );
    if (scale < 1) (source as HTMLCanvasElement).width = 0;
    if (this.destroyed) return;

    // Board state
    this.pieceGroup = new Int32Array(n);
    const restored = state && this.restoreState(state);
    if (!restored) this.layoutFresh(config.startMode);

    this.computeZoomLimits();
    if (restored && state?.camera) this.pendingCamera = state.camera;
    else this.fit(false);
    this.applyPendingCamera();

    if (completed || this.countJoined() === this.totalJoins()) {
      this.completed = true;
      this.completeT0 = -1e9;
    }

    this.ready = true;
    this.dirty = true;
    this.cb.onLoadProgress?.("Ready", 1);
    this.emitStats();
  }

  /** Average colour per piece via a supersampled thumbnail of the image. */
  private computeColours(image: CanvasImageSource) {
    const ss = 4;
    const c = document.createElement("canvas");
    c.width = this.cols * ss;
    c.height = this.rows * ss;
    const cx = c.getContext("2d", { willReadFrequently: true })!;
    cx.imageSmoothingQuality = "high";
    cx.drawImage(image, 0, 0, c.width, c.height);
    const data = cx.getImageData(0, 0, c.width, c.height).data;
    this.colours = new Float32Array(this.rows * this.cols * 3);
    for (let r = 0; r < this.rows; r++) {
      for (let col = 0; col < this.cols; col++) {
        let R = 0,
          G = 0,
          B = 0;
        for (let y = 0; y < ss; y++) {
          for (let x = 0; x < ss; x++) {
            const i = ((r * ss + y) * c.width + col * ss + x) * 4;
            R += data[i];
            G += data[i + 1];
            B += data[i + 2];
          }
        }
        const k = ss * ss;
        const [h, s, l] = rgbToHsl(R / k, G / k, B / k);
        const p = (r * this.cols + col) * 3;
        this.colours[p] = h;
        this.colours[p + 1] = s;
        this.colours[p + 2] = l;
      }
    }
  }

  /* ====================================================================== */
  /* Groups                                                                 */
  /* ====================================================================== */

  private newGroup(pieces: number[], x: number, y: number, rot: number, locked: boolean): Group {
    const g: Group = {
      id: this.nextGid++,
      x,
      y,
      rot,
      locked,
      pieces,
      c0: 0,
      c1: 0,
      r0: 0,
      r1: 0,
      aDX0: 0,
      aDY0: 0,
      aAng0: 0,
      pivX: 0,
      pivY: 0,
      aStart: 0,
      aDur: 0,
    };
    for (const p of pieces) this.pieceGroup[p] = g.id;
    this.updateBounds(g);
    this.groups.set(g.id, g);
    return g;
  }

  private updateBounds(g: Group) {
    let c0 = Infinity,
      c1 = -Infinity,
      r0 = Infinity,
      r1 = -Infinity;
    for (const p of g.pieces) {
      const pc = this.pieces[p];
      if (pc.col < c0) c0 = pc.col;
      if (pc.col > c1) c1 = pc.col;
      if (pc.row < r0) r0 = pc.row;
      if (pc.row > r1) r1 = pc.row;
    }
    g.c0 = c0;
    g.c1 = c1;
    g.r0 = r0;
    g.r1 = r1;
  }

  private groupOf(piece: number): Group {
    return this.groups.get(this.pieceGroup[piece])!;
  }

  private bringToTop(g: Group) {
    if (g.locked) return;
    const i = this.z.indexOf(g.id);
    if (i >= 0 && i !== this.z.length - 1) {
      this.z.splice(i, 1);
      this.z.push(g.id);
    }
  }

  private sendToBottom(g: Group) {
    const i = this.z.indexOf(g.id);
    if (i > 0) {
      this.z.splice(i, 1);
      this.z.unshift(g.id);
    }
  }

  /** Move all pieces of `src` into `dst` and delete `src`. */
  private absorb(dst: Group, src: Group) {
    for (const p of src.pieces) {
      this.pieceGroup[p] = dst.id;
      dst.pieces.push(p);
    }
    this.groups.delete(src.id);
    this.animating.delete(src);
    const i = this.z.indexOf(src.id);
    if (i >= 0) this.z.splice(i, 1);
    if (this.boardGid === src.id) this.boardGid = dst.id;
    this.updateBounds(dst);
  }

  /** World AABB of a group (real transform, tabs included). */
  private groupWorldRect(g: Group): Rect {
    const lx0 = g.c0 * this.cw - this.pad;
    const ly0 = g.r0 * this.ch - this.pad;
    const lx1 = (g.c1 + 1) * this.cw + this.pad;
    const ly1 = (g.r1 + 1) * this.ch + this.pad;
    const c = COS[g.rot];
    const s = SIN[g.rot];
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const [lx, ly] of [
      [lx0, ly0],
      [lx1, ly0],
      [lx0, ly1],
      [lx1, ly1],
    ]) {
      const wx = c * lx - s * ly + g.x;
      const wy = s * lx + c * ly + g.y;
      if (wx < x0) x0 = wx;
      if (wx > x1) x1 = wx;
      if (wy < y0) y0 = wy;
      if (wy > y1) y1 = wy;
    }
    return { x0, y0, x1, y1 };
  }

  /* ---------------------------- animations ------------------------------ */

  private residual(g: Group, now: number): number {
    if (g.aDur <= 0) return 0;
    const u = Math.min(1, (now - g.aStart) / g.aDur);
    return 1 - easeOut(u);
  }

  /**
   * Start (or extend) a visual animation: the group is drawn as if offset by
   * (dx, dy) and rotated by `ang` about local pivot, decaying to its real
   * transform over `dur` ms.
   */
  private animate(g: Group, dx: number, dy: number, ang: number, pivX: number, pivY: number, dur = 160) {
    const now = performance.now();
    const k = this.residual(g, now);
    g.aDX0 = g.aDX0 * k + dx;
    g.aDY0 = g.aDY0 * k + dy;
    g.aAng0 = g.aAng0 * k + ang;
    if (ang !== 0) {
      g.pivX = pivX;
      g.pivY = pivY;
    }
    g.aStart = now;
    g.aDur = dur;
    this.animating.add(g);
  }

  /** Real transform matrix of a group. */
  private groupMatrix(g: Group): Mat {
    const c = COS[g.rot];
    const s = SIN[g.rot];
    return [c, s, -s, c, g.x, g.y];
  }

  /** Transform including any running animation residual. */
  private displayMatrix(g: Group, now: number): Mat {
    const G = this.groupMatrix(g);
    if (!this.animating.has(g)) return G;
    const k = this.residual(g, now);
    if (k <= 0) return G;
    let M = G;
    const ang = g.aAng0 * k;
    if (ang !== 0) {
      // pivot in world space under the real transform
      const px = G[0] * g.pivX + G[2] * g.pivY + G[4];
      const py = G[1] * g.pivX + G[3] * g.pivY + G[5];
      M = mul(rotAbout(px, py, ang), M);
    }
    const dx = g.aDX0 * k;
    const dy = g.aDY0 * k;
    if (dx !== 0 || dy !== 0) M = mul([1, 0, 0, 1, dx, dy], M);
    return M;
  }

  /** Rotate a group by ±90° about a world point. */
  private rotateGroup(g: Group, dir: 1 | -1, pivotX: number, pivotY: number) {
    if (g.locked || !this.rotationEnabled) return;
    // Pivot in local coordinates (unchanged by the rotation itself).
    const c = COS[g.rot];
    const s = SIN[g.rot];
    const dx = pivotX - g.x;
    const dy = pivotY - g.y;
    const plx = c * dx + s * dy;
    const ply = -s * dx + c * dy;
    // t' = Rq (t - P) + P
    const qc = COS[(4 + dir) % 4];
    const qs = SIN[(4 + dir) % 4];
    const tx = g.x - pivotX;
    const ty = g.y - pivotY;
    g.x = qc * tx - qs * ty + pivotX;
    g.y = qs * tx + qc * ty + pivotY;
    g.rot = (g.rot + dir + 4) % 4;
    this.animate(g, 0, 0, -dir * QUARTER, plx, ply, 170);
    this.dirty = true;
  }

  /* ====================================================================== */
  /* Layout                                                                 */
  /* ====================================================================== */

  /** Place a single-piece group so its piece centre lands on world point (sx, sy). */
  private placePieceAt(g: Group, sx: number, sy: number) {
    const pc = this.pieces[g.pieces[0]];
    const lx = (pc.col + 0.5) * this.cw;
    const ly = (pc.row + 0.5) * this.ch;
    const c = COS[g.rot];
    const s = SIN[g.rot];
    g.x = sx - (c * lx - s * ly);
    g.y = sy - (s * lx + c * ly);
  }

  private get pitch() {
    return Math.max(this.cw, this.ch) * (1 + 2 * 0.31);
  }

  /** Order pieces for a given arrangement mode, paired with slot positions. */
  private arrange(pieceIds: number[], slots: Point[], mode: OrganizeMode | StartMode): Array<[number, Point]> {
    const pairs: Array<[number, Point]> = [];
    if (mode === "colour") {
      // Colour wedges: pieces sorted by hue are assigned to slots sorted by
      // angle around the frame; near-greys go last, ordered by lightness.
      const key = (p: number) => {
        const h = this.colours[p * 3];
        const s = this.colours[p * 3 + 1];
        const l = this.colours[p * 3 + 2];
        if (s < 0.12 || l < 0.08 || l > 0.94) return 1000 + l * 100;
        return Math.floor(h / 15) * 2 + l;
      };
      const sortedPieces = [...pieceIds].sort((a, b) => key(a) - key(b));
      const sortedSlots = [...slots].sort((a, b) => angleAround(a, this.W, this.H) - angleAround(b, this.W, this.H));
      sortedPieces.forEach((p, i) => pairs.push([p, sortedSlots[i]]));
    } else if (mode === "edges") {
      // Edge pieces take the slots nearest the frame; interior pieces go outside.
      const edges = shuffle(pieceIds.filter((p) => this.pieces[p].isEdge));
      const inner = shuffle(pieceIds.filter((p) => !this.pieces[p].isEdge));
      [...edges, ...inner].forEach((p, i) => pairs.push([p, slots[i]]));
    } else {
      const ps = shuffle([...pieceIds]);
      const jitter = this.pitch * 0.12;
      ps.forEach((p, i) =>
        pairs.push([
          p,
          { x: slots[i].x + (Math.random() * 2 - 1) * jitter, y: slots[i].y + (Math.random() * 2 - 1) * jitter },
        ]),
      );
    }
    return pairs;
  }

  /** Brand-new board: every piece is its own group, arranged around the frame. */
  private layoutFresh(mode: StartMode) {
    this.groups.clear();
    this.z = [];
    this.boardGid = null;
    this.nextGid = 1;
    const ids = this.pieces.map((p) => p.id);
    const slots = computeSlots(ids.length, this.W, this.H, this.pitch, [], this.viewAspect);
    const groupsById: Group[] = [];
    for (const id of ids) {
      const rot = this.rotationEnabled ? Math.floor(Math.random() * 4) : 0;
      groupsById[id] = this.newGroup([id], 0, 0, rot, false);
    }
    for (const [p, pt] of this.arrange(ids, slots, mode)) {
      this.placePieceAt(groupsById[p], pt.x, pt.y);
    }
    // Random z-order looks more natural for a scatter.
    this.z = shuffle(groupsById.map((g) => g.id));
  }

  private get viewAspect() {
    return this.viewW / Math.max(1, this.viewH);
  }

  /**
   * Re-arrange all loose single pieces (not multi-piece groups, not placed
   * pieces) around the board.
   */
  organize(mode: OrganizeMode) {
    if (!this.ready || this.completed) return;
    const before = this.snapshot();
    const loose: Group[] = [];
    const avoid: Rect[] = [];
    for (const g of this.groups.values()) {
      if (g.locked) continue;
      if (g.pieces.length === 1) loose.push(g);
      else {
        const r = this.groupWorldRect(g);
        const m = this.pitch * 0.2;
        avoid.push({ x0: r.x0 - m, y0: r.y0 - m, x1: r.x1 + m, y1: r.y1 + m });
      }
    }
    if (!loose.length) return;
    const slots = computeSlots(loose.length, this.W, this.H, this.pitch, avoid, this.viewAspect);
    const byPiece = new Map(loose.map((g) => [g.pieces[0], g]));
    const pairs = this.arrange([...byPiece.keys()], slots, mode);
    for (const [p, pt] of pairs) {
      const g = byPiece.get(p)!;
      const ox = g.x;
      const oy = g.y;
      this.placePieceAt(g, pt.x, pt.y);
      this.animate(g, ox - g.x, oy - g.y, 0, 0, 0, 420);
    }
    this.pushUndo(before);
    this.dirty = true;
    this.emitStats();
    this.cb.onChange?.();
  }

  /** Restart: scatter every piece again (same cut), clearing progress. */
  resetBoard(mode: StartMode) {
    if (!this.ready) return;
    this.completed = false;
    this.moves = 0;
    this.undoStack = [];
    this.redoStack = [];
    this.animating.clear();
    this.layoutFresh(mode);
    this.computeZoomLimits();
    this.fit(true);
    this.dirty = true;
    this.emitStats();
    this.cb.onChange?.();
  }

  /* ====================================================================== */
  /* Snapping                                                               */
  /* ====================================================================== */

  private get snapTol() {
    // World-space tolerance, slightly more generous when zoomed far out.
    const cell = Math.max(this.cw, this.ch);
    return Math.max(cell * 0.28, Math.min(cell * 0.45, 14 / this.cam.zoom));
  }

  private neighbours(p: number): number[] {
    const r = Math.floor(p / this.cols);
    const c = p % this.cols;
    const out: number[] = [];
    if (r > 0) out.push(p - this.cols);
    if (r < this.rows - 1) out.push(p + this.cols);
    if (c > 0) out.push(p - 1);
    if (c < this.cols - 1) out.push(p + 1);
    return out;
  }

  /**
   * After a group is dropped or rotated: join it with any correctly aligned
   * neighbouring groups, and lock it to the board if it sits on its true spot.
   * Returns true if anything snapped.
   */
  private trySnap(g: Group): boolean {
    if (g.locked) return false;
    const tol = this.snapTol;
    const matches = new Set<Group>();
    const seam: number[] = [];
    for (const p of g.pieces) {
      for (const q of this.neighbours(p)) {
        const h = this.groupOf(q);
        if (h === g || h.rot !== g.rot) continue;
        if (Math.abs(h.x - g.x) < tol && Math.abs(h.y - g.y) < tol) {
          matches.add(h);
          seam.push(p, q);
        }
      }
    }

    let snapped = false;
    let big = false;
    if (matches.size) {
      // Anchor: the board group if involved, otherwise the largest group.
      let anchor: Group | null = null;
      for (const h of matches) {
        if (h.locked) anchor = h;
        else if (!anchor || (!anchor.locked && h.pieces.length > anchor.pieces.length)) anchor = h;
      }
      const a = anchor!;
      const ox = g.x;
      const oy = g.y;
      g.x = a.x;
      g.y = a.y;
      for (const h of matches) {
        if (h.locked) g.locked = true;
        this.absorb(g, h);
      }
      if (g.locked) {
        g.x = 0;
        g.y = 0;
        g.rot = 0;
        this.boardGid = g.id;
        this.sendToBottom(g);
      }
      this.animate(g, ox - g.x, oy - g.y, 0, 0, 0, 140);
      snapped = true;
      big = g.locked;
    }

    // Board lock: correct orientation and near the true position.
    if (!g.locked && this.settings.snapToBoard && g.rot === 0 && Math.abs(g.x) < tol && Math.abs(g.y) < tol) {
      const ox = g.x;
      const oy = g.y;
      g.x = 0;
      g.y = 0;
      g.locked = true;
      const board = this.boardGid != null ? this.groups.get(this.boardGid) : undefined;
      if (board && board !== g) this.absorb(g, board);
      this.boardGid = g.id;
      this.sendToBottom(g);
      this.animate(g, ox, oy, 0, 0, 0, 140);
      snapped = true;
      big = true;
      // Flash the pieces just placed (those not already on the board).
      if (!seam.length) seam.push(...g.pieces.slice(0, 400));
    }

    if (snapped) {
      g.flash = { pieces: [...new Set(seam)].filter((p) => this.pieceGroup[p] === g.id).slice(0, 600), start: performance.now() };
      this.animating.add(g);
      if (this.settings.sound) playSnap(big);
    }
    return snapped;
  }

  /* ====================================================================== */
  /* Undo / serialisation                                                   */
  /* ====================================================================== */

  private snapshot(): Snapshot {
    const index = new Map<number, number>();
    const groups = new Float64Array(this.z.length * 4);
    this.z.forEach((gid, i) => {
      const g = this.groups.get(gid)!;
      index.set(gid, i);
      groups[i * 4] = g.x;
      groups[i * 4 + 1] = g.y;
      groups[i * 4 + 2] = g.rot;
      groups[i * 4 + 3] = g.locked ? 1 : 0;
    });
    const pieceGroup = new Int32Array(this.pieceGroup.length);
    for (let p = 0; p < pieceGroup.length; p++) pieceGroup[p] = index.get(this.pieceGroup[p])!;
    return { pieceGroup, groups };
  }

  /** Rebuild groups from a snapshot. Returns false if it doesn't fit this puzzle. */
  private applySnapshot(s: { pieceGroup: ArrayLike<number>; groups: ArrayLike<number> }): boolean {
    const n = this.rows * this.cols;
    const gcount = Math.floor(s.groups.length / 4);
    if (s.pieceGroup.length !== n || gcount < 1) return false;
    const lists: number[][] = Array.from({ length: gcount }, () => []);
    for (let p = 0; p < n; p++) {
      const gi = s.pieceGroup[p];
      if (!(gi >= 0 && gi < gcount)) return false;
      lists[gi].push(p);
    }
    this.groups.clear();
    this.animating.clear();
    this.z = [];
    this.boardGid = null;
    for (let i = 0; i < gcount; i++) {
      if (!lists[i].length) continue;
      const x = Number(s.groups[i * 4]) || 0;
      const y = Number(s.groups[i * 4 + 1]) || 0;
      const rot = this.rotationEnabled ? ((Number(s.groups[i * 4 + 2]) % 4) + 4) % 4 : 0;
      const locked = s.groups[i * 4 + 3] === 1;
      const g = this.newGroup(lists[i], locked ? 0 : x, locked ? 0 : y, locked ? 0 : rot, locked);
      if (locked) {
        if (this.boardGid != null) {
          this.absorb(this.groups.get(this.boardGid)!, g);
          continue;
        }
        this.boardGid = g.id;
      }
      this.z.push(g.id);
    }
    if (this.boardGid != null) this.sendToBottom(this.groups.get(this.boardGid)!);
    this.dirty = true;
    return true;
  }

  private pushUndo(s: Snapshot) {
    this.undoStack.push(s);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  undo() {
    if (!this.ready || this.completed || !this.undoStack.length || this.drag) return;
    this.redoStack.push(this.snapshot());
    this.applySnapshot(this.undoStack.pop()!);
    this.emitStats();
    this.cb.onChange?.();
  }

  redo() {
    if (!this.ready || this.completed || !this.redoStack.length || this.drag) return;
    this.undoStack.push(this.snapshot());
    this.applySnapshot(this.redoStack.pop()!);
    this.emitStats();
    this.checkComplete();
    this.cb.onChange?.();
  }

  serialize(): SerializedState {
    const s = this.snapshot();
    const groups: number[] = new Array(s.groups.length);
    for (let i = 0; i < s.groups.length; i++) groups[i] = Math.round(s.groups[i] * 100) / 100;
    return {
      v: 1,
      pieceGroup: Array.from(s.pieceGroup),
      groups,
      camera: this.savedCamera(),
    };
  }

  private restoreState(state: SerializedState): boolean {
    try {
      if (state.v !== 1) return false;
      return this.applySnapshot(state);
    } catch {
      return false;
    }
  }

  get moveCount() {
    return this.moves;
  }

  set moveCount(v: number) {
    this.moves = v;
    this.emitStats();
  }

  /* ====================================================================== */
  /* Stats & completion                                                     */
  /* ====================================================================== */

  private totalJoins() {
    return this.rows * (this.cols - 1) + (this.rows - 1) * this.cols;
  }

  private countJoined(): number {
    let joined = 0;
    const { rows, cols, pieceGroup } = this;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p = r * cols + c;
        if (c < cols - 1 && pieceGroup[p] === pieceGroup[p + 1]) joined++;
        if (r < rows - 1 && pieceGroup[p] === pieceGroup[p + cols]) joined++;
      }
    }
    return joined;
  }

  private emitStats() {
    if (!this.pieceGroup) return;
    const joined = this.countJoined();
    const total = this.totalJoins();
    const board = this.boardGid != null ? this.groups.get(this.boardGid) : undefined;
    this.cb.onStats?.({
      progress: total ? joined / total : 0,
      joined,
      totalJoins: total,
      placed: board ? board.pieces.length : 0,
      moves: this.moves,
      canUndo: !this.completed && this.undoStack.length > 0,
      canRedo: !this.completed && this.redoStack.length > 0,
      completed: this.completed,
      zoom: this.cam.zoom,
    });
  }

  private checkComplete() {
    if (this.completed || this.groups.size !== 1) return;
    const g = this.groups.values().next().value as Group;
    // Glide the finished puzzle onto the board in the upright orientation.
    if (!g.locked || g.rot !== 0 || g.x !== 0 || g.y !== 0) {
      const now = performance.now();
      const M = this.displayMatrix(g, now);
      const cx = ((g.c0 + g.c1 + 1) / 2) * this.cw;
      const cy = ((g.r0 + g.r1 + 1) / 2) * this.ch;
      const oldPx = M[0] * cx + M[2] * cy + M[4];
      const oldPy = M[1] * cx + M[3] * cy + M[5];
      const oldAng = Math.atan2(M[1], M[0]);
      g.x = 0;
      g.y = 0;
      g.rot = 0;
      g.locked = true;
      this.boardGid = g.id;
      g.aDX0 = g.aDY0 = g.aAng0 = 0;
      this.animate(g, oldPx - cx, oldPy - cy, oldAng, cx, cy, 600);
    }
    this.completed = true;
    this.completeT0 = performance.now() + 450;
    this.undoStack = [];
    this.redoStack = [];
    if (this.settings.sound) setTimeout(() => playComplete(), 350);
    this.dirty = true;
    this.emitStats();
    this.cb.onComplete?.();
  }

  get isCompleted() {
    return this.completed;
  }

  /* ====================================================================== */
  /* Camera                                                                 */
  /* ====================================================================== */

  private resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(1, parent.clientHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // Keep the world point at the view centre fixed.
    const cx = (this.viewW / 2 - this.cam.x) / this.cam.zoom;
    const cy = (this.viewH / 2 - this.cam.y) / this.cam.zoom;
    const hadSize = this.viewW > 1;
    this.viewW = w;
    this.viewH = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    if (hadSize) {
      this.cam.x = w / 2 - cx * this.cam.zoom;
      this.cam.y = h / 2 - cy * this.cam.zoom;
    }
    if (this.ready) this.computeZoomLimits();
    this.applyPendingCamera();
    this.dirty = true;
  }

  private applyPendingCamera() {
    if (!this.pendingCamera || this.viewW <= 1) return;
    const { cx, cy, zoom } = this.pendingCamera;
    const z = Math.min(this.maxZoom, Math.max(this.minZoom, zoom));
    this.cam = { x: this.viewW / 2 - cx * z, y: this.viewH / 2 - cy * z, zoom: z };
    this.pendingCamera = undefined;
  }

  private savedCamera(): SavedCamera {
    const c = this.camAnim ? this.camAnim.to : this.cam;
    return {
      cx: Math.round(((this.viewW / 2 - c.x) / c.zoom) * 10) / 10,
      cy: Math.round(((this.viewH / 2 - c.y) / c.zoom) * 10) / 10,
      zoom: Math.round(c.zoom * 10000) / 10000,
    };
  }

  /** World bounds containing the frame and every group. */
  private contentBounds(): Rect {
    const b: Rect = { x0: 0, y0: 0, x1: this.W, y1: this.H };
    for (const g of this.groups.values()) {
      const r = this.groupWorldRect(g);
      b.x0 = Math.min(b.x0, r.x0);
      b.y0 = Math.min(b.y0, r.y0);
      b.x1 = Math.max(b.x1, r.x1);
      b.y1 = Math.max(b.y1, r.y1);
    }
    return b;
  }

  private computeZoomLimits() {
    const b = this.contentBounds();
    const fitZ = Math.min(this.viewW / (b.x1 - b.x0), this.viewH / (b.y1 - b.y0));
    const cell = Math.max(this.cw, this.ch);
    this.minZoom = Math.min(fitZ * 0.5, 0.5);
    this.maxZoom = Math.max(fitZ * 2, Math.min(4, 360 / cell));
  }

  private camFor(b: Rect, padding = 0.94) {
    const bw = b.x1 - b.x0;
    const bh = b.y1 - b.y0;
    const zoom = Math.min(this.maxZoom, Math.max(this.minZoom, Math.min(this.viewW / bw, this.viewH / bh) * padding));
    return {
      zoom,
      x: this.viewW / 2 - ((b.x0 + b.x1) / 2) * zoom,
      y: this.viewH / 2 - ((b.y0 + b.y1) / 2) * zoom,
    };
  }

  private setCamera(target: Camera, animated: boolean) {
    if (!animated) {
      this.cam = target;
      this.camAnim = null;
    } else {
      this.camAnim = { from: { ...this.cam }, to: target, t0: performance.now(), dur: 320 };
    }
    this.dirty = true;
    this.emitStats();
  }

  /** Fit the whole table (frame + all pieces) in view. */
  fit(animated = true) {
    this.computeZoomLimits();
    this.setCamera(this.camFor(this.contentBounds()), animated);
  }

  /** Fit just the puzzle frame. */
  focusBoard(animated = true) {
    const m = Math.max(this.cw, this.ch) * 0.5;
    this.setCamera(this.camFor({ x0: -m, y0: -m, x1: this.W + m, y1: this.H + m }), animated);
  }

  /** Zoom by a factor about the view centre (or a given screen point). */
  zoomBy(factor: number, sx = this.viewW / 2, sy = this.viewH / 2, animated = true) {
    const base = this.camAnim ? this.camAnim.to : this.cam;
    const zoom = Math.min(this.maxZoom, Math.max(this.minZoom, base.zoom * factor));
    const wx = (sx - base.x) / base.zoom;
    const wy = (sy - base.y) / base.zoom;
    this.setCamera({ zoom, x: sx - wx * zoom, y: sy - wy * zoom }, animated);
  }

  /** 1 image pixel = 1 screen pixel (approximately "actual size"). */
  zoomActual() {
    const scaleToImage = this.fullImage ? this.W / this.fullImage.width : 1;
    this.zoomBy(scaleToImage / (this.camAnim ? this.camAnim.to.zoom : this.cam.zoom));
  }

  private zoomAt(sx: number, sy: number, zoom: number) {
    zoom = Math.min(this.maxZoom, Math.max(this.minZoom, zoom));
    const wx = (sx - this.cam.x) / this.cam.zoom;
    const wy = (sy - this.cam.y) / this.cam.zoom;
    this.cam.zoom = zoom;
    this.cam.x = sx - wx * zoom;
    this.cam.y = sy - wy * zoom;
    this.camAnim = null;
    this.dirty = true;
    this.statsSoon();
  }

  private statsTimer = 0;
  private statsSoon() {
    if (this.statsTimer) return;
    this.statsTimer = window.setTimeout(() => {
      this.statsTimer = 0;
      this.emitStats();
    }, 120);
  }

  private toWorld(sx: number, sy: number): Point {
    return { x: (sx - this.cam.x) / this.cam.zoom, y: (sy - this.cam.y) / this.cam.zoom };
  }

  /* ====================================================================== */
  /* Settings                                                               */
  /* ====================================================================== */

  setSettings(s: Partial<EngineSettings>) {
    this.settings = { ...this.settings, ...s };
    this.layerKey = "";
    this.dirty = true;
  }

  /* ====================================================================== */
  /* Input                                                                  */
  /* ====================================================================== */

  private localPoint(e: { clientX: number; clientY: number }): Point {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private isDimmed(g: Group, p: number): boolean {
    const f = this.settings.filter;
    if (f === "all" || g.locked || g.pieces.length > 1) return false;
    return f === "edges" ? !this.pieces[p].isEdge : this.pieces[p].isEdge;
  }

  /** Top-most draggable group under a world point (pixel-accurate). */
  private hitTest(wx: number, wy: number): Group | null {
    const { cw, ch, pad, cols, rows } = this;
    for (let i = this.z.length - 1; i >= 0; i--) {
      const g = this.groups.get(this.z[i])!;
      if (g.locked) continue;
      const c = COS[g.rot];
      const s = SIN[g.rot];
      const dx = wx - g.x;
      const dy = wy - g.y;
      const lx = c * dx + s * dy;
      const ly = -s * dx + c * dy;
      if (lx < g.c0 * cw - pad || lx > (g.c1 + 1) * cw + pad || ly < g.r0 * ch - pad || ly > (g.r1 + 1) * ch + pad) {
        continue;
      }
      const col = Math.floor(lx / cw);
      const row = Math.floor(ly / ch);
      for (let k = 0; k < 9; k++) {
        // centre cell first, then the 8 neighbours (tabs reach into them)
        const dc = k === 0 ? 0 : [-1, 0, 1, -1, 1, -1, 0, 1][k - 1];
        const dr = k === 0 ? 0 : [-1, -1, -1, 0, 0, 1, 1, 1][k - 1];
        const cc = col + dc;
        const rr = row + dr;
        if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
        const p = rr * cols + cc;
        if (this.pieceGroup[p] !== g.id || this.isDimmed(g, p)) continue;
        if (this.hitCtx.isPointInPath(this.pieces[p].path, lx, ly)) return g;
      }
    }
    return null;
  }

  private onContextMenu = (e: Event) => e.preventDefault();

  private onPointerDown = (e: PointerEvent) => {
    if (!this.ready) return;
    const pt = this.localPoint(e);
    this.lastPointer = pt;
    this.pointers.set(e.pointerId, pt);
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    if (this.pointers.size === 2) {
      // A second finger while dragging a piece rotates it (touch-friendly).
      if (this.drag && e.pointerType === "touch" && this.rotationEnabled) {
        const g = this.groups.get(this.drag.gid);
        const dp = this.pointers.get(this.drag.pointerId);
        if (g && dp) {
          const w = this.toWorld(dp.x, dp.y);
          this.rotateGroup(g, 1, w.x, w.y);
          this.drag.rotated = true;
        }
        this.pointers.delete(e.pointerId);
        return;
      }
      if (this.drag) this.finishDrag(false);
      this.startPinch();
      return;
    }
    if (this.pointers.size > 2 || this.completed) {
      if (this.completed && this.pointers.size === 1) this.mode = "pan";
      return;
    }

    if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
      this.mode = "pan";
      return;
    }
    const w = this.toWorld(pt.x, pt.y);
    const hit = this.hitTest(w.x, w.y);
    if (e.button === 2) {
      if (hit && this.rotationEnabled) {
        const before = this.snapshot();
        this.bringToTop(hit);
        this.rotateGroup(hit, -1, w.x, w.y);
        this.moves++;
        this.pushUndo(before);
        this.afterAction(hit);
      }
      return;
    }
    if (hit) {
      this.bringToTop(hit);
      this.drag = {
        gid: hit.id,
        pointerId: e.pointerId,
        lastSX: pt.x,
        lastSY: pt.y,
        startSX: pt.x,
        startSY: pt.y,
        t0: performance.now(),
        moved: false,
        rotated: false,
        panArmed: false,
        before: this.snapshot(),
      };
      this.mode = "drag";
      this.layerKey = "";
      this.canvas.style.cursor = "grabbing";
      this.dirty = true;
    } else {
      this.mode = "pan";
      this.canvas.style.cursor = "grabbing";
    }
  };

  private startPinch() {
    const [a, b] = [...this.pointers.values()];
    this.mode = "pinch";
    this.camAnim = null;
    this.pinch = {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      zoom: this.cam.zoom,
    };
  }

  private onPointerMove = (e: PointerEvent) => {
    const pt = this.localPoint(e);
    this.lastPointer = pt;
    const prev = this.pointers.get(e.pointerId);
    if (!prev) {
      // Hover: update cursor.
      if (this.ready && this.mode === "none" && e.pointerType === "mouse") {
        const w = this.toWorld(pt.x, pt.y);
        this.canvas.style.cursor = this.hitTest(w.x, w.y) ? "grab" : this.completed ? "default" : "default";
      }
      return;
    }
    this.pointers.set(e.pointerId, pt);

    if (this.mode === "drag" && this.drag && this.drag.pointerId === e.pointerId) {
      const g = this.groups.get(this.drag.gid);
      if (!g) return;
      const dx = (pt.x - this.drag.lastSX) / this.cam.zoom;
      const dy = (pt.y - this.drag.lastSY) / this.cam.zoom;
      g.x += dx;
      g.y += dy;
      this.drag.lastSX = pt.x;
      this.drag.lastSY = pt.y;
      if (!this.drag.moved && Math.hypot(pt.x - this.drag.startSX, pt.y - this.drag.startSY) > 4) this.drag.moved = true;
      this.dirty = true;
    } else if (this.mode === "pan") {
      this.cam.x += pt.x - prev.x;
      this.cam.y += pt.y - prev.y;
      this.camAnim = null;
      this.dirty = true;
    } else if (this.mode === "pinch" && this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.cam.x += mid.x - this.pinch.mid.x;
      this.cam.y += mid.y - this.pinch.mid.y;
      this.zoomAt(mid.x, mid.y, this.pinch.zoom * (dist / this.pinch.dist));
      this.pinch.mid = mid;
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (this.mode === "drag" && this.drag?.pointerId === e.pointerId) {
      this.finishDrag(e.type !== "pointercancel");
    } else if (this.mode === "pinch") {
      if (this.pointers.size < 2) {
        this.pinch = null;
        // Remaining finger does nothing until lifted (avoids a jump).
        this.mode = "none";
      }
    } else if (this.mode === "pan" && this.pointers.size === 0) {
      this.mode = "none";
      this.emitStats();
      this.cb.onChange?.();
    }
    if (this.pointers.size === 0) {
      this.mode = "none";
      this.canvas.style.cursor = "default";
    }
  };

  private onPointerLeave = () => {
    if (this.mode === "none") this.lastPointer = null;
  };

  private finishDrag(allowTap: boolean) {
    const d = this.drag;
    this.drag = null;
    this.mode = "none";
    if (!d) return;
    const g = this.groups.get(d.gid);
    if (!g) return;
    const isTap = allowTap && !d.moved && !d.rotated && performance.now() - d.t0 < 400;
    if (isTap && this.rotationEnabled) {
      const w = this.toWorld(d.lastSX, d.lastSY);
      this.rotateGroup(g, 1, w.x, w.y);
      d.rotated = true;
    }
    if (d.moved || d.rotated) {
      this.moves++;
      this.pushUndo(d.before);
      this.afterAction(g);
    } else {
      this.dirty = true;
    }
  }

  /** Common follow-up after a group was moved or rotated. */
  private afterAction(g: Group) {
    this.trySnap(g);
    this.dirty = true;
    this.emitStats();
    this.checkComplete();
    this.cb.onChange?.();
  }

  private onWheel = (e: WheelEvent) => {
    if (!this.ready) return;
    e.preventDefault();
    const pt = this.localPoint(e);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.viewH : 1;
    const dx = e.deltaX * unit;
    const dy = e.deltaY * unit;
    const legacy = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
    const looksLikeMouse =
      e.deltaMode !== 0 || (dx === 0 && Math.abs(dy) >= 50 && (legacy === undefined || legacy % 120 === 0 || Number.isInteger(dy)));
    if (e.ctrlKey || e.metaKey) {
      // Trackpad pinch (browsers report it as ctrl+wheel).
      this.zoomAt(pt.x, pt.y, this.cam.zoom * Math.exp(-dy * 0.01));
    } else if (looksLikeMouse) {
      this.zoomAt(pt.x, pt.y, this.cam.zoom * Math.exp(-dy * 0.0016));
    } else {
      this.cam.x -= dx;
      this.cam.y -= dy;
      this.camAnim = null;
      this.dirty = true;
    }
    if (this.drag) {
      // Keep a dragged group under the cursor while the camera moves.
      const g = this.groups.get(this.drag.gid);
      if (g) this.dirty = true;
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Space" && !this.isTyping(e)) {
      this.spaceDown = true;
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === "Space") this.spaceDown = false;
  };

  private isTyping(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
  }

  /** Rotate the group being dragged, or the one under the mouse. */
  rotateAtPointer(dir: 1 | -1) {
    if (!this.ready || !this.rotationEnabled || this.completed || !this.lastPointer) return;
    const w = this.toWorld(this.lastPointer.x, this.lastPointer.y);
    if (this.drag) {
      const g = this.groups.get(this.drag.gid);
      if (g) {
        this.rotateGroup(g, dir, w.x, w.y);
        this.drag.rotated = true;
      }
      return;
    }
    const g = this.hitTest(w.x, w.y);
    if (!g) return;
    const before = this.snapshot();
    this.bringToTop(g);
    this.rotateGroup(g, dir, w.x, w.y);
    this.moves++;
    this.pushUndo(before);
    this.afterAction(g);
  }

  /* ====================================================================== */
  /* Frame loop & rendering                                                 */
  /* ====================================================================== */

  private tick = (now: number) => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.tick);

    if (this.camAnim) {
      const u = Math.min(1, (now - this.camAnim.t0) / this.camAnim.dur);
      const k = easeOut(u);
      const { from, to } = this.camAnim;
      // Interpolate zoom geometrically for a natural feel.
      const zoom = from.zoom * Math.pow(to.zoom / from.zoom, k);
      // Interpolate the world point at the view centre.
      const fcx = (this.viewW / 2 - from.x) / from.zoom;
      const fcy = (this.viewH / 2 - from.y) / from.zoom;
      const tcx = (this.viewW / 2 - to.x) / to.zoom;
      const tcy = (this.viewH / 2 - to.y) / to.zoom;
      const cx = fcx + (tcx - fcx) * k;
      const cy = fcy + (tcy - fcy) * k;
      this.cam = { zoom, x: this.viewW / 2 - cx * zoom, y: this.viewH / 2 - cy * zoom };
      if (u >= 1) {
        this.cam = { ...to };
        this.camAnim = null;
        this.emitStats();
      }
      this.dirty = true;
    }

    // Auto-pan when dragging a piece near the edge of the view.
    if (this.drag && this.lastPointer) {
      const edge = 32;
      const { x, y } = this.lastPointer;
      if (!this.drag.panArmed && x > edge * 2 && y > edge * 2 && x < this.viewW - edge * 2 && y < this.viewH - edge * 2) {
        this.drag.panArmed = true;
      }
      let vx = 0;
      let vy = 0;
      if (x < edge) vx = (edge - x) / edge;
      else if (x > this.viewW - edge) vx = -(x - (this.viewW - edge)) / edge;
      if (y < edge) vy = (edge - y) / edge;
      else if (y > this.viewH - edge) vy = -(y - (this.viewH - edge)) / edge;
      if ((vx || vy) && this.drag.panArmed) {
        const speed = 14;
        this.cam.x += vx * speed;
        this.cam.y += vy * speed;
        const g = this.groups.get(this.drag.gid);
        if (g) {
          g.x -= (vx * speed) / this.cam.zoom;
          g.y -= (vy * speed) / this.cam.zoom;
        }
        this.drag.moved = true;
        this.dirty = true;
      }
    }

    if (this.animating.size) {
      for (const g of this.animating) {
        const animDone = g.aDur <= 0 || now - g.aStart >= g.aDur;
        const flashDone = !g.flash || now - g.flash.start >= FLASH_MS;
        if (animDone) {
          g.aDX0 = g.aDY0 = g.aAng0 = 0;
          g.aDur = 0;
        }
        if (flashDone) g.flash = undefined;
        if (animDone && flashDone) this.animating.delete(g);
      }
      this.dirty = true;
    }

    const completing = this.completed && now - this.completeT0 < 2200;
    if (this.dirty || completing) {
      this.dirty = false;
      this.draw(now);
    }
  };

  private draw(now: number) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.ready || !this.atlas) return;

    // Fast path while dragging: blit the cached static scene, draw the group on top.
    const dragged = this.drag ? this.groups.get(this.drag.gid) : undefined;
    const othersAnimating = [...this.animating].some((g) => g !== dragged);
    if (dragged && !othersAnimating && !this.completed) {
      const key = `${this.cam.x}|${this.cam.y}|${this.cam.zoom}|${this.canvas.width}|${this.canvas.height}|${dragged.id}`;
      if (!this.layer) this.layer = document.createElement("canvas");
      if (key !== this.layerKey) {
        const L = this.layer;
        if (L.width !== this.canvas.width || L.height !== this.canvas.height) {
          L.width = this.canvas.width;
          L.height = this.canvas.height;
        }
        const lctx = L.getContext("2d")!;
        lctx.setTransform(1, 0, 0, 1, 0, 0);
        lctx.clearRect(0, 0, L.width, L.height);
        this.renderScene(lctx, this.cam, this.viewW, this.viewH, this.dpr, now, true, { exclude: dragged });
        this.layerKey = key;
      }
      ctx.drawImage(this.layer, 0, 0);
      this.renderScene(ctx, this.cam, this.viewW, this.viewH, this.dpr, now, true, { only: dragged });
      return;
    }
    this.layerKey = "";
    this.renderScene(ctx, this.cam, this.viewW, this.viewH, this.dpr, now, true);
  }

  private renderScene(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    vw: number,
    vh: number,
    dpr: number,
    now: number,
    interactive: boolean,
    filter: { only?: Group; exclude?: Group } = {},
  ) {
    const atlas = this.atlas!;
    const dark = this.settings.theme === "dark";
    const s = cam.zoom * dpr;
    const C: Mat = [s, 0, 0, s, cam.x * dpr, cam.y * dpr];
    const vx0 = -cam.x / cam.zoom;
    const vy0 = -cam.y / cam.zoom;
    const vx1 = vx0 + vw / cam.zoom;
    const vy1 = vy0 + vh / cam.zoom;
    const { cw, ch, pad, W, H } = this;

    /* --- board frame --------------------------------------------------- */
    ctx.setTransform(...C);
    ctx.imageSmoothingEnabled = true;
    // "low" = plain bilinear. Higher qualities make Skia build mipmaps of the
    // big atlas pages on the fly; we already pick our own pre-built mip level.
    ctx.imageSmoothingQuality = "low";
    const m = Math.max(cw, ch) * 0.06;
    if (!filter.only) {
    ctx.fillStyle = dark ? "rgba(0,0,0,0.28)" : "rgba(60,45,30,0.10)";
    ctx.fillRect(-m, -m, W + m * 2, H + m * 2);
    ctx.fillStyle = dark ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.55)";
    ctx.fillRect(0, 0, W, H);
    if (this.settings.ghost && this.ghost && !this.completed) {
      ctx.globalAlpha = this.settings.ghostOpacity;
      ctx.drawImage(this.ghost, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    ctx.lineWidth = 1.5 / cam.zoom;
    ctx.strokeStyle = dark ? "rgba(255,255,255,0.16)" : "rgba(60,45,30,0.25)";
    ctx.strokeRect(0, 0, W, H);
    }

    /* --- pieces -------------------------------------------------------- */
    const level = s > 0.55 ? 0 : s > 0.28 ? 1 : 2;
    const L = 1 / (1 << level);
    const pages = atlas.levels[level];
    const shadows = atlas.shadows;
    const sw = atlas.slotW;
    const sh = atlas.slotH;
    const SS = SHADOW_SCALE;
    const cell = Math.max(cw, ch);
    const shadowAlpha = dark ? 0.6 : 0.38;
    const dragGid = this.drag?.gid;
    const margin = pad + cell * 0.2;
    // Shadows are imperceptible when pieces are only a few pixels wide.
    const drawShadows = cell * s >= 14;

    for (let zi = 0; zi < this.z.length; zi++) {
      const g = this.groups.get(this.z[zi])!;
      if (filter.only ? g !== filter.only : g === filter.exclude) continue;
      const isAnim = this.animating.has(g);
      const G = this.displayMatrix(g, now);

      // Group-level culling (skipped mid-animation; cheap anyway).
      if (!isAnim) {
        const r = this.groupWorldRect(g);
        if (r.x1 < vx0 - margin || r.x0 > vx1 + margin || r.y1 < vy0 - margin || r.y0 > vy1 + margin) continue;
      }

      const M = mul(C, G);
      ctx.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]);

      // Per-piece culling rectangle in local coordinates (large groups only).
      let lx0 = -Infinity,
        ly0 = -Infinity,
        lx1 = Infinity,
        ly1 = Infinity;
      if (g.pieces.length > 12 && !isAnim) {
        const c = COS[g.rot];
        const sn = SIN[g.rot];
        lx0 = ly0 = Infinity;
        lx1 = ly1 = -Infinity;
        for (const [wx, wy] of [
          [vx0, vy0],
          [vx1, vy0],
          [vx0, vy1],
          [vx1, vy1],
        ]) {
          const dx = wx - g.x;
          const dy = wy - g.y;
          const lx = c * dx + sn * dy;
          const ly = -sn * dx + c * dy;
          lx0 = Math.min(lx0, lx);
          lx1 = Math.max(lx1, lx);
          ly0 = Math.min(ly0, ly);
          ly1 = Math.max(ly1, ly);
        }
        lx0 -= sw;
        ly0 -= sh;
        lx1 += cell * 0.2;
        ly1 += cell * 0.2;
      }

      // Soft drop shadow (screen-space offset → local via inverse rotation).
      if (!g.locked && (drawShadows || g.id === dragGid)) {
        const lifted = g.id === dragGid;
        const offX = cell * (lifted ? 0.07 : 0.025);
        const offY = cell * (lifted ? 0.11 : 0.045);
        const c = COS[g.rot];
        const sn = SIN[g.rot];
        const sox = c * offX + sn * offY;
        const soy = -sn * offX + c * offY;
        ctx.globalAlpha = lifted ? shadowAlpha * 0.85 : shadowAlpha;
        for (const p of g.pieces) {
          const pc = this.pieces[p];
          const dx = pc.col * cw - pad - 1;
          const dy = pc.row * ch - pad - 1;
          if (dx > lx1 || dy > ly1 || dx < lx0 || dy < ly0) continue;
          const slot = atlas.slots[p];
          ctx.drawImage(shadows[slot.page], slot.x * SS, slot.y * SS, sw * SS, sh * SS, dx + sox, dy + soy, sw, sh);
        }
        ctx.globalAlpha = 1;
      }

      for (const p of g.pieces) {
        const pc = this.pieces[p];
        const dx = pc.col * cw - pad - 1;
        const dy = pc.row * ch - pad - 1;
        if (dx > lx1 || dy > ly1 || dx < lx0 || dy < ly0) continue;
        const slot = atlas.slots[p];
        const dim = this.settings.filter !== "all" && this.isDimmed(g, p);
        if (dim) ctx.globalAlpha = 0.14;
        ctx.drawImage(pages[slot.page], slot.x * L, slot.y * L, sw * L, sh * L, dx, dy, sw, sh);
        if (dim) ctx.globalAlpha = 1;
      }

      // Snap feedback: a brief glow along the newly joined pieces.
      if (g.flash && interactive) {
        const u = (now - g.flash.start) / FLASH_MS;
        if (u < 1) {
          ctx.globalAlpha = 0.85 * (1 - u);
          ctx.lineWidth = Math.max(2, 3.2 / cam.zoom);
          ctx.strokeStyle = dark ? "#f6d58a" : "#e0a83a";
          ctx.lineJoin = "round";
          for (const p of g.flash.pieces) ctx.stroke(this.pieces[p].path);
          ctx.globalAlpha = 1;
        }
      }
    }

    /* --- completion reveal --------------------------------------------- */
    if (this.completed && this.fullImage && !filter.only && !filter.exclude) {
      const t = now - this.completeT0;
      const a = Math.max(0, Math.min(1, t / 900));
      if (a > 0) {
        ctx.setTransform(...C);
        ctx.globalAlpha = a;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(this.fullImage, 0, 0, W, H);
        ctx.globalAlpha = 1;
        // A single soft light sweep across the finished image.
        if (interactive && t < 2200) {
          const u = Math.max(0, Math.min(1, (t - 300) / 1500));
          const bx = -W * 0.3 + (W * 1.6) * u;
          const grad = ctx.createLinearGradient(bx - W * 0.15, 0, bx + W * 0.15, H * 0.4);
          grad.addColorStop(0, "rgba(255,255,255,0)");
          grad.addColorStop(0.5, "rgba(255,255,255,0.22)");
          grad.addColorStop(1, "rgba(255,255,255,0)");
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, W, H);
          ctx.clip();
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, W, H);
          ctx.restore();
        }
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /**
   * Render a small JPEG snapshot of the board (frame area) for save cards.
   */
  renderThumbnail(maxW = 480): string | undefined {
    if (!this.ready || this.destroyed) return undefined;
    const m = Math.max(this.cw, this.ch) * 0.8;
    const bw = this.W + m * 2;
    const bh = this.H + m * 2;
    const scale = Math.min(maxW / bw, maxW / bh);
    const w = Math.round(bw * scale);
    const h = Math.round(bh * scale);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = this.settings.theme === "dark" ? "#1b1a1f" : "#ece6dc";
    ctx.fillRect(0, 0, w, h);
    const ghost = this.settings.ghost;
    this.settings.ghost = false;
    this.renderScene(ctx, { x: m * scale, y: m * scale, zoom: scale }, w, h, 1, performance.now() + 1e6, false);
    this.settings.ghost = ghost;
    try {
      return c.toDataURL("image/jpeg", 0.78);
    } catch {
      return undefined;
    }
  }

  /** Piece and atlas diagnostics (shown in the side panel). */
  get info() {
    return {
      pieces: this.rows * this.cols,
      groups: this.groups.size,
      atlasMB: this.atlas ? Math.round(this.atlas.bytes / 1048576) : 0,
      pieceSize: Math.round(Math.max(this.cw, this.ch)),
    };
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    if (this.statsTimer) clearTimeout(this.statsTimer);
    this.resizeObs?.disconnect();
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onPointerDown);
    c.removeEventListener("pointermove", this.onPointerMove);
    c.removeEventListener("pointerup", this.onPointerUp);
    c.removeEventListener("pointercancel", this.onPointerUp);
    c.removeEventListener("pointerleave", this.onPointerLeave);
    c.removeEventListener("wheel", this.onWheel);
    c.removeEventListener("contextmenu", this.onContextMenu);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.atlas?.dispose();
    if (this.ghost) this.ghost.width = 0;
  }
}
