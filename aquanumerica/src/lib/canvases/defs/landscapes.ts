import { palette, type CanvasEntry } from "../entry";
import {
  Rand, between, circle, closeDown, cluster, lens, poly, rect, resampleSmooth, ridgePts, smooth, stem, blob, wave,
  type Pt,
} from "../shapes";

/** Connect control points with midpoint-displaced detail. */
function detailRidge(ctrl: Pt[], rnd: Rand, rough: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const seg = ridgePts(ctrl[i][0], ctrl[i + 1][0], ctrl[i][1], ctrl[i + 1][1], rnd, rough, 3);
    out.push(...(i === 0 ? seg : seg.slice(1)));
  }
  return out;
}

/** Snow cap hugging a ridge around a peak, with a jagged lower edge. */
function snowCap(ridge: Pt[], peakX: number, depth: number, rnd: Rand): Pt[] {
  let pi = 0;
  for (let i = 0; i < ridge.length; i++) if (Math.abs(ridge[i][0] - peakX) < Math.abs(ridge[pi][0] - peakX)) pi = i;
  // Walk to the true local summit.
  while (pi > 0 && ridge[pi - 1][1] < ridge[pi][1]) pi--;
  while (pi < ridge.length - 1 && ridge[pi + 1][1] < ridge[pi][1]) pi++;
  const py = ridge[pi][1];
  let a = pi, b = pi;
  while (a > 0 && ridge[a - 1][1] < py + depth) a--;
  while (b < ridge.length - 1 && ridge[b + 1][1] < py + depth) b++;
  const top = ridge.slice(a, b + 1);
  const x0 = top[0][0], x1 = top[top.length - 1][0];
  const bottom: Pt[] = [];
  const steps = Math.max(3, Math.round((x1 - x0) / 16));
  for (let i = steps - 1; i >= 1; i--) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const dip = i % 2 ? depth * rnd.range(0.95, 1.25) : depth * rnd.range(0.55, 0.8);
    bottom.push([x, py + dip]);
  }
  return [...top, ...bottom];
}

/** Spiky tree-line silhouette closed downward. */
function treeline(x0: number, x1: number, baseY: (x: number) => number, bottom: number, rnd: Rand, step = 16, spike = 24): Pt[] {
  const pts: Pt[] = [];
  for (let x = x0; x <= x1; x += step) {
    const y = baseY(x);
    pts.push([x, y + rnd.range(0, 4)]);
    pts.push([x + step / 2, y - rnd.range(spike * 0.4, spike)]);
  }
  return closeDown(pts, bottom);
}

/** Layered spruce silhouette. */
function spruce(x: number, baseY: number, h: number, tiers = 5): Pt[] {
  const right: Pt[] = [];
  const top = baseY - h;
  for (let i = 1; i <= tiers; i++) {
    const yb = top + ((h * 0.86) * i) / tiers;
    const w = h * 0.3 * (0.35 + 0.65 * (i / tiers));
    right.push([x + w, yb]);
    if (i < tiers) right.push([x + w * 0.38, yb - h * 0.035]);
  }
  right.push([x + h * 0.045, baseY - h * 0.14], [x + h * 0.045, baseY]);
  const left = right.map(([px, py]) => [2 * x - px, py] as Pt).reverse();
  return [[x, top], ...right, ...left];
}

/** Tall flame-shaped cypress. */
function cypress(x: number, baseY: number, h: number, w: number): string {
  const pts: Pt[] = [
    [x, baseY - h],
    [x + w * 0.22, baseY - h * 0.8],
    [x + w * 0.42, baseY - h * 0.5],
    [x + w * 0.5, baseY - h * 0.2],
    [x + w * 0.3, baseY],
    [x - w * 0.3, baseY],
    [x - w * 0.5, baseY - h * 0.22],
    [x - w * 0.4, baseY - h * 0.52],
    [x - w * 0.2, baseY - h * 0.8],
  ];
  return smooth(pts, 0.45);
}

