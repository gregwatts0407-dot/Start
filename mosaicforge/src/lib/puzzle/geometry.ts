/**
 * Algorithmic jigsaw cut generator.
 *
 * Every interior edge between two cells is a classic tab/blank described by
 * three cubic Bézier segments (10 control points). The tab direction and a
 * handful of jitter parameters are randomised per edge, so every piece is
 * uniquely shaped while neighbouring pieces share the *exact same* curve and
 * therefore interlock perfectly. Border edges are straight lines.
 *
 * The shape parameterisation follows the well-known approach popularised by
 * Draradech's public jigsaw generator, re-implemented here with per-edge tab
 * size variation.
 */
import { mulberry32 } from "./rng";

/** Ten (x, y) control points in absolute puzzle coordinates, or null for a flat border. */
export type EdgeCurve = Float64Array | null;

export interface PieceGeom {
  id: number;
  row: number;
  col: number;
  /** True for border pieces (at least one straight side). */
  isEdge: boolean;
  /** Outline in absolute puzzle coordinates. */
  path: Path2D;
}

export interface CutLayout {
  rows: number;
  cols: number;
  /** Cell width/height in world units. */
  cw: number;
  ch: number;
  /** Max distance a tab may protrude beyond its cell, in world units. */
  pad: number;
  pieces: PieceGeom[];
}

/** Fraction of the edge length a tab can protrude (measured max ≈0.315 incl. jitter). */
export const TAB_EXTENT = 0.33;

/**
 * Build one edge curve from (x0,y0) to (x1,y1). `flip` chooses which side the
 * tab bulges toward. Perpendicular offsets are scaled by the edge length.
 */
function makeEdge(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rand: () => number,
): Float64Array {
  const flip = rand() < 0.5 ? 1 : -1;
  const t = 0.085 + rand() * 0.025; // tab size
  const j = 0.04; // jitter
  const r = () => (rand() * 2 - 1) * j;
  const a = r();
  const b = r();
  const c = r();
  const d = r();
  const e = r();

  const dx = x1 - x0;
  const dy = y1 - y0;
  // Unit-ish perpendicular (scaled by edge length).
  const px = -dy;
  const py = dx;

  // (along, across) pairs in edge-relative units.
  const rel: Array<[number, number]> = [
    [0, 0],
    [0.2, a],
    [0.5 + b + d, -t + c],
    [0.5 - t + b, t + c],
    [0.5 - 2 * t + b - d, 3 * t + c],
    [0.5 + 2 * t + b - d, 3 * t + c],
    [0.5 + t + b, t + c],
    [0.5 + b + e, -t + c],
    [0.8, e],
    [1, 0],
  ];
  const out = new Float64Array(20);
  for (let i = 0; i < 10; i++) {
    const [l, w] = rel[i];
    out[i * 2] = x0 + dx * l + px * w * flip;
    out[i * 2 + 1] = y0 + dy * l + py * w * flip;
  }
  // Pin the end points exactly so corners match bit-for-bit.
  out[0] = x0;
  out[1] = y0;
  out[18] = x1;
  out[19] = y1;
  return out;
}

/** Minimal path interface satisfied by Path2D and by the SVG string builder below. */
interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(a: number, b: number, c: number, d: number, e: number, f: number): void;
  closePath(): void;
}

/** Collects path commands into an SVG `d` attribute string. */
class SvgPath implements PathSink {
  d = "";
  private f = (n: number) => Math.round(n * 100) / 100;
  moveTo(x: number, y: number) {
    this.d += `M${this.f(x)} ${this.f(y)}`;
  }
  lineTo(x: number, y: number) {
    this.d += `L${this.f(x)} ${this.f(y)}`;
  }
  bezierCurveTo(a: number, b: number, c: number, d: number, e: number, f: number) {
    const r = this.f;
    this.d += `C${r(a)} ${r(b)} ${r(c)} ${r(d)} ${r(e)} ${r(f)}`;
  }
  closePath() {
    this.d += "Z";
  }
}

/** Append an edge to a path, either forwards (p0→p9) or reversed (p9→p0). */
function traceEdge(path: PathSink, e: EdgeCurve, reverse: boolean, ex: number, ey: number) {
  if (!e) {
    path.lineTo(ex, ey);
    return;
  }
  if (!reverse) {
    path.bezierCurveTo(e[2], e[3], e[4], e[5], e[6], e[7]);
    path.bezierCurveTo(e[8], e[9], e[10], e[11], e[12], e[13]);
    path.bezierCurveTo(e[14], e[15], e[16], e[17], e[18], e[19]);
  } else {
    path.bezierCurveTo(e[16], e[17], e[14], e[15], e[12], e[13]);
    path.bezierCurveTo(e[10], e[11], e[8], e[9], e[6], e[7]);
    path.bezierCurveTo(e[4], e[5], e[2], e[3], e[0], e[1]);
  }
}

