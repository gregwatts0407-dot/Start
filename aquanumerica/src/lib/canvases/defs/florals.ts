import { palette, type CanvasEntry } from "../entry";
import {
  Rand, circle, closeDown, cluster, ellipse, leafHalves, lens, petal, petalPts, poly, resampleSmooth, smoothSharp,
  squash, star, smooth, stem, type Pt,
} from "../shapes";

export const wildPoppies: CanvasEntry = {
  meta: {
    id: "wild-poppies",
    title: "Wild Poppies",
    description: "Scarlet poppies and cornflowers nod in a breezy summer meadow.",
    category: "floral",
    difficulty: "easy",
    width: 1200,
    height: 800,
    tags: ["meadow", "summer", "red", "flowers"],
    palette: palette([
      ["Summer Sky", "#d3e3ee"],
      ["Cloud", "#f7f5f0"],
      ["Meadow Haze", "#c9d8ab"],
      ["Grass", "#92b06c"],
      ["Deep Grass", "#5f8250"],
      ["Poppy Red", "#dd4b3c"],
      ["Poppy Shade", "#a63530"],
      ["Poppy Heart", "#322c2d"],
      ["Cornflower", "#7290d0"],
    ]),
  },
  build(s) {
    const r = new Rand(71);
    s.background(1);
    s.add(cluster(250, 130, 60, r, { lobes: 7, depth: 0.12, sx: 2.2, sy: 0.9 }), 2);
    s.add(cluster(880, 105, 50, r, { lobes: 7, depth: 0.12, sx: 2.4, sy: 0.85 }), 2);
    s.add(cluster(610, 220, 30, r, { lobes: 6, depth: 0.12, sx: 2.2, sy: 0.8 }), 2);
    s.add(poly(closeDown(resampleSmooth([[0, 400], [200, 370], [420, 395], [640, 372], [880, 398], [1200, 380]], 8), 800)), 3);
    s.add(poly(closeDown(resampleSmooth([[0, 500], [260, 470], [520, 495], [800, 468], [1000, 488], [1200, 470]], 8), 800)), 4);

    const poppies: Array<[number, number, number, number]> = [
      [300, 468, 84, -0.15], [572, 560, 108, 0.1], [832, 450, 70, 0.2], [1012, 608, 94, -0.1], [168, 652, 62, 0.15],
    ];
    // Stems first so flowers sit on top.
    for (const [cx, cy, R] of poppies) {
      s.add(stem([[cx, cy + R * 0.2], [cx + r.jit(0, 30), (cy + 800) / 2], [cx + r.jit(0, 40), 812]], 9, 13), 5);
    }
    // Drooping buds.
    s.add(stem([[700, 812], [690, 520], [720, 390], [748, 372]], 7, 9), 5);
    s.add(ellipse(758, 392, 22, 32, -0.5), 5);
    s.add(lens(746, 774, 398, 12, 0, 1.0), 6);
    s.add(stem([[440, 812], [430, 600], [400, 520], [378, 512]], 7, 9), 5);
    s.add(ellipse(368, 530, 20, 30, 0.45), 5);

    // Foreground grass with spiky tufts.
    const front: Pt[] = [];
    for (let x = -20, i = 0; x <= 1220; x += 22, i++) {
      front.push([x, 708 + 10 * Math.sin(x / 90) - (i % 2 ? r.range(22, 46) : 0)]);
    }
    s.add(poly(closeDown(front, 800)), 5);

    for (const [cx, cy, R, tilt] of poppies) {
      const up = -Math.PI / 2;
      s.add(petal(cx, cy, up - 0.72 + tilt, R, R * 1.22, 1, 0.7, r), 7);
      s.add(petal(cx, cy, up + 0.72 + tilt, R, R * 1.22, 1, 0.7, r), 7);
      s.add(petal(cx, cy, -up - 0.78 + tilt, R * 1.04, R * 1.3, 1, 0.7, r), 6);
      s.add(petal(cx, cy, -up + 0.78 + tilt, R * 1.04, R * 1.3, 1, 0.7, r), 6);
      s.add(smooth(star(cx, cy - R * 0.04, R * 0.24, R * 0.14, 6, tilt)), 8);
    }
    for (const [x, y, rad] of [[120, 560, 20], [470, 640, 22], [690, 690, 18], [910, 540, 20], [1130, 520, 18], [380, 560, 16]] as const) {
      s.add(smooth(star(x, y, rad, rad * 0.5, 7, r.next())), 9);
    }
  },
};

