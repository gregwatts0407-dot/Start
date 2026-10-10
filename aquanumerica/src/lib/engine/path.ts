/**
 * Minimal SVG path parser + flattener.
 *
 * Converts an SVG path `d` string into closed polygons (flat arrays of x,y
 * pairs) suitable for scanline rasterisation. Supports the full command set
 * (M L H V C S Q T A Z, absolute and relative). Curves are flattened with a
 * tolerance expressed in output pixels, so geometry stays smooth at any scale.
 */

export type Polygon = number[]; // [x0, y0, x1, y1, ...]

interface Token {
  cmd: string;
  args: number[];
}

const ARG_COUNT: Record<string, number> = {
  M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0,
};

/** Tokenise a path string into commands with numeric arguments. */
export function tokenizePath(d: string): Token[] {
  const tokens: Token[] = [];
  const re = /([MLHVCSQTAZmlhvcsqtaz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
  let current: Token | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    if (m[1]) {
      current = { cmd: m[1], args: [] };
      tokens.push(current);
    } else if (current) {
      current.args.push(parseFloat(m[2]));
    }
  }
  // Split implicit repeats (e.g. "L 1 2 3 4" → two L commands).
  const out: Token[] = [];
  for (const t of tokens) {
    const upper = t.cmd.toUpperCase();
    const n = ARG_COUNT[upper];
    if (n === 0 || t.args.length <= n) {
      out.push(t);
      continue;
    }
    for (let i = 0; i < t.args.length; i += n) {
      let cmd = t.cmd;
      // Subsequent pairs after a moveto are treated as lineto.
      if (i > 0 && upper === "M") cmd = t.cmd === "m" ? "l" : "L";
      out.push({ cmd, args: t.args.slice(i, i + n) });
    }
  }
  return out;
}

function cubicSegments(
  x0: number, y0: number, x1: number, y1: number,
  x2: number, y2: number, x3: number, y3: number, scale: number,
): number {
  const len =
    Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
  return Math.max(2, Math.min(96, Math.ceil(Math.sqrt(len * scale) * 1.1)));
}

/**
 * Flatten a path into polygons. `scale` multiplies all coordinates (canvas
 * units → paint pixels) and also drives curve subdivision density.
 */
export function flattenPath(d: string, scale = 1): Polygon[] {
  const tokens = tokenizePath(d);
  const polys: Polygon[] = [];
  let poly: Polygon = [];
  let cx = 0, cy = 0; // current point (unscaled)
  let sx = 0, sy = 0; // subpath start
  let lastCtrlX = 0, lastCtrlY = 0; // reflection point for S/T
  let lastCmd = "";

  const push = (x: number, y: number) => {
    poly.push(x * scale, y * scale);
  };
  const closePoly = () => {
    if (poly.length >= 6) polys.push(poly);
    poly = [];
  };

  for (const { cmd, args } of tokens) {
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    switch (C) {
      case "M": {
        closePoly();
        cx = args[0] + ox; cy = args[1] + oy;
        sx = cx; sy = cy;
        push(cx, cy);
        break;
      }
      case "L": {
        cx = args[0] + ox; cy = args[1] + oy;
        push(cx, cy);
        break;
      }
      case "H": {
        cx = args[0] + ox;
        push(cx, cy);
        break;
      }
      case "V": {
        cy = args[0] + oy;
        push(cx, cy);
        break;
      }
      case "C":
      case "S": {
        let x1: number, y1: number, x2: number, y2: number, x: number, y: number;
        if (C === "C") {
          x1 = args[0] + ox; y1 = args[1] + oy;
          x2 = args[2] + ox; y2 = args[3] + oy;
          x = args[4] + ox; y = args[5] + oy;
        } else {
          const reflect = lastCmd === "C" || lastCmd === "S";
          x1 = reflect ? 2 * cx - lastCtrlX : cx;
          y1 = reflect ? 2 * cy - lastCtrlY : cy;
          x2 = args[0] + ox; y2 = args[1] + oy;
          x = args[2] + ox; y = args[3] + oy;
        }
        const n = cubicSegments(cx, cy, x1, y1, x2, y2, x, y, scale);
        for (let i = 1; i <= n; i++) {
          const t = i / n, mt = 1 - t;
          const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, e = t * t * t;
          push(a * cx + b * x1 + c * x2 + e * x, a * cy + b * y1 + c * y2 + e * y);
        }
        lastCtrlX = x2; lastCtrlY = y2;
        cx = x; cy = y;
        break;
      }
      case "Q":
      case "T": {
        let x1: number, y1: number, x: number, y: number;
        if (C === "Q") {
          x1 = args[0] + ox; y1 = args[1] + oy;
          x = args[2] + ox; y = args[3] + oy;
        } else {
          const reflect = lastCmd === "Q" || lastCmd === "T";
          x1 = reflect ? 2 * cx - lastCtrlX : cx;
          y1 = reflect ? 2 * cy - lastCtrlY : cy;
          x = args[0] + ox; y = args[1] + oy;
        }
        const n = cubicSegments(cx, cy, x1, y1, x1, y1, x, y, scale);
        for (let i = 1; i <= n; i++) {
          const t = i / n, mt = 1 - t;
          push(mt * mt * cx + 2 * mt * t * x1 + t * t * x, mt * mt * cy + 2 * mt * t * y1 + t * t * y);
        }
        lastCtrlX = x1; lastCtrlY = y1;
        cx = x; cy = y;
        break;
      }
      case "A": {
        const x = args[5] + ox, y = args[6] + oy;
        arcToPoints(cx, cy, args[0], args[1], args[2], args[3] !== 0, args[4] !== 0, x, y, scale, push);
        cx = x; cy = y;
        break;
      }
      case "Z": {
        cx = sx; cy = sy;
        closePoly();
        break;
      }
    }
    lastCmd = C;
  }
  closePoly();
  return polys;
}

/** Endpoint-parameterised elliptical arc → polyline (SVG spec F.6.5). */
function arcToPoints(
  x1: number, y1: number, rx: number, ry: number, phiDeg: number,
  largeArc: boolean, sweep: boolean, x2: number, y2: number, scale: number,
  push: (x: number, y: number) => void,
) {
  if (rx === 0 || ry === 0) {
    push(x2, y2);
    return;
  }
  rx = Math.abs(rx); ry = Math.abs(ry);
  const phi = (phiDeg * Math.PI) / 180;
  const cosP = Math.cos(phi), sinP = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cosP * dx + sinP * dy;
  const y1p = -sinP * dx + cosP * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s; ry *= s;
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let coef = Math.sqrt(Math.max(0, num / den));
  if (largeArc === sweep) coef = -coef;
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cosP * cxp - sinP * cyp + (x1 + x2) / 2;
  const cy = sinP * cxp + cosP * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;
  const n = Math.max(4, Math.ceil((Math.abs(dTheta) * Math.max(rx, ry) * scale) / 6));
  for (let i = 1; i <= n; i++) {
    const t = theta1 + (dTheta * i) / n;
    const ct = Math.cos(t), st = Math.sin(t);
    push(cosP * rx * ct - sinP * ry * st + cx, sinP * rx * ct + cosP * ry * st + cy);
  }
}

/** Axis-aligned bounds of a polygon list. */
export function polygonBounds(polys: Polygon[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of polys) {
    for (let i = 0; i < p.length; i += 2) {
      const x = p[i], y = p[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
}
