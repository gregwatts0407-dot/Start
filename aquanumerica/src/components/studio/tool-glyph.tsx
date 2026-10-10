"use client";

import { useId } from "react";
import { Eraser, PaintBucket, Pipette } from "lucide-react";
import type { ToolId } from "@/lib/engine/brushes";

/** Small illustrated preview of each implement's mark, in the current colour. */
export function ToolGlyph({ id, color, active }: { id: ToolId; color: string; active: boolean }) {
  const uid = useId().replace(/:/g, "");
  const op = active ? 1 : 0.8;
  const box = "h-7 w-11";
  switch (id) {
    case "watercolor":
      return (
        <svg viewBox="0 0 44 28" className={box} aria-hidden>
          <defs>
            <filter id={`b${uid}`}>
              <feGaussianBlur stdDeviation="1.3" />
            </filter>
          </defs>
          <path d="M5 19c6-9 12-10 17-6s11 3 17-6" fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" opacity={0.75 * op} filter={`url(#b${uid})`} />
          <path d="M5 19c6-9 12-10 17-6s11 3 17-6" fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" opacity={0.25 * op} />
        </svg>
      );
    case "round":
      return (
        <svg viewBox="0 0 44 28" className={box} aria-hidden>
          <path d="M4 20C10 14 15 9 22 11s12 4 18-4c-5 9-12 9-18 7S10 18 4 20Z" fill={color} opacity={0.9 * op} />
        </svg>
      );
    case "flat":
      return (
        <svg viewBox="0 0 44 28" className={box} aria-hidden>
          <path d="M5 17c8-6 14-6 20-3s10 1 14-3" fill="none" stroke={color} strokeWidth="11" strokeLinecap="butt" opacity={0.8 * op} />
          <path d="M5 14c8-6 14-6 20-3s10 1 14-3M5 20c8-6 14-6 20-3s10 1 14-3" fill="none" stroke="#fff" strokeWidth="0.8" opacity="0.5" />
        </svg>
      );
    case "liner":
      return (
        <svg viewBox="0 0 44 28" className={box} aria-hidden>
          <path d="M4 18c4-6 7-8 10-5s6 5 9 0 6-7 9-3 5 4 8 0" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" opacity={op} />
        </svg>
      );
    case "fill":
      return (
        <span className="relative flex h-7 w-11 items-center justify-center" aria-hidden>
          <PaintBucket className="size-5" />
          <span className="absolute right-2 bottom-0.5 size-2.5 rounded-full border border-card" style={{ background: color }} />
        </span>
      );
    case "eyedropper":
      return (
        <span className="flex h-7 w-11 items-center justify-center" aria-hidden>
          <Pipette className="size-5" />
        </span>
      );
    case "eraser":
      return (
        <span className="flex h-7 w-11 items-center justify-center" aria-hidden>
          <Eraser className="size-5" />
        </span>
      );
  }
}