export const alpineDawn: CanvasEntry = {
  meta: {
    id: "alpine-dawn",
    title: "Alpine Dawn",
    description: "First light warms snow-capped peaks above a still mountain lake.",
    category: "landscape",
    difficulty: "easy",
    width: 1200,
    height: 800,
    tags: ["mountains", "lake", "sunrise", "snow"],
    palette: palette([
      ["Lilac Sky", "#cdc4e0"],
      ["Dawn Blush", "#f2cfc6"],
      ["Apricot Glow", "#f7dfbd"],
      ["Sun Gold", "#f4c066"],
      ["Distant Blue", "#a6b8d0"],
      ["Snow", "#f5f3f0"],
      ["Slate Violet", "#7889aa"],
      ["Spruce", "#3e5d5a"],
      ["Lake Teal", "#8cb5be"],
      ["Meadow", "#9cb57c"],
      ["Rose Slope", "#c4afc2"],
    ]),
  },
  build(s) {
    const r = new Rand(11);
    s.background(1);
    s.add(lens(90, 470, 92, 26, -4), 2);
    s.add(lens(620, 1080, 140, 30, 5), 2);
    s.add(lens(380, 760, 60, 20, 3), 3);
    s.add(poly(closeDown(wave(0, 1200, 215, 16, 760, 0.6), 800)), 2);
    s.add(lens(-40, 360, 278, 24, 3), 1);
    s.add(lens(880, 1240, 262, 22, -3), 3);
    s.add(poly(closeDown(wave(0, 1200, 345, 12, 980, 2.1), 800)), 3);
    s.add(circle(835, 402, 66), 4);

    const far = detailRidge(
      [[0, 470], [120, 395], [250, 300], [330, 352], [430, 262], [540, 345], [640, 388], [770, 322], [890, 408], [1010, 338], [1110, 392], [1200, 372]],
      r, 14,
    );
    s.add(poly(closeDown(far, 660)), 5);
    for (const px of [250, 430, 770, 1010]) s.add(poly(snowCap(far, px, 50, r)), 6);

    const midCtrl: Pt[] = [[0, 560], [110, 505], [220, 468], [340, 520], [470, 446], [600, 505], [720, 470], [860, 532], [980, 482], [1100, 515], [1200, 492]];
    const mid = detailRidge(midCtrl, r, 10);
    s.add(poly(closeDown(mid, 680)), 7);
    // Sun-facing slopes catch the light.
    for (const k of [2, 4, 6, 8]) {
      const [px, py] = midCtrl[k];
      const [vx] = midCtrl[k + 1];
      const ex = px + (vx - px) * 0.62;
      const slope = mid.filter(([x]) => x >= px && x <= ex);
      const end = slope[slope.length - 1];
      s.add(poly([...slope, [end[0] - 18, end[1] + 70], [px + 10, py + 150]]), 11);
    }

    s.add(poly(treeline(-8, 1210, (x) => 596 + 14 * Math.sin(x / 170) + 8 * Math.sin(x / 53), 652, r)), 8);
    s.add(rect(0, 650, 1200, 150), 9);
    // Reflections
    s.add(lens(60, 540, 672, 18), 7);
    s.add(lens(600, 1150, 690, 16), 7);
    s.add(lens(160, 660, 712, 14), 11);
    s.add(lens(750, 920, 668, 14), 4);
    s.add(lens(780, 890, 694, 12), 4);
    s.add(lens(800, 870, 716, 10), 4);

    const meadow = resampleSmooth([[0, 712], [200, 735], [420, 750], [700, 742], [950, 760], [1200, 746]], 8);
    s.add(poly(closeDown(meadow, 800)), 10);
    s.add(blob(610, 774, 30, r, { sx: 1.5, sy: 0.8 }), 7);
    s.add(blob(668, 782, 18, r, { sx: 1.4, sy: 0.8 }), 7);
    s.add(poly(spruce(80, 764, 210)), 8);
    s.add(poly(spruce(152, 772, 150, 4)), 8);
    s.add(poly(spruce(1108, 772, 176)), 8);
    s.add(poly(spruce(1166, 784, 120, 4)), 8);
  },
};

