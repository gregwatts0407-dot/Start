import { palette, type CanvasEntry } from "../entry";
import type { Scene } from "../shapes";
import {
  Rand, blob, circle, closeDown, cluster, leafHalves, lens, petal, place, poly, rect, resampleSmooth, sector,
  smooth, smoothSharp, squash, star, stem, ellipse, type Pt,
} from "../shapes";

// ---------------------------------------------------------------------------
// Koi Pond
// ---------------------------------------------------------------------------

/** Koi seen from above, built along a curved spine (head → tail). */
function koi(
  s: Scene, r: Rand, spine: Pt[], W: number, bodyN: number, finN: number,
  patches: Array<[number, number, number, number]>,
) {
  const path = resampleSmooth(spine, 10);
  const m = path.length;
  const cum = [0];
  for (let i = 1; i < m; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const total = cum[m - 1];
  const halfW = (t: number) => W * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.55)), 0.8) * (1 - 0.75 * t) + W * 0.12 * t;
  const normal = (i: number): Pt => {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(m - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    return [-dy / len, dx / len];
  };
  const at = (t: number) => {
    const target = t * total;
    let i = 0;
    while (i < m - 2 && cum[i + 1] < target) i++;
    return i;
  };

  // Tail fin.
  const T = path[m - 1], P = path[m - 3];
  const dl = Math.hypot(T[0] - P[0], T[1] - P[1]) || 1;
  const d: Pt = [(T[0] - P[0]) / dl, (T[1] - P[1]) / dl];
  const n: Pt = [-d[1], d[0]];
  const tail: Pt[] = [
    [T[0] + n[0] * W * 0.14, T[1] + n[1] * W * 0.14],
    [T[0] + d[0] * W * 1.05 + n[0] * W * 0.95, T[1] + d[1] * W * 1.05 + n[1] * W * 0.95],
    [T[0] + d[0] * W * 0.62, T[1] + d[1] * W * 0.62],
    [T[0] + d[0] * W * 1.05 - n[0] * W * 0.95, T[1] + d[1] * W * 1.05 - n[1] * W * 0.95],
    [T[0] - n[0] * W * 0.14, T[1] - n[1] * W * 0.14],
  ];
  s.add(smoothSharp(tail, [false, true, true, true, false], 0.6), finN);

  // Pectoral fins.
  const fi = at(0.27);
  const fn = normal(fi);
  const dirA = Math.atan2(path[fi + 1][1] - path[fi][1], path[fi + 1][0] - path[fi][0]);
  for (const side of [1, -1]) {
    const w = halfW(0.27) * 0.9;
    const bx = path[fi][0] + fn[0] * w * side, by = path[fi][1] + fn[1] * w * side;
    s.add(petal(bx, by, dirA + side * (Math.PI / 2 + 0.65), W * 0.95, W * 0.62, 0.8), finN);
  }

  // Body.
  const left: Pt[] = [], right: Pt[] = [];
  for (let i = 0; i < m; i++) {
    const t = cum[i] / total;
    const w = halfW(t);
    const nn = normal(i);
    left.push([path[i][0] + nn[0] * w, path[i][1] + nn[1] * w]);
    right.push([path[i][0] - nn[0] * w, path[i][1] - nn[1] * w]);
  }
  s.add(smooth([...left, ...right.reverse()], 0.5), bodyN);

  // Markings stay well inside the body outline.
  for (const [t, off, size, colour] of patches) {
    const i = at(t);
    const w = halfW(t);
    const nn = normal(i);
    const cx = path[i][0] + nn[0] * off * w, cy = path[i][1] + nn[1] * off * w;
    const rad = Math.min(size * W, (1 - Math.abs(off)) * w * 0.8);
    const rot = Math.atan2(path[Math.min(m - 1, i + 1)][1] - path[i][1], path[Math.min(m - 1, i + 1)][0] - path[i][0]);
    s.add(blobPtsSmooth(cx, cy, rad, r, rot), colour);
  }
}