/**
 * Choose a rows × cols grid whose cells are as square as possible and whose
 * count is close to `target`.
 */
export function gridFor(target: number, aspect: number): { rows: number; cols: number } {
  let best = { rows: 1, cols: 1, score: Infinity };
  const approxCols = Math.sqrt(target * aspect);
  for (let cols = Math.max(2, Math.floor(approxCols * 0.7)); cols <= Math.ceil(approxCols * 1.3) + 1; cols++) {
    for (const rows of [Math.floor(target / cols), Math.ceil(target / cols)]) {
      if (rows < 2) continue;
      const cellAspect = aspect / cols / (1 / rows); // cell w / cell h
      const squareness = Math.abs(Math.log(cellAspect));
      const countErr = Math.abs(rows * cols - target) / target;
      const score = squareness * 2 + countErr * 3;
      if (score < best.score) best = { rows, cols, score };
    }
  }
  return { rows: best.rows, cols: best.cols };
}

/** All shared edge curves of a cut. */
function buildEdges(rows: number, cols: number, W: number, H: number, seed: number) {
  const rand = mulberry32(seed);
  const cw = W / cols;
  const ch = H / rows;

  // Horizontal edges: between row r-1 and r, for r in 1..rows-1, spanning column c.
  const hEdges: EdgeCurve[] = new Array((rows + 1) * cols).fill(null);
  for (let r = 1; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      hEdges[r * cols + c] = makeEdge(c * cw, r * ch, (c + 1) * cw, r * ch, rand);
    }
  }
  // Vertical edges: between col c-1 and c, for c in 1..cols-1, spanning row r (top → bottom).
  const vEdges: EdgeCurve[] = new Array(rows * (cols + 1)).fill(null);
  for (let r = 0; r < rows; r++) {
    for (let c = 1; c < cols; c++) {
      vEdges[r * (cols + 1) + c] = makeEdge(c * cw, r * ch, c * cw, (r + 1) * ch, rand);
    }
  }
  return { cw, ch, hEdges, vEdges };
}

type Edges = ReturnType<typeof buildEdges>;

/** Trace one piece outline clockwise from its top-left corner. */
function tracePiece(path: PathSink, edges: Edges, cols: number, r: number, c: number) {
  const { cw, ch, hEdges, vEdges } = edges;
  const x0 = c * cw;
  const y0 = r * ch;
  const x1 = (c + 1) * cw;
  const y1 = (r + 1) * ch;
  path.moveTo(x0, y0);
  traceEdge(path, hEdges[r * cols + c], false, x1, y0); // top, left → right
  traceEdge(path, vEdges[r * (cols + 1) + c + 1], false, x1, y1); // right, top → bottom
  traceEdge(path, hEdges[(r + 1) * cols + c], true, x0, y1); // bottom, right → left
  traceEdge(path, vEdges[r * (cols + 1) + c], true, x0, y0); // left, bottom → top
  path.closePath();
}

/**
 * Generate the full cut for a W×H world image.
 */
export function generateCut(rows: number, cols: number, W: number, H: number, seed: number): CutLayout {
  const edges = buildEdges(rows, cols, W, H, seed);
  const { cw, ch } = edges;
  const pieces: PieceGeom[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const path = new Path2D();
      tracePiece(path, edges, cols, r, c);
      pieces.push({
        id: r * cols + c,
        row: r,
        col: c,
        isEdge: r === 0 || c === 0 || r === rows - 1 || c === cols - 1,
        path,
      });
    }
  }

  return { rows, cols, cw, ch, pad: Math.ceil(Math.max(cw, ch) * TAB_EXTENT), pieces };
}

/** SVG path strings (`d` attributes) for every piece — used for decorative UI. */
export function cutToSvg(rows: number, cols: number, W: number, H: number, seed: number): string[][] {
  const edges = buildEdges(rows, cols, W, H, seed);
  const out: string[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: string[] = [];
    for (let c = 0; c < cols; c++) {
      const p = new SvgPath();
      tracePiece(p, edges, cols, r, c);
      row.push(p.d);
    }
    out.push(row);
  }
  return out;
}
