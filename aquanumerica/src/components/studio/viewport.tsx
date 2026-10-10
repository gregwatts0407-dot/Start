"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChevronRight, Droplets, Grid3x3, Hash, Maximize, Minus, PenLine, Plus, Redo2, ScanEye, Sparkles, Undo2, Wind,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { TOOLS, TOOL_ORDER } from "@/lib/engine/brushes";
import { hexToRgb, luminance } from "@/lib/engine/color";
import { PaintEngine, type EngineCallbacks } from "@/lib/engine/engine";
import { loadAnalysis } from "@/lib/engine/load-analysis";
import { loadPainting, prepareStorage, readProgressMeta, savePainting, savePaintingNow, writeProgressMeta } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { useStudio, useStudioStore } from "./studio-context";
import { ToolGlyph } from "./tool-glyph";
import { swatchRadius } from "./left-panel";

interface Bloom {
  id: number;
  x: number;
  y: number;
  color: string;
}

export function Viewport() {
  const store = useStudioStore();
  const def = useStudio((s) => s.def);
  const status = useStudio((s) => s.status);
  const message = useStudio((s) => s.loadMessage);
  const tool = useStudio((s) => s.tool);
  const picking = useStudio((s) => s.pickingReset);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [blooms, setBlooms] = useState<Bloom[]>([]);

  const addBloom = useCallback((x: number, y: number, color: string) => {
    const id = Math.random();
    setBlooms((b) => [...b, { id, x, y, color }]);
    setTimeout(() => setBlooms((b) => b.filter((v) => v.id !== id)), 1000);
  }, []);

  // Engine lifecycle: load analysis + saved paint, autosave, dispose.
  useEffect(() => {
    const canvas = canvasRef.current, overlay = overlayRef.current, container = containerRef.current;
    if (!canvas || !overlay || !container) return;
    let disposed = false;
    let engine: PaintEngine | null = null;
    let resizeObs: ResizeObserver | null = null;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    let firstDirty = 0;
    let savedVersion = -1;
    let dirty = false;
    let elapsed = 0;
    let lastActive = performance.now();
    let saving: Promise<void> | null = null;
    const tickTimer = setInterval(() => {
      // Count painting time only while the tab is visible and the user is active.
      if (document.visibilityState === "visible" && performance.now() - lastActive < 90_000) {
        elapsed += 1000;
        store.getState().setRuntime({ elapsedMs: elapsed });
      }
    }, 1000);
    const markActive = () => (lastActive = performance.now());
    container.addEventListener("pointerdown", markActive);

    const progressMeta = () => {
      const p = store.getState().progress;
      if (!p) return;
      const prev = readProgressMeta()[def.id];
      writeProgressMeta(def.id, {
        percent: p.percent,
        regionsDone: p.completeRegions,
        regionsTotal: p.totalRegions,
        accuracy: p.accuracy,
        updatedAt: Date.now(),
        finished: prev?.finished ?? false,
      });
    };

    void prepareStorage();
    const save = async (): Promise<void> => {
      if (!engine || (!dirty && engine.version === savedVersion)) return;
      clearTimeout(saveTimer);
      firstDirty = 0;
      dirty = false;
      const version = engine.version;
      const data = engine.serialize();
      const thumbnail = engine.thumbnail(); // composes synchronously, encodes async
      const { width, height } = engine.analysis;
      store.getState().setRuntime({ saveState: "saving" });
      try {
        await savePainting({ id: def.id, width, height, data, thumbnail, elapsedMs: elapsed });
        savedVersion = version;
        progressMeta();
        if (!disposed) store.getState().setRuntime({ saveState: "saved", lastSaved: Date.now() });
      } catch {
        if (!disposed) store.getState().setRuntime({ saveState: "error" });
      }
    };
    const scheduleSave = () => {
      const now = Date.now();
      if (!firstDirty) firstDirty = now;
      clearTimeout(saveTimer);
      // Debounce, but never wait more than ~3 s while painting continuously.
      saveTimer = setTimeout(() => (saving = save()), now - firstDirty > 3000 ? 0 : 1200);
    };
    /** Synchronous-start save for tab hide / unload, where async work may never finish. */
    const saveImmediately = () => {
      if (!engine || engine.version === savedVersion) return;
      const { width, height } = engine.analysis;
      if (savePaintingNow({ id: def.id, width, height, data: engine.serialize(), elapsedMs: elapsed })) {
        savedVersion = engine.version;
        progressMeta();
      }
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") saveImmediately();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", saveImmediately);

    const callbacks: EngineCallbacks = {
      onHistory: (history) => store.getState().setRuntime({ history }),
      onProgress: (progress) => {
        const prev = store.getState().progress;
        store.getState().setRuntime({ progress });
        if (prev && progress.completeRegions === progress.totalRegions && prev.completeRegions < progress.totalRegions) {
          toast.success("Every region is painted!", {
            description: "Reveal the finished watercolour whenever you're ready.",
            action: { label: "Finish & Reveal", onClick: () => store.getState().setUi({ revealOpen: true }) },
            duration: 8000,
          });
        } else if (prev) {
          for (const [num, pn] of Object.entries(progress.perNumber)) {
            const before = prev.perNumber[Number(num)];
            if (before && pn.complete === pn.total && before.complete < before.total) {
              const sw = def.palette.find((p) => p.number === Number(num));
              toast(`All ${num}s painted`, { description: sw?.name, duration: 2500 });
            }
          }
        }
      },
      onColorPicked: (hex, number) => {
        const s = store.getState();
        if (number != null) s.selectNumber(number);
        else s.setColor(hex);
        toast(number != null ? `Picked colour ${number}` : `Picked ${hex.toUpperCase()}`, { duration: 1500, id: "pick" });
      },
      onHint: (h) => {
        if (h.kind === "wrong-number" && h.number != null) {
          const n = h.number;
          toast(h.message, {
            id: "hint",
            description: "Strict numbers keeps each colour in its own regions.",
            action: { label: `Paint ${n}`, onClick: () => store.getState().selectNumber(n) },
            duration: 3500,
          });
        }
      },
      onRegionComplete: (region, screen) => {
        if (!engine || !screen) return;
        const r = engine.analysis.regions[region];
        const sw = def.palette.find((p) => p.number === r.number);
        addBloom(screen.x, screen.y, sw?.hex ?? "#ffffff");
      },
      onViewChange: (zoom) => store.getState().setRuntime({ zoom }),
      onChange: () => scheduleSave(),
      onWetChange: (wet) => {
        store.getState().setRuntime({ wet });
        // Wet-in-wet diffusion keeps moving pigment after the last stroke; save the settled result.
        if (!wet && engine) {
          dirty = true;
          scheduleSave();
        }
      },
    };

    const st = store.getState();
    st.setStatus("loading", "Stretching the paper…");
    loadAnalysis(def)
      .then(async (analysis) => {
        if (disposed) return;
        store.getState().setStatus("loading", "Mixing the pigments…");
        const s = store.getState();
        engine = new PaintEngine({
          canvas,
          overlay,
          def,
          analysis,
          brush: {
            tool: s.tool,
            settings: s.toolSettings[s.tool],
            color: s.color,
            activeNumber: s.activeNumber,
            lock: s.lock,
            strict: s.strict,
            magnetic: s.magnetic,
          },
          display: s.display,
          layers: s.layers,
          callbacks,
        });
        const rect = container.getBoundingClientRect();
        engine.resize(rect.width, rect.height, Math.min(2, window.devicePixelRatio || 1));
        resizeObs = new ResizeObserver(([entry]) => {
          const { width, height } = entry.contentRect;
          engine?.resize(width, height, Math.min(2, window.devicePixelRatio || 1));
        });
        resizeObs.observe(container);
        const saved = await loadPainting(def.id);
        if (disposed) {
          engine.dispose();
          return;
        }
        if (saved && saved.width === analysis.width && saved.height === analysis.height) {
          engine.load(saved.data);
          elapsed = saved.elapsedMs;
          store.getState().setRuntime({ elapsedMs: elapsed, lastSaved: Date.now(), saveState: "saved" });
        }
        savedVersion = engine.version;
        store.getState().attachEngine(engine);
        store.getState().setStatus("ready");
      })
      .catch(() => {
        if (!disposed) store.getState().setStatus("error", "This canvas could not be prepared.");
      });

    return () => {
      disposed = true;
      clearInterval(tickTimer);
      clearTimeout(saveTimer);
      container.removeEventListener("pointerdown", markActive);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", saveImmediately);
      resizeObs?.disconnect();
      if (engine) {
        saveImmediately();
        // Full save (compressed + thumbnail) follows; the immediate write guards against unload.
        dirty = true;
        savedVersion = -1;
        void save();
        engine.dispose();
        engine = null;
        store.getState().attachEngine(null);
      }
      void saving;
    };
  }, [def, store, addBloom]);

  const spec = TOOLS[tool];
  const cursor = picking ? "cell" : spec.kind === "fill" || spec.kind === "eyedropper" ? "crosshair" : "none";

  return (
    <div ref={containerRef} data-tour="canvas" className="absolute inset-0 overflow-hidden" style={{ cursor }}>
      <canvas ref={canvasRef} className="absolute inset-0" aria-label={`${def.title} canvas`} role="img" />
      <canvas ref={overlayRef} className="absolute inset-0 touch-none" />

      {blooms.map((b) => (
        <span key={b.id} className="pointer-events-none absolute" style={{ left: b.x, top: b.y }}>
          <span className="animate-bloom absolute size-24 rounded-full mix-blend-multiply" style={{ background: `radial-gradient(circle, ${b.color}66 0%, ${b.color}22 55%, transparent 70%)` }} />
          <span className="animate-sparkle absolute text-lg text-gold drop-shadow">✦</span>
        </span>
      ))}

      {status !== "ready" && <LoadingVeil message={message} error={status === "error"} />}
      {status === "ready" && (
        <>
          <GuideChip />
          <FinishedChip />
          <PickBanner />
          <QuickTools />
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex flex-col items-center gap-2 px-3">
            <QuickPalette />
            <ViewControls />
          </div>
        </>
      )}
    </div>
  );
}

