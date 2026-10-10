"use client";

import { memo, useMemo } from "react";
import { getCanvas } from "@/lib/canvases";
import { cn } from "@/lib/utils";

/**
 * Finished-painting preview rendered as inline SVG with a watercolour treatment:
 * displaced (wobbly) edges, slightly darker pooled edges and a paper grain.
 */
export const CanvasPreview = memo(function CanvasPreview({
  id,
  mode = "colour",
  className,
}: {
  id: string;
  mode?: "colour" | "outline";
  className?: string;
}) {
  const def = useMemo(() => getCanvas(id), [id]);
  if (!def) return null;
  const pal = new Map(def.palette.map((p) => [p.number, p.hex]));
  const fid = `wc-${id}`;
  return (
    <svg
      viewBox={`0 0 ${def.width} ${def.height}`}
      preserveAspectRatio="xMidYMid slice"
      className={cn("block size-full", className)}
      role="img"
      aria-label={`${def.title} preview`}
    >
      <defs>
        <filter id={fid} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="7" result="warp" />
          <feDisplacementMap in="SourceGraphic" in2="warp" scale="9" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id={`${fid}-grain`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="3" />
          <feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 0 0.25  0 0 0 0.16 0" />
        </filter>
      </defs>
      <rect width={def.width} height={def.height} fill="#faf7ef" />
      {mode === "colour" ? (
        <g filter={`url(#${fid})`}>
          {/* Oversized backdrop so displaced edges never reveal blank paper. */}
          <rect x={-40} y={-40} width={def.width + 80} height={def.height + 80} fill={pal.get(def.shapes[0]?.n ?? 1)} />
          {def.shapes.map((s, i) => (
            <path key={i} d={s.d} fill={pal.get(s.n)} fillRule={s.rule} stroke="rgba(60,50,45,0.16)" strokeWidth={1.2} />
          ))}
        </g>
      ) : (
        <g fill="none" stroke="#6b6d76" strokeWidth={1.4} strokeLinejoin="round">
          {def.shapes.map((s, i) => (
            <path key={i} d={s.d} fillRule={s.rule} />
          ))}
        </g>
      )}
      <rect width={def.width} height={def.height} filter={`url(#${fid}-grain)`} style={{ mixBlendMode: "multiply" }} />
    </svg>
  );
});
