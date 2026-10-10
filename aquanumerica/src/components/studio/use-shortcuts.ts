"use client";

import { useEffect } from "react";
import { TOOL_ORDER, TOOLS } from "@/lib/engine/brushes";
import type { StudioStore } from "@/lib/store/studio-store";

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable || t.getAttribute("role") === "slider");
}

/** Studio keyboard shortcuts (tools, sizes, numbers, undo/redo, view toggles). */
export function useStudioShortcuts(store: StudioStore) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.defaultPrevented) return;
      const s = store.getState();
      const engine = s.engine;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) engine?.redo();
        else engine?.undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        engine?.redo();
        return;
      }
      if (mod && key === "0") {
        e.preventDefault();
        engine?.fit();
        return;
      }
      if (mod || e.altKey) return;

      const tool = TOOL_ORDER.find((id) => TOOLS[id].shortcut.toLowerCase() === key);
      if (tool) {
        s.setTool(tool);
        return;
      }
      if (/^[0-9]$/.test(e.key)) {
        const n = e.key === "0" ? 10 : Number(e.key);
        if (s.def.palette.some((p) => p.number === n)) s.selectNumber(n);
        return;
      }
      const spec = TOOLS[s.tool];
      const size = s.toolSettings[s.tool].size;
      switch (e.key) {
        case "[":
          s.setToolSetting("size", Math.max(spec.sizeRange[0], Math.round(size / 1.15)));
          break;
        case "]":
          s.setToolSetting("size", Math.min(spec.sizeRange[1], Math.round(size * 1.15) + 1));
          break;
        case "n":
          s.setDisplay({ showNumbers: !s.display.showNumbers });
          break;
        case "o":
          s.setDisplay({ showOutlines: !s.display.showOutlines });
          break;
        case "q":
          s.setDisplay({ guide: !s.display.guide });
          break;
        case "d":
          engine?.dryNow();
          break;
        case "=":
        case "+":
          engine?.zoomBy(1.25);
          break;
        case "-":
          engine?.zoomBy(0.8);
          break;
        case "?":
          s.setUi({ tutorialOpen: true });
          break;
        case "Escape":
          if (s.pickingReset) {
            engine?.pickRegionOnce(null);
            s.setUi({ pickingReset: false });
          }
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);
}
