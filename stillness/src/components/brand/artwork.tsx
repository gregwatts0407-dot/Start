import { cn } from '@/lib/utils';
import type { Artwork as ArtworkName } from '@/lib/types';

// Generative cover art: layered soft gradients seeded by the session's slug,
// so every session has a distinct, calm cover without uploading an image.

const PALETTES: Record<ArtworkName, { base: [string, string]; glows: string[] }> = {
  dusk: { base: ['#1d2747', '#4a4570'], glows: ['#d9a35f', '#8d6fa8', '#f0c88a'] },
  night: { base: ['#0c1428', '#1f2c52'], glows: ['#f2e6c9', '#3b5287', '#6c7fb5'] },
  sage: { base: ['#7f9c88', '#c9d4c0'], glows: ['#eef0e2', '#5d7c67', '#e3cf9f'] },
  dawn: { base: ['#efbf94', '#f6dfc4'], glows: ['#fff3df', '#e39b80', '#f2d08a'] },
  ocean: { base: ['#24506a', '#5f95a3'], glows: ['#bfe0de', '#173a52', '#8cc1c4'] },
  mist: { base: ['#b8bfcf', '#e8e4dc'], glows: ['#ffffff', '#9aa5bf', '#d8cbb5'] },
  ember: { base: ['#b8644d', '#e5ab7f'], glows: ['#f7d9a8', '#8a3f3a', '#f2bf8f'] },
};

function hash(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface ArtworkProps {
  palette: ArtworkName;
  seed: string;
  coverUrl?: string | null;
  className?: string;
  children?: React.ReactNode;
}

export function Artwork({ palette, seed, coverUrl, className, children }: ArtworkProps) {
  const p = PALETTES[palette] ?? PALETTES.dusk;
  const h = hash(seed);
  const pos = (shift: number) => `${(h >> shift) % 80 + 10}% ${(h >> (shift + 7)) % 70 + 15}%`;
  const background = coverUrl
    ? undefined
    : [
        `radial-gradient(circle at ${pos(0)}, ${p.glows[0]}cc 0%, transparent 42%)`,
        `radial-gradient(circle at ${pos(5)}, ${p.glows[1]}aa 0%, transparent 50%)`,
        `radial-gradient(circle at ${pos(11)}, ${p.glows[2]}88 0%, transparent 38%)`,
        `linear-gradient(${(h % 120) + 140}deg, ${p.base[0]}, ${p.base[1]})`,
      ].join(', ');

  return (
    <div className={cn('relative overflow-hidden bg-muted', className)} style={{ background }} aria-hidden={!children}>
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
      ) : (
        <svg className="absolute inset-0 size-full opacity-[0.12] mix-blend-overlay" aria-hidden>
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain)" />
        </svg>
      )}
      {children}
    </div>
  );
}

export function artworkIsDark(palette: ArtworkName) {
  return palette === 'dusk' || palette === 'night' || palette === 'ocean' || palette === 'ember';
}