export const lavenderFields: CanvasEntry = {
  meta: {
    id: "lavender-fields",
    title: "Lavender Fields",
    description: "Provençal rows of lavender lead to a stone farmhouse and its cypress sentinels.",
    category: "landscape",
    difficulty: "medium",
    width: 1200,
    height: 800,
    tags: ["provence", "summer", "farm", "perspective"],
    palette: palette([
      ["Morning Sky", "#cfe1ef"],
      ["Horizon Glow", "#f4e6d4"],
      ["Cloud White", "#f8f6f2"],
      ["Far Hills", "#b3c2cb"],
      ["Olive Grove", "#8b9c6b"],
      ["Cypress", "#3f5c48"],
      ["Lavender", "#a493cc"],
      ["Deep Violet", "#6b5b99"],
      ["Warm Earth", "#a38a68"],
      ["Limestone", "#ebdecb"],
      ["Terracotta", "#c87a5c"],
      ["Sun Haze", "#f6d796"],
    ]),
  },
  build(s) {
    const r = new Rand(23);
    s.background(1);
    s.add(poly(closeDown(wave(0, 1200, 318, 10, 900, 0.4), 800)), 2);
    s.add(circle(300, 292, 44), 12);
    s.add(blob(810, 148, 46, r, { sx: 2.7, jitter: 0.16, n: 12 }), 3);
    s.add(blob(500, 104, 30, r, { sx: 2.4, jitter: 0.16, n: 10 }), 3);
    s.add(blob(1050, 232, 26, r, { sx: 2.8, jitter: 0.14, n: 10 }), 3);

    s.add(poly(closeDown(resampleSmooth([[0, 420], [180, 388], [380, 410], [560, 384], [760, 404], [960, 380], [1200, 410]], 8), 480)), 4);
    // Olive grove with scalloped tree tops.
    const grove: Pt[] = [];
    for (let x = -10; x <= 1210; x += 6) grove.push([x, 452 - Math.abs(Math.sin(x / 19)) * 11 - Math.sin(x / 140) * 4]);
    s.add(poly(closeDown(grove, 480)), 5);

    // Farmhouse
    s.add(rect(872, 430, 68, 36), 10);
    s.add(poly([[940, 430], [986, 437], [986, 468], [940, 466]]), 4);
    s.add(poly([[864, 433], [948, 433], [936, 412], [876, 412]]), 11);
    s.add(poly([[948, 433], [994, 440], [982, 420], [936, 412]]), 9);
    s.add(rect(884, 442, 13, 13), 6);
    s.add(rect(914, 442, 13, 13), 6);

    s.add(cypress(846, 468, 122, 28), 6);
    s.add(cypress(1004, 470, 96, 24), 6);
    s.add(cypress(1034, 470, 72, 20), 6);
    s.add(cypress(360, 470, 82, 22), 6);

    // Field
    s.add(rect(0, 470, 1200, 330), 9);
    s.add(rect(0, 470, 1200, 36), 7);
    const vp: Pt = [640, 470];
    const at = (xb: number, y: number) => vp[0] + (xb - vp[0]) * ((y - vp[1]) / (800 - vp[1]));
    for (let i = -11; i <= 11; i++) {
      const xb = 640 + i * 250;
      if (i === 0) continue;
      const y0 = 502;
      const L = xb - 82, R = xb + 82, M = xb + (i < 0 ? 22 : -22);
      // Lit side faces the light (left), shadow on the right.
      s.add(poly([[at(L, y0), y0], [at(M, y0), y0], [M, 800], [L, 800]]), 7);
      s.add(poly([[at(M, y0), y0], [at(R, y0), y0], [R, 800], [M, 800]]), 8);
    }
    // Chalky path through the middle.
    s.add(poly([[at(540, 476), 476], [at(740, 476), 476], [742, 800], [538, 800]]), 10);
  },
};

