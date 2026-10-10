"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  BrushIcon, Download, Eraser, Eye, EyeOff, FileImage, FileText, History as HistoryIcon, Layers, Loader2, PaintBucket,
  RotateCcw, ShieldCheck, Sparkles, Trash2, TrendingUp, Undo2, Redo2, Wind,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ExportOptions } from "@/lib/engine/engine";
import type { HistoryKind } from "@/lib/engine/history";
import type { LayerSettings, LayerState } from "@/lib/engine/renderer";
import type { RightTab } from "@/lib/store/studio-store";
import { cn, formatDuration, timeAgo } from "@/lib/utils";
import { swatchRadius } from "./left-panel";
import { useStudio } from "./studio-context";

export function RightPanel() {
  const tab = useStudio((s) => s.rightTab);
  const setUi = useStudio((s) => s.setUi);
  return (
    <Tabs value={tab} onValueChange={(v) => setUi({ rightTab: v as RightTab })} className="flex h-full min-h-0 flex-col gap-0">
      <div className="border-b p-3 pr-10 xl:pr-3">
        <TabsList className="w-full [&>button]:px-1 [&>button]:text-xs">
          <TabsTrigger value="progress" aria-label="Progress">
            <TrendingUp className="size-3.5" /> Progress
          </TabsTrigger>
          <TabsTrigger value="layers" aria-label="Layers">
            <Layers className="size-3.5" /> Layers
          </TabsTrigger>
          <TabsTrigger value="history" aria-label="History">
            <HistoryIcon className="size-3.5" /> History
          </TabsTrigger>
          <TabsTrigger value="export" aria-label="Export">
            <Download className="size-3.5" /> Export
          </TabsTrigger>
        </TabsList>
      </div>
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
        <TabsContent value="progress" className="p-4">
          <ProgressPanel />
        </TabsContent>
        <TabsContent value="layers" className="p-4">
          <LayersPanel />
        </TabsContent>
        <TabsContent value="history" className="p-4">
          <HistoryPanel />
        </TabsContent>
        <TabsContent value="export" className="p-4">
          <ExportPanel />
        </TabsContent>
      </div>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

function Ring({ value, size = 112 }: { value: number; size?: number }) {
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth="8" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--primary)"
        strokeOpacity="0.8"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(1, value / 100))}
        className="transition-[stroke-dashoffset] duration-700"
      />
    </svg>
  );
}

