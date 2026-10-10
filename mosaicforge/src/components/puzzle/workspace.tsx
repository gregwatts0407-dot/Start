"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { AlertTriangleIcon, MaximizeIcon, MinusIcon, PlusIcon } from "lucide-react";
import { PuzzleEngine } from "@/lib/puzzle/engine";
import type { OrganizeMode, PieceFilter, SaveRecord } from "@/lib/puzzle/types";
import { getSave, putSave } from "@/lib/storage";
import { loadImageElement, resolveImage } from "@/lib/custom-images";
import type { GalleryImage } from "@/lib/images";
import { restartAsCopy } from "@/lib/create-puzzle";
import { useWorkspace } from "@/store/workspace";
import { usePrefs } from "@/store/prefs";
import { Button } from "@/components/ui/button";
import { RestartDialog } from "@/components/saves/restart-dialog";
import { TopBar } from "./top-bar";
import { SidePanel } from "./side-panel";
import { LoadingOverlay } from "./loading-overlay";
import { CompletionDialog } from "./completion-dialog";
import { ImageViewer } from "./image-viewer";
import { ShortcutsDialog } from "./shortcuts-dialog";
import type { WorkspaceActions } from "./actions";

type PanelInfo = { pieces: number; rows: number; cols: number; pieceSize: number; atlasMB: number };

const AUTOSAVE_DEBOUNCE_MS = 1200;
const PERIODIC_SAVE_MS = 20_000;
const THUMB_INTERVAL_MS = 15_000;
const IDLE_PAUSE_MS = 3 * 60_000;