function blobPtsSmooth(cx: number, cy: number, rad: number, r: Rand, rot: number) {
  return blob(cx, cy, rad, r, { n: 8, jitter: 0.18, sx: 1.25, sy: 0.85, rot });
}

/** Lily pad with a notch, split into lit and shaded halves. */
function lilyPad(s: Scene, cx: number, cy: number, R: number, notch: number, light: number, dark: number) {
  const half = (a0: number, a1: number) => {
    const pts: Pt[] = [[cx, cy]];
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
    }
    return poly(squash(pts, cy, 0.78));
  };
  s.add(half(notch + 0.28, notch + Math.PI), light);
  s.add(half(notch + Math.PI, notch + Math.PI * 2 - 0.28), dark);
}

export const koiPond: CanvasEntry = {
  meta: {
    id: "koi-pond",
    title: "Koi Pond",
    description: "Koi glide between lily pads and a single lotus in a cool, rippling pond.",
    category: "animal",
    difficulty: "medium",
    width: 1000,
    height: 1000,
    tags: ["fish", "water", "japanese", "lotus"],
    palette: palette([
      ["Deep Water", "#3e6c7a"],
      ["Mid Water", "#5d92a0"],
      ["Light Ripple", "#9fc8cc"],
      ["Lily Pad", "#78a35f"],
      ["Pad Shadow", "#4f7748"],
      ["Koi Orange", "#ef8c3d"],
      ["Koi Pearl", "#f7f2e9"],
      ["Koi Crimson", "#c84a3c"],
      ["Lotus Pink", "#f3b9c8"],
      ["Lotus Gold", "#f4d46c"],
      ["Sunlit Water", "#c9e2df"],
    ]),
  },
  build(s) {
    const r = new Rand(131);
    s.background(1);
    s.add(cluster(300, 260, 230, r, { lobes: 5, depth: 0.08 }), 2);
    s.add(cluster(760, 760, 260, r, { lobes: 5, depth: 0.08 }), 2);
    s.add(cluster(840, 210, 150, r, { lobes: 5, depth: 0.08 }), 2);
    for (const [cx, cy, radii] of [[330, 720, [60, 112, 166]], [720, 300, [52, 98]]] as const) {
      radii.forEach((rad, k) => {
        const a0 = r.range(0, Math.PI * 2);
        s.add(poly(squash(sector(cx, cy, rad, rad + 13, a0, a0 + Math.PI * (1.1 + k * 0.2), 24), cy, 0.8)), 3);
      });
    }
    for (const [x, y, len, a] of [[120, 480, 110, 0.3], [560, 110, 130, -0.2], [930, 520, 90, 0.6], [420, 900, 120, -0.4], [700, 980, 100, 0.1]] as const) {
      s.add(lens(x - len / 2, x + len / 2, y, 16, 3, a), 11);
    }
    lilyPad(s, 160, 160, 112, 0.6, 4, 5);
    lilyPad(s, 870, 110, 92, 2.2, 4, 5);
    lilyPad(s, 122, 870, 84, -0.9, 4, 5);
    lilyPad(s, 560, 920, 72, 1.4, 4, 5);
    lilyPad(s, 920, 470, 66, 3.0, 4, 5);
    lilyPad(s, 870, 860, 124, -2.4, 4, 5);

    // Lotus on the large pad.
    const lx = 846, ly = 828;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      s.add(smooth(squash(petalPtsLocal(lx, ly, a, 92, 48), ly, 0.8)), 9);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.55;
      s.add(smooth(squash(petalPtsLocal(lx, ly, a, 58, 34), ly, 0.8)), 9);
    }
    s.add(ellipse(lx, ly, 20, 16), 10);

    koi(s, r, [[262, 330], [380, 420], [520, 468], [650, 448]], 56, 7, 6, [[0.1, 0, 0.42, 8], [0.4, 0.28, 0.5, 6], [0.64, -0.2, 0.44, 6]]);
    koi(s, r, [[724, 640], [604, 598], [470, 640], [380, 744]], 62, 6, 7, [[0.3, -0.25, 0.42, 7], [0.55, 0.22, 0.45, 7], [0.78, 0, 0.32, 7]]);
    koi(s, r, [[650, 236], [560, 172], [450, 152], [362, 196]], 46, 7, 6, [[0.24, 0.12, 0.5, 8], [0.52, -0.12, 0.45, 8]]);
  },
};