function ProgressPanel() {
  const progress = useStudio((s) => s.progress);
  const def = useStudio((s) => s.def);
  const lock = useStudio((s) => s.lock);
  const elapsed = useStudio((s) => s.elapsedMs);
  const activeNumber = useStudio((s) => s.activeNumber);
  const selectNumber = useStudio((s) => s.selectNumber);
  const engine = useStudio((s) => s.engine);
  const setUi = useStudio((s) => s.setUi);
  const [confirmClear, setConfirmClear] = useState(false);

  const pct = progress?.percent ?? 0;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Ring value={pct} />
          <span className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-2xl font-medium tabular-nums">{Math.round(pct)}%</span>
            <span className="text-[10px] tracking-wider text-muted-foreground uppercase">painted</span>
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm">
            <span className="font-display text-xl font-medium tabular-nums">{progress?.completeRegions ?? 0}</span>
            <span className="text-muted-foreground"> of {progress?.totalRegions ?? "…"} regions complete</span>
          </p>
          <p className="text-xs text-muted-foreground">Painting for {formatDuration(elapsed)}</p>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex cursor-help items-center gap-2">
                <Sparkles className="size-3.5 text-gold" />
                <span className="text-xs">
                  Accuracy <span className="font-medium tabular-nums">{progress && progress.completeRegions ? `${Math.round(progress.accuracy)}%` : "—"}</span>
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="left">How closely finished regions match their palette colours. Just for fun – it never blocks you.</TooltipContent>
          </Tooltip>
          {lock !== "off" && (
            <Badge variant="soft" className="gap-1">
              <ShieldCheck /> Clean-edge bonus
            </Badge>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">By colour</h3>
        {def.palette.map((p) => {
          const pn = progress?.perNumber[p.number];
          const done = !!pn && pn.complete === pn.total;
          return (
            <button
              key={p.number}
              onClick={() => {
                selectNumber(p.number);
                engine?.focusNextUnfinished(p.number);
              }}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent",
                activeNumber === p.number && "bg-primary/8",
              )}
            >
              <span className="flex size-6 shrink-0 items-center justify-center text-[11px] font-semibold text-black/60" style={{ background: p.hex, borderRadius: swatchRadius(p.number) }}>
                {p.number}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 text-sm">
                  <span className={cn("truncate", done && "text-muted-foreground line-through decoration-muted-foreground/40")}>{p.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {pn ? `${pn.complete}/${pn.total}` : "…"}
                  </span>
                </span>
                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.round(Math.min(1, (pn?.coverage ?? 0) / 0.9) * 100)}%`, background: p.hex }} />
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            engine?.pickRegionOnce((region) => {
              setUi({ pickingReset: false });
              if (region >= 0) {
                engine.resetRegion(region);
                toast("Region washed clean", { action: { label: "Undo", onClick: () => engine.undo() }, duration: 3000 });
              }
            });
            setUi({ pickingReset: true, rightOpen: false });
          }}
        >
          <RotateCcw /> Reset a region…
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmClear(true)}>
          <Trash2 /> Clear painting
        </Button>
      </div>
      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear the whole painting?</DialogTitle>
            <DialogDescription>All paint is washed off the paper. You can still undo this from the history panel.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Keep painting</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                engine?.clearAll();
                setConfirmClear(false);
              }}
            >
              Clear painting
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

const LAYER_ROWS: Array<{ key: "varnish" | "underdrawing" | "paint" | "paper"; name: string; hint: string }> = [
  { key: "varnish", name: "Varnish", hint: "Soft-focus glow and a warm vignette" },
  { key: "underdrawing", name: "Underdrawing", hint: "Graphite outlines and numbers" },
  { key: "paint", name: "Paint", hint: "Your watercolour washes" },
  { key: "paper", name: "Paper grain", hint: "Cold-press texture and tooth" },
];

function LayersPanel() {
  const layers = useStudio((s) => s.layers);
  const setLayers = useStudio((s) => s.setLayers);
  const drying = useStudio((s) => s.dryingSpeed);
  const setDrying = useStudio((s) => s.setDryingSpeed);
  const engine = useStudio((s) => s.engine);
  const wet = useStudio((s) => s.wet);
  const patchLayer = (key: keyof LayerSettings, patch: Partial<LayerState>) =>
    setLayers({ [key]: { ...(layers[key] as LayerState), ...patch } } as Partial<LayerSettings>);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        {LAYER_ROWS.map(({ key, name, hint }) => {
          const L = layers[key];
          return (
            <div key={key} className={cn("rounded-xl border bg-card/70 p-3 transition-opacity", !L.visible && "opacity-60")}>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${L.visible ? "Hide" : "Show"} ${name}`}
                  aria-pressed={L.visible}
                  onClick={() => patchLayer(key, { visible: !L.visible })}
                >
                  {L.visible ? <Eye /> : <EyeOff />}
                </Button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{name}</p>
                  <p className="truncate text-xs text-muted-foreground">{hint}</p>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">{Math.round(L.opacity * 100)}%</span>
              </div>
              <Slider
                className="mt-2"
                aria-label={`${name} opacity`}
                min={0}
                max={100}
                value={[L.opacity * 100]}
                disabled={!L.visible}
                onValueChange={([v]) => patchLayer(key, { opacity: v / 100 })}
              />
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Watercolour behaviour</h3>
        <LabeledSlider label="Granulation" hint="Pigment settling into the paper's valleys" value={layers.granulation} onChange={(v) => setLayers({ granulation: v })} />
        <LabeledSlider label="Paper cockling" hint="Gentle buckling where the paper is wet or heavily painted" value={layers.cockling} onChange={(v) => setLayers({ cockling: v })} />
        <div className="flex flex-col gap-2">
          <Label className="text-xs">Drying speed</Label>
          <ToggleGroup type="single" value={String(drying)} onValueChange={(v) => v && setDrying(Number(v))}>
            <ToggleGroupItem value="0.5">Slow</ToggleGroupItem>
            <ToggleGroupItem value="1">Natural</ToggleGroupItem>
            <ToggleGroupItem value="2.2">Quick</ToggleGroupItem>
          </ToggleGroup>
          <Button variant="outline" size="sm" onClick={() => engine?.dryNow()} disabled={!wet}>
            <Wind /> {wet ? "Dry the paper now" : "Paper is dry"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function LabeledSlider({ label, hint, value, onChange }: { label: string; hint: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-xs text-muted-foreground tabular-nums">{Math.round(value * 100)}%</span>
      </div>
      <Slider aria-label={label} min={0} max={100} value={[value * 100]} onValueChange={([v]) => onChange(v / 100)} />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

const KIND_ICON: Record<HistoryKind, React.ComponentType<{ className?: string }>> = {
  stroke: BrushIcon,
  fill: PaintBucket,
  erase: Eraser,
  reset: RotateCcw,
  clear: Trash2,
  load: HistoryIcon,
};

function HistoryPanel() {
  const history = useStudio((s) => s.history);
  const engine = useStudio((s) => s.engine);
  const entries = history.entries;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => engine?.undo()} disabled={!history.canUndo}>
          <Undo2 /> Undo
        </Button>
        <Button variant="outline" size="sm" onClick={() => engine?.redo()} disabled={!history.canRedo}>
          <Redo2 /> Redo
        </Button>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{entries.length} steps</span>
      </div>
      <p className="text-xs text-muted-foreground">Tap any step to return to it. Up to 120 steps are kept for this session.</p>
      <ol className="flex flex-col gap-0.5">
        <li>
          <button
            onClick={() => engine?.jumpTo(0)}
            className={cn("flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent", history.position === 0 && "bg-primary/8 font-medium")}
          >
            <span className="flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <FileImage className="size-3.5" />
            </span>
            Opened canvas
          </button>
        </li>
        {entries.map((e, i) => {
          const Icon = KIND_ICON[e.kind];
          const applied = i < history.position;
          const current = i === history.position - 1;
          return (
            <li key={e.id}>
              <button
                onClick={() => engine?.jumpTo(i + 1)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                  current && "bg-primary/8 font-medium",
                  !applied && "text-muted-foreground/60",
                )}
              >
                <span className="relative flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Icon className="size-3.5" />
                  {e.color && <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border border-card" style={{ background: e.color }} />}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {e.label}
                  {e.number != null && e.kind !== "fill" && e.kind !== "reset" && <span className="text-muted-foreground"> · {e.number}</span>}
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums">{timeAgo(e.time)}</span>
              </button>
            </li>
          );
        }).reverse()}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

type Format = "png" | "pdf";

const PRESETS: Array<{ name: string; hint: string; format: Format; opts: ExportOptions }> = [
  { name: "Finished painting", hint: "Paper, soft pencil lines, varnish", format: "png", opts: { scale: 2, background: "paper", underdrawing: "soft", numbers: false, varnish: true } },
  { name: "Gallery print (PDF)", hint: "A4 page with title", format: "pdf", opts: { scale: 2, background: "paper", underdrawing: "soft", numbers: false, varnish: true } },
  { name: "Transparent wash", hint: "Pigment only, on transparency", format: "png", opts: { scale: 2, background: "transparent", underdrawing: "none", numbers: false, varnish: false } },
  { name: "Printable template", hint: "Outlines and numbers for real paint", format: "pdf", opts: { scale: 2, background: "template", underdrawing: "full", numbers: true, varnish: false } },
];

export function useExporter() {
  const engine = useStudio((s) => s.engine);
  const def = useStudio((s) => s.def);
  const progress = useStudio((s) => s.progress);
  const [busy, setBusy] = useState(false);
  const run = async (format: Format, opts: ExportOptions) => {
    if (!engine) return;
    setBusy(true);
    // Let the spinner paint before the heavy render.
    await new Promise((r) => setTimeout(r, 30));
    try {
      const suffix = opts.background === "template" ? "template" : opts.background === "transparent" ? "transparent" : "watercolour";
      const name = `${def.id}-${suffix}.${format}`;
      const blob =
        format === "png"
          ? await engine.exportPNG(opts)
          : await engine.exportPDF({
              ...opts,
              title: def.title,
              caption:
                opts.background === "template"
                  ? `${def.palette.map((p) => `${p.number} ${p.name}`).join(" - ")}`
                  : `Watercolour - ${progress?.completeRegions ?? 0} of ${progress?.totalRegions ?? 0} regions - AquaNumerica`,
            });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast.success(`Exported ${name}`, { description: `${(blob.size / 1024 / 1024).toFixed(1)} MB` });
    } catch (e) {
      toast.error("Export failed", { description: String(e) });
    } finally {
      setBusy(false);
    }
  };
  return { run, busy };
}

function ExportPanel() {
  const def = useStudio((s) => s.def);
  const engine = useStudio((s) => s.engine);
  const { run, busy } = useExporter();
  const [format, setFormat] = useState<Format>("png");
  const [opts, setOpts] = useState<ExportOptions>(PRESETS[0].opts);
  const w = engine ? Math.round(engine.analysis.width * opts.scale) : 0;
  const h = engine ? Math.round(engine.analysis.height * opts.scale) : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            disabled={busy || !engine}
            onClick={() => run(p.format, p.opts)}
            className="flex flex-col gap-1 rounded-xl border bg-card/70 p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
          >
            <span className="flex items-center gap-1.5 text-sm font-medium">
              {p.format === "pdf" ? <FileText className="size-3.5" /> : <FileImage className="size-3.5" />} {p.name}
            </span>
            <span className="text-xs text-muted-foreground">{p.hint}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card/70 p-3">
        <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Custom export</h3>
        <OptionRow label="Format">
          <ToggleGroup type="single" value={format} onValueChange={(v) => v && setFormat(v as Format)}>
            <ToggleGroupItem value="png">PNG</ToggleGroupItem>
            <ToggleGroupItem value="pdf">PDF</ToggleGroupItem>
          </ToggleGroup>
        </OptionRow>
        <OptionRow label="Background">
          <ToggleGroup type="single" value={opts.background} onValueChange={(v) => v && setOpts({ ...opts, background: v as ExportOptions["background"] })}>
            <ToggleGroupItem value="paper">Paper</ToggleGroupItem>
            <ToggleGroupItem value="transparent" disabled={format === "pdf"}>
              Clear
            </ToggleGroupItem>
            <ToggleGroupItem value="template">Template</ToggleGroupItem>
          </ToggleGroup>
        </OptionRow>
        <OptionRow label="Size">
          <ToggleGroup type="single" value={String(opts.scale)} onValueChange={(v) => v && setOpts({ ...opts, scale: Number(v) })}>
            <ToggleGroupItem value="1">Standard</ToggleGroupItem>
            <ToggleGroupItem value="2">High-res</ToggleGroupItem>
          </ToggleGroup>
        </OptionRow>
        {opts.background === "paper" && (
          <>
            <OptionRow label="Lines">
              <ToggleGroup type="single" value={opts.underdrawing} onValueChange={(v) => v && setOpts({ ...opts, underdrawing: v as ExportOptions["underdrawing"] })}>
                <ToggleGroupItem value="none">None</ToggleGroupItem>
                <ToggleGroupItem value="soft">Soft</ToggleGroupItem>
                <ToggleGroupItem value="full">Full</ToggleGroupItem>
              </ToggleGroup>
            </OptionRow>
            <div className="flex items-center justify-between">
              <Label htmlFor="exp-numbers" className="text-xs">Show numbers</Label>
              <Switch id="exp-numbers" checked={opts.numbers} onCheckedChange={(v) => setOpts({ ...opts, numbers: v })} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="exp-varnish" className="text-xs">Varnish (soft focus)</Label>
              <Switch id="exp-varnish" checked={opts.varnish} onCheckedChange={(v) => setOpts({ ...opts, varnish: v })} />
            </div>
          </>
        )}
        <p className="text-xs text-muted-foreground tabular-nums">
          {w} × {h} px{format === "pdf" ? " on an A4 page" : ""}
        </p>
        <Button disabled={busy || !engine} onClick={() => run(format, format === "pdf" && opts.background === "transparent" ? { ...opts, background: "paper" } : opts)}>
          {busy ? <Loader2 className="animate-spin" /> : <Download />} Download {format.toUpperCase()}
        </Button>
      </div>
      <a href={`/canvases/${def.id}.svg`} download className="text-xs text-primary underline-offset-4 hover:underline">
        Download the vector line-art template (SVG)
      </a>
    </div>
  );
}

function OptionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
