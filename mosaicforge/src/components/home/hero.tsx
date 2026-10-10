"use client";

import { useMemo } from "react";
import { cutToSvg } from "@/lib/puzzle/geometry";
import { ArrowDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ASSET_PREFIX } from "@/lib/env";

const W = 600;
const H = 400;
const ROWS = 4;
const COLS = 6;
const IMG = `${ASSET_PREFIX}images/thumbs/monument-valley.webp`;

/** Pieces that "float" out of the hero puzzle: [row, col, dx, dy, rotateDeg]. */
const LIFTED: Array<[number, number, number, number, number]> = [
  [1, 4, 70, -46, 9],
  [2, 1, -52, 58, -14],
  [3, 4, 46, 52, 5],
];

/**
 * Decorative hero: a real 24-piece cut (same generator as the game) of a
 * gallery image, with a few pieces gently floating out of place.
 */
export function Hero({ onBrowse }: { onBrowse: () => void }) {
  const paths = useMemo(() => cutToSvg(ROWS, COLS, W, H, 1337), []);
  const lifted = new Set(LIFTED.map(([r, c]) => `${r}:${c}`));

  return (
    <section className="relative overflow-hidden border-b">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_70%_20%,color-mix(in_oklch,var(--gold)_16%,transparent),transparent_60%)]" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.05fr_1fr] lg:px-8 lg:py-20">
        <div className="max-w-xl">
          <p className="mb-4 text-xs font-semibold tracking-[0.2em] text-gold uppercase">Digital jigsaw studio</p>
          <h1 className="font-display text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Piece together something beautiful.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-pretty text-muted-foreground">
            Curated photography and art, cut into truly interlocking pieces — from a relaxing 100 to a
            2000-piece masterpiece. Smooth zoom, satisfying snaps, and every move saved automatically.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={onBrowse} className="h-11 px-6">
              Choose a puzzle
              <ArrowDownIcon />
            </Button>
            <span className="text-sm text-muted-foreground">No account needed · progress stays on this device</span>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-xl">
          <svg viewBox={`-90 -70 ${W + 180} ${H + 140}`} className="w-full drop-shadow-2xl" role="img" aria-label="A jigsaw puzzle with a few pieces lifted out">
            <defs>
              <filter id="hero-shadow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="10" stdDeviation="9" floodOpacity="0.45" />
              </filter>
              <pattern id="hero-img" patternUnits="userSpaceOnUse" width={W} height={H}>
                <image href={IMG} width={W} height={H} preserveAspectRatio="xMidYMid slice" />
              </pattern>
            </defs>
            {/* Board */}
            <rect x={-6} y={-6} width={W + 12} height={H + 12} rx={10} className="fill-foreground/5 stroke-foreground/10" />
            {paths.map((row, r) =>
              row.map((d, c) =>
                lifted.has(`${r}:${c}`) ? (
                  <path key={`h${r}:${c}`} d={d} className="fill-foreground/[0.06] stroke-foreground/15" strokeWidth={1} strokeDasharray="3 4" />
                ) : (
                  <path key={`${r}:${c}`} d={d} fill="url(#hero-img)" className="stroke-black/25" strokeWidth={1} />
                ),
              ),
            )}
            {LIFTED.map(([r, c, dx, dy, rot], i) => {
              const cx = (c + 0.5) * (W / COLS);
              const cy = (r + 0.5) * (H / ROWS);
              return (
                <g key={i} style={{ animation: `hero-float ${5 + i}s ease-in-out ${i * -1.7}s infinite` }}>
                  <g transform={`translate(${dx} ${dy}) rotate(${rot} ${cx} ${cy})`} filter="url(#hero-shadow)">
                    <path d={paths[r][c]} fill="url(#hero-img)" className="stroke-white/40" strokeWidth={1.5} />
                  </g>
                </g>
              );
            })}
          </svg>
          <style>{`@keyframes hero-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-8px) } } @media (prefers-reduced-motion: reduce) { [style*="hero-float"] { animation: none !important } }`}</style>
        </div>
      </div>
    </section>
  );
}
