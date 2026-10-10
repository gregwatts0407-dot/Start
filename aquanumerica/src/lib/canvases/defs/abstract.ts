import { palette, type CanvasEntry } from "../entry";
import {
  Rand, between, centroid, circle, clipConvex, ellipsePts, petal, poly, sector, voronoi, wave, type Pt,
} from "../shapes";

export const rippleBands: CanvasEntry = {
  meta: {
    id: "ripple-bands",
    title: "Ripple Bands",
    description: "Flowing bands of sea and sand, interrupted by a warm sun and a cool moon.",
    category: "abstract",
    difficulty: "easy",
    width: 1200,
    height: 800,
    tags: ["waves", "modern", "sun", "relaxing"],
    palette: palette([
      ["Mist", "#e6eef1"],
      ["Aqua", "#a9d3d0"],
      ["Teal", "#5fa3a3"],
      ["Deep Teal", "#2f6f7a"],
      ["Sand", "#f1dcb5"],
      ["Coral", "#ef9a7a"],
      ["Rose", "#d36b6b"],
      ["Plum", "#7c4a6b"],
    ]),
  },
  build(s) {
    const bands = 9;
    const lines: Pt[][] = [wave(-20, 1220, -20, 0, 1000)];
    for (let k = 1; k < bands; k++) {
      lines.push(wave(-20, 1220, (k * 800) / bands, 24 + (k % 3) * 6, 560 + k * 46, k * 0.8, 40));
    }
    lines.push(wave(-20, 1220, 820, 0, 1000));
    const polys = Array.from({ length: bands }, (_, k) => between(lines[k], lines[k + 1]));
    const cool = [1, 2, 3, 4, 3, 2, 1, 2, 3];
    const warm = [5, 6, 7, 8, 7, 6, 5, 6, 7];
    const moonish = [8, 7, 6, 5, 6, 7, 8, 7, 6];
    polys.forEach((p, k) => s.add(poly(p), cool[k]));
    const sun = ellipsePts(800, 330, 220, 220, 0, 72);
    const moon = ellipsePts(250, 560, 132, 132, 0, 60);
    polys.forEach((p, k) => {
      const c = clipConvex(p, sun);
      if (c.length > 2) s.add(poly(c), warm[k]);
    });
    polys.forEach((p, k) => {
      const c = clipConvex(p, moon);
      if (c.length > 2) s.add(poly(c), moonish[k]);
    });
  },
};

export const shardsOfSpring: CanvasEntry = {
  meta: {
    id: "shards-of-spring",
    title: "Shards of Spring",
    description: "A stained-glass mosaic of blossom pinks, butter yellows and fresh greens.",
    category: "abstract",
    difficulty: "medium",
    width: 1200,
    height: 900,
    tags: ["mosaic", "geometric", "spring", "stained glass"],
    palette: palette([
      ["Petal Pink", "#f4c2c9"],
      ["Blossom", "#e98fa3"],
      ["Lilac", "#c4b3de"],
      ["Butter", "#f6e3a1"],
      ["Sunlit", "#f2c66d"],
      ["Fresh Green", "#b5d18c"],
      ["Leaf", "#7fae6a"],
      ["Teal Mist", "#a4d1cb"],
      ["Sky", "#b9d3ec"],
      ["Cream", "#f8f3e7"],
    ]),
  },
  build(s) {
    const r = new Rand(211);
    const sites: Pt[] = [];
    // Jittered grid gives even, pleasing shard sizes.
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 9; x++) {
        sites.push([(x + 0.5) * (1200 / 9) + r.jit(0, 45), (y + 0.5) * (900 / 7) + r.jit(0, 40)]);
      }
    }
    const cells = voronoi(sites, 1200, 900, 2);
    const focus: Pt = [380, 300];
    const rings = [[5, 4], [4, 10, 1], [1, 2], [2, 3], [3, 9], [9, 8], [8, 6], [6, 7]];
    s.background(10);
    cells.forEach((cell) => {
      if (cell.length < 3) return;
      const c = centroid(cell);
      const d = Math.hypot(c[0] - focus[0], (c[1] - focus[1]) * 1.15) / 1050;
      const greenPull = Math.max(0, (c[1] - 560) / 340) * 0.35;
      const idx = Math.min(rings.length - 1, Math.max(0, Math.floor((d + greenPull) * rings.length + r.jit(0, 0.6))));
      s.add(poly(cell), r.pick(rings[idx]));
    });
  },
};

export const tidalMandala: CanvasEntry = {
  meta: {
    id: "tidal-mandala",
    title: "Tidal Mandala",
    description: "Concentric rings of petals and pearls in sea-glass blues with coral accents.",
    category: "abstract",
    difficulty: "hard",
    width: 1000,
    height: 1000,
    tags: ["mandala", "symmetry", "meditative", "ocean"],
    palette: palette([
      ["Sea Foam", "#e4f0ec"],
      ["Aqua", "#a6d5cf"],
      ["Lagoon", "#5fa7a8"],
      ["Deep Sea", "#2e6577"],
      ["Navy Ink", "#27405a"],
      ["Sand", "#efdcb8"],
      ["Coral", "#ec9478"],
      ["Shell Pink", "#f3c3bd"],
      ["Sunset Gold", "#f2c461"],
      ["Kelp", "#6f9b6e"],
      ["Lilac", "#b9a6d4"],
      ["Pearl", "#f8f4ec"],
    ]),
  },
  build(s) {
    const cx = 500, cy = 500;
    const TAU = Math.PI * 2;
    s.background(1);
    // Corner fans.
    for (const [x, y, a0] of [[0, 0, 0], [1000, 0, Math.PI / 2], [1000, 1000, Math.PI], [0, 1000, -Math.PI / 2]] as const) {
      for (let k = 0; k < 3; k++) {
        s.add(poly(sector(x, y, 60 + k * 70, 110 + k * 70, a0, a0 + Math.PI / 2, 16)), [2, 3, 10][k]);
      }
    }
    // Scalloped outer edge.
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      s.add(circle(cx + Math.cos(a) * 432, cy + Math.sin(a) * 432, 36), i % 2 ? 2 : 3);
    }
    s.add(circle(cx, cy, 418), 6);
    for (let i = 0; i < 16; i++) s.add(petal(cx, cy, (i / 16) * TAU, 400, 122, 0.15), i % 2 ? 8 : 7);
    for (let i = 0; i < 16; i++) s.add(petal(cx, cy, ((i + 0.5) / 16) * TAU, 330, 92, 0.2), 11);
    s.add(circle(cx, cy, 214), 4);
    for (let i = 0; i < 12; i++) s.add(petal(cx, cy, ((i + 0.5) / 12) * TAU, 200, 104, 0.85), i % 2 ? 2 : 3);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      s.add(circle(cx + Math.cos(a) * 168, cy + Math.sin(a) * 168, 11), 12);
    }
    s.add(circle(cx, cy, 128), 5);
    for (let i = 0; i < 8; i++) s.add(petal(cx, cy, (i / 8) * TAU, 120, 72, 0.4), 9);
    for (let i = 0; i < 8; i++) s.add(petal(cx, cy, ((i + 0.5) / 8) * TAU, 84, 46, 0.4), 7);
    s.add(circle(cx, cy, 42), 12);
    s.add(circle(cx, cy, 20), 7);
  },
};
