/**
 * Procedural cold-press watercolour paper.
 *
 * The height field combines cellular (Worley) noise – which gives the soft,
 * dimpled "tooth" of mould-made cold-press paper – with multi-octave value
 * noise and faint fibres. The texture tiles seamlessly so a single 1024²
 * height map can cover canvases of any size.
 */

import { hash2, valueNoise } from "./noise";

export const PAPER_SIZE = 1024;
export const PAPER_MASK = PAPER_SIZE - 1;

/** Warm, slightly creamy paper base colour (0..255). */
export const PAPER_RGB: [number, number, number] = [250, 247, 239];

export interface PaperTexture {
  size: number;
  /** Height 0..1 (mean ≈ 0.5). Valleys (low) collect granulating pigment. */
  height: Float32Array;
  /** Directional lighting term ≈ 1 ± 0.1, derived from the height gradient. */
  shade: Float32Array;
  /** Fine pigment speckle 0..1 (tileable) used for granulation. */
  fine: Float32Array;
  /** Large-scale cockling field −1..1 (tileable), at 1/4 resolution. */
  cockle: Float32Array;
  cockleSize: number;
}

let cached: PaperTexture | null = null;

export const PAPER_SEED = 2024;

export function getPaperTexture(): PaperTexture {
  if (!cached) cached = generatePaper(PAPER_SIZE, PAPER_SEED);
  return cached;
}

export function hasPaperTexture() {
  return cached !== null;
}

/** Install a texture generated elsewhere (e.g. in the analysis worker). */
export function setPaperTexture(p: PaperTexture) {
  cached = p;
}

export function generatePaper(size: number, seed: number): PaperTexture {
  const height = new Float32Array(size * size);

  // Worley feature points on a periodic grid.
  const cells = 96; // ≈11 px cells at 1024 – a medium cold-press tooth
  const cellSize = size / cells;
  const fx = new Float32Array(cells * cells);
  const fy = new Float32Array(cells * cells);
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      fx[cy * cells + cx] = (cx + 0.15 + 0.7 * hash2(cx, cy, seed)) * cellSize;
      fy[cy * cells + cx] = (cy + 0.15 + 0.7 * hash2(cx, cy, seed + 1)) * cellSize;
    }
  }

  let min = Infinity, max = -Infinity;
  for (let y = 0; y < size; y++) {
    const cy = Math.floor(y / cellSize);
    for (let x = 0; x < size; x++) {
      const cx = Math.floor(x / cellSize);
      let f1 = Infinity;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          let nx = cx + ox, ny = cy + oy;
          let wrapX = 0, wrapY = 0;
          if (nx < 0) { nx += cells; wrapX = -size; } else if (nx >= cells) { nx -= cells; wrapX = size; }
          if (ny < 0) { ny += cells; wrapY = -size; } else if (ny >= cells) { ny -= cells; wrapY = size; }
          const k = ny * cells + nx;
          const dx = fx[k] + wrapX - x, dy = fy[k] + wrapY - y;
          const d = dx * dx + dy * dy;
          if (d < f1) f1 = d;
        }
      }
      // Soft rounded domes around each feature point (no hard creases).
      const t = Math.min(1, Math.sqrt(f1) / (cellSize * 0.8));
      const bumps = 1 - t * t * (3 - 2 * t);

      // Multi-octave value noise (tileable).
      const u = x / size, v = y / size;
      const n1 = valueNoise(u * 16, v * 16, seed + 11, 16);
      const n2 = valueNoise(u * 48, v * 48, seed + 12, 48);
      const n3 = valueNoise(u * 160, v * 160, seed + 13, 160);
      // Faint horizontal fibres.
      const fibre = valueNoise(u * 24, v * 320, seed + 14, 24) * 0.5 +
        valueNoise(u * 320, v * 24, seed + 15, 320) * 0.5;

      const h = 0.3 * bumps + 0.3 * n1 + 0.2 * n2 + 0.14 * n3 + 0.06 * fibre;
      height[y * size + x] = h;
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }
  const range = max - min || 1;
  for (let i = 0; i < height.length; i++) height[i] = (height[i] - min) / range;

  // Lighting from the upper-left.
  const shade = new Float32Array(size * size);
  const m = size - 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hl = height[y * size + ((x - 1) & m)];
      const hr = height[y * size + ((x + 1) & m)];
      const hu = height[((y - 1) & m) * size + x];
      const hd = height[((y + 1) & m) * size + x];
      const lambert = (hl - hr) * 0.7 + (hu - hd) * 0.7;
      shade[y * size + x] = 1 + lambert * 0.2 + (height[y * size + x] - 0.5) * 0.04;
    }
  }

  // Fine speckle: per-pixel noise, lightly blurred, for granulating pigment.
  const raw = new Float32Array(size * size);
  for (let i = 0; i < raw.length; i++) raw[i] = hash2(i % size, (i / size) | 0, seed + 31);
  const fine = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = raw[y * size + x] * 4 + raw[y * size + ((x + 1) & m)] + raw[y * size + ((x - 1) & m)] +
        raw[((y + 1) & m) * size + x] + raw[((y - 1) & m) * size + x];
      fine[y * size + x] = c / 8;
    }
  }

  // Cockling: gentle large-scale undulation, expressed as shading.
  const cs = size >> 2;
  const cockle = new Float32Array(cs * cs);
  for (let y = 0; y < cs; y++) {
    for (let x = 0; x < cs; x++) {
      const u = x / cs, v = y / cs;
      const a = valueNoise(u * 3, v * 3, seed + 21, 3);
      const b = valueNoise(u * 3 + 0.02, v * 3 + 0.02, seed + 21, 3);
      const c = valueNoise(u * 7, v * 7, seed + 22, 7) - 0.5;
      cockle[y * cs + x] = Math.max(-1, Math.min(1, (a - b) * 28 + c * 0.6));
    }
  }

  return { size, height, shade, fine, cockle, cockleSize: cs };
}
