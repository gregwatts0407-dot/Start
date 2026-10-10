/**
 * Texture atlas for puzzle pieces.
 *
 * Each piece is rendered once — clipped from the source image, with a bevel
 * (light top-left / dark bottom-right inner strokes) and a fine outline — into
 * a slot of a large atlas page. At draw time a piece is a single `drawImage`
 * from an atlas page, which keeps 2000-piece boards fast.
 *
 * Three mip levels (1, ½, ¼) avoid shimmering and wasted fill-rate when zoomed
 * out, and a separate low-resolution silhouette atlas provides soft drop
 * shadows (bilinear up-scaling of a ¼-res silhouette is a free blur).
 */
import type { CutLayout } from "./geometry";

const PAGE_MAX = 4096;
const GUTTER = 4;
export const SHADOW_SCALE = 0.25;
export const MIP_LEVELS = 3;

export interface Slot {
  page: number;
  x: number;
  y: number;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/** Yield to the browser so the loading UI can paint. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

export class SpriteAtlas {
  /** Slot size in level-0 pixels (== world units). */
  readonly slotW: number;
  readonly slotH: number;
  readonly perRow: number;
  readonly perPage: number;
  /** levels[level][page] */
  readonly levels: HTMLCanvasElement[][] = [];
  readonly shadows: HTMLCanvasElement[] = [];
  readonly slots: Slot[] = [];

  constructor(private readonly cut: CutLayout) {
    const { cw, ch, pad } = cut;
    this.slotW = Math.ceil(cw + pad * 2) + 2;
    this.slotH = Math.ceil(ch + pad * 2) + 2;
    const stepW = this.slotW + GUTTER;
    const stepH = this.slotH + GUTTER;
    this.perRow = Math.max(1, Math.floor(PAGE_MAX / stepW));
    const rowsPerPage = Math.max(1, Math.floor(PAGE_MAX / stepH));
    this.perPage = this.perRow * rowsPerPage;

    const n = cut.pieces.length;
    const pageCount = Math.ceil(n / this.perPage);
    const level0: HTMLCanvasElement[] = [];
    for (let p = 0; p < pageCount; p++) {
      const count = Math.min(this.perPage, n - p * this.perPage);
      const rowsUsed = Math.ceil(count / this.perRow);
      const w = Math.min(count, this.perRow) * stepW;
      const h = rowsUsed * stepH;
      level0.push(makeCanvas(w, h));
      this.shadows.push(makeCanvas(w * SHADOW_SCALE, h * SHADOW_SCALE));
    }
    this.levels.push(level0);
    for (let i = 0; i < n; i++) {
      const page = Math.floor(i / this.perPage);
      const k = i % this.perPage;
      this.slots.push({
        page,
        x: (k % this.perRow) * stepW + GUTTER / 2,
        y: Math.floor(k / this.perRow) * stepH + GUTTER / 2,
      });
    }
  }

  /** Approximate memory used by all atlas canvases, in bytes. */
  get bytes(): number {
    let px = 0;
    for (const lvl of this.levels) for (const c of lvl) px += c.width * c.height;
    for (const c of this.shadows) px += c.width * c.height;
    return px * 4;
  }

  /**
   * Render every piece into the atlas, yielding between frames so the UI stays
   * responsive. `source` must already be scaled to world size (W×H).
   */
  async build(
    source: CanvasImageSource,
    W: number,
    H: number,
    onProgress?: (fraction: number) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const { cut } = this;
    const { pieces, cw, ch, pad } = cut;
    const ctxs = this.levels[0].map((c) => c.getContext("2d")!);
    const sctxs = this.shadows.map((c) => c.getContext("2d")!);
    for (const s of sctxs) s.fillStyle = "#000";

    const bevel = Math.max(0.8, Math.min(cw, ch) * 0.016);
    const outline = Math.max(0.6, Math.min(cw, ch) * 0.005);

    let i = 0;
    while (i < pieces.length) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const t0 = performance.now();
      // Time-slice: ~14ms of work per frame.
      while (i < pieces.length && performance.now() - t0 < 14) {
        const piece = pieces[i];
        const slot = this.slots[i];
        const ctx = ctxs[slot.page];
        const ox = slot.x + 1 + pad - piece.col * cw;
        const oy = slot.y + 1 + pad - piece.row * ch;

        ctx.save();
        ctx.translate(ox, oy);
        ctx.clip(piece.path);
        // Source region covering the piece including tabs, clamped to the image.
        const sx = Math.max(0, piece.col * cw - pad - 1);
        const sy = Math.max(0, piece.row * ch - pad - 1);
        const ex = Math.min(W, (piece.col + 1) * cw + pad + 1);
        const ey = Math.min(H, (piece.row + 1) * ch + pad + 1);
        ctx.drawImage(source, sx, sy, ex - sx, ey - sy, sx, sy, ex - sx, ey - sy);

        // Bevel: a light stroke offset down-right shows on the top/left inner
        // edge; a dark stroke offset up-left shows on the bottom/right edge.
        ctx.lineJoin = "round";
        ctx.lineWidth = bevel * 2;
        ctx.translate(bevel * 0.7, bevel * 0.7);
        ctx.strokeStyle = "rgba(255,255,255,0.2)";
        ctx.stroke(piece.path);
        ctx.translate(-bevel * 1.4, -bevel * 1.4);
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.stroke(piece.path);
        ctx.translate(bevel * 0.7, bevel * 0.7);
        ctx.lineWidth = outline * 2;
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.stroke(piece.path);
        ctx.restore();

        // Silhouette for the soft shadow atlas.
        const sctx = sctxs[slot.page];
        sctx.setTransform(SHADOW_SCALE, 0, 0, SHADOW_SCALE, ox * SHADOW_SCALE, oy * SHADOW_SCALE);
        sctx.fill(piece.path);
        i++;
      }
      onProgress?.(i / pieces.length);
      await nextFrame();
    }

    this.buildMips();
  }

  /** Down-sample atlas pages into ½ and ¼ resolution levels. */
  private buildMips() {
    for (let lvl = 1; lvl < MIP_LEVELS; lvl++) {
      const prev = this.levels[lvl - 1];
      const pages = prev.map((src) => {
        const c = makeCanvas(src.width / 2, src.height / 2);
        const ctx = c.getContext("2d")!;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, src.width / 2, src.height / 2);
        return c;
      });
      this.levels.push(pages);
    }
  }

  /** Release GPU/bitmap memory. */
  dispose() {
    const all = [...this.levels.flat(), ...this.shadows];
    for (const c of all) {
      c.width = 0;
      c.height = 0;
    }
  }
}