export const peonyBloom: CanvasEntry = {
  meta: {
    id: "peony-bloom",
    title: "Peony Bloom",
    description: "A lavish garden peony unfurls its blush petals among soft green leaves.",
    category: "floral",
    difficulty: "medium",
    width: 1000,
    height: 1000,
    tags: ["peony", "pink", "garden", "botanical"],
    palette: palette([
      ["Cream Ground", "#f6ede0"],
      ["Sage Wash", "#cdd9c3"],
      ["Petal Blush", "#f7cdd2"],
      ["Rose", "#ee9fae"],
      ["Deep Rose", "#cd6680"],
      ["Raspberry", "#a03f60"],
      ["Stamen Gold", "#f1c766"],
      ["Leaf", "#82a66d"],
      ["Deep Leaf", "#4f7556"],
      ["Bud Green", "#a9c48a"],
      ["Lilac Mist", "#d8cde7"],
    ]),
  },
  build(s) {
    const r = new Rand(83);
    s.background(1);
    s.add(cluster(190, 210, 190, r, { lobes: 6, depth: 0.1 }), 2);
    s.add(cluster(830, 800, 220, r, { lobes: 6, depth: 0.1 }), 2);
    s.add(cluster(840, 160, 140, r, { lobes: 6, depth: 0.1 }), 11);
    s.add(cluster(140, 830, 130, r, { lobes: 6, depth: 0.1 }), 11);

    s.add(stem([[540, 560], [480, 790], [400, 1020]], 22, 30), 9);
    s.add(stem([[476, 760], [340, 560], [236, 352]], 12, 9), 9);
    const leaves: Array<[number, number, number, number, number]> = [
      [520, 700, 2.25, 250, 116],
      [548, 690, 0.85, 270, 124],
      [470, 730, 3.25, 230, 104],
      [612, 650, 0.12, 250, 112],
      [440, 790, 1.95, 210, 92],
      [350, 580, -2.3, 160, 74],
    ];
    for (const [x, y, a, len, w] of leaves) {
      const [L, R] = leafHalves(x, y, a, len, w, 0.12);
      s.add(L, 8);
      s.add(R, 9);
    }
    // Bud
    s.add(circle(232, 322, 50), 4);
    s.add(petal(232, 322, -Math.PI / 2, 46, 42, 0.6), 3);
    for (const a of [1.2, 2.0, 2.9]) s.add(petal(232, 360, a, 62, 30, 0.2), 10);

    // The bloom, viewed slightly from the side.
    const cx = 540, cy = 470;
    const layer = (count: number, len: number, width: number, n: number, offset: number) => {
      for (let i = 0; i < count; i++) {
        const a = offset + (i / count) * Math.PI * 2 + r.jit(0, 0.12);
        const pts = squash(petalPts(cx, cy, a, len * r.range(0.92, 1.06), width, 1, 1.4, r), cy, 0.86);
        s.add(smoothSharp(pts, pts.map((_, k) => k === 0)), n);
      }
    };
    layer(10, 300, 250, 3, 0.1);
    layer(9, 236, 206, 4, 0.45);
    layer(8, 172, 158, 5, 0.2);
    layer(6, 112, 118, 6, 0.6);
    s.add(cluster(cx, cy, 34, r, { lobes: 8, depth: 0.25 }), 7);
  },
};

export const sunflowerTrio: CanvasEntry = {
  meta: {
    id: "sunflower-trio",
    title: "Sunflower Trio",
    description: "Three sunflowers turn their golden faces to a high summer sky.",
    category: "floral",
    difficulty: "medium",
    width: 1000,
    height: 1000,
    tags: ["sunflower", "yellow", "summer", "field"],
    palette: palette([
      ["Summer Sky", "#bcd9ee"],
      ["Cloud", "#f6f4ef"],
      ["Sun Yellow", "#f6c445"],
      ["Marigold", "#e8992f"],
      ["Seed Brown", "#74502f"],
      ["Seed Dark", "#3f2d22"],
      ["Stem Green", "#6f9b50"],
      ["Leaf Shade", "#4d7a45"],
      ["Field", "#a9c47e"],
      ["Distant Hills", "#8fb0b8"],
    ]),
  },
  build(s) {
    const r = new Rand(97);
    s.background(1);
    s.add(cluster(770, 150, 64, r, { lobes: 7, depth: 0.14, sx: 2, sy: 0.85 }), 2);
    s.add(cluster(200, 120, 46, r, { lobes: 6, depth: 0.14, sx: 2.2, sy: 0.8 }), 2);
    s.add(poly(closeDown(resampleSmooth([[0, 690], [250, 660], [520, 690], [780, 650], [1000, 680]], 8), 1000)), 10);
    s.add(poly(closeDown(resampleSmooth([[0, 770], [300, 748], [600, 772], [1000, 746]], 8), 1000)), 9);

    s.add(stem([[420, 440], [446, 720], [430, 1010]], 28, 34), 7);
    s.add(stem([[760, 600], [774, 820], [782, 1010]], 22, 26), 7);
    s.add(stem([[200, 720], [188, 870], [204, 1010]], 18, 22), 7);
    const leaves: Array<[number, number, number, number, number]> = [
      [442, 640, 2.6, 200, 124], [446, 720, 0.45, 220, 130],
      [772, 790, 0.35, 176, 104], [770, 856, 2.75, 166, 98],
      [192, 866, 0.25, 136, 84],
    ];
    for (const [x, y, a, len, w] of leaves) {
      const [L, R] = leafHalves(x, y, a, len, w, 0.16);
      s.add(L, 7);
      s.add(R, 8);
    }

    const flower = (cx: number, cy: number, R: number, n: number) => {
      const step = (Math.PI * 2) / n;
      for (let i = 0; i < n; i++) s.add(petal(cx, cy, i * step + step / 2 + r.jit(0, 0.05), R * r.range(0.96, 1.04), R * 0.4, 0.25), 4);
      for (let i = 0; i < n; i++) s.add(petal(cx, cy, i * step + r.jit(0, 0.05), R * r.range(0.88, 0.95), R * 0.37, 0.3), 3);
      s.add(circle(cx, cy, R * 0.43), 5);
      s.add(circle(cx, cy, R * 0.27), 6);
    };
    flower(200, 700, 92, 10);
    flower(760, 560, 122, 12);
    flower(420, 380, 172, 14);
  },
};
