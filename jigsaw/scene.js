/*
 * "Cottage garden in late spring" - the puzzle picture.
 *
 * The picture is painted procedurally onto a canvas, so the game ships no image
 * files. Every random choice comes from a seeded generator, so the same seed
 * always paints the same picture.
 *
 * Composition (2400 x 1920):
 *   - a strip of sky above the roof line
 *   - a brick cottage with a clay-tile roof, dormers, a green door and a
 *     climbing rose round the door; wisteria on the left of the facade
 *   - a dry-stone wall across the middle with an open five-bar timber gate
 *   - a gravel path from the bottom edge through the gateway to the door
 *   - beds either side that shift from cool purples and blues (left) to warm
 *     pinks and yellows (right)
 *   - an old tree framing the left edge and a potting bench in the lower right
 */
(function (root) {
  'use strict';

  const W = 2400;
  const H = 1920;
  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------------------
  // Random numbers and noise
  // ---------------------------------------------------------------------------

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createNoise(rng) {
    const perm = new Uint8Array(512);
    const vals = new Float32Array(256);
    const p = [];
    for (let i = 0; i < 256; i++) { p.push(i); vals[i] = rng(); }
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const lattice = (ix, iy) => vals[perm[(ix & 255) + perm[iy & 255]]];
    const fade = (t) => t * t * (3 - 2 * t);
    function noise(x, y) {
      const ix = Math.floor(x), iy = Math.floor(y);
      const fx = x - ix, fy = y - iy;
      const a = lattice(ix, iy), b = lattice(ix + 1, iy);
      const c = lattice(ix, iy + 1), d = lattice(ix + 1, iy + 1);
      const u = fade(fx), v = fade(fy);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    function fbm(x, y, octaves = 4) {
      let sum = 0, amp = 0.5, freq = 1, norm = 0;
      for (let i = 0; i < octaves; i++) {
        sum += amp * noise(x * freq, y * freq);
        norm += amp;
        amp *= 0.5;
        freq *= 2.03;
      }
      return sum / norm;
    }
    return { noise, fbm };
  }

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const hsl = (h, s, l, a = 1) =>
    `hsla(${Math.round(h)},${clamp(Math.round(s), 0, 100)}%,${clamp(Math.round(l), 0, 100)}%,${a})`;

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------

  const ROOF = { ridgeY: 236, eaveY: 566, ridgeL: 668, ridgeR: 1732, eaveL: 532, eaveR: 1868 };
  const HOUSE = { x0: 590, x1: 1810, y0: 566, y1: 1222 };
  const DOOR = { x0: 1124, x1: 1276, y0: 778, y1: 1206 };
  const WINDOWS = [
    { x0: 700, x1: 962, y0: 764, y1: 994, box: 'cool' },
    { x0: 1438, x1: 1700, y0: 764, y1: 994, box: 'warm' },
  ];
  const DORMERS = [{ cx: 884 }, { cx: 1516 }];
  const CHIMNEY = { x0: 1588, x1: 1692, y0: 112, y1: 300 };
  const WALL = { top: 1138, base: 1338, gapL: 1082, gapR: 1318 };
  const GATE = { x0: 806, x1: 1046, top: 1150, bottom: 1326 };
  const PATH = { stepY: 1224, topY: 1338, gateL: 1110, gateR: 1290, topL: 1088, topR: 1312, botL: 772, botR: 1628 };
  const BENCH = { x0: 1738, x1: 2352, back: 1490, front: 1532, floor: 1888 };
  const TREE_BASE_Y = 1660;

  const pathL = (y) =>
    y < PATH.topY
      ? lerp(PATH.gateL, PATH.topL, (y - PATH.stepY) / (PATH.topY - PATH.stepY))
      : lerp(PATH.topL, PATH.botL, (y - PATH.topY) / (H - PATH.topY));
  const pathR = (y) =>
    y < PATH.topY
      ? lerp(PATH.gateR, PATH.topR, (y - PATH.stepY) / (PATH.topY - PATH.stepY))
      : lerp(PATH.topR, PATH.botR, (y - PATH.topY) / (H - PATH.topY));
  // Perspective scale for things standing in the beds.
  const depth = (y) => lerp(0.5, 1.32, clamp((y - 1250) / (H - 1250), 0, 1));

  // ---------------------------------------------------------------------------
  // Painter
  // ---------------------------------------------------------------------------

  function paintScene(canvas, options = {}) {
    const seed = options.seed ?? 52126;
    const onProgress = options.onProgress || (() => {});
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const rng = mulberry32(seed);
    const { noise, fbm } = createNoise(mulberry32(seed ^ 0x9e3779b9));

    const rand = (a, b) => a + (b - a) * rng();
    const jit = (v) => (rng() - 0.5) * 2 * v;
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];

    // 0 on the cool left, 1 on the warm right, with a wavering boundary.
    const warmthAt = (x, y = 1500) =>
      smoothstep(0.24 * W, 0.76 * W, x + (fbm(x / 340, y / 340 + 7.3, 3) - 0.5) * 380);

    // --- primitives -----------------------------------------------------------

    function dot(x, y, r, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.3, r), 0, TAU);
      ctx.fill();
    }

    function dab(x, y, rx, ry, rot, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(x, y, Math.max(0.3, rx), Math.max(0.3, ry), rot, 0, TAU);
      ctx.fill();
    }

    function line(x1, y1, x2, y2, width, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    function curve(x1, y1, cx, cy, x2, y2, width, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(cx, cy, x2, y2);
      ctx.stroke();
    }

    function poly(points, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
      ctx.closePath();
      ctx.fill();
    }

    // An irregular rounded blob through jittered points round an ellipse.
    function blobPath(cx, cy, rx, ry, wobble, n = 9) {
      const pts = [];
      const off = rng() * TAU;
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * TAU;
        const k = 1 + jit(wobble);
        pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
      }
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const p = pts[i], q = pts[(i + 1) % n];
        const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
        if (i === 0) {
          const prev = pts[n - 1];
          ctx.moveTo((prev[0] + p[0]) / 2, (prev[1] + p[1]) / 2);
        }
        ctx.quadraticCurveTo(p[0], p[1], mx, my);
      }
      ctx.closePath();
    }

    function blob(cx, cy, rx, ry, color, wobble = 0.25) {
      blobPath(cx, cy, rx, ry, wobble);
      ctx.fillStyle = color;
      ctx.fill();
    }

    // A mass of leaves. Darker leaves are drawn first and sunlit ones last, with
    // the light coming from the upper left, which gives each mass some volume.
    function foliage(cx, cy, rx, ry, o) {
      const size = o.size || 6;
      const n = o.count ?? Math.round(((rx * ry) / (size * size)) * (o.density ?? 1.7));
      const contrast = o.contrast ?? 12;
      if (o.base !== false) {
        for (let i = 0; i < 4; i++) {
          blob(cx + jit(rx * 0.2), cy + jit(ry * 0.15), rx * rand(0.7, 0.95), ry * rand(0.7, 0.95),
            hsl(o.h, o.s, o.l - contrast - 6, 0.9), 0.3);
        }
      }
      const leaves = [];
      for (let i = 0; i < n; i++) {
        const a = rng() * TAU;
        const r = Math.sqrt(rng());
        const dx = Math.cos(a) * r, dy = Math.sin(a) * r;
        const lit = -dy * 0.65 - dx * 0.35 + jit(0.35);
        leaves.push([cx + dx * rx, cy + dy * ry, lit]);
      }
      leaves.sort((p, q) => p[2] - q[2]);
      const hj = o.hj ?? 14;
      const aspect = o.aspect ?? 0.5;
      for (const [x, y, lit] of leaves) {
        const sz = size * rand(0.6, 1.25);
        dab(x, y, sz, sz * aspect, o.rot ?? rng() * TAU,
          hsl(o.h + jit(hj / 2), o.s + jit(8), o.l + lit * contrast + jit(5)));
      }
    }

    // Small scattered flowers over the top of a mound.
    function sprinkle(cx, cy, rx, ry, n, r, colorFn) {
      for (let i = 0; i < n; i++) {
        const a = rng() * TAU;
        const d = Math.sqrt(rng());
        const dy = Math.sin(a) * d;
        const x = cx + Math.cos(a) * d * rx;
        const y = cy + dy * ry - ry * 0.15;
        dot(x, y, r * rand(0.7, 1.2), colorFn(-dy));
      }
    }

    function roseBloom(x, y, r, h, s, l) {
      dot(x + r * 0.18, y + r * 0.24, r * 1.05, hsl(h, s * 0.6, l - 34, 0.45));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + rng() * 0.6;
        dab(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.4, r * 0.58, r * 0.44, a,
          hsl(h + jit(4), s, l - 8 + rng() * 8));
      }
      dot(x, y, r * 0.64, hsl(h, s, l));
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = hsl(h, s + 6, l - 20 - i * 3, 0.75);
        ctx.lineWidth = Math.max(0.6, r * 0.1);
        ctx.beginPath();
        const st = rng() * TAU;
        ctx.arc(x + jit(r * 0.1), y + jit(r * 0.1), r * (0.16 + i * 0.15), st, st + 2.6);
        ctx.stroke();
      }
      dab(x - r * 0.24, y - r * 0.3, r * 0.28, r * 0.15, -0.6, hsl(h, s - 10, Math.min(97, l + 15), 0.85));
    }

    function daisy(x, y, r, petal, centre, n = 12) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + jit(0.15);
        dab(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.42, r * 0.5, r * 0.17, a, petal);
      }
      dot(x, y, r * 0.3, centre);
    }

    function leafShape(x, y, len, wid, angle, color, vein) {
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const tx = x + cos * len, ty = y + sin * len;
      const nx = -sin * wid, ny = cos * wid;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + cos * len * 0.5 + nx, y + sin * len * 0.5 + ny, tx, ty);
      ctx.quadraticCurveTo(x + cos * len * 0.5 - nx, y + sin * len * 0.5 - ny, x, y);
      ctx.fill();
      if (vein) line(x, y, tx - cos * len * 0.15, ty - sin * len * 0.15, Math.max(0.5, wid * 0.12), vein);
    }

    // --- stages -----------------------------------------------------------------

    function paintSky() {
      const g = ctx.createLinearGradient(0, 0, 0, 520);
      g.addColorStop(0, hsl(208, 58, 66));
      g.addColorStop(0.45, hsl(203, 55, 78));
      g.addColorStop(1, hsl(196, 45, 88));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, 700);
      // Soft clouds, built from many faint puffs.
      const clouds = [[420, 70, 260], [980, 120, 300], [1420, 60, 230], [2020, 110, 320], [2350, 40, 150]];
      for (const [cx, cy, size] of clouds) {
        for (let i = 0; i < 70; i++) {
          const x = cx + jit(size);
          const y = cy + jit(size * 0.18) - Math.abs(x - cx) * -0.04;
          const r = rand(28, 70) * (1 - Math.abs(x - cx) / (size * 1.6));
          if (r <= 4) continue;
          const g2 = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
          g2.addColorStop(0, 'rgba(255,255,255,0.55)');
          g2.addColorStop(0.6, 'rgba(250,251,255,0.22)');
          g2.addColorStop(1, 'rgba(240,244,250,0)');
          ctx.fillStyle = g2;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, TAU);
          ctx.fill();
        }
        // Shaded undersides.
        for (let i = 0; i < 18; i++) {
          dab(cx + jit(size * 0.8), cy + size * 0.12 + jit(10), rand(30, 70), rand(6, 12), 0,
            'rgba(150,165,190,0.06)');
        }
      }
      // A few birds.
      ctx.lineCap = 'round';
      for (const [bx, by, s] of [[1240, 96, 9], [1272, 82, 7], [1300, 104, 6]]) {
        ctx.strokeStyle = 'rgba(60,64,72,0.65)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(bx - s, by);
        ctx.quadraticCurveTo(bx - s / 2, by - s * 0.6, bx, by);
        ctx.quadraticCurveTo(bx + s / 2, by - s * 0.6, bx + s, by);
        ctx.stroke();
      }
    }

    function paintDistantTrees() {
      // A soft, slightly blue band of far trees behind the cottage.
      for (let x = -80; x < W + 80; x += rand(70, 130)) {
        const top = 170 + fbm(x / 260, 1.7) * 160 + (x > 600 && x < 1800 ? 70 : 0);
        const r = rand(90, 170);
        foliage(x, top + r * 0.9, r, r * 0.9, {
          h: 128 + jit(10), s: 18, l: 52, size: 9, density: 0.9, contrast: 9, base: true,
        });
      }
      // Fill the band down to the wall so nothing shows through.
      ctx.fillStyle = hsl(120, 18, 38);
      ctx.fillRect(0, 520, W, WALL.top + 20 - 520);
    }

    function paintSideGardens() {
      // Left: lilac and a ceanothus behind the wall.
      foliage(470, 520, 230, 220, { h: 112, s: 26, l: 40, size: 10, density: 1.4 });
      for (let i = 0; i < 40; i++) {
        const x = rand(280, 640), y = rand(330, 680);
        const r = rand(10, 18);
        for (let k = 0; k < 26; k++) {
          const a = rng() * TAU, d = Math.sqrt(rng());
          dot(x + Math.cos(a) * d * r * 0.7, y + Math.sin(a) * d * r * 1.3 - r * 0.2, rand(2, 3.4),
            hsl(275 + jit(10), 40, 60 + (-Math.sin(a) * d) * 10 + jit(5)));
        }
      }
      // Dense shrubs at the far left, mostly behind the tree trunk.
      for (const [cx, cy, r] of [[60, 470, 150], [150, 640, 170], [40, 820, 160], [250, 760, 150], [120, 1020, 180]]) {
        foliage(cx, cy, r, r * 0.85, { h: 122 + jit(8), s: 26, l: 33, size: 8, density: 1.6 });
      }
      foliage(420, 920, 260, 220, { h: 130, s: 28, l: 32, size: 8, density: 1.8 });
      sprinkle(420, 900, 240, 190, 1800, 2.6, (lit) => hsl(222 + jit(10), 62, 56 + lit * 12 + jit(6)));
      foliage(170, 1000, 220, 190, { h: 118, s: 25, l: 34, size: 8, density: 1.6 });

      // Right: a laburnum with hanging yellow chains, over a pink weigela.
      for (const [cx, cy, rx, ry] of [[2330, 300, 170, 170], [2080, 300, 190, 150], [2230, 520, 230, 170],
        [1960, 470, 150, 140], [2400, 640, 140, 200], [2120, 620, 160, 120]]) {
        foliage(cx, cy, rx, ry, { h: 92 + jit(6), s: 32, l: 41, size: 9, density: 1.5, contrast: 13 });
      }
      for (let i = 0; i < 95; i++) {
        const x = rand(1860, 2420), y = rand(200, 700);
        const len = rand(45, 95);
        const sway = jit(0.25);
        for (let k = 0; k < 20; k++) {
          const t = k / 19;
          const w = (1 - t) * 7 + 2;
          const px = x + Math.sin(sway + t) * 6 * t + jit(w);
          dab(px, y + t * len, rand(2.4, 3.6) * (1 - t * 0.4), rand(1.8, 2.6), jit(0.5),
            hsl(50 + jit(5), 88, 54 + (1 - t) * 4 + (px < x ? 8 : -4) + jit(5)));
        }
      }
      for (const [cx, cy, rx, ry] of [[2050, 900, 190, 150], [2280, 860, 200, 170], [2160, 1040, 260, 120], [2400, 1000, 120, 150]]) {
        foliage(cx, cy, rx, ry, { h: 110 + jit(6), s: 28, l: 33, size: 8, density: 1.7 });
        sprinkle(cx, cy, rx * 0.9, ry * 0.85, Math.round(rx * ry * 0.018), 3, (lit) => hsl(338 + jit(8), 55, 64 + lit * 12 + jit(6)));
      }
      for (const [cx, cy, r] of [[1890, 640, 120], [1940, 780, 130], [1880, 1000, 130]]) {
        foliage(cx, cy, r, r, { h: 118 + jit(8), s: 26, l: 31, size: 7, density: 1.6 });
      }
    }

    function paintRoof() {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(ROOF.ridgeL, ROOF.ridgeY);
      ctx.lineTo(ROOF.ridgeR, ROOF.ridgeY);
      ctx.lineTo(ROOF.eaveR, ROOF.eaveY);
      ctx.lineTo(ROOF.eaveL, ROOF.eaveY);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = hsl(12, 30, 18);
      ctx.fillRect(ROOF.eaveL, ROOF.ridgeY, ROOF.eaveR - ROOF.eaveL, ROOF.eaveY - ROOF.ridgeY);
      const th = 22, tw = 30;
      let row = 0;
      for (let y = ROOF.ridgeY - 4; y < ROOF.eaveY; y += th, row++) {
        const off = (row % 2) * tw * 0.5;
        for (let x = ROOF.eaveL - tw + off; x < ROOF.eaveR + tw; x += tw) {
          const age = fbm(x / 160, y / 120, 3);
          const h = 14 + jit(5) + (age - 0.5) * 10;
          const l = 38 + jit(6) - (age - 0.5) * 14;
          ctx.fillStyle = hsl(h, 48 + jit(8), l);
          ctx.fillRect(x + 1, y, tw - 2, th + 3);
          // Lighter lower lip and a shadow cast by the row above.
          ctx.fillStyle = hsl(h, 40, l + 8, 0.6);
          ctx.fillRect(x + 1, y + th - 2, tw - 2, 3);
          const g = ctx.createLinearGradient(0, y, 0, y + 8);
          g.addColorStop(0, 'rgba(30,10,5,0.55)');
          g.addColorStop(1, 'rgba(30,10,5,0)');
          ctx.fillStyle = g;
          ctx.fillRect(x + 1, y, tw - 2, 8);
          // Speckle.
          for (let k = 0; k < 3; k++) {
            dot(x + rand(3, tw - 3), y + rand(6, th), rand(0.6, 1.4), hsl(h, 30, l + jit(14), 0.6));
          }
        }
      }
      // Moss and lichen, heavier low down and on the left.
      for (let i = 0; i < 1400; i++) {
        const x = rand(ROOF.eaveL, ROOF.eaveR), y = rand(ROOF.ridgeY, ROOF.eaveY);
        const m = fbm(x / 120, y / 90 + 3, 3) + (y - ROOF.ridgeY) / 900 - (x - 600) / 4000;
        if (m < 0.62) continue;
        dot(x, y, rand(1.5, 4.5), rng() < 0.75 ? hsl(78 + jit(10), 40, 34 + jit(8), 0.75) : hsl(55, 25, 70, 0.6));
      }
      // Hip edges.
      ctx.restore();
      ctx.lineCap = 'round';
      line(ROOF.ridgeL, ROOF.ridgeY, ROOF.eaveL, ROOF.eaveY, 12, hsl(10, 35, 26));
      line(ROOF.ridgeR, ROOF.ridgeY, ROOF.eaveR, ROOF.eaveY, 12, hsl(10, 35, 22));
      line(ROOF.ridgeL - 2, ROOF.ridgeY, ROOF.eaveL - 2, ROOF.eaveY, 3, hsl(16, 40, 46, 0.7));
      // Ridge tiles.
      for (let x = ROOF.ridgeL - 6; x < ROOF.ridgeR + 6; x += 34) {
        ctx.fillStyle = hsl(12 + jit(4), 42, 32 + jit(5));
        ctx.beginPath();
        ctx.ellipse(x + 17, ROOF.ridgeY - 2, 18, 11, 0, Math.PI, TAU);
        ctx.fill();
        ctx.fillStyle = hsl(14, 40, 44, 0.6);
        ctx.fillRect(x + 6, ROOF.ridgeY - 11, 14, 3);
      }
      // Fascia board and the deep shadow under the eaves.
      ctx.fillStyle = hsl(30, 12, 22);
      ctx.fillRect(ROOF.eaveL - 6, ROOF.eaveY - 4, ROOF.eaveR - ROOF.eaveL + 12, 12);
    }

    function paintChimney() {
      const c = CHIMNEY;
      ctx.save();
      ctx.beginPath();
      ctx.rect(c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0);
      ctx.clip();
      ctx.fillStyle = hsl(25, 12, 52);
      ctx.fillRect(c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0);
      let row = 0;
      for (let y = c.y0 + 14; y < c.y1; y += 20, row++) {
        for (let x = c.x0 - 24 + (row % 2) * 24; x < c.x1; x += 48) {
          ctx.fillStyle = hsl(10 + jit(8), 45, 34 + jit(7));
          ctx.fillRect(x + 2, y + 2, 44, 16);
        }
      }
      const g = ctx.createLinearGradient(c.x0, 0, c.x1, 0);
      g.addColorStop(0, 'rgba(255,240,220,0.12)');
      g.addColorStop(0.6, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(20,5,0,0.35)');
      ctx.fillStyle = g;
      ctx.fillRect(c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0);
      ctx.restore();
      // Cap and pots.
      ctx.fillStyle = hsl(30, 8, 62);
      ctx.fillRect(c.x0 - 8, c.y0 - 4, c.x1 - c.x0 + 16, 16);
      ctx.fillStyle = hsl(30, 8, 40);
      ctx.fillRect(c.x0 - 8, c.y0 + 10, c.x1 - c.x0 + 16, 3);
      for (const px of [c.x0 + 26, c.x1 - 26]) {
        const top = c.y0 - 52;
        const g2 = ctx.createLinearGradient(px - 14, 0, px + 14, 0);
        g2.addColorStop(0, hsl(18, 55, 52));
        g2.addColorStop(1, hsl(14, 50, 30));
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.moveTo(px - 15, c.y0 - 4);
        ctx.lineTo(px - 11, top + 8);
        ctx.lineTo(px + 11, top + 8);
        ctx.lineTo(px + 15, c.y0 - 4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = hsl(16, 50, 40);
        ctx.fillRect(px - 15, top, 30, 10);
      }
      // Lead flashing where the chimney meets the roof.
      ctx.fillStyle = hsl(210, 6, 46);
      ctx.fillRect(c.x0 - 6, c.y1 - 10, c.x1 - c.x0 + 12, 12);
    }

    function paintBrickWall(x0, y0, x1, y1) {
      ctx.fillStyle = hsl(36, 16, 64);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      const bh = 20, mortar = 4, bw = 54;
      let row = 0;
      for (let y = y1 - bh - mortar; y > y0 - bh; y -= bh + mortar, row++) {
        const off = (row % 2) * (bw + mortar) * 0.5;
        for (let x = x0 - bw + off; x < x1; x += bw + mortar) {
          const w = fbm(x / 220, y / 180 + 11, 3);
          const burnt = rng() < 0.08;
          const h = 10 + jit(6) + (w - 0.5) * 12;
          const s = burnt ? 30 : 46 + jit(10);
          const l = (burnt ? 26 : 40) + jit(5) - (w - 0.5) * 12 - Math.max(0, (y - 1060) / 30);
          ctx.fillStyle = hsl(h, s, l);
          ctx.fillRect(x, y, bw, bh);
          ctx.fillStyle = hsl(h + 4, s - 8, l + 9, 0.5);
          ctx.fillRect(x, y, bw, 2);
          ctx.fillStyle = hsl(h, s, l - 10, 0.45);
          ctx.fillRect(x, y + bh - 3, bw, 3);
          for (let k = 0; k < 5; k++) {
            dot(x + rand(2, bw - 2), y + rand(2, bh - 2), rand(0.5, 1.6), hsl(h, s - 15, l + jit(16), 0.55));
          }
        }
      }
    }

    function paintWindow(win) {
      const { x0, x1, y0, y1 } = win;
      // Brick soldier-course lintel.
      for (let x = x0 - 18; x < x1 + 18; x += 14) {
        ctx.fillStyle = hsl(10 + jit(6), 45, 34 + jit(6));
        ctx.fillRect(x, y0 - 46, 12, 40);
      }
      // Reveal (shadowed depth of the opening).
      ctx.fillStyle = hsl(20, 18, 24);
      ctx.fillRect(x0 - 10, y0 - 6, x1 - x0 + 20, y1 - y0 + 10);
      // Glass.
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, hsl(205, 28, 48));
      g.addColorStop(0.5, hsl(212, 30, 24));
      g.addColorStop(1, hsl(215, 26, 18));
      ctx.fillStyle = g;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      // Curtains inside.
      for (const side of [0, 1]) {
        const cx = side ? x1 - 34 : x0 + 34;
        for (let k = 0; k < 6; k++) {
          ctx.fillStyle = hsl(40, 35, 78 - k * 3, 0.42);
          ctx.fillRect(cx - 30 + k * 10 + (side ? 6 : -6), y0 + 4, 8, y1 - y0 - 8);
        }
      }
      // Sky reflections.
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, x1 - x0, y1 - y0);
      ctx.clip();
      for (let k = 0; k < 4; k++) {
        const sx = x0 + rand(0, x1 - x0);
        ctx.fillStyle = `rgba(230,240,255,${rand(0.08, 0.16)})`;
        ctx.beginPath();
        ctx.moveTo(sx, y0);
        ctx.lineTo(sx + 40, y0);
        ctx.lineTo(sx - 60, y1);
        ctx.lineTo(sx - 100, y1);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      // Frame and glazing bars (three casements, each with a transom).
      const frame = hsl(45, 22, 90);
      const frameShade = hsl(40, 12, 66);
      const fw = 12;
      ctx.fillStyle = frame;
      ctx.fillRect(x0 - fw, y0 - fw, x1 - x0 + fw * 2, fw);
      ctx.fillRect(x0 - fw, y1, x1 - x0 + fw * 2, fw);
      ctx.fillRect(x0 - fw, y0 - fw, fw, y1 - y0 + fw * 2);
      ctx.fillRect(x1, y0 - fw, fw, y1 - y0 + fw * 2);
      const cw = (x1 - x0) / 3;
      for (let i = 1; i < 3; i++) ctx.fillRect(x0 + i * cw - 5, y0, 10, y1 - y0);
      const ty = y0 + (y1 - y0) * 0.3;
      ctx.fillRect(x0, ty - 5, x1 - x0, 10);
      ctx.fillStyle = frameShade;
      for (let i = 1; i < 3; i++) ctx.fillRect(x0 + i * cw + 3, y0, 2, y1 - y0);
      ctx.fillRect(x0, ty + 4, x1 - x0, 2);
      ctx.fillRect(x0, y0, x1 - x0, 2);
      // Thin glazing bars dividing the lower lights.
      ctx.fillStyle = frame;
      for (let i = 0; i < 3; i++) {
        const mx = x0 + i * cw + cw / 2;
        ctx.fillRect(mx - 2, ty, 4, y1 - ty);
        ctx.fillRect(x0 + i * cw, ty + (y1 - ty) / 2 - 2, cw, 4);
      }
      // Stone sill with its shadow.
      ctx.fillStyle = 'rgba(30,10,5,0.35)';
      ctx.fillRect(x0 - 24, y1 + fw + 14, x1 - x0 + 48, 12);
      ctx.fillStyle = hsl(40, 10, 74);
      ctx.fillRect(x0 - 26, y1 + fw, x1 - x0 + 52, 16);
      ctx.fillStyle = hsl(40, 8, 58);
      ctx.fillRect(x0 - 26, y1 + fw + 11, x1 - x0 + 52, 5);
      paintWindowBox(win);
    }

    function paintWindowBox(win) {
      const { x0, x1, y1 } = win;
      const top = y1 + 30;
      ctx.fillStyle = 'rgba(25,10,5,0.35)';
      ctx.fillRect(x0 - 4, top + 50, x1 - x0 + 8, 10);
      const g = ctx.createLinearGradient(0, top, 0, top + 52);
      g.addColorStop(0, hsl(30, 25, 42));
      g.addColorStop(1, hsl(28, 25, 26));
      ctx.fillStyle = g;
      ctx.fillRect(x0 - 6, top + 6, x1 - x0 + 12, 46);
      for (let x = x0; x < x1; x += 40) line(x0, top + 20 + (x % 3), x1, top + 20 + (x % 3), 1, 'rgba(0,0,0,0.12)');
      const cool = win.box === 'cool';
      foliage((x0 + x1) / 2, top - 4, (x1 - x0) / 2 + 6, 26, {
        h: 110, s: 34, l: 34, size: 6, density: 1.8, contrast: 10,
      });
      // Trailing stems over the front.
      for (let i = 0; i < 26; i++) {
        const x = rand(x0, x1);
        const len = rand(20, 70);
        for (let k = 0; k < len; k += 5) {
          dab(x + Math.sin(k / 12 + i) * 5, top + 8 + k, 4, 2.4, rng() * TAU, hsl(cool ? 100 : 95, 35, 30 + jit(8)));
        }
        if (cool) dot(x, top + 8 + len, 3, hsl(225, 60, 58));
      }
      if (cool) {
        sprinkle((x0 + x1) / 2, top - 6, (x1 - x0) / 2, 24, 320, 3, (lit) =>
          rng() < 0.2 ? hsl(0, 0, 94) : hsl(228 + jit(12), 65, 52 + lit * 10));
      } else {
        for (let i = 0; i < 14; i++) {
          const x = x0 + 10 + (i / 13) * (x1 - x0 - 20) + jit(6);
          const y = top - 14 + jit(10);
          for (let k = 0; k < 14; k++) {
            dot(x + jit(9), y + jit(7), rand(2.6, 3.8), hsl(356 + jit(6), 70, 48 + jit(8)));
          }
        }
      }
    }

    function paintDormer(d) {
      const x0 = d.cx - 100, x1 = d.cx + 100, y0 = 392, y1 = ROOF.eaveY - 2;
      ctx.fillStyle = 'rgba(30,10,5,0.35)';
      ctx.fillRect(x1, y0 + 10, 14, y1 - y0 - 10);
      paintBrickWall(x0, y0, x1, y1);
      // Small gabled roof.
      poly([[x0 - 18, y0 + 6], [d.cx, y0 - 92], [x1 + 18, y0 + 6]], hsl(12, 40, 30));
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x0 - 18, y0 + 6);
      ctx.lineTo(d.cx, y0 - 92);
      ctx.lineTo(x1 + 18, y0 + 6);
      ctx.closePath();
      ctx.clip();
      for (let y = y0 - 94; y < y0 + 8; y += 16) {
        for (let x = x0 - 30 + ((y / 16) % 2) * 12; x < x1 + 30; x += 24) {
          ctx.fillStyle = hsl(13 + jit(5), 46, 36 + jit(7));
          ctx.fillRect(x + 1, y, 22, 18);
          ctx.fillStyle = 'rgba(30,10,5,0.4)';
          ctx.fillRect(x + 1, y, 22, 4);
        }
      }
      ctx.restore();
      ctx.lineCap = 'round';
      line(x0 - 20, y0 + 7, d.cx, y0 - 93, 8, hsl(40, 15, 86));
      line(d.cx, y0 - 93, x1 + 20, y0 + 7, 8, hsl(40, 12, 76));
      paintWindowSimple(d.cx - 60, y0 + 34, d.cx + 60, y1 - 18);
    }

    function paintWindowSimple(x0, y0, x1, y1) {
      ctx.fillStyle = hsl(20, 18, 22);
      ctx.fillRect(x0 - 6, y0 - 6, x1 - x0 + 12, y1 - y0 + 12);
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, hsl(205, 30, 52));
      g.addColorStop(1, hsl(214, 28, 20));
      ctx.fillStyle = g;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.fillStyle = 'rgba(240,245,255,0.14)';
      ctx.beginPath();
      ctx.moveTo(x0 + 20, y0);
      ctx.lineTo(x0 + 50, y0);
      ctx.lineTo(x0 + 10, y1);
      ctx.lineTo(x0 - 20, y1);
      ctx.fill();
      ctx.fillStyle = hsl(45, 22, 90);
      ctx.fillRect(x0 - 9, y0 - 9, x1 - x0 + 18, 9);
      ctx.fillRect(x0 - 9, y1, x1 - x0 + 18, 9);
      ctx.fillRect(x0 - 9, y0 - 9, 9, y1 - y0 + 18);
      ctx.fillRect(x1, y0 - 9, 9, y1 - y0 + 18);
      ctx.fillRect((x0 + x1) / 2 - 4, y0, 8, y1 - y0);
      ctx.fillRect(x0, (y0 + y1) / 2 - 3, x1 - x0, 6);
    }

    function paintDoor() {
      const { x0, x1, y0, y1 } = DOOR;
      // Frame and fanlight.
      const frame = hsl(45, 20, 88);
      ctx.fillStyle = hsl(20, 18, 20);
      ctx.fillRect(x0 - 8, y0 - 86, x1 - x0 + 16, y1 - y0 + 86);
      ctx.fillStyle = frame;
      ctx.fillRect(x0 - 24, y0 - 104, x1 - x0 + 48, 18);
      ctx.fillRect(x0 - 24, y0 - 104, 18, y1 - y0 + 104);
      ctx.fillRect(x1 + 6, y0 - 104, 18, y1 - y0 + 104);
      ctx.fillRect(x0 - 8, y0 - 14, x1 - x0 + 16, 14);
      const fg = ctx.createLinearGradient(0, y0 - 86, 0, y0 - 14);
      fg.addColorStop(0, hsl(205, 30, 46));
      fg.addColorStop(1, hsl(214, 30, 22));
      ctx.fillStyle = fg;
      ctx.fillRect(x0 - 6, y0 - 86, x1 - x0 + 12, 72);
      ctx.fillStyle = frame;
      for (let i = 1; i < 4; i++) ctx.fillRect(x0 - 6 + (i * (x1 - x0 + 12)) / 4 - 3, y0 - 86, 6, 72);
      // The green door itself.
      const dg = ctx.createLinearGradient(x0, 0, x1, 0);
      dg.addColorStop(0, hsl(152, 42, 32));
      dg.addColorStop(0.55, hsl(150, 44, 26));
      dg.addColorStop(1, hsl(150, 46, 19));
      ctx.fillStyle = dg;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      for (let i = 0; i < 260; i++) {
        const x = rand(x0, x1), y = rand(y0, y1);
        line(x, y, x + jit(1), y + rand(6, 26), 1, hsl(150, 40, rng() < 0.5 ? 18 : 34, 0.25));
      }
      // Four raised-and-fielded panels.
      const pad = 18, mid = 10;
      const pw = (x1 - x0 - pad * 2 - mid) / 2;
      const rows = [[y0 + 20, y0 + 200], [y0 + 236, y1 - 26]];
      for (const [py0, py1] of rows) {
        for (let i = 0; i < 2; i++) {
          const px = x0 + pad + i * (pw + mid);
          ctx.fillStyle = hsl(150, 44, 20);
          ctx.fillRect(px, py0, pw, py1 - py0);
          ctx.fillStyle = hsl(150, 38, 40, 0.8);
          ctx.fillRect(px, py1 - 3, pw, 3);
          ctx.fillRect(px + pw - 3, py0, 3, py1 - py0);
          ctx.fillStyle = hsl(150, 42, 28);
          ctx.fillRect(px + 7, py0 + 7, pw - 14, py1 - py0 - 14);
          ctx.fillStyle = hsl(150, 40, 36, 0.7);
          ctx.fillRect(px + 7, py0 + 7, pw - 14, 3);
          ctx.fillRect(px + 7, py0 + 7, 3, py1 - py0 - 14);
        }
      }
      // Brass: knocker, letter plate and knob.
      const brass = (l) => hsl(44, 60, l);
      const cx = (x0 + x1) / 2;
      ctx.lineWidth = 5;
      ctx.strokeStyle = brass(44);
      ctx.beginPath();
      ctx.arc(cx, y0 + 140, 15, 0.1, Math.PI - 0.1);
      ctx.stroke();
      dot(cx, y0 + 122, 7, brass(52));
      dot(cx - 2, y0 + 120, 2.5, brass(78));
      ctx.fillStyle = brass(40);
      ctx.fillRect(cx - 36, y0 + 210, 72, 16);
      ctx.fillStyle = brass(64);
      ctx.fillRect(cx - 36, y0 + 210, 72, 4);
      dot(x1 - 22, y0 + 230, 9, brass(42));
      dot(x1 - 24, y0 + 227, 3.5, brass(76));
      // Worn threshold and stone step.
      ctx.fillStyle = hsl(40, 8, 70);
      ctx.fillRect(x0 - 30, y1, x1 - x0 + 60, 14);
      ctx.fillStyle = hsl(40, 6, 56);
      ctx.fillRect(x0 - 30, y1 + 12, x1 - x0 + 60, 6);
    }

    function paintWisteria() {
      // Pale foliage along under the eaves, then hanging racemes.
      for (let i = 0; i < 9; i++) {
        foliage(rand(600, 1070), rand(590, 700), rand(60, 110), rand(30, 50), {
          h: 88, s: 36, l: 44, size: 6, density: 1.3, contrast: 10,
        });
      }
      // Twisting woody stems.
      ctx.lineCap = 'round';
      curve(612, 1200, 560, 900, 640, 640, 9, hsl(25, 15, 30));
      curve(640, 640, 820, 580, 1060, 610, 7, hsl(25, 15, 32));
      curve(612, 1100, 680, 820, 700, 700, 5, hsl(25, 15, 34));
      for (let i = 0; i < 70; i++) {
        const x = rand(605, 1080);
        const y = rand(600, 690) + Math.max(0, (x - 900) * 0.1);
        const len = rand(55, 120);
        for (let k = 0; k < 22; k++) {
          const t = k / 21;
          const w = (1 - t) * 9 + 2;
          dot(x + jit(w * 0.6) + Math.sin(t * 2) * 4, y + t * len, rand(2.2, 3.6),
            hsl(262 + jit(8), 42 - t * 10, 54 + t * 16 + jit(6)));
        }
      }
      // A spray down the left corner of the house.
      for (let i = 0; i < 16; i++) {
        const x = rand(590, 680), y = rand(700, 1000);
        foliage(x, y, 34, 24, { h: 88, s: 34, l: 40, size: 5, density: 1.4 });
        for (let k = 0; k < 18; k++) {
          const t = k / 17;
          dot(x + jit(5), y + 10 + t * 60, rand(2, 3.2), hsl(264 + jit(8), 40, 55 + t * 14));
        }
      }
    }

    function paintClimbingRoses() {
      // Pink rose arching round the door.
      const arch = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        let x, y;
        if (t < 0.35) { x = lerp(1050, 1060, t / 0.35); y = lerp(1180, 760, t / 0.35); }
        else if (t < 0.75) {
          const u = (t - 0.35) / 0.4;
          x = lerp(1060, 1350, u);
          y = 690 - Math.sin(u * Math.PI) * 50;
        } else { x = lerp(1350, 1338, (t - 0.75) / 0.25); y = lerp(760, 1020, (t - 0.75) / 0.25); }
        arch.push([x, y]);
      }
      ctx.lineCap = 'round';
      for (let i = 0; i < arch.length - 1; i++) {
        line(arch[i][0] + 6, arch[i][1], arch[i + 1][0] + 6, arch[i + 1][1], 4, hsl(25, 25, 28));
      }
      for (const [x, y] of arch) {
        foliage(x + jit(10), y + jit(10), rand(28, 46), rand(26, 40), {
          h: 112, s: 36, l: 32, size: 6, density: 1.3, contrast: 12, base: false,
        });
      }
      for (const [x, y] of arch) {
        for (let k = 0; k < 2; k++) {
          if (rng() < 0.75) roseBloom(x + jit(34), y + jit(30), rand(8, 13), 342 + jit(8), 58, 68 + jit(8));
        }
        if (rng() < 0.5) dot(x + jit(30), y + jit(30), 4, hsl(345, 55, 50));
      }
      // Yellow rose up the right-hand corner.
      for (let i = 0; i < 22; i++) {
        const t = i / 21;
        const x = 1790 + Math.sin(t * 7) * 18, y = lerp(1170, 640, t);
        foliage(x, y, 36, 30, { h: 100, s: 34, l: 33, size: 6, density: 1.2, base: false });
        if (rng() < 0.8) roseBloom(x + jit(24), y + jit(20), rand(8, 12), 46 + jit(4), 80, 66 + jit(6));
      }
    }

    function paintHouse() {
      paintBrickWall(HOUSE.x0, HOUSE.y0, HOUSE.x1, HOUSE.y1);
      // Shadow under the eaves.
      const g = ctx.createLinearGradient(0, HOUSE.y0, 0, HOUSE.y0 + 70);
      g.addColorStop(0, 'rgba(25,8,4,0.6)');
      g.addColorStop(1, 'rgba(25,8,4,0)');
      ctx.fillStyle = g;
      ctx.fillRect(HOUSE.x0, HOUSE.y0, HOUSE.x1 - HOUSE.x0, 70);
      // Corner quoins catch the light.
      const shade = ctx.createLinearGradient(HOUSE.x1 - 60, 0, HOUSE.x1, 0);
      shade.addColorStop(0, 'rgba(20,5,0,0)');
      shade.addColorStop(1, 'rgba(20,5,0,0.25)');
      ctx.fillStyle = shade;
      ctx.fillRect(HOUSE.x1 - 60, HOUSE.y0, 60, HOUSE.y1 - HOUSE.y0);
      for (const w of WINDOWS) paintWindow(w);
      paintDoor();
    }

    function paintBaseShrubs() {
      // Shrubs between the cottage and the wall: their tops show over the wall.
      for (let x = 0; x < W; x += rand(50, 90)) {
        if (x > PATH.gateL - 30 && x < PATH.gateR + 30) continue;
        const warm = warmthAt(x, 1100);
        const y = rand(1080, 1120);
        const r = rand(46, 80);
        foliage(x, y, r, r * 0.7, { h: lerp(115, 95, warm), s: 30, l: 33, size: 6, density: 1.6 });
        if (rng() < 0.75) {
          sprinkle(x, y, r * 0.9, r * 0.6, Math.round(r * 2.4), 2.8, (lit) =>
            warm < 0.5
              ? hsl(lerp(268, 232, rng()), 50, 56 + lit * 12)
              : hsl(rng() < 0.5 ? 340 : 48, 70, 62 + lit * 10));
        }
      }
    }

    function stoneColor(x, y) {
      const n = fbm(x / 140, y / 90 + 5, 3);
      const blue = rng() < 0.25;
      return {
        h: blue ? 210 : 36 + jit(8),
        s: blue ? 6 : 16 + jit(6),
        l: 52 + (n - 0.5) * 22 + jit(7),
      };
    }

    function stone(x, y, w, h, c) {
      blobPath(x + w / 2, y + h / 2, w / 2, h / 2, 0.12, 10);
      const g = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
      g.addColorStop(0, hsl(c.h, c.s, c.l + 10));
      g.addColorStop(1, hsl(c.h, c.s, c.l - 10));
      ctx.fillStyle = g;
      ctx.fill();
      // Speckle and lichen.
      for (let k = 0; k < (w * h) / 90; k++) {
        dot(x + rand(4, w - 4), y + rand(3, h - 3), rand(0.5, 1.6), hsl(c.h, c.s, c.l + jit(18), 0.6));
      }
      if (rng() < 0.3) {
        const lx = x + rand(6, w - 6), ly = y + rand(4, h - 4);
        for (let k = 0; k < 10; k++) dot(lx + jit(7), ly + jit(5), rand(1, 3), hsl(rng() < 0.5 ? 62 : 80, 35, 64, 0.8));
      }
    }

    function paintStoneWall() {
      const { top, base, gapL, gapR } = WALL;
      for (const [x0, x1] of [[-20, gapL], [gapR, W + 20]]) {
        ctx.fillStyle = hsl(30, 14, 18);
        ctx.fillRect(x0, top, x1 - x0, base - top);
        let y = base;
        while (y > top + 14) {
          const ch = rand(26, 40);
          let x = x0;
          while (x < x1) {
            const w = Math.min(rand(46, 120), x1 - x + 4);
            if (w > 8) stone(x + 2, y - ch + 2, w - 3, ch - 3, stoneColor(x, y));
            x += w;
          }
          y -= ch;
        }
        // Coping: a row of stones set on edge.
        let x = x0;
        while (x < x1) {
          const w = rand(18, 30);
          const h = rand(40, 58);
          const lean = jit(4);
          const c = stoneColor(x, top);
          ctx.save();
          ctx.translate(x + w / 2, top + 6);
          ctx.rotate(lean * 0.02);
          stone(-w / 2, -h, w, h, { h: c.h, s: c.s, l: c.l + 4 });
          ctx.restore();
          x += w + rand(0, 2);
        }
        // Shadow along the base of the wall.
        const g = ctx.createLinearGradient(0, base - 30, 0, base + 10);
        g.addColorStop(0, 'rgba(20,15,10,0)');
        g.addColorStop(1, 'rgba(20,15,10,0.45)');
        ctx.fillStyle = g;
        ctx.fillRect(x0, base - 30, x1 - x0, 40);
      }
      // Cushions tumbling over the wall: aubrieta and white arabis on the cool
      // side, golden alyssum on the warm side.
      for (let x = 330; x < W - 40; x += rand(120, 210)) {
        if (x > gapL - 110 && x < gapR + 90) continue;
        if (rng() < 0.25) continue;
        const warm = warmthAt(x, 1150);
        const w = rand(80, 160);
        const hue = warm < 0.5 ? (rng() < 0.25 ? -1 : 280 + jit(16)) : 50 + jit(5);
        const flower = () => (hue < 0
          ? hsl(60, 20, 92 + jit(4))
          : hue > 200 ? hsl(hue + jit(8), 52, 52 + jit(12)) : hsl(hue + jit(4), 85, 58 + jit(10)));
        foliage(x, top - 22, w * 0.5, 16, { h: 100, s: 30, l: 32, size: 3.5, density: 1.3 });
        const phase = rng() * 50;
        for (let cx = x - w / 2; cx < x + w / 2; cx += 3) {
          const u = Math.abs(cx - x) / (w / 2);
          const hang = (1 - u * u) * (26 + 70 * fbm(cx / 26 + phase, 3.3, 2));
          for (let yy = top - 34 + u * 14; yy < top + hang; yy += 3) {
            const r = rng();
            if (r < 0.5) dot(cx + jit(2), yy + jit(2), rand(1.5, 2.5), flower());
            else if (r < 0.8) dab(cx + jit(2), yy + jit(2), 2.6, 1.4, rng() * TAU, hsl(100, 30, 26 + jit(10)));
          }
        }
      }
      // Fleabane daisies in the crevices.
      for (let i = 0; i < 130; i++) {
        const x = rand(0, W);
        if (x > gapL - 10 && x < gapR + 10) continue;
        const y = rand(top + 20, base - 10);
        foliage(x, y, 10, 6, { h: 100, s: 30, l: 34, size: 2.5, density: 1.5, base: false });
        for (let k = 0; k < 4; k++) {
          daisy(x + jit(10), y + jit(6) - 4, 4, hsl(330, 40, rng() < 0.5 ? 94 : 84), hsl(48, 90, 55), 9);
        }
      }
    }

    function plank(x0, y0, x1, y1, width, l) {
      // A weathered timber member from (x0,y0) to (x1,y1).
      const ang = Math.atan2(y1 - y0, x1 - x0);
      const len = Math.hypot(x1 - x0, y1 - y0);
      ctx.save();
      ctx.translate(x0, y0);
      ctx.rotate(ang);
      const g = ctx.createLinearGradient(0, -width / 2, 0, width / 2);
      g.addColorStop(0, hsl(34, 14, l + 12));
      g.addColorStop(0.5, hsl(32, 16, l));
      g.addColorStop(1, hsl(30, 18, l - 14));
      ctx.fillStyle = g;
      ctx.fillRect(0, -width / 2, len, width);
      for (let k = 0; k < width / 2.2; k++) {
        const yy = -width / 2 + rng() * width;
        ctx.strokeStyle = hsl(30, 18, l + jit(14), 0.45);
        ctx.lineWidth = rand(0.6, 1.4);
        ctx.beginPath();
        ctx.moveTo(rand(0, len * 0.3), yy);
        ctx.bezierCurveTo(len * 0.3, yy + jit(2), len * 0.6, yy + jit(2), rand(len * 0.7, len), yy + jit(1.5));
        ctx.stroke();
      }
      ctx.restore();
    }

    function paintGate() {
      const { gapL, gapR, top, base } = WALL;
      const g = GATE;
      // Cast shadow of the open gate on the wall behind it.
      ctx.fillStyle = 'rgba(15,10,5,0.32)';
      for (let i = 0; i < 5; i++) {
        const y = g.top + 8 + i * ((g.bottom - g.top - 20) / 4);
        ctx.fillRect(g.x0 + 10, y + 10, g.x1 - g.x0 - 10, 12);
      }
      // Five-bar gate of silvered oak, swung open against the wall.
      for (let i = 0; i < 5; i++) {
        const y = g.top + i * ((g.bottom - g.top - 20) / 4) + 6;
        plank(g.x0, y, g.x1, y, i === 0 ? 22 : 14, 64);
      }
      plank(g.x0 + 8, g.top - 4, g.x0 + 8, g.bottom, 20, 62);
      plank(g.x1 - 10, g.top - 8, g.x1 - 10, g.bottom, 24, 60);
      plank(g.x0 + 14, g.bottom - 12, g.x1 - 16, g.top + 14, 14, 66);
      // Gateposts with caps and iron hinges.
      for (const [px, lit] of [[gapL - 26, 50], [gapR + 4, 44]]) {
        plank(px + 22, top - 92, px + 22, base + 6, 44, lit);
        poly([[px - 4, top - 90], [px + 22, top - 116], [px + 48, top - 90]], hsl(32, 16, lit - 6));
        poly([[px - 4, top - 90], [px + 22, top - 116], [px + 22, top - 90]], hsl(34, 14, lit + 6));
      }
      ctx.fillStyle = hsl(20, 10, 14);
      for (const y of [g.top + 10, g.bottom - 30]) {
        ctx.fillRect(g.x1 - 40, y, 64, 6);
        dot(g.x1 + 22, y + 3, 5, hsl(20, 10, 18));
      }
      // Latch.
      ctx.fillRect(g.x0 + 2, g.top + 34, 26, 7);
    }

    function paintGateway() {
      // Grass verge in the gateway, either side of the path.
      ctx.fillStyle = hsl(95, 26, 30);
      ctx.fillRect(WALL.gapL - 10, HOUSE.y1 + 2, WALL.gapR - WALL.gapL + 20, WALL.base - HOUSE.y1 + 6);
      for (let i = 0; i < 1600; i++) {
        const x = rand(WALL.gapL - 10, WALL.gapR + 10), y = rand(HOUSE.y1 + 10, WALL.base + 8);
        line(x, y, x + jit(3), y - rand(4, 10), 1.4, hsl(90 + jit(14), 34, 26 + rng() * 22));
      }
    }

    function paintPath() {
      // Base: a gravel colour that is darker at the edges and lighter far away.
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(PATH.gateL - 4, PATH.stepY);
      ctx.lineTo(PATH.gateR + 4, PATH.stepY);
      ctx.lineTo(PATH.topR, PATH.topY);
      ctx.lineTo(PATH.botR + 40, H);
      ctx.lineTo(PATH.botL - 40, H);
      ctx.lineTo(PATH.topL, PATH.topY);
      ctx.closePath();
      ctx.clip();
      const g = ctx.createLinearGradient(0, PATH.stepY, 0, H);
      g.addColorStop(0, hsl(38, 22, 70));
      g.addColorStop(1, hsl(34, 20, 56));
      ctx.fillStyle = g;
      ctx.fillRect(0, PATH.stepY, W, H - PATH.stepY);
      // Low-frequency mottling so every patch of gravel looks different.
      for (let i = 0; i < 900; i++) {
        const y = rand(PATH.stepY, H);
        const x = rand(pathL(y) - 40, pathR(y) + 40);
        const k = depth(y);
        const n = fbm(x / 90, y / 70, 3);
        dab(x, y, rand(20, 60) * k, rand(8, 22) * k, jit(0.3), hsl(34 + (n - 0.5) * 30, 18, 48 + n * 30, 0.18));
      }
      // Pebbles, smaller further away.
      for (let y = PATH.stepY; y < H; y += 1.6) {
        const k = depth(y);
        const w = pathR(y) - pathL(y) + 80;
        const per = (3.1 * k) * (3.1 * k) * 1.25;
        const count = (w * 1.6) / per;
        for (let i = 0; i < count; i++) {
          const x = rand(pathL(y) - 40, pathR(y) + 40);
          const r = rand(1.1, 3.6) * k * (rng() < 0.04 ? 2 : 1);
          const n = fbm(x / 60, y / 50 + 20, 2);
          const hue = rng() < 0.2 ? 210 : 30 + jit(14);
          const sat = hue === 210 ? 5 : 16 + jit(10);
          const l = 46 + n * 30 + jit(14);
          const rot = jit(1);
          dab(x + r * 0.35, y + r * 0.45, r, r * 0.7, rot, `rgba(40,30,20,${0.32})`);
          dab(x, y, r, r * 0.72, rot, hsl(hue, sat, l));
          if (r > 1.6) dab(x - r * 0.3, y - r * 0.3, r * 0.4, r * 0.25, rot, hsl(hue, sat, Math.min(95, l + 16), 0.7));
        }
      }
      // Soft shade along both edges, where the plants overhang.
      for (let y = PATH.stepY; y < H; y += 6) {
        const k = depth(y);
        for (const [x, dir] of [[pathL(y), 1], [pathR(y), -1]]) {
          const sg = ctx.createLinearGradient(x, 0, x + dir * 60 * k, 0);
          sg.addColorStop(0, 'rgba(30,25,15,0.45)');
          sg.addColorStop(1, 'rgba(30,25,15,0)');
          ctx.fillStyle = sg;
          ctx.fillRect(Math.min(x, x + dir * 60 * k), y, 60 * k, 6);
        }
      }
      ctx.restore();
    }

    function paintBedGround() {
      // Dark soil, then a thick carpet of low foliage so no bed reads as flat.
      const bedTop = WALL.base - 20;
      for (const side of [0, 1]) {
        ctx.save();
        ctx.beginPath();
        if (side === 0) {
          ctx.moveTo(-10, bedTop);
          ctx.lineTo(PATH.topL + 10, bedTop);
          ctx.lineTo(PATH.botL + 10, H);
          ctx.lineTo(-10, H);
        } else {
          ctx.moveTo(PATH.topR - 10, bedTop);
          ctx.lineTo(W + 10, bedTop);
          ctx.lineTo(W + 10, H);
          ctx.lineTo(PATH.botR - 10, H);
        }
        ctx.closePath();
        ctx.clip();
        ctx.fillStyle = hsl(28, 24, 18);
        ctx.fillRect(0, bedTop, W, H - bedTop);
        for (let i = 0; i < 2600; i++) {
          const y = rand(bedTop, H);
          const x = side === 0 ? rand(-20, pathL(y) + 20) : rand(pathR(y) - 20, W + 20);
          dot(x, y, rand(1, 3), hsl(28, 20, rand(10, 26)));
        }
        for (let i = 0; i < 9000; i++) {
          const y = rand(bedTop, H);
          const x = side === 0 ? rand(-20, pathL(y) + 10) : rand(pathR(y) - 10, W + 20);
          const k = depth(y);
          const warm = warmthAt(x, y);
          dab(x, y, rand(4, 9) * k, rand(2, 4) * k, rng() * TAU,
            hsl(lerp(118, 96, warm) + jit(14), 30 + jit(8), 24 + rng() * 18));
        }
        ctx.restore();
      }
    }

    // --- plants ---------------------------------------------------------------

    function lavender(x, y, k) {
      foliage(x, y - 10 * k, 40 * k, 20 * k, { h: 96, s: 14, l: 48, size: 3.4 * k, density: 1.6, aspect: 0.3, contrast: 10 });
      ctx.lineCap = 'round';
      const n = 26 + Math.floor(rng() * 14);
      for (let i = 0; i < n; i++) {
        const bx = x + jit(30 * k), by = y - 12 * k;
        const ang = -Math.PI / 2 + jit(0.6) + (bx - x) / (60 * k);
        const len = rand(45, 78) * k;
        const tx = bx + Math.cos(ang) * len, ty = by + Math.sin(ang) * len;
        line(bx, by, tx, ty, 1.1 * k, hsl(95, 18, 46, 0.9));
        const spike = 16 * k;
        for (let s = 0; s < 8; s++) {
          const t = s / 7;
          dot(tx - Math.cos(ang) * spike * t + jit(1.2 * k), ty - Math.sin(ang) * spike * t + jit(1.2 * k),
            (2.1 - t * 0.6) * k, hsl(266 + jit(8), 42 + jit(10), 44 + (1 - t) * 10 + jit(8)));
        }
      }
    }

    function catmint(x, y, k) {
      foliage(x, y - 18 * k, 48 * k, 28 * k, { h: 100, s: 16, l: 50, size: 4 * k, density: 1.6, contrast: 12 });
      for (let i = 0; i < 26; i++) {
        const bx = x + jit(44 * k), by = y - 24 * k + jit(16 * k);
        const len = rand(14, 26) * k;
        for (let s = 0; s < 7; s++) {
          dot(bx + jit(2 * k), by - (s / 6) * len, rand(1.4, 2.2) * k, hsl(244 + jit(10), 40, 64 + jit(8)));
        }
      }
    }

    function delphinium(x, y, k) {
      for (let i = 0; i < 7; i++) {
        leafShape(x + jit(14 * k), y - 6 * k, rand(24, 36) * k, 9 * k, -Math.PI / 2 + jit(1.4), hsl(118, 32, 28 + jit(6)));
      }
      const spikes = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < spikes; i++) {
        const bx = x + jit(18 * k);
        const top = y - rand(210, 320) * k;
        const lean = jit(14 * k);
        line(bx, y, bx + lean, top, 2.4 * k, hsl(100, 30, 32));
        const hue = 222 + jit(16);
        const len = y - top;
        for (let s = 0; s < 46; s++) {
          const t = s / 45;
          const yy = top + len * 0.62 * t;
          const width = (6 + t * 12) * k;
          dot(bx + lean * (1 - t * 0.62) + jit(width), yy, rand(3.2, 4.6) * k * (0.6 + t * 0.4),
            hsl(hue + jit(8), 60, 48 + (1 - t) * 8 + jit(10)));
          if (rng() < 0.3) dot(bx + lean * (1 - t * 0.62) + jit(width), yy, 1.2 * k, hsl(60, 20, 92));
        }
      }
    }

    function foxglove(x, y, k, warm) {
      for (let i = 0; i < 8; i++) {
        leafShape(x + jit(10 * k), y - 4 * k, rand(30, 46) * k, 11 * k, -Math.PI / 2 + jit(1.6),
          hsl(105, 26, 30 + jit(8)), hsl(100, 20, 46, 0.5));
      }
      let col;
      if (warm < 0.35) col = [290 + jit(10), 38, 56];
      else if (warm < 0.6) col = rng() < 0.5 ? [305, 40, 66] : [0, 0, 94];
      else col = pick([[332, 55, 66], [338, 50, 72], [24, 70, 76], [48, 40, 90]]);
      const spikes = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < spikes; i++) {
        const bx = x + jit(14 * k);
        const height = rand(220, 330) * k;
        const lean = jit(18 * k);
        const top = y - height;
        line(bx, y, bx + lean, top, 2.6 * k, hsl(95, 28, 32));
        // Bells from the bottom up, all hanging towards the viewer's side.
        for (let s = 0; s < 18; s++) {
          const t = s / 17;
          const yy = y - height * (0.28 + t * 0.6);
          const sx = bx + lean * (0.28 + t * 0.6);
          const side = s % 2 ? 1 : -1;
          const size = (1 - t * 0.55) * k;
          const bxl = sx + side * 7 * size, byl = yy + 6 * size;
          const ang = Math.PI / 2 - side * 0.7;
          dab(bxl, byl, 11 * size, 6 * size, ang, hsl(col[0], col[1], col[2] - 10));
          dab(bxl - 1 * size, byl - 1 * size, 9.5 * size, 4.8 * size, ang, hsl(col[0], col[1], col[2]));
          dot(bxl + side * 6 * size, byl + 6 * size, 3.6 * size, hsl(col[0], col[1] - 10, Math.min(96, col[2] + 14)));
          for (let d = 0; d < 3; d++) dot(bxl + side * 5 * size + jit(2 * size), byl + 5 * size + jit(2 * size), 0.9 * size, hsl(300, 40, 26));
        }
        for (let s = 0; s < 6; s++) dot(bx + lean + jit(2 * k), top + s * 6 * k, (2 + s * 0.3) * k, hsl(100, 30, 42));
      }
    }

    function allium(x, y, k) {
      for (let i = 0; i < 3; i++) leafShape(x + jit(8 * k), y, 30 * k, 4 * k, -Math.PI / 2 + jit(1.2), hsl(100, 25, 34));
      const heads = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < heads; i++) {
        const hx = x + jit(20 * k), hy = y - rand(120, 190) * k;
        line(x + jit(4), y, hx, hy, 1.6 * k, hsl(95, 26, 40));
        const r = rand(14, 19) * k;
        dot(hx, hy, r, hsl(275, 40, 38));
        for (let s = 0; s < 70; s++) {
          const a = rng() * TAU, d = Math.sqrt(rng()) * r;
          const lit = (-Math.sin(a) * 0.6 - Math.cos(a) * 0.4) * (d / r);
          dot(hx + Math.cos(a) * d, hy + Math.sin(a) * d, rand(1.4, 2.3) * k, hsl(278 + jit(8), 50, 56 + lit * 14 + jit(6)));
        }
      }
    }

    function cranesbill(x, y, k, warm) {
      foliage(x, y - 14 * k, 44 * k, 24 * k, { h: 112, s: 32, l: 32, size: 5 * k, density: 1.4 });
      const hue = warm < 0.5 ? 252 + jit(10) : 326 + jit(10);
      for (let i = 0; i < 26; i++) {
        const fx = x + jit(42 * k), fy = y - 20 * k + jit(16 * k);
        const r = rand(3.5, 5) * k;
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * TAU;
          dot(fx + Math.cos(a) * r * 0.55, fy + Math.sin(a) * r * 0.5, r * 0.55, hsl(hue, 55, 60 + jit(6)));
        }
        dot(fx, fy, r * 0.28, hsl(hue, 30, 88));
      }
    }

    function sage(x, y, k, warm) {
      const purple = warm < 0.4 && rng() < 0.4;
      foliage(x, y - 16 * k, 42 * k, 26 * k, {
        h: purple ? 300 : 92, s: purple ? 14 : 14, l: purple ? 38 : 58, size: 6 * k, density: 1.5, aspect: 0.55, contrast: 12,
      });
      for (let i = 0; i < 4; i++) {
        const bx = x + jit(30 * k), by = y - 30 * k;
        for (let s = 0; s < 6; s++) dot(bx, by - s * 4 * k, 2 * k, hsl(258, 40, 58));
      }
    }

    function rosemary(x, y, k) {
      ctx.lineCap = 'round';
      for (let i = 0; i < 16; i++) {
        const bx = x + jit(18 * k);
        const ang = -Math.PI / 2 + jit(0.45);
        const len = rand(40, 70) * k;
        for (let s = 0; s < 14; s++) {
          const t = s / 13;
          const px = bx + Math.cos(ang) * len * t, py = y + Math.sin(ang) * len * t;
          line(px, py, px + (s % 2 ? 6 : -6) * k, py - 3 * k, 1.4 * k, hsl(140, 20, 26 + jit(8)));
          if (rng() < 0.3) dot(px + jit(3 * k), py, 1.6 * k, hsl(215, 50, 74));
        }
      }
    }

    function chives(x, y, k) {
      ctx.lineCap = 'round';
      for (let i = 0; i < 26; i++) {
        const ang = -Math.PI / 2 + jit(0.4);
        const len = rand(30, 52) * k;
        line(x + jit(8 * k), y, x + Math.cos(ang) * len, y + Math.sin(ang) * len, 1.6 * k, hsl(110, 36, 34 + jit(10)));
      }
      for (let i = 0; i < 7; i++) {
        const hx = x + jit(16 * k), hy = y - rand(44, 62) * k;
        for (let s = 0; s < 14; s++) dot(hx + jit(5 * k), hy + jit(5 * k), 1.8 * k, hsl(296 + jit(8), 40, 66 + jit(8)));
      }
    }

    function thyme(x, y, k, warm) {
      foliage(x, y - 6 * k, 34 * k, 11 * k, { h: 105, s: 22, l: 36, size: 2.4 * k, density: 1.8 });
      sprinkle(x, y - 6 * k, 32 * k, 10 * k, 50, 1.5 * k, () => hsl(warm < 0.5 ? 285 : 330, 40, 70 + jit(8)));
    }

    function roseBush(x, y, k, warm) {
      foliage(x, y - 34 * k, 50 * k, 40 * k, { h: 118, s: 32, l: 28, size: 6 * k, density: 1.5, contrast: 12 });
      let palette;
      if (warm < 0.3) palette = [[290, 28, 78], [40, 30, 94], [270, 25, 72]];
      else if (warm < 0.55) palette = [[320, 35, 82], [40, 30, 94], [300, 30, 76]];
      else palette = [[346, 62, 70], [340, 62, 56], [24, 78, 72], [48, 85, 66], [355, 60, 78]];
      const col = pick(palette);
      const n = 8 + Math.floor(rng() * 7);
      for (let i = 0; i < n; i++) {
        const a = rng() * TAU, d = Math.sqrt(rng());
        roseBloom(x + Math.cos(a) * d * 44 * k, y - 38 * k + Math.sin(a) * d * 32 * k, rand(8, 11.5) * k,
          col[0] + jit(4), col[1], col[2] + jit(5));
      }
      for (let i = 0; i < 4; i++) dot(x + jit(44 * k), y - 40 * k + jit(30 * k), 3 * k, hsl(col[0], col[1], col[2] - 18));
    }

    function peony(x, y, k) {
      foliage(x, y - 26 * k, 48 * k, 30 * k, { h: 120, s: 30, l: 28, size: 7 * k, density: 1.4 });
      const col = pick([[336, 55, 76], [345, 62, 62], [30, 40, 90]]);
      for (let i = 0; i < 4; i++) {
        const fx = x + jit(36 * k), fy = y - 36 * k + jit(16 * k);
        const r = rand(14, 19) * k;
        dot(fx + r * 0.2, fy + r * 0.3, r * 1.05, hsl(col[0], col[1] * 0.5, col[2] - 34, 0.4));
        for (let p = 0; p < 26; p++) {
          const a = rng() * TAU, d = Math.sqrt(rng()) * r * 0.8;
          dab(fx + Math.cos(a) * d, fy + Math.sin(a) * d * 0.85, r * 0.34, r * 0.24, a,
            hsl(col[0] + jit(4), col[1], col[2] + (-Math.sin(a)) * 8 * (d / r) + jit(6)));
        }
      }
    }

    function poppy(x, y, k) {
      foliage(x, y - 10 * k, 36 * k, 16 * k, { h: 96, s: 18, l: 38, size: 6 * k, density: 1.2, aspect: 0.35 });
      const col = pick([[8, 82, 56], [358, 70, 52], [345, 55, 72], [16, 85, 60]]);
      const n = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        const fx = x + jit(26 * k), fy = y - rand(80, 130) * k;
        curve(x + jit(5), y - 8 * k, x + jit(20 * k), (y + fy) / 2, fx, fy, 1.6 * k, hsl(95, 22, 40));
        const r = rand(14, 19) * k;
        for (let p = 0; p < 4; p++) {
          const a = (p / 4) * TAU + 0.4 + jit(0.3);
          dab(fx + Math.cos(a) * r * 0.42, fy + Math.sin(a) * r * 0.36, r * 0.66, r * 0.52, a,
            hsl(col[0], col[1], col[2] + (p === 0 ? 8 : p === 2 ? -8 : 0)));
        }
        ctx.strokeStyle = hsl(col[0], col[1], col[2] + 14, 0.6);
        ctx.lineWidth = 1 * k;
        for (let p = 0; p < 4; p++) {
          ctx.beginPath();
          ctx.arc(fx + jit(4 * k), fy + jit(4 * k), r * rand(0.4, 0.8), rand(0, TAU), rand(0, TAU));
          ctx.stroke();
        }
        dot(fx, fy, r * 0.3, hsl(280, 30, 12));
        dot(fx, fy, r * 0.14, hsl(90, 25, 40));
      }
    }

    function achillea(x, y, k) {
      ctx.lineCap = 'round';
      for (let i = 0; i < 10; i++) {
        line(x + jit(14 * k), y, x + jit(24 * k), y - rand(30, 50) * k, 3 * k, hsl(100, 22, 38, 0.8));
      }
      const plates = 3 + Math.floor(rng() * 3);
      for (let i = 0; i < plates; i++) {
        const px = x + jit(28 * k), py = y - rand(70, 110) * k;
        line(x + jit(6 * k), y - 10 * k, px, py, 1.6 * k, hsl(95, 22, 40));
        dab(px, py + 2 * k, 15 * k, 6 * k, 0, hsl(46, 70, 36));
        for (let s = 0; s < 40; s++) {
          const a = rng() * TAU, d = Math.sqrt(rng());
          dot(px + Math.cos(a) * d * 14 * k, py + Math.sin(a) * d * 5 * k, 1.6 * k,
            hsl(52 + jit(5), 85, 58 + (-Math.sin(a) * d) * 10));
        }
      }
    }

    function ladysMantle(x, y, k) {
      for (let i = 0; i < 12; i++) {
        const lx = x + jit(34 * k), ly = y - 8 * k + jit(12 * k);
        const r = rand(9, 13) * k;
        dot(lx, ly, r, hsl(82, 38, 34 + jit(6)));
        dot(lx - r * 0.2, ly - r * 0.25, r * 0.7, hsl(80, 40, 44 + jit(6)));
        if (rng() < 0.3) dot(lx - r * 0.3, ly - r * 0.3, 1.5 * k, 'rgba(255,255,255,0.8)');
      }
      sprinkle(x, y - 20 * k, 40 * k, 18 * k, 140, 1.6 * k, (lit) => hsl(66 + jit(6), 70, 60 + lit * 10));
    }

    function calendula(x, y, k) {
      foliage(x, y - 12 * k, 30 * k, 18 * k, { h: 100, s: 32, l: 36, size: 5 * k, density: 1.3 });
      for (let i = 0; i < 7; i++) {
        daisy(x + jit(28 * k), y - 24 * k + jit(12 * k), rand(7, 10) * k,
          hsl(30 + jit(10), 92, 56 + jit(6)), hsl(20, 60, 26), 14);
      }
    }

    function fennel(x, y, k) {
      ctx.lineCap = 'round';
      const bronze = rng() < 0.5;
      for (let i = 0; i < 40; i++) {
        const bx = x + jit(20 * k), by = y - rand(0, 150) * k;
        for (let s = 0; s < 5; s++) {
          const a = rng() * TAU;
          line(bx, by, bx + Math.cos(a) * 12 * k, by + Math.sin(a) * 12 * k, 0.8 * k,
            bronze ? hsl(20, 30, 34 + jit(8), 0.8) : hsl(90, 40, 44 + jit(8), 0.8));
        }
      }
      for (let i = 0; i < 4; i++) {
        const ux = x + jit(26 * k), uy = y - rand(170, 230) * k;
        line(x, y - 100 * k, ux, uy, 1.4 * k, hsl(90, 30, 40));
        for (let s = 0; s < 34; s++) {
          const a = -Math.PI * rng();
          dot(ux + Math.cos(a) * 14 * k * rng(), uy + Math.sin(a) * 7 * k * rng(), 1.5 * k, hsl(54, 80, 56 + jit(8)));
        }
      }
    }

    function marjoram(x, y, k) {
      foliage(x, y - 12 * k, 36 * k, 18 * k, { h: 68, s: 55, l: 52, size: 3.4 * k, density: 1.7, contrast: 12 });
      sprinkle(x, y - 14 * k, 30 * k, 12 * k, 30, 1.6 * k, () => hsl(320, 40, 80));
    }

    function dianthus(x, y, k) {
      ctx.lineCap = 'round';
      for (let i = 0; i < 30; i++) {
        const ang = -Math.PI / 2 + jit(1.2);
        const len = rand(10, 20) * k;
        const bx = x + jit(26 * k);
        line(bx, y, bx + Math.cos(ang) * len, y + Math.sin(ang) * len, 1.4 * k, hsl(180, 14, 60 + jit(8)));
      }
      for (let i = 0; i < 12; i++) {
        const fx = x + jit(26 * k), fy = y - rand(18, 34) * k;
        dot(fx, fy, 5 * k, hsl(336 + jit(6), 62, 74 + jit(6)));
        dot(fx, fy, 2 * k, hsl(340, 60, 42));
      }
    }

    function oxeye(x, y, k) {
      for (let i = 0; i < 6; i++) {
        const fx = x + jit(22 * k), fy = y - rand(60, 100) * k;
        line(x + jit(4), y, fx, fy, 1.2 * k, hsl(100, 26, 36));
        daisy(fx, fy, rand(8, 11) * k, hsl(50, 30, 96), hsl(46, 90, 52), 14);
      }
    }

    const PLANTS = {
      lavender: { fn: lavender, tall: 0 },
      catmint: { fn: catmint, tall: 0 },
      delphinium: { fn: delphinium, tall: 2 },
      foxglove: { fn: foxglove, tall: 2 },
      allium: { fn: allium, tall: 1 },
      cranesbill: { fn: cranesbill, tall: 0 },
      sage: { fn: sage, tall: 0 },
      rosemary: { fn: rosemary, tall: 1 },
      chives: { fn: chives, tall: 0 },
      thyme: { fn: thyme, tall: 0 },
      rose: { fn: roseBush, tall: 1 },
      peony: { fn: peony, tall: 1 },
      poppy: { fn: poppy, tall: 1 },
      achillea: { fn: achillea, tall: 1 },
      ladysMantle: { fn: ladysMantle, tall: 0 },
      calendula: { fn: calendula, tall: 0 },
      fennel: { fn: fennel, tall: 2 },
      marjoram: { fn: marjoram, tall: 0 },
      dianthus: { fn: dianthus, tall: 0 },
      oxeye: { fn: oxeye, tall: 1 },
    };

    // Planting weights on the cool (left) and warm (right) sides.
    const COOL = { lavender: 18, catmint: 12, delphinium: 9, foxglove: 9, allium: 10, cranesbill: 10, sage: 8, rosemary: 6, chives: 6, thyme: 4, rose: 5, oxeye: 3 };
    const WARM = { rose: 18, peony: 9, poppy: 9, foxglove: 9, achillea: 10, ladysMantle: 9, calendula: 9, fennel: 6, marjoram: 6, dianthus: 6, cranesbill: 4, oxeye: 4, thyme: 3 };

    function choosePlant(warm, x, y) {
      const backRow = y < 1470;
      // Keep the gate and gateposts in view.
      const byGate = x > GATE.x0 - 40 && x < WALL.gapL + 10 && y < 1560;
      const weights = {};
      let total = 0;
      for (const name of Object.keys(PLANTS)) {
        let w = lerp(COOL[name] || 0, WARM[name] || 0, warm);
        const tall = PLANTS[name].tall;
        if (byGate) w *= tall === 2 ? 0 : tall === 1 ? 0.15 : 1.4;
        else if (backRow) w *= tall === 2 ? 1.9 : tall === 1 ? 1.2 : 0.6;
        else if (y > 1720) w *= tall === 2 ? 0.05 : tall === 1 ? 0.6 : 1.5;
        else if (tall === 2) w *= 0.35;
        weights[name] = w;
        total += w;
      }
      let r = rng() * total;
      for (const name in weights) {
        r -= weights[name];
        if (r <= 0) return name;
      }
      return 'lavender';
    }

    function inBench(x, y) {
      return x > BENCH.x0 - 20 && x < BENCH.x1 + 30 && y > BENCH.back - 20 && y < BENCH.floor + 10;
    }

    function inTrunk(x, y) {
      return x < 330 && y < TREE_BASE_Y - 10;
    }

    function planBeds() {
      const items = [];
      // Lavender hedge along the left edge of the path; lady's mantle and pinks
      // along the right edge.
      for (let y = WALL.base + 10; y < H + 40; y += 30 * depth(y)) {
        items.push({ y, x: pathL(y) - 12 * depth(y), draw: (it) => lavender(it.x, it.y, depth(it.y) * 1.15) });
        const name = rng() < 0.6 ? 'ladysMantle' : 'dianthus';
        items.push({ y: y + 4, x: pathR(y) + 16 * depth(y), draw: (it) => PLANTS[name].fn(it.x, it.y, depth(it.y) * 1.1, 1) });
      }
      // Main planting on a jittered grid that tightens with distance.
      for (let y = WALL.base - 6; y < H + 60; ) {
        const k = depth(y);
        const step = 64 * k;
        for (let x = -30; x < W + 30; x += step * rand(0.75, 1.2)) {
          const py = y + jit(step * 0.3);
          if (x > pathL(py) - 34 * k && x < pathR(py) + 34 * k) continue;
          if (inBench(x, py) || inTrunk(x, py)) continue;
          const warm = warmthAt(x, py);
          const name = choosePlant(warm, x, py);
          items.push({ y: py, x, name, warm });
        }
        y += step * 0.55;
      }
      return items;
    }

    function paintBeds(items) {
      items.sort((a, b) => a.y - b.y);
      for (const it of items) {
        if (it.draw) it.draw(it);
        else PLANTS[it.name].fn(it.x, it.y, depth(it.y) * rand(0.9, 1.15), it.warm);
      }
    }

    // --- the old tree on the left --------------------------------------------

    function paintTree() {
      // Trunk outline: left and right edges from the base to the crown.
      const left = [], right = [];
      for (let i = 0; i <= 30; i++) {
        const t = i / 30;
        const y = lerp(TREE_BASE_Y + 20, 150, t);
        const centre = 190 + Math.sin(t * 2.6 + 0.4) * 40 - t * 20;
        const half = lerp(150, 78, Math.pow(t, 0.7)) + (t < 0.08 ? (0.08 - t) * 700 : 0);
        left.push([centre - half + jit(5), y]);
        right.push([centre + half + jit(5), y]);
      }
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(left[0][0], left[0][1]);
      for (const p of left) ctx.lineTo(p[0], p[1]);
      // Two limbs leaving the top of the frame.
      ctx.lineTo(left[30][0] - 60, 0);
      ctx.lineTo(left[30][0] + 70, 0);
      ctx.lineTo(left[30][0] + 110, 120);
      ctx.lineTo(right[30][0] + 160, 0);
      ctx.lineTo(right[30][0] + 260, 0);
      for (let i = 30; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
      ctx.closePath();
      const g = ctx.createLinearGradient(40, 0, 380, 0);
      g.addColorStop(0, hsl(30, 12, 46));
      g.addColorStop(0.4, hsl(28, 14, 36));
      g.addColorStop(1, hsl(25, 16, 18));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.clip();
      // Bark: long wavering fissures and lighter ridges.
      ctx.lineCap = 'round';
      for (let i = 0; i < 520; i++) {
        let x = rand(0, 520);
        let y = rand(-40, TREE_BASE_Y + 40);
        const len = rand(40, 180);
        const dark = rng() < 0.6;
        ctx.strokeStyle = dark ? hsl(25, 18, rand(8, 18), 0.8) : hsl(32, 10, rand(48, 64), 0.5);
        ctx.lineWidth = dark ? rand(2, 6) : rand(1, 3);
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let s = 0; s < 6; s++) {
          x += jit(8);
          y += len / 6;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // Cross cracks.
      for (let i = 0; i < 160; i++) {
        const x = rand(0, 480), y = rand(0, TREE_BASE_Y);
        line(x, y, x + rand(8, 22), y + jit(4), rand(1.5, 3), hsl(25, 18, 12, 0.7));
      }
      // Lichen and moss.
      for (let i = 0; i < 90; i++) {
        const x = rand(40, 420), y = rand(100, TREE_BASE_Y);
        const moss = rng() < 0.5;
        for (let k = 0; k < 14; k++) {
          dot(x + jit(12), y + jit(16), rand(1.2, 4), moss ? hsl(85, 40, 30 + jit(10), 0.85) : hsl(70, 18, 70 + jit(8), 0.75));
        }
      }
      // Shadow side.
      const sg = ctx.createLinearGradient(140, 0, 360, 0);
      sg.addColorStop(0, 'rgba(10,5,0,0)');
      sg.addColorStop(1, 'rgba(10,5,0,0.45)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, 600, H);
      ctx.restore();
      // Ivy scrambling up the lower trunk.
      for (let i = 0; i < 220; i++) {
        const t = Math.pow(rng(), 1.6);
        const y = lerp(TREE_BASE_Y, 760, t);
        const x = 190 + Math.sin(y / 70) * 90 + jit(60);
        const s = rand(9, 15);
        const l = 22 + rng() * 16;
        for (let p = 0; p < 3; p++) {
          const a = -Math.PI / 2 + (p - 1) * 1.1 + jit(0.2);
          leafShape(x, y, s, s * 0.45, a, hsl(130 + jit(10), 34, l), hsl(100, 20, l + 16, 0.6));
        }
      }
      // Canopy across the top-left corner, with gaps of sky.
      const clumps = [[60, 40, 260, 140], [340, 70, 200, 120], [560, 30, 160, 90], [180, 210, 200, 110], [-20, 300, 160, 130], [450, 180, 120, 80]];
      for (const [cx, cy, rx, ry] of clumps) {
        foliage(cx, cy, rx, ry, { h: 98, s: 36, l: 38, size: 8, density: 1.7, contrast: 14 });
      }
      for (let i = 0; i < 900; i++) {
        const a = rng() * TAU, d = Math.sqrt(rng());
        const x = 250 + Math.cos(a) * d * 420, y = 120 + Math.sin(a) * d * 230;
        if (y < -10) continue;
        dab(x, y, rand(5, 9), rand(2.5, 4), rng() * TAU, hsl(80 + jit(10), 50, 52 + jit(8), 0.9));
      }
    }

    // --- potting bench ---------------------------------------------------------

    function pot(cx, base, w, h, opts = {}) {
      const top = base - h;
      const bw = w * 0.72;
      const rimH = h * 0.2;
      const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
      g.addColorStop(0, hsl(18, 55, 58));
      g.addColorStop(0.35, hsl(17, 58, 50));
      g.addColorStop(1, hsl(14, 55, 30));
      if (opts.inverted) {
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(cx - bw / 2, top);
        ctx.lineTo(cx + bw / 2, top);
        ctx.lineTo(cx + w / 2, base - rimH);
        ctx.lineTo(cx - w / 2, base - rimH);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(cx - w / 2 - 3, base - rimH, w + 6, rimH);
        ctx.fillStyle = 'rgba(30,10,0,0.25)';
        ctx.fillRect(cx - w / 2 - 3, base - rimH, w + 6, 3);
        dab(cx, top, bw / 2, 3, 0, hsl(17, 50, 56));
        dot(cx, top, 3, hsl(15, 40, 20));
      } else {
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(cx - w / 2, top + rimH);
        ctx.lineTo(cx + w / 2, top + rimH);
        ctx.lineTo(cx + bw / 2, base);
        ctx.lineTo(cx - bw / 2, base);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(cx - w / 2 - 4, top, w + 8, rimH);
        ctx.fillStyle = 'rgba(30,10,0,0.3)';
        ctx.fillRect(cx - w / 2, top + rimH, w, 4);
        ctx.fillStyle = hsl(18, 40, 66, 0.5);
        ctx.fillRect(cx - w / 2 - 4, top, w + 8, 2);
        dab(cx, top + 1, w / 2 + 2, Math.max(3, w * 0.09), 0, hsl(20, 30, 16));
      }
      // Clay speckle and a little white bloom.
      for (let k = 0; k < (w * h) / 40; k++) {
        dot(cx + jit(w * 0.4), top + rand(rimH, h), rand(0.5, 1.4), rng() < 0.15 ? 'rgba(240,235,220,0.5)' : hsl(16, 45, rand(30, 60), 0.5));
      }
      return top;
    }

    function wateringCan(x0, base) {
      // Galvanised can: oval body, long spout to the left, rose head, arched handle.
      const w = 150, h = 112, bx = x0 + 60;
      const metal = (stops) => {
        const g = ctx.createLinearGradient(bx, 0, bx + w, 0);
        for (const [t, l] of stops) g.addColorStop(t, hsl(205, 8, l));
        return g;
      };
      // Spout.
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = hsl(205, 7, 58);
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(bx + 14, base - 26);
      ctx.lineTo(x0 - 30, base - 128);
      ctx.stroke();
      ctx.strokeStyle = hsl(205, 8, 78);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bx + 12, base - 32);
      ctx.lineTo(x0 - 28, base - 132);
      ctx.stroke();
      ctx.restore();
      // Rose.
      dab(x0 - 36, base - 136, 10, 16, 0.5, hsl(205, 8, 52));
      dab(x0 - 40, base - 138, 5, 13, 0.5, hsl(205, 8, 70));
      // Handle.
      ctx.strokeStyle = hsl(205, 8, 54);
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.moveTo(bx + 30, base - h + 6);
      ctx.bezierCurveTo(bx + 40, base - h - 70, bx + w + 20, base - h - 70, bx + w + 6, base - 40);
      ctx.stroke();
      ctx.strokeStyle = hsl(205, 8, 76);
      ctx.lineWidth = 3;
      ctx.stroke();
      // Body.
      ctx.fillStyle = metal([[0, 50], [0.18, 82], [0.34, 62], [0.7, 46], [1, 32]]);
      ctx.beginPath();
      ctx.moveTo(bx, base - h);
      ctx.lineTo(bx + w, base - h);
      ctx.lineTo(bx + w, base - 6);
      ctx.quadraticCurveTo(bx + w / 2, base + 6, bx, base - 6);
      ctx.closePath();
      ctx.fill();
      dab(bx + w / 2, base - h, w / 2, 12, 0, hsl(205, 8, 70));
      dab(bx + w / 2, base - h + 2, w / 2 - 10, 7, 0, hsl(205, 10, 26));
      // Seams and rivets.
      for (const yy of [base - h + 22, base - 30]) {
        ctx.fillStyle = hsl(205, 8, 40, 0.6);
        ctx.fillRect(bx, yy, w, 3);
        for (let r = bx + 8; r < bx + w; r += 18) dot(r, yy + 1.5, 1.6, hsl(205, 8, 80));
      }
      // Speckled galvanised spangle.
      for (let k = 0; k < 120; k++) dot(bx + rand(2, w - 2), base - rand(6, h - 4), rand(0.8, 2.4), hsl(205, 6, rand(40, 80), 0.35));
    }

    function twine(cx, cy, r) {
      dot(cx + 4, cy + 6, r, 'rgba(30,20,10,0.35)');
      dot(cx, cy, r, hsl(38, 38, 58));
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.clip();
      for (let i = 0; i < 70; i++) {
        const a = rng() * Math.PI;
        const off = jit(r);
        ctx.strokeStyle = hsl(36, 35, rand(40, 72), 0.8);
        ctx.lineWidth = rand(1, 2);
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(a + 1.57) * off * 0.3, cy + Math.sin(a + 1.57) * off * 0.3, r * 1.05, r * rand(0.2, 0.9), a, 0, TAU);
        ctx.stroke();
      }
      const g = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.4, r * 0.1, cx, cy, r);
      g.addColorStop(0, 'rgba(255,245,220,0.35)');
      g.addColorStop(1, 'rgba(40,25,10,0.45)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.restore();
    }

    function seedling(cx, top, w) {
      for (let i = 0; i < 10; i++) {
        const sx = cx + jit(w * 0.3);
        const len = rand(22, 46);
        line(sx, top + 2, sx + jit(8), top - len, 1.6, hsl(100, 40, 36));
        leafShape(sx + jit(6), top - len * rand(0.5, 1), rand(9, 14), 4.5, -Math.PI / 2 + jit(1.8), hsl(105, 45, 42 + jit(8)));
      }
    }

    function paintBench() {
      const b = BENCH;
      const wood = 50;
      // Ground beneath the bench: trodden gravel in shadow.
      const gTop = b.floor - 150;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(b.x0 - 10, gTop + 30);
      ctx.quadraticCurveTo((b.x0 + b.x1) / 2, gTop - 10, b.x1 + 30, gTop + 30);
      ctx.lineTo(b.x1 + 40, b.floor + 20);
      ctx.lineTo(b.x0 - 20, b.floor + 20);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = hsl(34, 16, 44);
      ctx.fillRect(b.x0 - 30, gTop - 20, b.x1 - b.x0 + 80, 200);
      for (let i = 0; i < 2600; i++) {
        const x = rand(b.x0 - 20, b.x1 + 40), y = rand(gTop - 10, b.floor + 20);
        const r = rand(1.4, 4);
        dab(x + r * 0.3, y + r * 0.4, r, r * 0.7, 0, 'rgba(30,20,10,0.35)');
        dab(x, y, r, r * 0.7, jit(1), hsl(32 + jit(12), 14, 40 + jit(14)));
      }
      const sh = ctx.createLinearGradient(0, gTop - 10, 0, b.floor + 20);
      sh.addColorStop(0, 'rgba(20,14,8,0.65)');
      sh.addColorStop(1, 'rgba(20,14,8,0.2)');
      ctx.fillStyle = sh;
      ctx.fillRect(b.x0 - 30, gTop - 20, b.x1 - b.x0 + 80, 200);
      ctx.restore();
      ctx.fillStyle = 'rgba(25,18,10,0.55)';
      ctx.beginPath();
      ctx.ellipse((b.x0 + b.x1) / 2 + 30, b.floor - 6, (b.x1 - b.x0) / 2 + 40, 34, 0, 0, TAU);
      ctx.fill();
      // Back legs, backboard and its top shelf.
      for (const lx of [b.x0 + 34, b.x1 - 34]) plank(lx, b.back - 186, lx, b.floor - 40, 20, wood - 10);
      for (let i = 0; i < 4; i++) {
        const y = b.back - 160 + i * 38;
        plank(b.x0 + 24, y + 19, b.x1 - 24, y + 19, 36, wood - 4 + jit(4));
        line(b.x0 + 24, y + 37, b.x1 - 24, y + 37, 2, 'rgba(20,10,0,0.45)');
      }
      plank(b.x0 + 10, b.back - 178, b.x1 - 10, b.back - 178, 16, wood + 8);
      // Small pots on the high shelf.
      const shelfBase = b.back - 186;
      pot(b.x0 + 90, shelfBase, 40, 36);
      seedling(b.x0 + 90, shelfBase - 36, 40);
      pot(b.x0 + 170, shelfBase, 36, 32);
      foliage(b.x0 + 170, shelfBase - 42, 22, 14, { h: 120, s: 30, l: 40, size: 4, density: 1.6 });
      pot(b.x1 - 120, shelfBase, 44, 38);
      foliage(b.x1 - 120, shelfBase - 46, 26, 16, { h: 95, s: 20, l: 50, size: 4, density: 1.6 });
      sprinkle(b.x1 - 120, shelfBase - 48, 22, 10, 20, 2, () => hsl(330, 50, 70));
      // Shadow under the worktop.
      ctx.fillStyle = 'rgba(20,10,0,0.45)';
      ctx.fillRect(b.x0 + 20, b.front + 22, b.x1 - b.x0 - 40, 40);
      // Lower shelf with upturned pots.
      const shelfY = b.floor - 132;
      plank(b.x0 + 18, shelfY - 18, b.x1 - 18, shelfY - 18, 26, wood - 14);
      plank(b.x0 + 12, shelfY, b.x1 - 12, shelfY, 16, wood + 2);
      pot(b.x0 + 120, shelfY - 8, 74, 64, { inverted: true });
      pot(b.x0 + 120, shelfY - 62, 70, 30, { inverted: true });
      pot(b.x0 + 230, shelfY - 8, 74, 64, { inverted: true });
      pot(b.x0 + 360, shelfY - 8, 90, 74);
      pot(b.x0 + 480, shelfY - 8, 60, 52, { inverted: true });
      // Worktop: visible top surface and front edge.
      poly([[b.x0, b.front], [b.x0 + 18, b.back], [b.x1 - 18, b.back], [b.x1, b.front]], hsl(32, 18, 54));
      for (let i = 0; i < 3; i++) {
        const y = lerp(b.back, b.front, i / 3);
        line(b.x0 + 12, y, b.x1 - 12, y, 1.6, 'rgba(40,25,10,0.4)');
      }
      for (let i = 0; i < 60; i++) {
        const y = rand(b.back + 2, b.front - 2), x = rand(b.x0 + 20, b.x1 - 60);
        line(x, y, x + rand(30, 90), y + jit(1), 0.8, hsl(32, 15, rand(40, 66), 0.5));
      }
      // Spilled compost.
      for (let i = 0; i < 80; i++) dot(rand(b.x0 + 60, b.x0 + 300), rand(b.back + 6, b.front - 4), rand(1, 3), hsl(25, 30, rand(12, 24)));
      plank(b.x0 - 4, b.front + 11, b.x1 + 4, b.front + 11, 22, wood + 4);
      // Front legs.
      for (const lx of [b.x0 + 22, b.x1 - 22]) plank(lx, b.front + 20, lx, b.floor, 26, wood);
      // On the worktop: nested pots, a seedling, twine and the watering can.
      const surf = b.front - 8;
      pot(b.x0 + 110, surf, 96, 82);
      pot(b.x0 + 110, surf - 60, 98, 36);
      pot(b.x0 + 110, surf - 86, 100, 34);
      const sTop = pot(b.x0 + 240, surf, 72, 60);
      seedling(b.x0 + 240, sTop, 70);
      twine(b.x0 + 340, surf - 36, 36);
      // Loose end of twine running over the edge.
      ctx.strokeStyle = hsl(38, 38, 60);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x0 + 360, surf - 10);
      ctx.bezierCurveTo(b.x0 + 390, b.front + 10, b.x0 + 360, b.front + 60, b.x0 + 384, b.front + 110);
      ctx.stroke();
      wateringCan(b.x0 + 420, surf + 2);
    }

    // --- finishing ------------------------------------------------------------

    function paintFinish() {
      // Warm sunlight from the upper left and a gentle vignette.
      ctx.save();
      ctx.globalCompositeOperation = 'soft-light';
      const sun = ctx.createRadialGradient(500, 200, 100, 700, 500, 2400);
      sun.addColorStop(0, 'rgba(255,236,190,0.55)');
      sun.addColorStop(0.5, 'rgba(255,230,190,0.15)');
      sun.addColorStop(1, 'rgba(40,30,60,0.35)');
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.55, W / 2, H / 2, H * 1.05);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(20,15,10,0.28)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
      // Fine grain, like the print on a real puzzle.
      const img = ctx.getImageData(0, 0, W, H);
      const d = img.data;
      let s = seed | 0;
      for (let i = 0; i < d.length; i += 4) {
        s = (s * 1664525 + 1013904223) | 0;
        const n = ((s >>> 24) - 128) / 16;
        d[i] += n;
        d[i + 1] += n;
        d[i + 2] += n;
      }
      ctx.putImageData(img, 0, 0);
    }

    // --- run ----------------------------------------------------------------

    const stages = [
      paintSky,
      paintDistantTrees,
      paintSideGardens,
      paintRoof,
      () => { for (const d of DORMERS) paintDormer(d); },
      paintChimney,
      paintHouse,
      paintWisteria,
      paintClimbingRoses,
      paintBaseShrubs,
      paintGateway,
      paintStoneWall,
      paintGate,
      paintPath,
      paintBedGround,
      () => {
        const items = planBeds();
        items.push({ y: TREE_BASE_Y, draw: paintTree });
        items.push({ y: BENCH.floor - 30, draw: paintBench });
        paintBeds(items);
      },
      paintFinish,
    ];

    return new Promise((resolve, reject) => {
      let i = 0;
      const next = () => {
        try {
          stages[i]();
          i++;
          onProgress(i / stages.length);
          if (i < stages.length) setTimeout(next, 0);
          else resolve(canvas);
        } catch (err) {
          reject(err);
        }
      };
      setTimeout(next, 0);
    });
  }

  root.CottageScene = { paint: paintScene, width: W, height: H };
})(typeof window !== 'undefined' ? window : globalThis);
