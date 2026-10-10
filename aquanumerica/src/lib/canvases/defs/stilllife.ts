import { palette, type CanvasEntry } from "../entry";
import {
  Rand, blob, circle, closeDown, ellipse, ellipsePts, leafHalves, lens, outlineRun, place, poly, rect, resampleClosed,
  resampleSmooth, sector, smoothSharp, squash, stem, type Pt,
} from "../shapes";

// Unit pear outline: bulb centred on the origin, neck toward −y.
const PEAR: Pt[] = [
  [0, -1.75], [0.3, -1.68], [0.46, -1.38], [0.52, -0.98], [0.76, -0.56], [0.98, -0.06], [0.94, 0.44], [0.65, 0.84],
  [0, 1.0], [-0.65, 0.84], [-0.94, 0.44], [-0.98, -0.06], [-0.76, -0.56], [-0.52, -0.98], [-0.46, -1.38], [-0.3, -1.68],
];
/** Inner edge of the pear's shadow side, bottom → top. */
const PEAR_TERMINATOR: Pt[] = [[0.42, 0.6], [0.58, 0.1], [0.42, -0.5], [0.28, -0.98], [0.24, -1.4]];

export const pearsOnLinen: CanvasEntry = {
  meta: {
    id: "pears-on-linen",
    title: "Pears on Linen",
    description: "Three ripe pears rest on a soft linen cloth in quiet morning light.",
    category: "still-life",
    difficulty: "easy",
    width: 1200,
    height: 900,
    tags: ["fruit", "kitchen", "calm", "classic"],
    palette: palette([
      ["Wall Sage", "#dfe3d3"],
      ["Wall Shadow", "#c3c9b6"],
      ["Linen", "#f1ebdf"],
      ["Linen Fold", "#d9cfbd"],
      ["Pear Green", "#b9c66a"],
      ["Pear Blush", "#e09a62"],
      ["Pear Shadow", "#8a9a48"],
      ["Stem Brown", "#6d5440"],
      ["Cast Shadow", "#a9aec4"],
    ]),
  },
  build(s) {
    const r = new Rand(181);
    s.background(1);
    s.add(poly([[0, 0], [300, 0], [130, 560], [0, 560]]), 2);
    s.add(poly(closeDown(resampleSmooth([[0, 560], [400, 548], [800, 566], [1200, 552]], 8), 900)), 3);
    s.add(lens(60, 430, 694, 26, 8, 0.12), 4);
    s.add(lens(740, 1160, 724, 22, -6, -0.08), 4);
    s.add(lens(430, 690, 772, 18, 4), 4);
    s.add(poly(closeDown(resampleSmooth([[0, 800], [300, 812], [600, 796], [900, 816], [1200, 802]], 8), 900)), 4);
    s.add(ellipse(560, 632, 160, 30, 0.02), 9);
    s.add(ellipse(800, 684, 140, 26, 0.05), 9);
    s.add(ellipse(1010, 724, 120, 22), 9);

    const pear = (cx: number, cy: number, R: number, angle: number, withLeaf: boolean) => {
      const P = (pts: Pt[]) => place(pts.map(([x, y]) => [x * R, y * R] as Pt), cx, cy, angle);
      // Stem and leaf go first so the body overlaps their base.
      s.add(stem(P([[0, -1.6], [0.06, -2.0], [0.2, -2.25]]), R * 0.09, R * 0.05), 8);
      if (withLeaf) {
        const [lx, ly] = P([[0.12, -2.02]])[0];
        const [L, Rr] = leafHalves(lx, ly, angle - 0.55, R * 0.95, R * 0.42, 0.14);
        s.add(L, 5);
        s.add(Rr, 7);
      }
      const outline = resampleClosed(PEAR, 8);
      s.add(poly(P(outline)), 5);
      s.add(blob(...P([[-0.42, -0.08]])[0], R * 0.36, r, { n: 9, jitter: 0.15, sy: 1.2, rot: angle }), 6);
      const lit = outlineRun(outline, ([x, y]) => x > 0.12 && y < 0.99 && y > -1.7);
      s.add(poly(P([...lit, ...PEAR_TERMINATOR])), 7);
      s.add(ellipse(...P([[-0.5, -0.5]])[0], R * 0.1, R * 0.2, angle + 0.35), 3);
    };
    pear(436, 520, 104, -0.05, true);
    pear(712, 584, 90, 0.34, false);
    pear(960, 668, 72, 1.38, false);
  },
};

function lemonPts(cx: number, cy: number, rx: number, ry: number, angle: number): Pt[] {
  const base = ellipsePts(0, 0, rx, ry, 0, 18);
  // Extend the two ends into small nubs.
  base[0] = [rx * 1.16, 0];
  base[9] = [-rx * 1.16, 0];
  return place(base, cx, cy, angle);
}

