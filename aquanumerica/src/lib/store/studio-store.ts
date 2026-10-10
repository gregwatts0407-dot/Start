/**
 * Per-studio state (Zustand vanilla store, provided through React context).
 *
 * One store per mounted studio: with Cache Components, Next.js may keep a
 * previous canvas route alive (hidden) while a new one mounts, so a global
 * singleton would leak state between canvases.
 *
 * Actions forward changes to the PaintEngine; per-frame work never touches
 * React state.
 */

import { createStore } from "zustand/vanilla";
import { TOOLS, TOOL_ORDER, type ToolId, type ToolSettings } from "../engine/brushes";
import type { DisplayState, HistoryState, LockMode, PaintEngine, ProgressStats } from "../engine/engine";
import { DEFAULT_LAYERS, type LayerSettings } from "../engine/renderer";
import type { CanvasDefinition } from "../canvases/types";
import { readJSON, writeJSON } from "../storage";

const PREFS_KEY = "aquanumerica:prefs:v1";
const RECENTS_KEY = "aquanumerica:recent-colours:v1";

export type SaveState = "idle" | "saving" | "saved" | "error";
export type RightTab = "progress" | "layers" | "history" | "export";

export interface Prefs {
  tool: ToolId;
  toolSettings: Record<ToolId, ToolSettings>;
  lock: LockMode;
  strict: boolean;
  magnetic: boolean;
  display: Omit<DisplayState, "finished">;
  layers: LayerSettings;
  dryingSpeed: number;
}

export const DEFAULT_PREFS: Prefs = {
  tool: "watercolor",
  toolSettings: Object.fromEntries(TOOL_ORDER.map((id) => [id, { ...TOOLS[id].defaults }])) as Record<ToolId, ToolSettings>,
  lock: "region",
  strict: true,
  magnetic: true,
  display: { showNumbers: true, showOutlines: true, showGrid: false, guide: true },
  layers: DEFAULT_LAYERS,
  dryingSpeed: 1,
};

export function loadPrefs(): Prefs {
  const saved = readJSON<Partial<Prefs>>(PREFS_KEY, {});
  return {
    ...DEFAULT_PREFS,
    ...saved,
    toolSettings: { ...DEFAULT_PREFS.toolSettings, ...(saved.toolSettings ?? {}) },
    display: { ...DEFAULT_PREFS.display, ...(saved.display ?? {}) },
    layers: { ...DEFAULT_PREFS.layers, ...(saved.layers ?? {}) },
  };
}

export interface StudioState {
  def: CanvasDefinition;
  status: "loading" | "ready" | "error";
  loadMessage: string;
  engine: PaintEngine | null;

  tool: ToolId;
  toolSettings: Record<ToolId, ToolSettings>;
  color: string;
  activeNumber: number | null;
  recentColors: string[];
  lock: LockMode;
  strict: boolean;
  magnetic: boolean;
  display: DisplayState;
  layers: LayerSettings;
  dryingSpeed: number;

  history: HistoryState;
  progress: ProgressStats | null;
  zoom: number;
  wet: boolean;
  saveState: SaveState;
  lastSaved: number | null;
  elapsedMs: number;
  pickingReset: boolean;

  leftOpen: boolean;
  rightOpen: boolean;
  rightTab: RightTab;
  revealOpen: boolean;
  tutorialOpen: boolean;
}

export interface StudioActions {
  attachEngine(engine: PaintEngine | null): void;
  setStatus(status: StudioState["status"], message?: string): void;
  applyPrefs(prefs: Prefs): void;
  setTool(tool: ToolId): void;
  setToolSetting(key: keyof ToolSettings, value: number): void;
  selectNumber(n: number): void;
  setColor(hex: string, opts?: { remember?: boolean; number?: number | null }): void;
  setLock(lock: LockMode): void;
  setStrict(v: boolean): void;
  setMagnetic(v: boolean): void;
  setDisplay(patch: Partial<DisplayState>): void;
  setLayers(patch: Partial<LayerSettings>): void;
  setDryingSpeed(v: number): void;
  setUi(patch: Partial<Pick<StudioState, "leftOpen" | "rightOpen" | "rightTab" | "revealOpen" | "tutorialOpen" | "pickingReset">>): void;
  setRuntime(patch: Partial<Pick<StudioState, "history" | "progress" | "zoom" | "wet" | "saveState" | "lastSaved" | "elapsedMs">>): void;
  prefs(): Prefs;
}

export type StudioStore = ReturnType<typeof createStudioStore>;