export const autumnBirches: CanvasEntry = {
  meta: {
    id: "autumn-birches",
    title: "Autumn Birches",
    description: "Silver birches glow among russet and gold foliage beside a woodland path.",
    category: "landscape",
    difficulty: "hard",
    width: 900,
    height: 1200,
    tags: ["forest", "autumn", "trees", "path"],
    palette: palette([
      ["Morning Mist", "#e8ebe4"],
      ["Far Trees", "#b8bfae"],
      ["Gold Leaf", "#f0c45c"],
      ["Ochre", "#df9a46"],
      ["Russet", "#bf603b"],
      ["Burgundy", "#8c3a3e"],
      ["Birch White", "#f4f1eb"],
      ["Bark Charcoal", "#39383b"],
      ["Moss", "#7f8b4f"],
      ["Path Sand", "#dcc6a0"],
      ["Blue Shadow", "#a2afc1"],
      ["Forest Shade", "#55603f"],
    ]),
  },
  build(s) {
    const r = new Rand(37);
    s.background(1);
    for (const [x, y, rad] of [[120, 520, 120], [330, 470, 110], [560, 520, 130], [780, 470, 120], [240, 650, 100], [680, 660, 110]] as const) {
      s.add(blob(x, y, rad, r, { jitter: 0.25, n: 11 }), 2);
    }
    for (const [x, y, rad] of [[60, 780, 90], [420, 760, 110], [820, 790, 100]] as const) {
      s.add(blob(x, y, rad, r, { jitter: 0.25, n: 11, sy: 0.8 }), 12);
    }
    // Upper canopy: lobed leaf clusters, denser toward the top.
    const colours = [3, 4, 5, 3, 6, 4, 5, 3, 4];
    let k = 0;
    for (let row = 0; row < 5; row++) {
      const cols = 6 - (row > 2 ? 1 : 0);
      for (let col = 0; col < cols; col++) {
        const x = 20 + col * 180 + (row % 2) * 90 + r.jit(0, 40);
        const y = 10 + row * 125 + r.jit(0, 25);
        if (row >= 3 && r.next() < 0.35) continue;
        const rad = r.range(70, 104) * (row >= 3 ? 0.8 : 1);
        s.add(cluster(x, y, rad, r, { lobes: r.int(7, 10), depth: 0.14, sy: 0.82 }), colours[k++ % colours.length]);
      }
    }

    s.add(poly(closeDown(resampleSmooth([[0, 860], [250, 846], [500, 870], [700, 850], [900, 866]], 8), 1200)), 9);
    const left = resampleSmooth([[430, 872], [398, 930], [328, 1010], [250, 1100], [176, 1200]], 6);
    const right = resampleSmooth([[472, 872], [522, 940], [566, 1020], [640, 1110], [722, 1200]], 6);
    s.add(poly(between(left, right)), 10);

    const trunks: Array<[Pt, Pt, number, number]> = [
      [[130, 965], [112, -20], 54, 30],
      [[300, 905], [322, -20], 66, 36],
      [[560, 888], [546, -20], 46, 26],
      [[702, 925], [738, -20], 74, 40],
      [[842, 995], [852, -20], 40, 24],
    ];
    // Cast shadows first so trunks sit on top.
    for (const [[bx, by], , w0] of trunks) {
      s.add(poly([[bx - w0 * 0.45, by - 4], [bx + w0 * 0.45, by - 6], [bx + 300, by + 92], [bx + 270, by + 112]]), 11);
    }
    for (const [base, top, w0, w1] of trunks) {
      const midPt: Pt = [(base[0] + top[0]) / 2 + r.jit(0, 10), (base[1] + top[1]) / 2];
      s.add(stem([base, midPt, top], w0, w1), 7);
      // Bark marks: dark lenses biting in from alternating sides.
      const marks = Math.round((base[1] - top[1]) / 120);
      for (let m = 0; m < marks; m++) {
        const t = 0.08 + (m + r.range(0.1, 0.8)) * (0.86 / marks);
        const cx = base[0] + (top[0] - base[0]) * t;
        const cy = base[1] + (top[1] - base[1]) * t;
        const w = w0 + (w1 - w0) * t;
        const side = m % 2 ? 1 : -1;
        const off = side * w * 0.2;
        s.add(lens(cx + off - w * 0.27, cx + off + w * 0.27, cy, r.range(7, 10), 0, r.jit(0, 0.12)), 8);
      }
    }
    for (let i = 0; i < 16; i++) {
      const x = r.range(40, 860), y = r.range(900, 1170);
      s.add(blob(x, y, r.range(10, 16), r, { n: 7, jitter: 0.3, sx: 1.4 }), r.pick([3, 4, 5]));
    }
  },
};

