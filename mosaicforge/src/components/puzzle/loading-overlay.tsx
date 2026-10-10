"use client";

import { Progress } from "@/components/ui/progress";
import { LogoMark } from "@/components/logo";

export function LoadingOverlay({
  label,
  progress,
  pieces,
  thumb,
}: {
  label: string;
  progress: number;
  pieces?: number;
  thumb?: string;
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center overflow-hidden">
      {thumb && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-30 blur-2xl" />
      )}
      <div className="relative w-80 rounded-2xl border bg-card/90 p-6 text-center shadow-2xl backdrop-blur-xl">
        <LogoMark className="mx-auto mb-3 size-10 animate-pulse" />
        <p className="font-medium">{label}…</p>
        {pieces ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Generating {pieces.toLocaleString()} interlocking pieces
          </p>
        ) : null}
        <Progress value={Math.round(progress * 100)} className="mt-4" />
        <p className="mt-2 text-xs text-muted-foreground tabular-nums">{Math.round(progress * 100)}%</p>
      </div>
    </div>
  );
}