export function createStudioStore(def: CanvasDefinition) {
  const first = def.palette[0];
  return createStore<StudioState & StudioActions>()((set, get) => {
    const pushBrush = () => {
      const s = get();
      s.engine?.setBrush({
        tool: s.tool,
        settings: s.toolSettings[s.tool],
        color: s.color,
        activeNumber: s.activeNumber,
        lock: s.lock,
        strict: s.strict,
        magnetic: s.magnetic,
      });
    };
    return {
      def,
      status: "loading",
      loadMessage: "Stretching the paper…",
      engine: null,
      tool: DEFAULT_PREFS.tool,
      toolSettings: DEFAULT_PREFS.toolSettings,
      color: first.hex,
      activeNumber: first.number,
      recentColors: [],
      lock: DEFAULT_PREFS.lock,
      strict: DEFAULT_PREFS.strict,
      magnetic: DEFAULT_PREFS.magnetic,
      display: { ...DEFAULT_PREFS.display, finished: false },
      layers: DEFAULT_PREFS.layers,
      dryingSpeed: 1,
      history: { entries: [], position: 0, canUndo: false, canRedo: false },
      progress: null,
      zoom: 1,
      wet: false,
      saveState: "idle",
      lastSaved: null,
      elapsedMs: 0,
      pickingReset: false,
      leftOpen: false,
      rightOpen: false,
      rightTab: "progress",
      revealOpen: false,
      tutorialOpen: false,

      attachEngine(engine) {
        set({ engine });
        if (engine) {
          pushBrush();
          const s = get();
          engine.setDisplay(s.display);
          engine.setLayers(s.layers);
          engine.setDryingSpeed(s.dryingSpeed);
        }
      },
      setStatus(status, message) {
        set({ status, loadMessage: message ?? get().loadMessage });
      },
      applyPrefs(p) {
        set({
          tool: p.tool,
          toolSettings: p.toolSettings,
          lock: p.lock,
          strict: p.strict,
          magnetic: p.magnetic,
          display: { ...p.display, finished: get().display.finished },
          layers: p.layers,
          dryingSpeed: p.dryingSpeed,
          recentColors: readJSON<string[]>(RECENTS_KEY, []),
        });
        pushBrush();
        const s = get();
        s.engine?.setDisplay(s.display);
        s.engine?.setLayers(s.layers);
        s.engine?.setDryingSpeed(s.dryingSpeed);
      },
      setTool(tool) {
        set({ tool, pickingReset: false });
        pushBrush();
      },
      setToolSetting(key, value) {
        const { tool, toolSettings } = get();
        set({ toolSettings: { ...toolSettings, [tool]: { ...toolSettings[tool], [key]: value } } });
        pushBrush();
      },
      selectNumber(n) {
        const sw = get().def.palette.find((p) => p.number === n);
        if (!sw) return;
        const { tool } = get();
        // Picking a paint while holding the eyedropper/eraser returns to the last brush.
        const nextTool = TOOLS[tool].kind === "eyedropper" ? "watercolor" : tool;
        set({ activeNumber: n, color: sw.hex, tool: nextTool });
        pushBrush();
      },
      setColor(hex, opts = {}) {
        const patch: Partial<StudioState> = { color: hex };
        if (opts.number !== undefined) patch.activeNumber = opts.number;
        if (opts.remember !== false) {
          const recents = [hex, ...get().recentColors.filter((c) => c.toLowerCase() !== hex.toLowerCase())].slice(0, 12);
          patch.recentColors = recents;
          writeJSON(RECENTS_KEY, recents);
        }
        set(patch);
        pushBrush();
      },
      setLock(lock) {
        set({ lock });
        pushBrush();
      },
      setStrict(strict) {
        set({ strict });
        pushBrush();
      },
      setMagnetic(magnetic) {
        set({ magnetic });
        pushBrush();
      },
      setDisplay(patch) {
        const display = { ...get().display, ...patch };
        set({ display });
        get().engine?.setDisplay(display);
      },
      setLayers(patch) {
        const layers = { ...get().layers, ...patch };
        set({ layers });
        get().engine?.setLayers(layers);
      },
      setDryingSpeed(dryingSpeed) {
        set({ dryingSpeed });
        get().engine?.setDryingSpeed(dryingSpeed);
      },
      setUi(patch) {
        set(patch);
      },
      setRuntime(patch) {
        set(patch);
      },
      prefs() {
        const s = get();
        const { finished: _finished, ...display } = s.display;
        void _finished;
        return {
          tool: s.tool,
          toolSettings: s.toolSettings,
          lock: s.lock,
          strict: s.strict,
          magnetic: s.magnetic,
          display,
          layers: s.layers,
          dryingSpeed: s.dryingSpeed,
        };
      },
    };
  });
}

export function savePrefs(p: Prefs) {
  writeJSON(PREFS_KEY, p);
}