export const harbourDusk: CanvasEntry = {
  meta: {
    id: "harbour-dusk",
    title: "Harbour at Dusk",
    description: "Sailboats drift home beneath a lighthouse as the evening sky turns to rose and amber.",
    category: "landscape",
    difficulty: "hard",
    width: 1200,
    height: 800,
    tags: ["sea", "lighthouse", "boats", "sunset", "coast"],
    palette: palette([
      ["Twilight", "#8f91bb"],
      ["Dusk Rose", "#e7b3a8"],
      ["Amber Glow", "#f2c98d"],
      ["Deep Indigo", "#434d78"],
      ["Sea Slate", "#5d7c9d"],
      ["Sea Light", "#a7bfd2"],
      ["Cliff Umber", "#8b6c56"],
      ["Cliff Shadow", "#5c4b45"],
      ["Lighthouse White", "#f3f0ea"],
      ["Signal Red", "#c3524e"],
      ["Sail Cream", "#efe2c6"],
      ["Boat Navy", "#2f3a56"],
      ["Grass Sage", "#93a47b"],
      ["Lamp Gold", "#f6d77b"],
    ]),
  },
  build(s) {
    const r = new Rand(53);
    s.background(1);
    s.add(poly(closeDown(wave(0, 1200, 228, 14, 800, 1), 800)), 2);
    s.add(poly(closeDown(wave(0, 1200, 362, 10, 1000, 0.3), 800)), 3);
    const wisps: Array<[number, number, number, number, number]> = [
      [60, 520, 118, 26, 2], [320, 760, 178, 22, 2], [640, 1150, 92, 28, 2], [820, 1200, 200, 20, 1],
      [20, 380, 300, 20, 3], [430, 900, 316, 22, 3], [700, 1100, 270, 18, 2], [100, 600, 410, 16, 2], [660, 1000, 432, 14, 2],
    ];
    for (const [x0, x1, y, t, n] of wisps) s.add(lens(x0, x1, y, t, r.jit(0, 4)), n);
    // Beams from the lantern.
    s.add(poly([[996, 183], [600, 118], [612, 214]]), 3);
    s.add(circle(380, 470, 46), 14);
    s.add(poly(closeDown(resampleSmooth([[0, 432], [80, 422], [160, 434], [240, 428], [330, 446], [420, 462], [480, 471]], 6), 474)), 4);

    s.add(rect(0, 470, 1200, 330), 5);
    // Wave streaks with perspective: longer and thicker toward the viewer.
    let y = 490;
    let row = 0;
    while (y < 790) {
      const depth = (y - 470) / 330;
      const len = 90 + depth * 260;
      const count = 2 + (row % 2);
      for (let c = 0; c < count; c++) {
        const x0 = r.range(-60, 760);
        s.add(lens(x0, x0 + len * r.range(0.7, 1.1), y + r.jit(0, 4), 8 + depth * 12, r.jit(0, 2)), (row + c) % 2 ? 4 : 6);
      }
      y += 20 + depth * 32;
      row++;
    }
    const glints: Array<[number, number, number]> = [[484, 96, 9], [502, 84, 9], [522, 72, 10], [545, 60, 10], [571, 48, 11]];
    for (const [gy, w, t] of glints) s.add(lens(380 - w / 2 + r.jit(0, 8), 380 + w / 2 + r.jit(0, 8), gy, t), 14);

    // Cliff
    s.add(poly([[740, 600], [790, 520], [840, 440], [900, 395], [980, 372], [1060, 360], [1140, 366], [1200, 355], [1200, 712], [1100, 692], [980, 664], [860, 642]]), 7);
    s.add(poly([[746, 598], [790, 524], [838, 448], [856, 502], [842, 580], [866, 638]]), 8);
    s.add(poly([[906, 402], [948, 390], [930, 470], [972, 560], [1010, 652], [930, 650], [900, 560], [915, 470]]), 8);
    s.add(poly([[1062, 366], [1100, 370], [1086, 452], [1120, 560], [1150, 690], [1100, 688], [1070, 562], [1060, 452]]), 8);
    s.add(poly([[838, 442], [900, 395], [980, 372], [1060, 360], [1140, 366], [1200, 355], [1200, 382], [1140, 392], [1060, 386], [980, 398], [906, 422], [852, 462]]), 13);

    // Lighthouse
    const towerBase = 368, towerTop = 212;
    const hw = (yy: number) => 20 + ((yy - towerTop) / (towerBase - towerTop)) * 11;
    const bands = [towerBase, 330, 292, 252, towerTop];
    for (let b = 0; b < 4; b++) {
      const y0 = bands[b + 1], y1 = bands[b];
      s.add(poly([[1010 - hw(y0), y0], [1010 + hw(y0), y0], [1010 + hw(y1), y1], [1010 - hw(y1), y1]]), b % 2 ? 10 : 9);
    }
    s.add(rect(984, 200, 52, 13), 12);
    s.add(rect(992, 166, 36, 34), 14);
    s.add(poly([[985, 168], [1035, 168], [1010, 138]]), 10);
    // Keeper's cottage
    s.add(rect(1062, 328, 74, 38), 9);
    s.add(poly([[1054, 331], [1144, 331], [1120, 305], [1078, 305]]), 10);
    s.add(rect(1074, 342, 14, 24), 12);
    s.add(rect(1104, 340, 18, 14), 14);

    s.add(blob(764, 640, 28, r, { sx: 1.4, sy: 0.8 }), 8);
    s.add(blob(722, 662, 18, r, { sx: 1.5, sy: 0.75 }), 8);
    s.add(blob(886, 690, 34, r, { sx: 1.5, sy: 0.7 }), 8);

    // Sailboats
    const boat = (x: number, yy: number, k: number, sail = 11) => {
      s.add(lens(x - 70 * k, x + 70 * k, yy + 34 * k, 14 * k), 4);
      s.add(poly([[x - 72 * k, yy], [x + 72 * k, yy], [x + 52 * k, yy + 22 * k], [x - 50 * k, yy + 22 * k]]), 12);
      s.add(poly([[x + 4 * k, yy - 4 * k], [x + 4 * k, yy - 132 * k], [x + 62 * k, yy - 8 * k]]), sail);
      s.add(poly([[x - 6 * k, yy - 4 * k], [x - 6 * k, yy - 112 * k], [x - 54 * k, yy - 8 * k]]), 11);
    };
    boat(220, 600, 1);
    boat(560, 536, 0.66);
    boat(660, 664, 1.2, 10);
  },
};
