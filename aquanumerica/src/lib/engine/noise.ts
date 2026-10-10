/**
 * Deterministic noise utilities shared by the paper generator and brushes.
 * Everything is seedable so strokes replay identically and textures are
 * stable between sessions.
 */

/** Mulberry32 PRNG – tiny, fast, good enough for visual noise. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer lattice hash → [0, 1). */
export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Smooth value noise, tileable with the given integer period (0 = no tiling). */
export function valueNoise(x: number, y: number, seed: number, period = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  let x0 = xi, y0 = yi, x1 = xi + 1, y1 = yi + 1;
  if (period > 0) {
    x0 = ((x0 % period) + period) % period;
    y0 = ((y0 % period) + period) % period;
    x1 = ((x1 % period) + period) % period;
    y1 = ((y1 % period) + period) % period;
  }
  const u = fade(xf), v = fade(yf);
  const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * A pre-baked tileable fBm texture. Sampling it bilinearly is an order of
 * magnitude faster than evaluating noise per pixel inside brush loops.
 */
export class NoiseTexture {
  readonly size: number;
  readonly data: Float32Array;
  private readonly mask: number;

  constructor(size = 256, seed = 7, octaves = 4) {
    this.size = size;
    this.mask = size - 1;
    this.data = new Float32Array(size * size);
    let min = Infinity, max = -Infinity;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let amp = 1, freq = 4, sum = 0, norm = 0;
        for (let o = 0; o < octaves; o++) {
          sum += amp * valueNoise((x / size) * freq, (y / size) * freq, seed + o * 31, freq);
          norm += amp;
          amp *= 0.5;
          freq *= 2;
        }
        const v = sum / norm;
        this.data[y * size + x] = v;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    // Normalise to the full 0..1 range for predictable contrast.
    const range = max - min || 1;
    for (let i = 0; i < this.data.length; i++) this.data[i] = (this.data[i] - min) / range;
  }

  /** Bilinear sample in texel units (wraps). */
  sample(x: number, y: number): number {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const m = this.mask, s = this.size, d = this.data;
    const x0 = xi & m, y0 = yi & m, x1 = (xi + 1) & m, y1 = (yi + 1) & m;
    const a = d[y0 * s + x0], b = d[y0 * s + x1], c = d[y1 * s + x0], e = d[y1 * s + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + e) * fx * fy;
  }
}

let sharedNoise: NoiseTexture | null = null;
/** Lazily created shared noise texture used by brushes and fills. */
export function getNoise(): NoiseTexture {
  if (!sharedNoise) sharedNoise = new NoiseTexture(256, 1337, 5);
  return sharedNoise;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
