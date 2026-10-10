/**
 * Table layout helpers: where loose pieces go around the puzzle frame.
 *
 * Slots are points on a square lattice centred on the frame. Slots that would
 * overlap the frame (plus a margin) or any "avoid" rectangle (existing
 * multi-piece groups) are rejected, and the remainder are ordered by their
 * distance from the frame so the first pieces land closest to the board.
 */

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Compute `count` slot centres around a W×H frame.
 * @param pitch spacing between slot centres (should exceed a piece incl. tabs)
 * @param avoid rectangles that must stay clear
 * @param viewAspect width/height of the viewport, used to bias the layout so
 *                   the whole table fits nicely on screen
 */
export function computeSlots(
  count: number,
  W: number,
  H: number,
  pitch: number,
  avoid: Rect[] = [],
  viewAspect = 16 / 10,
): Point[] {
  if (count <= 0) return [];
  const margin = pitch * 0.35;
  const half = pitch / 2;
  const fx0 = -margin;
  const fy0 = -margin;
  const fx1 = W + margin;
  const fy1 = H + margin;
  const cx = W / 2;
  const cy = H / 2;

  // Bias: how much "further" vertical distance counts, so the table grows
  // towards the viewport's aspect ratio rather than into a tall square.
  const frameAspect = W / H;
  const vBias = Math.min(2.2, Math.max(0.6, viewAspect / Math.max(0.3, frameAspect) + 0.15));

  let reach = Math.sqrt((count * pitch * pitch) / 4) + pitch * 2;
  for (let attempt = 0; attempt < 12; attempt++) {
    const pts: Array<Point & { d: number }> = [];
    const kxMax = Math.ceil((W / 2 + margin + reach * 1.4) / pitch);
    const kyMax = Math.ceil((H / 2 + margin + reach) / pitch);
    for (let ky = -kyMax; ky <= kyMax; ky++) {
      const y = cy + ky * pitch;
      for (let kx = -kxMax; kx <= kxMax; kx++) {
        const x = cx + kx * pitch;
        // Reject slots touching the frame.
        if (x + half > fx0 && x - half < fx1 && y + half > fy0 && y - half < fy1) continue;
        let blocked = false;
        for (const r of avoid) {
          if (x + half > r.x0 && x - half < r.x1 && y + half > r.y0 && y - half < r.y1) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;
        const dx = Math.max(0, fx0 - x, x - fx1);
        const dy = Math.max(0, fy0 - y, y - fy1);
        pts.push({ x, y, d: Math.max(dx, dy * vBias) + (dx + dy) * 0.02 });
      }
    }
    if (pts.length >= count) {
      pts.sort((a, b) => a.d - b.d);
      return pts.slice(0, count).map(({ x, y }) => ({ x, y }));
    }
    reach *= 1.5;
  }
  // Extremely unlikely fallback: a simple row below the frame.
  return Array.from({ length: count }, (_, i) => ({ x: (i % 50) * pitch, y: H + pitch * (2 + Math.floor(i / 50)) }));
}

/** Angle of a point around the frame centre, used for colour wedges. */
export function angleAround(p: Point, W: number, H: number): number {
  return Math.atan2((p.y - H / 2) / H, (p.x - W / 2) / W);
}

/** RGB (0-255) → HSL with h in [0,360), s/l in [0,1]. */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}