export const lemonTea: CanvasEntry = {
  meta: {
    id: "lemon-tea",
    title: "Lemon Tea",
    description: "A teal teapot, a porcelain cup and sunny lemons on a striped tablecloth.",
    category: "still-life",
    difficulty: "medium",
    width: 1200,
    height: 900,
    tags: ["tea", "lemons", "kitchen", "cosy"],
    palette: palette([
      ["Wall Cream", "#f3ead9"],
      ["Wall Shade", "#dccfb8"],
      ["Cloth Blue", "#9fb7d1"],
      ["Cloth Stripe", "#f5f1e8"],
      ["Teapot Teal", "#5e9aa3"],
      ["Teapot Shade", "#3f6f7a"],
      ["Lemon", "#f4d24e"],
      ["Lemon Shade", "#d9a93a"],
      ["Pith", "#f8efc8"],
      ["Leaf Green", "#6f9a55"],
      ["Porcelain", "#f7f4ef"],
      ["Cast Shadow", "#a6a9b8"],
    ]),
  },
  build(s) {
    s.background(1);
    s.add(poly([[820, 0], [1200, 0], [1200, 600], [960, 600]]), 2);
    s.add(rect(0, 560, 1200, 340), 3);
    for (let i = -6; i <= 6; i++) {
      const xt = 600 + i * 112, xb = 600 + i * 172;
      s.add(poly([[xt - 13, 560], [xt + 13, 560], [xb + 20, 900], [xb - 20, 900]]), 4);
    }
    s.add(ellipse(470, 690, 214, 34), 12);
    s.add(ellipse(860, 694, 168, 28), 12);
    s.add(ellipse(326, 770, 120, 20), 12);
    s.add(ellipse(650, 806, 108, 18), 12);
    s.add(ellipse(1010, 840, 128, 20), 12);

    // Teapot
    s.add(poly(sector(612, 530, 68, 96, -1.45, 1.5, 18)), 6);
    s.add(stem([[356, 600], [296, 560], [254, 474], [226, 452]], 48, 22), 5);
    s.add(lens(208, 246, 450, 14, 0, -0.5), 6);
    const body = resampleClosed(ellipsePts(460, 560, 172, 132, 0, 24).map(([x, y]) => [x, Math.min(y, 676)] as Pt), 6);
    s.add(poly(body), 5);
    const shadeOuter = outlineRun(body, ([x]) => x > 548);
    s.add(poly([...shadeOuter, [556, 650], [584, 560], [560, 452]]), 6);
    s.add(ellipse(392, 512, 24, 46, -0.4), 11);
    s.add(poly([...ellipsePts(460, 432, 104, 26, 0, 20).filter(([, y]) => y <= 432), [356, 432], [564, 432]]), 6);
    const dome: Pt[] = [[362, 432]];
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI + (i / 12) * Math.PI;
      dome.push([460 + Math.cos(a) * 98, 432 + Math.sin(a) * 60]);
    }
    s.add(poly(dome), 5);
    s.add(ellipse(460, 432, 108, 18), 6);
    s.add(circle(460, 366, 20), 6);
    s.add(ellipse(460, 676, 118, 12), 6);

    // Cup and saucer
    s.add(ellipse(860, 690, 152, 34), 11);
    s.add(ellipse(860, 684, 98, 20), 2);
    s.add(poly(sector(948, 630, 22, 38, -1.6, 1.6, 14)), 11);
    s.add(smoothSharp([[766, 592], [790, 650], [826, 678], [894, 678], [930, 650], [954, 592]], [true, false, false, false, false, true], 0.5), 11);
    s.add(smoothSharp([[904, 600], [946, 594], [930, 650], [900, 672], [914, 640]], [false, true, false, false, false], 0.5), 2);
    s.add(ellipse(860, 592, 94, 20), 11);
    s.add(ellipse(860, 594, 82, 15), 8);

    // Lemons
    const lemon = (cx: number, cy: number, rx: number, ry: number, a: number) => {
      const out = resampleClosed(lemonPts(cx, cy, rx, ry, a), 6);
      s.add(poly(out), 7);
      // Shade along the lower edge, rotated with the fruit.
      const c = Math.cos(-a), sn = Math.sin(-a);
      const local = ([x, y]: Pt) => [(x - cx) * c - (y - cy) * sn, (x - cx) * sn + (y - cy) * c];
      const run = outlineRun(out, (p) => local(p)[1] > ry * 0.05);
      s.add(poly([...run, ...place([[-rx * 0.4, ry * 0.15], [0, ry * 0.42], [rx * 0.5, ry * 0.2]].reverse() as Pt[], cx, cy, a)]), 8);
    };
    lemon(300, 720, 92, 62, -0.15);
    s.add(ellipse(270, 700, 26, 12, -0.3), 9);
    const [L, R] = leafHalves(352, 668, -0.9, 122, 54, 0.12);
    s.add(L, 10);
    s.add(R, 6);
    lemon(632, 762, 80, 54, 0.25);

    // Cut lemon half
    const hx = 1004, hy = 792, k = 0.62;
    s.add(ellipse(hx, hy, 112, 112 * k), 8);
    s.add(ellipse(hx, hy, 100, 100 * k), 9);
    for (let i = 0; i < 10; i++) {
      const a0 = (i / 10) * Math.PI * 2 + 0.06, a1 = ((i + 1) / 10) * Math.PI * 2 - 0.06;
      const pts: Pt[] = [[hx + Math.cos((a0 + a1) / 2) * 10, hy + Math.sin((a0 + a1) / 2) * 10]];
      for (let j = 0; j <= 8; j++) {
        const a = a0 + ((a1 - a0) * j) / 8;
        pts.push([hx + Math.cos(a) * 88, hy + Math.sin(a) * 88]);
      }
      s.add(poly(squash(pts, hy, k)), 7);
    }
    s.add(ellipse(hx, hy, 12, 8), 9);
  },
};
