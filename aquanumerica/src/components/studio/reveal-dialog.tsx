"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Brush, Download, FileText, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { readProgressMeta, writeProgressMeta } from "@/lib/storage";
import { formatDuration } from "@/lib/utils";
import { useExporter } from "./right-panel";
import { useStudio } from "./studio-context";

const FINISHED = { scale: 2, background: "paper", underdrawing: "soft", numbers: false, varnish: true } as const;

/** Finish & Reveal: switch to finished mode and present the painting. */
export function RevealDialog() {
  const open = useStudio((s) => s.revealOpen);
  const engine = useStudio((s) => s.engine);
  const def = useStudio((s) => s.def);
  const progress = useStudio((s) => s.progress);
  const elapsed = useStudio((s) => s.elapsedMs);
  const setUi = useStudio((s) => s.setUi);
  const setDisplay = useStudio((s) => s.setDisplay);
  const finished = useStudio((s) => s.display.finished);
  const [image, setImage] = useState<string | null>(null);
  const { run, busy } = useExporter();

  useEffect(() => {
    if (!open || !engine) return;
    setDisplay({ finished: true });
    // Render after the dialog has opened so the animation stays smooth.
    const t = setTimeout(() => {
      const c = engine.renderExport({ ...FINISHED, scale: 0.75 });
      setImage(c.toDataURL("image/jpeg", 0.92));
      const p = engine.computeStats();
      const prev = readProgressMeta()[def.id];
      writeProgressMeta(def.id, {
        percent: p.percent,
        regionsDone: p.completeRegions,
        regionsTotal: p.totalRegions,
        accuracy: p.accuracy,
        updatedAt: Date.now(),
        finished: (prev?.finished ?? false) || p.completeRegions >= p.totalRegions * 0.9,
      });
    }, 220);
    return () => clearTimeout(t);
  }, [open, engine, def.id, setDisplay]);

  const close = (keepFinished: boolean) => {
    setUi({ revealOpen: false });
    if (!keepFinished) setDisplay({ finished: false });
    setImage(null);
  };

  const complete = progress ? progress.completeRegions / Math.max(1, progress.totalRegions) : 0;
  const portrait = def.height > def.width;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close(finished)}>
      <DialogContent className="max-w-[min(1100px,calc(100%-2rem))] gap-0 overflow-hidden p-0 sm:max-w-[min(1100px,calc(100%-2rem))]">
        <div className={portrait ? "grid md:grid-cols-[1fr_320px]" : "grid lg:grid-cols-[1fr_300px]"}>
          <div className="paper-texture flex items-center justify-center bg-viewport p-5 sm:p-8">
            <div className="relative w-full bg-[#f6f2ea] p-3 shadow-[0_20px_50px_-20px_rgba(20,25,45,0.5)] sm:p-5" style={{ maxWidth: portrait ? 460 : 720 }}>
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt={`Finished watercolour of ${def.title}`} className="block w-full animate-in fade-in-0 zoom-in-[0.98] duration-700" />
              ) : (
                <div className="flex items-center justify-center bg-muted/40" style={{ aspectRatio: `${def.width} / ${def.height}` }}>
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-5 p-6">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                <Sparkles className="size-3.5" /> {complete >= 0.999 ? "Finished painting" : "Preview of your painting"}
              </p>
              <DialogTitle className="mt-1 text-2xl">{def.title}</DialogTitle>
              <DialogDescription className="mt-1">
                {complete >= 0.999
                  ? "Every region is painted. The numbers are gone and the pencil lines rest softly beneath the paint."
                  : `${Math.round(complete * 100)}% of regions are complete – you can keep painting any time.`}
              </DialogDescription>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Regions" value={`${progress?.completeRegions ?? 0}/${progress?.totalRegions ?? 0}`} />
              <Stat label="Accuracy" value={progress?.completeRegions ? `${Math.round(progress.accuracy)}%` : "—"} />
              <Stat label="Time" value={elapsed < 60_000 ? "<1 min" : formatDuration(elapsed)} />
            </dl>
            <div className="flex flex-col gap-2">
              <Button disabled={busy} onClick={() => run("png", FINISHED)}>
                {busy ? <Loader2 className="animate-spin" /> : <Download />} Download high-res PNG
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => run("pdf", FINISHED)}>
                <FileText /> Download PDF print
              </Button>
            </div>
            <div className="mt-auto flex flex-col gap-2">
              <Button variant="secondary" onClick={() => close(false)}>
                <Brush /> Keep painting
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/">Back to the gallery</Link>
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card/60 px-2 py-2">
      <dt className="text-[10px] tracking-wider text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-0.5 font-display text-base font-medium tabular-nums">{value}</dd>
    </div>
  );
}
