"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Layers3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABELS, DIFFICULTY_LABELS, type CanvasMeta } from "@/lib/canvases/types";
import { loadThumbnail, type ProgressMeta } from "@/lib/storage";
import { useMounted } from "@/hooks/use-mounted";
import { cn } from "@/lib/utils";
import { CanvasPreview } from "./canvas-preview";

const DIFF_DOTS = { easy: 1, medium: 2, hard: 3 } as const;

export function CanvasCard({ meta, regions, progress }: { meta: CanvasMeta; regions?: number; progress?: ProgressMeta }) {
  const mounted = useMounted();
  const [thumb, setThumb] = useState<string | null>(null);
  const started = !!progress && progress.percent > 0.5;

  useEffect(() => {
    if (!started) return;
    let url: string | null = null;
    let cancelled = false;
    loadThumbnail(meta.id).then((blob) => {
      if (blob && !cancelled) {
        url = URL.createObjectURL(blob);
        setThumb(url);
      }
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [meta.id, started, progress?.updatedAt]);

  return (
    <Link
      href={`/paint/${meta.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgba(30,30,50,0.04),0_8px_30px_-12px_rgba(30,40,80,0.18)] transition-all duration-300 outline-none hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(30,30,50,0.05),0_18px_40px_-16px_rgba(30,40,80,0.3)] focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[#faf7ef]">
        {mounted && (
          <>
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt={`Your ${meta.title} painting`} className="size-full object-cover" />
            ) : (
              <CanvasPreview id={meta.id} className="transition-opacity duration-500 group-hover:opacity-0" />
            )}
            {!thumb && <CanvasPreview id={meta.id} mode="outline" className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />}
          </>
        )}
        {!mounted && <div className="size-full animate-pulse bg-muted/60" />}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        {progress?.finished ? (
          <Badge className="absolute top-3 left-3 bg-card/90 text-foreground shadow-sm backdrop-blur" variant="secondary">
            <CheckCircle2 className="text-sage" /> Finished
          </Badge>
        ) : started ? (
          <Badge className="absolute top-3 left-3 bg-card/90 text-foreground shadow-sm backdrop-blur" variant="secondary">
            Your painting · {Math.round(progress!.percent)}%
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-lg leading-tight font-medium">{meta.title}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{meta.description}</p>
          </div>
          <span className="mt-1 flex shrink-0 gap-0.5" title={DIFFICULTY_LABELS[meta.difficulty]} aria-label={`Difficulty: ${DIFFICULTY_LABELS[meta.difficulty]}`}>
            {[1, 2, 3].map((d) => (
              <span key={d} className={cn("size-1.5 rounded-full", d <= DIFF_DOTS[meta.difficulty] ? "bg-primary/70" : "bg-muted-foreground/20")} />
            ))}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="soft">{CATEGORY_LABELS[meta.category]}</Badge>
          <Badge variant="outline">{DIFFICULTY_LABELS[meta.difficulty]}</Badge>
          {regions != null && (
            <Badge variant="outline" className="gap-1">
              <Layers3 /> {regions} regions
            </Badge>
          )}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <div className="flex -space-x-1">
            {meta.palette.slice(0, 10).map((p) => (
              <span key={p.number} className="size-4 rounded-full border border-card shadow-[0_0_0_0.5px_rgba(0,0,0,0.12)]" style={{ background: p.hex }} title={`${p.number} · ${p.name}`} />
            ))}
            {meta.palette.length > 10 && <span className="ml-2 text-xs text-muted-foreground">+{meta.palette.length - 10}</span>}
          </div>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
            {progress?.finished ? "Revisit" : started ? "Continue" : "Begin"}
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
        {started && !progress?.finished && (
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.min(100, progress!.percent)}%` }} />
          </div>
        )}
      </div>
    </Link>
  );
}
