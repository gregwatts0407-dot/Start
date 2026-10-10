"use client";

import Link from "next/link";
import { DownloadIcon, ExpandIcon, LayoutGridIcon, RotateCcwIcon, TrophyIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/format";

export function CompletionDialog({
  open,
  onOpenChange,
  title,
  thumb,
  src,
  elapsedMs,
  moves,
  pieces,
  rotation,
  onViewFull,
  onPlayAgain,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  thumb?: string;
  src?: string;
  elapsedMs: number;
  moves: number;
  pieces: number;
  rotation: boolean;
  onViewFull: () => void;
  onPlayAgain: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        {thumb && (
          <div className="relative aspect-[16/8] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumb} alt="" className="size-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/10 to-transparent" />
            <div className="absolute bottom-0 left-1/2 flex size-16 -translate-x-1/2 translate-y-1/3 items-center justify-center rounded-full bg-gold text-black shadow-xl ring-4 ring-background">
              <TrophyIcon className="size-7" />
            </div>
          </div>
        )}
        <div className="px-6 pt-10 pb-6 text-center">
          <DialogTitle className="font-display text-3xl font-semibold">Puzzle complete!</DialogTitle>
          <DialogDescription className="mt-1.5">
            You finished “{title}”. Every piece in its place.
          </DialogDescription>

          <div className="mt-6 grid grid-cols-3 divide-x rounded-xl border bg-muted/40 py-3">
            <Metric label="Time" value={formatTime(elapsedMs)} />
            <Metric label="Moves" value={moves.toLocaleString()} />
            <Metric label="Pieces" value={`${pieces.toLocaleString()}${rotation ? " ↻" : ""}`} />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={onViewFull}>
              <ExpandIcon /> View full image
            </Button>
            <Button variant="outline" asChild>
              <a href={src} download={`${title}.webp`}>
                <DownloadIcon /> Save image
              </a>
            </Button>
            <Button variant="outline" onClick={onPlayAgain}>
              <RotateCcwIcon /> Play again
            </Button>
            <Button asChild>
              <Link href="/#gallery">
                <LayoutGridIcon /> Another puzzle
              </Link>
            </Button>
          </div>
          <button onClick={() => onOpenChange(false)} className="mt-4 text-sm text-muted-foreground hover:text-foreground">
            Admire the finished board
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-0.5 font-display text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