export function Workspace({ id }: { id: string }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PuzzleEngine | null>(null);
  const saveRef = useRef<SaveRecord | null>(null);
  const elapsedRef = useRef(0);
  const lastActivityRef = useRef(0);
  const lastThumbRef = useRef(0);
  const saveTimerRef = useRef<number>(0);
  const savingRef = useRef<Promise<void> | null>(null);
  const dirtyRef = useRef(false);

  const [image, setImage] = useState<GalleryImage | null>(null);
  const [save, setSave] = useState<SaveRecord | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [restartOpen, setRestartOpen] = useState(false);
  const [info, setInfo] = useState<PanelInfo | undefined>();

  const status = useWorkspace((s) => s.status);
  const error = useWorkspace((s) => s.error);
  const loadLabel = useWorkspace((s) => s.loadLabel);
  const loadProgress = useWorkspace((s) => s.loadProgress);
  const showCompletion = useWorkspace((s) => s.showCompletion);
  const setWs = useWorkspace((s) => s.set);

  const panelOpen = usePrefs((s) => s.panelOpen);
  const sound = usePrefs((s) => s.sound);
  const ghostOpacity = usePrefs((s) => s.ghostOpacity);
  const snapToBoard = usePrefs((s) => s.snapToBoard);
  const setPrefs = usePrefs((s) => s.set);
  const { resolvedTheme } = useTheme();

  /* ------------------------------ saving ------------------------------ */

  const doSave = useCallback(async (opts: { thumb?: boolean } = {}) => {
    const engine = engineRef.current;
    const base = saveRef.current;
    if (!engine || !base || useWorkspace.getState().status !== "ready") return;
    // Serialise saves; if one is running, chain after it.
    if (savingRef.current) await savingRef.current;
    const run = (async () => {
      window.clearTimeout(saveTimerRef.current);
      dirtyRef.current = false;
      setWs({ saveStatus: "saving" });
      const stats = useWorkspace.getState().stats;
      const now = Date.now();
      const wantThumb = opts.thumb || now - lastThumbRef.current > THUMB_INTERVAL_MS || !base.thumb;
      const rec: SaveRecord = {
        ...base,
        state: engine.serialize(),
        elapsedMs: Math.round(elapsedRef.current),
        moves: engine.moveCount,
        progress: stats.progress,
        completed: engine.isCompleted,
        completedAt: engine.isCompleted ? (base.completedAt ?? now) : undefined,
        updatedAt: now,
        thumb: wantThumb ? (engine.renderThumbnail() ?? base.thumb) : base.thumb,
      };
      if (wantThumb) lastThumbRef.current = now;
      try {
        await putSave(rec);
        saveRef.current = rec;
        setWs({ saveStatus: dirtyRef.current ? "unsaved" : "saved", lastSavedAt: now });
      } catch (e) {
        console.error(e);
        setWs({ saveStatus: "error" });
        toast.error("Could not save progress", { description: "Your browser storage may be full or disabled." });
      }
    })();
    savingRef.current = run;
    await run;
    if (savingRef.current === run) savingRef.current = null;
  }, [setWs]);

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    lastActivityRef.current = Date.now();
    setWs({ saveStatus: "unsaved" });
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => void doSave(), AUTOSAVE_DEBOUNCE_MS);
  }, [doSave, setWs]);

  /* ------------------------------ loading ----------------------------- */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ac = new AbortController();
    useWorkspace.getState().reset();
    lastThumbRef.current = 0;
    // On tablets/phones the panel overlays the board, so start with it closed.
    if (window.innerWidth < 1024) usePrefs.getState().set({ panelOpen: false });

    const engine = new PuzzleEngine(canvas, {
      onStats: (stats) => setWs({ stats }),
      onChange: () => scheduleSave(),
      onLoadProgress: (label, f) => setWs({ loadLabel: label, loadProgress: f }),
      onComplete: () => {
        setWs({ saveStatus: "unsaved" });
        void doSave({ thumb: true });
        window.setTimeout(() => setWs({ showCompletion: true }), 1700);
      },
    });
    engineRef.current = engine;
    // Handy for debugging and automated browser tests.
    (window as unknown as { __mosaicforge?: PuzzleEngine }).__mosaicforge = engine;
    const prefs = usePrefs.getState();
    engine.setSettings({
      sound: prefs.sound,
      ghostOpacity: prefs.ghostOpacity,
      snapToBoard: prefs.snapToBoard,
      theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
    });

    (async () => {
      try {
        const rec = await getSave(id);
        if (!rec) throw new Error("This puzzle could not be found. It may have been deleted.");
        saveRef.current = rec;
        setSave(rec);
        elapsedRef.current = rec.elapsedMs;
        setWs({ elapsedMs: rec.elapsedMs });
        const img = await resolveImage(rec.config.imageId);
        if (!img) throw new Error("The image for this puzzle is no longer available.");
        setImage(img);
        setWs({ loadLabel: "Loading image", loadProgress: 0.02 });
        const el = await loadImageElement(img.src);
        if (ac.signal.aborted) return;
        await engine.load({
          image: el,
          config: rec.config,
          state: rec.state,
          completed: rec.completed,
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;
        engine.moveCount = rec.moves;
        lastActivityRef.current = Date.now();
        setInfo({ ...engine.info, rows: rec.config.rows, cols: rec.config.cols });
        setWs({ status: "ready", saveStatus: rec.state ? "saved" : "unsaved", lastSavedAt: rec.updatedAt });
        if (!rec.state) void doSave({ thumb: true });
        if (!rec.state && !readFlag("mosaicforge-hinted")) {
          writeFlag("mosaicforge-hinted");
          toast("Drag pieces to the board", {
            description: "Scroll or pinch to zoom, drag the background to pan. Press ? for all shortcuts.",
            duration: 7000,
          });
        }
      } catch (e) {
        if ((e as Error)?.name === "AbortError" || ac.signal.aborted) return;
        console.error(e);
        setWs({ status: "error", error: e instanceof Error ? e.message : "Failed to load puzzle" });
      }
    })();

    return () => {
      ac.abort();
      // Flush pending changes before tearing down.
      if (dirtyRef.current) void doSave();
      window.clearTimeout(saveTimerRef.current);
      engine.destroy();
      engineRef.current = null;
    };
  }, [id, doSave, scheduleSave, setWs]);

  // Keep engine settings in sync with preferences and theme.
  useEffect(() => {
    engineRef.current?.setSettings({ sound, ghostOpacity, snapToBoard });
  }, [sound, ghostOpacity, snapToBoard]);
  useEffect(() => {
    if (resolvedTheme) engineRef.current?.setSettings({ theme: resolvedTheme === "dark" ? "dark" : "light" });
  }, [resolvedTheme]);

  /* ------------------------- timer & lifecycle ------------------------ */

  useEffect(() => {
    let last = performance.now();
    const t = window.setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      const engine = engineRef.current;
      const ready = useWorkspace.getState().status === "ready";
      const active =
        document.visibilityState === "visible" && Date.now() - lastActivityRef.current < IDLE_PAUSE_MS;
      if (engine && ready && !engine.isCompleted && active) {
        elapsedRef.current += dt;
        setWs({ elapsedMs: elapsedRef.current });
      }
    }, 1000);
    // Periodic save keeps the timer persisted even without moves.
    const p = window.setInterval(() => {
      const engine = engineRef.current;
      if (engine && !engine.isCompleted && document.visibilityState === "visible") void doSave();
    }, PERIODIC_SAVE_MS);

    const onHide = () => {
      if (document.visibilityState === "hidden") void doSave({ thumb: true });
    };
    const onPageHide = () => void doSave();
    const activity = () => (lastActivityRef.current = Date.now());
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    window.addEventListener("wheel", activity, { passive: true });
    return () => {
      window.clearInterval(t);
      window.clearInterval(p);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
      window.removeEventListener("wheel", activity);
    };
  }, [doSave, setWs]);

  /* ------------------------------ actions ----------------------------- */

  const actions: WorkspaceActions = useMemo(
    () => ({
      undo: () => engineRef.current?.undo(),
      redo: () => engineRef.current?.redo(),
      save: () => {
        void doSave({ thumb: true }).then(() => {
          if (useWorkspace.getState().saveStatus !== "error") toast.success("Progress saved");
        });
      },
      setGhost: (on: boolean) => {
        setWs({ ghost: on });
        engineRef.current?.setSettings({ ghost: on });
      },
      setGhostOpacity: (v: number) => {
        setPrefs({ ghostOpacity: v });
      },
      setFilter: (f: PieceFilter) => {
        setWs({ filter: f });
        engineRef.current?.setSettings({ filter: f });
      },
      organize: (mode: OrganizeMode) => engineRef.current?.organize(mode),
      zoomIn: () => engineRef.current?.zoomBy(1.4),
      zoomOut: () => engineRef.current?.zoomBy(1 / 1.4),
      fit: () => engineRef.current?.fit(),
      focusBoard: () => engineRef.current?.focusBoard(),
      zoomActual: () => engineRef.current?.zoomActual(),
      restart: () => setRestartOpen(true),
      openViewer: () => setViewerOpen(true),
      openShortcuts: () => setShortcutsOpen(true),
      togglePanel: () => setPrefs({ panelOpen: !usePrefs.getState().panelOpen }),
    }),
    [doSave, setPrefs, setWs],
  );

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (isDialogVisible()) return;
      const engine = engineRef.current;
      if (!engine) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z") {
        e.preventDefault();
        if (e.shiftKey) engine.redo();
        else engine.undo();
      } else if (mod && k === "y") {
        e.preventDefault();
        engine.redo();
      } else if (mod && k === "s") {
        e.preventDefault();
        actions.save();
      } else if (mod) {
        return;
      } else if (k === "r") {
        engine.rotateAtPointer(e.shiftKey ? -1 : 1);
      } else if (k === "q") {
        engine.rotateAtPointer(-1);
      } else if (k === "g") {
        actions.setGhost(!useWorkspace.getState().ghost);
      } else if (k === "e") {
        const order: PieceFilter[] = ["all", "edges", "interior"];
        const cur = useWorkspace.getState().filter;
        actions.setFilter(order[(order.indexOf(cur) + 1) % order.length]);
      } else if (k === "f") {
        engine.fit();
      } else if (k === "b") {
        engine.focusBoard();
      } else if (k === "+" || k === "=") {
        engine.zoomBy(1.4);
      } else if (k === "-" || k === "_") {
        engine.zoomBy(1 / 1.4);
      } else if (k === "p") {
        actions.togglePanel();
      } else if (k === "?") {
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions]);

  // Close transient dialogs when this (preserved) route is hidden.
  useLayoutEffect(
    () => () => {
      setViewerOpen(false);
      setShortcutsOpen(false);
      setRestartOpen(false);
      useWorkspace.getState().set({ showCompletion: false });
    },
    [],
  );

  /* ------------------------------ restart ----------------------------- */

  async function restartOverwrite() {
    const engine = engineRef.current;
    const rec = saveRef.current;
    if (!engine || !rec) return;
    setRestartOpen(false);
    setWs({ showCompletion: false });
    engine.resetBoard(rec.config.startMode);
    elapsedRef.current = 0;
    setWs({ elapsedMs: 0 });
    saveRef.current = { ...rec, completedAt: undefined, createdAt: Date.now() };
    await doSave({ thumb: true });
    toast("Puzzle restarted");
  }

  async function restartCopy() {
    const rec = saveRef.current;
    if (!rec) return;
    if (dirtyRef.current) await doSave({ thumb: true });
    const newId = await restartAsCopy(rec);
    setRestartOpen(false);
    router.push(`/play?id=${newId}`);
  }

  /* ------------------------------- render ----------------------------- */

  const config = save?.config;
  const pieces = config ? config.rows * config.cols : 0;
  const elapsedMs = useWorkspace((s) => s.elapsedMs);
  const moves = useWorkspace((s) => s.stats.moves);

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-background">
      <TopBar
        title={config?.title ?? "Loading…"}
        pieces={pieces}
        rotation={!!config?.rotation}
        panelOpen={panelOpen}
        actions={actions}
      />
      <div className="relative flex min-h-0 flex-1">
        <div className="puzzle-table relative min-w-0 flex-1 overflow-hidden">
          <canvas ref={canvasRef} className="absolute inset-0 z-[1] block" aria-label="Puzzle board" />

          {status === "loading" && (
            <LoadingOverlay label={loadLabel} progress={loadProgress} pieces={pieces || undefined} thumb={image?.thumb} />
          )}

          {status === "error" && (
            <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
              <div className="max-w-sm rounded-2xl border bg-card p-6 text-center shadow-xl">
                <AlertTriangleIcon className="mx-auto mb-3 size-8 text-destructive" />
                <p className="font-medium">Couldn’t open this puzzle</p>
                <p className="mt-1 text-sm text-muted-foreground">{error}</p>
                <Button asChild className="mt-5">
                  <Link href="/">Back to gallery</Link>
                </Button>
              </div>
            </div>
          )}

          {/* Floating zoom controls */}
          {status === "ready" && (
            <div className="absolute bottom-4 left-4 z-10 flex items-center gap-0.5 rounded-xl border bg-background/80 p-1 shadow-lg backdrop-blur-xl">
              <Button variant="ghost" size="icon-sm" onClick={actions.zoomOut} aria-label="Zoom out">
                <MinusIcon />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={actions.fit} aria-label="Fit all">
                <MaximizeIcon />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={actions.zoomIn} aria-label="Zoom in">
                <PlusIcon />
              </Button>
            </div>
          )}
        </div>

        {status !== "error" && (
          <SidePanel open={panelOpen} thumb={image?.thumb} info={info} actions={actions} />
        )}
      </div>

      {image && (
        <ImageViewer open={viewerOpen} onOpenChange={setViewerOpen} src={image.src} title={image.title} />
      )}
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <RestartDialog
        open={restartOpen}
        onOpenChange={setRestartOpen}
        title={config?.title ?? ""}
        onOverwrite={restartOverwrite}
        onNewCopy={restartCopy}
      />
      <CompletionDialog
        open={showCompletion}
        onOpenChange={(o) => setWs({ showCompletion: o })}
        title={config?.title ?? ""}
        thumb={image?.thumb}
        src={image?.src}
        elapsedMs={elapsedMs}
        moves={moves}
        pieces={pieces}
        rotation={!!config?.rotation}
        onViewFull={() => setViewerOpen(true)}
        onPlayAgain={() => {
          setWs({ showCompletion: false });
          setRestartOpen(true);
        }}
      />
    </div>
  );
}

/** True if a modal dialog is actually showing (ignores ones in hidden, preserved routes). */
function isDialogVisible(): boolean {
  return [...document.querySelectorAll<HTMLElement>("[role=dialog], [role=alertdialog]")].some(
    (el) => el.getClientRects().length > 0,
  );
}

/** localStorage can be unavailable (private mode, sandboxed frames). */
function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) != null;
  } catch {
    return false;
  }
}

function writeFlag(key: string) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* ignore */
  }
}