function petalPtsLocal(x: number, y: number, a: number, len: number, w: number): Pt[] {
  const local: Pt[] = [[0, 0], [len * 0.3, w * 0.42], [len * 0.72, w * 0.36], [len, 0], [len * 0.72, -w * 0.36], [len * 0.3, -w * 0.42]];
  return place(local, x, y, a);
}

// ---------------------------------------------------------------------------
// Little Fox (geometric, low-poly)
// ---------------------------------------------------------------------------

export const littleFox: CanvasEntry = {
  meta: {
    id: "little-fox",
    title: "Little Fox",
    description: "A faceted fox sits beneath a rising moon at the edge of a pine wood.",
    category: "animal",
    difficulty: "medium",
    width: 1000,
    height: 1000,
    tags: ["fox", "geometric", "night", "moon"],
    palette: palette([
      ["Night Blue", "#3d4a6e"],
      ["Twilight Violet", "#6d6a9a"],
      ["Dusk Rose", "#d9a3a8"],
      ["Moon Cream", "#f6ecd2"],
      ["Pine", "#2f4a49"],
      ["Fox Orange", "#e0803f"],
      ["Fox Rust", "#b65a2e"],
      ["Fox Cream", "#f3e3cc"],
      ["Charcoal", "#3a3335"],
      ["Meadow", "#7d8f5c"],
      ["Grass Light", "#a9b77a"],
    ]),
  },
  build(s) {
    const r = new Rand(149);
    s.background(1);
    s.add(poly(closeDown(resampleSmooth([[0, 300], [300, 330], [600, 300], [1000, 336]], 8), 1000)), 2);
    s.add(poly(closeDown(resampleSmooth([[0, 520], [300, 500], [640, 530], [1000, 505]], 8), 1000)), 3);
    s.add(circle(640, 300, 130), 4);
    for (const [x, y, rad] of [[120, 110, 16], [260, 210, 11], [420, 80, 13], [820, 120, 15], [910, 260, 10], [80, 330, 10], [560, 150, 9]] as const) {
      s.add(smooth(star(x, y, rad, rad * 0.38, 4, r.next())), 4);
    }
    // Pine wood silhouette.
    const pines: Pt[] = [];
    for (let x = -20, i = 0; x <= 1040; x += 32, i++) {
      const base = 660 + Math.sin(x / 140) * 12;
      pines.push([x, base], [x + 16, base - r.range(70, 150)]);
    }
    s.add(poly(closeDown(pines, 760)), 5);
    s.add(poly(closeDown(resampleSmooth([[0, 720], [300, 706], [620, 726], [1000, 708]], 8), 1000)), 10);
    s.add(ellipse(540, 806, 260, 34), 2);

    const F = (pts: number[], n: number) => {
      const p: Pt[] = [];
      for (let i = 0; i < pts.length; i += 2) p.push([pts[i], pts[i + 1]]);
      s.add(poly(p), n);
    };
    // Tail (behind body)
    F([640, 640, 780, 556, 846, 640, 806, 764, 650, 792, 566, 780], 6);
    F([706, 700, 806, 764, 650, 792], 7);
    F([566, 780, 650, 792, 604, 820, 516, 802], 8);
    // Body
    F([410, 470, 330, 600, 330, 762, 452, 762, 470, 640, 410, 560], 6);
    F([520, 465, 600, 500, 650, 620, 545, 560], 6);
    F([545, 560, 650, 620, 640, 762, 452, 762, 470, 640], 7);
    // Bib
    F([430, 465, 472, 472, 472, 642, 410, 560], 8);
    F([472, 472, 520, 460, 545, 560, 472, 642], 4);
    // Legs and paws
    F([440, 620, 470, 632, 468, 768, 436, 768], 6);
    F([482, 632, 512, 620, 514, 768, 484, 768], 7);
    F([430, 762, 474, 762, 478, 790, 426, 790], 9);
    F([480, 762, 520, 762, 524, 790, 476, 790], 9);
    // Ears (behind head)
    F([440, 326, 392, 246, 380, 366], 6);
    F([430, 330, 398, 270, 392, 350], 9);
    F([510, 326, 566, 248, 580, 366], 7);
    F([520, 330, 560, 272, 568, 350], 9);
    // Head facets
    F([475, 320, 440, 324, 385, 392, 455, 412], 6);
    F([475, 320, 510, 324, 576, 396, 495, 412], 7);
    F([455, 412, 475, 320, 495, 412, 475, 442], 6);
    F([385, 392, 455, 412, 430, 468], 8);
    F([576, 396, 495, 412, 520, 462], 4);
    F([455, 412, 475, 442, 465, 488, 430, 468], 8);
    F([495, 412, 475, 442, 465, 488, 520, 462], 4);
    F([450, 476, 480, 476, 465, 494], 9);
    F([428, 396, 446, 386, 454, 398, 440, 404], 9);
    F([496, 398, 504, 386, 522, 396, 510, 404], 9);

    // Foreground grass tufts.
    for (const [x, w] of [[90, 120], [250, 90], [760, 110], [920, 130], [620, 80]] as const) {
      const base = 1000;
      const pts: Pt[] = [[x - w / 2, base]];
      const blades = 5;
      for (let b = 0; b < blades; b++) {
        const t = (b + 0.5) / blades;
        pts.push([x - w / 2 + w * t + r.jit(0, 6), base - r.range(70, 130)], [x - w / 2 + w * (t + 0.5 / blades), base - r.range(10, 30)]);
      }
      pts.push([x + w / 2, base]);
      s.add(poly(pts), 11);
    }
    s.add(rect(0, 985, 1000, 15), 10);
  },
};

