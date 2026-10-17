// Renders the app icon, favicon and Open Graph image from SVG source.
// Run with `npm run icons`; outputs are committed to public/.
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const out = new URL('../public/', import.meta.url);

/** The lotus: five soft petals and a quiet circle (the "still point"). */
function lotus({ cx, cy, scale, petal = '#f7f3ea', petalBack = '#dfe8e0', dot = '#f7f3ea', edge = '#56735f' }) {
  const t = (d) => `<path d="${d}" transform="translate(${cx} ${cy}) scale(${scale})"/>`;
  return `
  <g fill="${petalBack}" opacity="0.9">
    ${t('M0 40 C -46 40 -86 10 -96 -26 C -64 -24 -30 -6 -10 22 Z')}
    ${t('M0 40 C 46 40 86 10 96 -26 C 64 -24 30 -6 10 22 Z')}
  </g>
  <g fill="${petal}" stroke="${edge}" stroke-width="${1.6 * scale}" stroke-linejoin="round">
    ${t('M0 40 C -34 30 -58 -2 -58 -44 C -30 -36 -10 -14 -2 14 Z')}
    ${t('M0 40 C 34 30 58 -2 58 -44 C 30 -36 10 -14 2 14 Z')}
    ${t('M0 40 C -24 18 -30 -16 -18 -46 C -10 -64 0 -78 0 -78 C 0 -78 10 -64 18 -46 C 30 -16 24 18 0 40 Z')}
  </g>
  <circle cx="${cx}" cy="${cy - 118 * scale}" r="${11 * scale}" fill="${dot}"/>`;
}

function iconSvg({ size = 512, padding = 1, rounded = true } = {}) {
  const r = rounded ? size * 0.22 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6c8b79"/>
      <stop offset="1" stop-color="#3f5a4b"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${r}" fill="url(#bg)"/>
  ${lotus({ cx: size / 2, cy: size * 0.6, scale: (size / 260) * padding })}
</svg>`;
}

function ogSvg() {
  const w = 1200;
  const h = 630;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6c8b79"/>
      <stop offset="1" stop-color="#3a5345"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.28" cy="0.5" r="0.4">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  ${lotus({ cx: 300, cy: 390, scale: 2.1 })}
  <text x="560" y="300" font-family="Helvetica, Arial, sans-serif" font-size="96" font-weight="600" fill="#f7f3ea">Stillpoint</text>
  <text x="564" y="366" font-family="Helvetica, Arial, sans-serif" font-size="34" fill="#dfe8e0">Meditation timer · Breathing · Sounds</text>
  <text x="564" y="424" font-family="Helvetica, Arial, sans-serif" font-size="30" fill="#c9d8cd">Free, private and works offline</text>
</svg>`;
}

async function png(svg, file, size) {
  const buf = await sharp(Buffer.from(svg)).resize(size?.[0], size?.[1]).png().toBuffer();
  await writeFile(new URL(file, out), buf);
  console.log('wrote', file);
}

await writeFile(new URL('favicon.svg', out), iconSvg({ size: 512 }));
await writeFile(new URL('icon-source.svg', out), iconSvg({ size: 512 }));
await png(iconSvg({ size: 512 }), 'icon-512.png');
await png(iconSvg({ size: 512 }), 'icon-192.png', [192, 192]);
await png(iconSvg({ size: 512 }), 'favicon-32.png', [32, 32]);
// Maskable and Apple icons are full-bleed squares (the OS applies its own mask),
// with the motif shrunk into the safe zone.
await png(iconSvg({ size: 512, padding: 0.78, rounded: false }), 'icon-maskable-512.png');
await png(iconSvg({ size: 512, padding: 0.9, rounded: false }), 'apple-touch-icon.png', [180, 180]);
await png(ogSvg(), 'og-image.png');