function LoadingVeil({ message, error }: { message: string; error: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-viewport/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 rounded-2xl border bg-card/90 px-8 py-6 shadow-lg">
        {!error && (
          <span className="relative flex size-12 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/15" />
            <Droplets className="animate-drip size-7 text-primary" />
          </span>
        )}
        <p className="font-display text-lg">{message}</p>
        {error && (
          <Button variant="outline" size="sm" onClick={() => location.reload()}>
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}

function ControlButton({ label, shortcut, active, onClick, children }: {
  label: string;
  shortcut?: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-pressed={active}
          onClick={onClick}
          className={cn("rounded-full", active && "bg-primary/12 text-primary hover:bg-primary/18 hover:text-primary")}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">
        {label}
        {shortcut && <Kbd className="border-background/20 bg-background/15 text-background">{shortcut}</Kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

function ViewControls() {
  const engine = useStudio((s) => s.engine);
  const zoom = useStudio((s) => s.zoom);
  const display = useStudio((s) => s.display);
  const setDisplay = useStudio((s) => s.setDisplay);
  const wet = useStudio((s) => s.wet);
  const zoomBy = (k: number) => engine?.zoomBy(k);
  return (
    <div className="pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border bg-card/90 p-1 shadow-lg backdrop-blur">
      <ControlButton label="Zoom out" shortcut="−" onClick={() => zoomBy(0.8)}>
        <Minus />
      </ControlButton>
      <button
        className="h-8 min-w-14 rounded-full px-2 text-xs font-medium tabular-nums hover:bg-accent"
        onClick={() => engine?.setScale(1)}
        title="Actual pixels (100%)"
      >
        {Math.round(zoom * 100)}%
      </button>
      <ControlButton label="Zoom in" shortcut="+" onClick={() => zoomBy(1.25)}>
        <Plus />
      </ControlButton>
      <ControlButton label="Fit to screen" shortcut="⌘0" onClick={() => engine?.fit()}>
        <Maximize />
      </ControlButton>
      <Separator orientation="vertical" className="mx-1 !h-5" />
      <ControlButton label="Numbers" shortcut="N" active={display.showNumbers} onClick={() => setDisplay({ showNumbers: !display.showNumbers })}>
        <Hash />
      </ControlButton>
      <ControlButton label="Outlines" shortcut="O" active={display.showOutlines} onClick={() => setDisplay({ showOutlines: !display.showOutlines })}>
        <PenLine />
      </ControlButton>
      <ControlButton label="Grid" active={display.showGrid} onClick={() => setDisplay({ showGrid: !display.showGrid })}>
        <Grid3x3 />
      </ControlButton>
      <ControlButton label="Guide mode" shortcut="Q" active={display.guide} onClick={() => setDisplay({ guide: !display.guide })}>
        <ScanEye />
      </ControlButton>
      <Separator orientation="vertical" className="mx-1 !h-5" />
      <ControlButton label={wet ? "Paint is wet – dry it now" : "Paper is dry"} shortcut="D" onClick={() => engine?.dryNow()}>
        {wet ? <Droplets className="animate-drip text-primary" /> : <Wind />}
      </ControlButton>
    </div>
  );
}

function GuideChip() {
  const guide = useStudio((s) => s.display.guide);
  const finished = useStudio((s) => s.display.finished);
  const def = useStudio((s) => s.def);
  const activeNumber = useStudio((s) => s.activeNumber);
  const prog = useStudio((s) => (s.activeNumber != null ? s.progress?.perNumber[s.activeNumber] : undefined));
  const engine = useStudio((s) => s.engine);
  if (!guide || finished || activeNumber == null) return null;
  const sw = def.palette.find((p) => p.number === activeNumber);
  if (!sw) return null;
  const dark = luminance(hexToRgb(sw.hex)) < 0.36;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-3">
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-full border bg-card/90 py-1 pr-1 pl-1 shadow-md backdrop-blur">
        <span className="flex size-7 items-center justify-center text-xs font-semibold" style={{ background: sw.hex, borderRadius: swatchRadius(sw.number), color: dark ? "#fff" : "rgba(0,0,0,0.65)" }}>
          {sw.number}
        </span>
        <span className="text-sm">
          <span className="font-medium">{sw.name}</span>
          {prog && (
            <span className="ml-2 text-muted-foreground tabular-nums">
              {prog.complete}/{prog.total}
            </span>
          )}
        </span>
        <Button size="sm" variant="secondary" className="h-7 rounded-full px-2.5 text-xs" onClick={() => engine?.focusNextUnfinished(sw.number)}>
          Next region <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function FinishedChip() {
  const finished = useStudio((s) => s.display.finished);
  const revealOpen = useStudio((s) => s.revealOpen);
  const setDisplay = useStudio((s) => s.setDisplay);
  const setUi = useStudio((s) => s.setUi);
  if (!finished || revealOpen) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-3">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border bg-card/90 py-1 pr-1 pl-4 text-sm shadow-md backdrop-blur">
        <Sparkles className="size-3.5 text-gold" /> Finished view
        <Button size="sm" variant="ghost" className="h-7 rounded-full" onClick={() => setUi({ revealOpen: true })}>
          Reveal
        </Button>
        <Button size="sm" variant="secondary" className="h-7 rounded-full" onClick={() => setDisplay({ finished: false })}>
          Back to painting
        </Button>
      </div>
    </div>
  );
}

function PickBanner() {
  const picking = useStudio((s) => s.pickingReset);
  const engine = useStudio((s) => s.engine);
  const setUi = useStudio((s) => s.setUi);
  if (!picking) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-14 flex justify-center px-3">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-destructive/30 bg-card/95 py-1.5 pr-1.5 pl-4 text-sm shadow-md">
        Tap a region to wash it clean
        <Button
          size="sm"
          variant="ghost"
          className="h-7 rounded-full"
          onClick={() => {
            engine?.pickRegionOnce(null);
            setUi({ pickingReset: false });
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Compact vertical tool strip for tablets (sidebars collapse below lg). */
function QuickTools() {
  const tool = useStudio((s) => s.tool);
  const color = useStudio((s) => s.color);
  const setTool = useStudio((s) => s.setTool);
  const engine = useStudio((s) => s.engine);
  const canUndo = useStudio((s) => s.history.canUndo);
  const canRedo = useStudio((s) => s.history.canRedo);
  return (
    <div className="absolute top-1/2 left-2 flex -translate-y-1/2 flex-col gap-0.5 rounded-2xl border bg-card/90 p-1 shadow-lg backdrop-blur lg:hidden">
      {TOOL_ORDER.map((id) => (
        <button
          key={id}
          onClick={() => setTool(id)}
          aria-label={TOOLS[id].name}
          aria-pressed={id === tool}
          className={cn("flex items-center justify-center rounded-xl p-1 transition-colors", id === tool ? "bg-primary/12 text-foreground" : "text-muted-foreground hover:bg-accent")}
        >
          <ToolGlyph id={id} color={color} active={id === tool} />
        </button>
      ))}
      <Separator className="my-0.5" />
      <Button variant="ghost" size="icon-sm" className="w-full rounded-xl" onClick={() => engine?.undo()} disabled={!canUndo} aria-label="Undo">
        <Undo2 />
      </Button>
      <Button variant="ghost" size="icon-sm" className="w-full rounded-xl" onClick={() => engine?.redo()} disabled={!canRedo} aria-label="Redo">
        <Redo2 />
      </Button>
    </div>
  );
}

/** Horizontal palette strip for tablets. */
function QuickPalette() {
  const def = useStudio((s) => s.def);
  const activeNumber = useStudio((s) => s.activeNumber);
  const selectNumber = useStudio((s) => s.selectNumber);
  return (
    <div className="pointer-events-auto flex max-w-full gap-1.5 overflow-x-auto rounded-full border bg-card/90 p-1.5 shadow-lg backdrop-blur lg:hidden">
      {def.palette.map((p) => {
        const dark = luminance(hexToRgb(p.hex)) < 0.36;
        return (
          <button
            key={p.number}
            onClick={() => selectNumber(p.number)}
            aria-label={`${p.number} ${p.name}`}
            aria-pressed={p.number === activeNumber}
            className={cn("flex size-9 shrink-0 items-center justify-center text-xs font-semibold transition-transform", p.number === activeNumber ? "scale-110 ring-2 ring-primary ring-offset-1 ring-offset-card" : "")}
            style={{ background: p.hex, borderRadius: swatchRadius(p.number), color: dark ? "#fff" : "rgba(0,0,0,0.65)" }}
          >
            {p.number}
          </button>
        );
      })}
    </div>
  );
}