// ---------------------------------------------------------------------------
// Hummingbird
// ---------------------------------------------------------------------------

export const hummingbird: CanvasEntry = {
  meta: {
    id: "hummingbird",
    title: "Hummingbird",
    description: "A ruby-throated hummingbird hovers to sip from hanging fuchsia blossoms.",
    category: "animal",
    difficulty: "hard",
    width: 1000,
    height: 1000,
    tags: ["bird", "flowers", "fuchsia", "garden"],
    palette: palette([
      ["Soft Ground", "#eef1e6"],
      ["Bokeh Green", "#c5d8b5"],
      ["Bokeh Teal", "#a9cfc9"],
      ["Leaf", "#6f9a5c"],
      ["Deep Leaf", "#456b4b"],
      ["Fuchsia", "#d24f86"],
      ["Magenta Deep", "#9c2f62"],
      ["Petal Violet", "#7d5aa6"],
      ["Emerald", "#3f8f6b"],
      ["Jade Light", "#8cc39a"],
      ["Ruby Throat", "#c43a4a"],
      ["Belly Pearl", "#efe9df"],
      ["Beak Charcoal", "#34302f"],
    ]),
  },
  build(s) {
    const r = new Rand(167);
    s.background(1);
    for (const [x, y, rad, n] of [[140, 180, 110, 2], [380, 120, 70, 3], [180, 560, 90, 3], [120, 860, 120, 2], [460, 820, 80, 2], [640, 900, 100, 3], [930, 380, 70, 2], [560, 260, 60, 2]] as const) {
      s.add(circle(x, y, rad), n);
    }
    // Branch and leaves.
    s.add(stem([[1010, 130], [900, 160], [760, 222], [600, 250]], 12, 7), 5);
    for (const [x, y, a, len, w] of [[948, 146, -2.5, 150, 66], [880, 176, 2.1, 140, 60], [800, 210, -2.0, 130, 56], [690, 238, 2.5, 120, 52], [640, 246, -2.7, 110, 48]] as const) {
      const [L, R] = leafHalves(x, y, a, len, w, 0.12);
      s.add(L, 4);
      s.add(R, 5);
    }
    const fuchsia = (jx: number, jy: number, from: Pt) => {
      s.add(stem([from, [(from[0] + jx) / 2 + 10, (from[1] + jy) / 2], [jx, jy - 60]], 5, 6), 5);
      s.add(petal(jx, jy - 70, Math.PI / 2, 72, 26, 0.5), 6);
      s.add(petal(jx, jy, -0.35, 84, 30, 0.15), 6);
      s.add(petal(jx, jy, Math.PI + 0.35, 84, 30, 0.15), 6);
      s.add(petal(jx, jy, 0.65, 78, 28, 0.15), 7);
      s.add(petal(jx, jy, Math.PI - 0.65, 78, 28, 0.15), 7);
      s.add(petal(jx, jy, Math.PI / 2 - 0.38, 78, 52, 0.95), 8);
      s.add(petal(jx, jy, Math.PI / 2 + 0.38, 78, 52, 0.95), 8);
      s.add(petal(jx, jy, Math.PI / 2, 84, 56, 0.95), 7);
    };
    fuchsia(800, 372, [820, 200]);
    fuchsia(892, 660, [900, 168]);
    fuchsia(690, 620, [700, 240]);

    // The bird in local coordinates: u toward the head, v toward the belly.
    const bx = 420, by = 480, ang = -0.45;
    const P = (pts: Pt[]) => place(pts, bx, by, ang);
    // Tail fan (behind body)
    const tailN = [9, 13, 5, 13, 9];
    for (let i = 0; i < 5; i++) {
      const a = Math.PI - 0.42 + i * 0.21;
      s.add(petalAt(P, -132, 4, a, 128, 40, 0.35), tailN[i]);
    }
    // Far wing
    for (let i = 0; i < 6; i++) {
      const a = -1.95 - i * 0.14;
      s.add(petalAt(P, 30, -42, a, 236 - i * 12, 58, 0.55), i % 2 ? 9 : 10);
    }
    // Body, belly
    s.add(smooth(P([[125, 0], [110, -35], [70, -55], [10, -60], [-60, -48], [-120, -22], [-152, -6], [-152, 8], [-120, 26], [-60, 52], [10, 62], [70, 56], [110, 38]])), 9);
    s.add(smooth(P([[92, 22], [62, 48], [10, 57], [-60, 46], [-112, 22], [-62, 24], [0, 22], [52, 14]])), 12);
    // Near wing
    for (let i = 0; i < 6; i++) {
      const a = -1.62 - i * 0.15;
      s.add(petalAt(P, 4, -34, a, 270 - i * 14, 66, 0.55), i % 2 ? 3 : 10);
    }
    // Beak, head, throat, eye
    s.add(poly(P([[160, -10], [332, 6], [164, 14]])), 13);
    s.add(circle(...P([[128, -8]])[0], 54), 9);
    s.add(blob(...P([[126, 34]])[0], 30, r, { sx: 1.35, sy: 0.9, rot: ang, n: 9, jitter: 0.12 }), 11);
    s.add(circle(...P([[146, -20]])[0], 10), 13);
  },
};

/** Petal attached at a local point of a placed frame. */
function petalAt(P: (pts: Pt[]) => Pt[], u: number, v: number, a: number, len: number, w: number, round: number) {
  const tip: Pt = [u + Math.cos(a) * len, v + Math.sin(a) * len];
  const [b, t] = P([[u, v], tip]);
  const angle = Math.atan2(t[1] - b[1], t[0] - b[0]);
  return petal(b[0], b[1], angle, len, w, round);
}
