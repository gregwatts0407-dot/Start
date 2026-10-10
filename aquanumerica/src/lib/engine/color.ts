/**
 * Colour helpers. Paint is modelled as optical density (Beer–Lambert):
 * a pigment layer transmits T = exp(−D) of the light per channel, so glazes
 * multiply – exactly how transparent watercolour behaves on white paper.
 */

import { PAPER_RGB } from "./paper";

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  const to = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Maximum density we ever store per channel (≈ 0.25% transmission). */
export const MAX_DENSITY = 6;

/**
 * Pigment density that reproduces `rgb` when laid once at full strength on our
 * paper. Computed relative to the paper tone so the finished painting matches
 * the palette swatch.
 */
export function rgbToDensity(rgb: RGB): RGB {
  return [0, 1, 2].map((c) => {
    const t = Math.min(1, Math.max(0.0025, rgb[c] / PAPER_RGB[c]));
    return Math.min(MAX_DENSITY, -Math.log(t));
  }) as RGB;
}

/** Colour seen on paper for a given density. */
export function densityToRgb(d: ArrayLike<number>): RGB {
  return [0, 1, 2].map((c) => PAPER_RGB[c] * Math.exp(-d[c])) as RGB;
}

// --- CIE Lab (D65) for accuracy scoring ---------------------------------

function srgbToLinear(v: number) {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function rgbToLab([r, g, b]: RGB): RGB {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function deltaE(a: RGB, b: RGB): number {
  const A = rgbToLab(a), B = rgbToLab(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}

// --- HSV for the colour wheel --------------------------------------------

export function hsvToRgb(h: number, s: number, v: number): RGB {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}

export function rgbToHsv([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

/** Relative luminance – used to pick legible label colours. */
export function luminance([r, g, b]: RGB): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}
