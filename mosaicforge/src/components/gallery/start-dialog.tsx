"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ExternalLinkIcon,
  GridIcon,
  Loader2Icon,
  PaletteIcon,
  PlayIcon,
  RotateCwIcon,
  ShuffleIcon,
  SquareDashedIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import { pieceOptions, type PieceCount } from "@/lib/difficulty";
import type { GalleryImage } from "@/lib/images";
import { createPuzzle } from "@/lib/create-puzzle";
import type { SaveRecord, StartMode } from "@/lib/puzzle/types";
import { usePrefs } from "@/store/prefs";
import { cn } from "@/lib/utils";

export function StartDialog({
  image,
  saves,
  onOpenChange,
}: {
  image: GalleryImage | null;
  saves: SaveRecord[];
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!image} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-5xl">
        {image && <StartForm key={image.id} image={image} saves={saves} />}
      </DialogContent>
    </Dialog>
  );
}

function StartForm({ image, saves }: { image: GalleryImage; saves: SaveRecord[] }) {
  const router = useRouter();
  const prefs = usePrefs();
  const [count, setCount] = useState<PieceCount>(prefs.lastPieceCount);
  const [rotation, setRotation] = useState(prefs.lastRotation);
  const [mode, setMode] = useState<StartMode>(prefs.lastStartMode);
  const [fullLoaded, setFullLoaded] = useState(false);
  const [starting, setStarting] = useState(false);

  const options = useMemo(() => pieceOptions(image.width, image.height, rotation), [image, rotation]);
  const opt = options.find((o) => o.target === count) ?? options[1];
  const existing = saves.filter((s) => s.config.imageId === image.id && !s.completed);

  async function start() {
    setStarting(true);
    try {
      prefs.set({ lastPieceCount: count, lastRotation: rotation, lastStartMode: mode });
      const id = await createPuzzle(image, opt, rotation, mode);
      router.push(`/play?id=${id}`);
    } catch (e) {
      setStarting(false);
      toast.error(e instanceof Error ? e.message : "Could not create the puzzle");
    }
  }

  return (
    <div className="grid md:grid-cols-[1.35fr_1fr]">
      {/* Preview */}
      <div className="group relative flex min-h-64 items-center justify-center bg-black/90 p-4 md:p-6">
        <div className="relative w-full" style={{ aspectRatio: `${image.width} / ${image.height}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.thumb} alt="" className="absolute inset-0 size-full rounded-md object-contain" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.src}
            alt={image.title}
            onLoad={() => setFullLoaded(true)}
            className={cn(
              "absolute inset-0 size-full rounded-md object-contain shadow-2xl transition-opacity duration-500",
              fullLoaded ? "opacity-100" : "opacity-0",
            )}
          />
          {/* Grid overlay hinting at the cut */}
          <div
            className="pointer-events-none absolute inset-0 rounded-md opacity-0 transition-opacity duration-300 md:group-hover:opacity-100"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(255,255,255,.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.25) 1px, transparent 1px)",
              backgroundSize: `${100 / opt.cols}% ${100 / opt.rows}%`,
            }}
          />
        </div>
        <a
          href={image.src}
          target="_blank"
          rel="noreferrer"
          className="absolute bottom-3 left-4 flex items-center gap-1.5 text-xs text-white/60 hover:text-white"
        >
          <ExternalLinkIcon className="size-3.5" /> View full resolution · {image.width} × {image.height}
        </a>
      </div>

      {/* Settings */}
      <div className="flex flex-col gap-5 p-6">
        <div className="pr-8">
          <Badge variant="secondary" className="mb-2">
            {image.custom ? "Your image" : image.category}
          </Badge>
          <DialogTitle className="font-display text-2xl font-semibold">{image.title}</DialogTitle>
          <DialogDescription className="mt-1">{image.credit}</DialogDescription>
        </div>

        <div className="space-y-2.5">
          <Label className="text-xs tracking-wide text-muted-foreground uppercase">Pieces</Label>
          <div className="grid grid-cols-4 gap-1.5">
            {options.map((o) => (
              <button
                key={o.target}
                onClick={() => setCount(o.target)}
                aria-pressed={o.target === count}
                aria-label={`${o.target} pieces, ${o.label}`}
                className={cn(
                  "rounded-lg border px-2 py-2 text-center transition-all",
                  o.target === count
                    ? "border-gold bg-gold/10 ring-1 ring-gold"
                    : "hover:border-foreground/25 hover:bg-muted/60",
                )}
              >
                <span className="block text-base font-semibold tabular-nums">{o.target}</span>
                <span className="block text-[10px] tracking-wide text-muted-foreground uppercase">{o.label}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/60 p-3 text-center">
            <Stat label="Grid" value={`${opt.cols} × ${opt.rows}`} sub={`${opt.actual} pieces`} />
            <Stat label="Piece size" value={`≈${opt.piecePx}px`} sub="of the source" />
            <Stat label="Est. time" value={opt.estimate} sub={<Pips n={opt.pips} />} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label htmlFor="rot" className="flex items-center gap-1.5">
              <RotateCwIcon className="size-3.5" /> Piece rotation
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">Pieces start turned; tap or press R to rotate 90°.</p>
          </div>
          <Switch id="rot" checked={rotation} onCheckedChange={setRotation} />
        </div>

        <div className="space-y-2">
          <Label className="text-xs tracking-wide text-muted-foreground uppercase">Starting layout</Label>
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(v) => v && setMode(v as StartMode)}
            className="w-full"
          >
            <ToggleGroupItem value="scatter">
              <ShuffleIcon /> Scatter
            </ToggleGroupItem>
            <ToggleGroupItem value="edges">
              <SquareDashedIcon /> Edges first
            </ToggleGroupItem>
            <ToggleGroupItem value="colour">
              <PaletteIcon /> By colour
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {existing.length > 0 && (
          <div className="rounded-lg border border-gold/30 bg-gold/5 p-3 text-sm">
            <p className="mb-1.5 flex items-center gap-1.5 font-medium">
              <GridIcon className="size-3.5" /> In progress with this image
            </p>
            <div className="flex flex-wrap gap-1.5">
              {existing.slice(0, 4).map((s) => (
                <Link
                  key={s.id}
                  href={`/play?id=${s.id}`}
                  className="rounded-md bg-background px-2 py-1 text-xs ring-1 ring-border hover:ring-gold"
                >
                  {s.config.rows * s.config.cols} pcs · {Math.round(s.progress * 100)}%
                </Link>
              ))}
            </div>
          </div>
        )}

        <Button size="lg" className="mt-auto h-11" onClick={start} disabled={starting}>
          {starting ? <Loader2Icon className="animate-spin" /> : <PlayIcon className="fill-current" />}
          Start {opt.actual}-piece puzzle
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 flex justify-center text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function Pips({ n }: { n: number }) {
  return (
    <span className="flex items-center gap-0.5 py-1" aria-label={`Difficulty ${n} of 7`}>
      {Array.from({ length: 7 }, (_, i) => (
        <span key={i} className={cn("h-1.5 w-2.5 rounded-full", i < n ? "bg-gold" : "bg-foreground/15")} />
      ))}
    </span>
  );
}
