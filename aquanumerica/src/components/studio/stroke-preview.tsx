"use client";

import { useEffect, useRef } from "react";
import { TOOLS, type ToolId, type ToolSettings } from "@/lib/engine/brushes";
import { blankAnalysis } from "@/lib/engine/blank";
import { hexToRgb, rgbToDensity } from "@/lib/engine/color";
import { Renderer } from "@/lib/engine/renderer";
import { WatercolorSurface, type StrokeOptions } from "@/lib/engine/watercolor";
import { useStudio } from "./studio-context";

const W = 520;
const H = 128;

interface PreviewKit {
  surface: WatercolorSurface;
  renderer: Renderer;
}

/**
 * Renders a sample stroke with the real watercolour engine so every setting
 * change is visible before it touches the painting.
 */
export function StrokePreview() {
  const tool = useStudio((s) => s.tool);
  const settings = useStudio((s) => s.toolSettings[s.tool]);
  const color = useStudio((s) => s.color);
  const granulation = useStudio((s) => s.layers.granulation);
  const ready = useStudio((s) => s.status === "ready");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const kitRef = useRef<PreviewKit | null>(null);

  useEffect(() => {
    if (!ready) return;
    const handle = setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (!kitRef.current) {
        const analysis = blankAnalysis(W, H);
        kitRef.current = {
          surface: new WatercolorSurface(analysis),
          renderer: new Renderer(analysis, [{ number: 1, name: "", hex: color }]),
        };
      }
      const { surface, renderer } = kitRef.current;
      renderer.layers = { ...renderer.layers, granulation, varnish: { visible: false, opacity: 0 } };
      paintSample(surface, tool, settings, color);
      renderer.updatePaint(surface, true);
      const ctx = canvas.getContext("2d")!;
      // The paint canvas already includes the paper texture.
      ctx.drawImage(renderer.paintCanvas, 0, 0);
      if (TOOLS[tool].kind === "eyedropper") {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, H * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }, 40);
    return () => clearTimeout(handle);
  }, [ready, tool, settings, color, granulation]);

  useEffect(() => () => kitRef.current?.renderer.dispose(), []);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      className="h-16 w-full rounded-lg border bg-[#faf7ef] shadow-inner"
      aria-label={`Preview of a ${TOOLS[tool].name} stroke`}
      role="img"
    />
  );
}

function paintSample(surface: WatercolorSurface, tool: ToolId, settings: ToolSettings, color: string) {
  surface.clearAll();
  const spec = TOOLS[tool];
  const density = rgbToDensity(hexToRgb(color));
  const opts = (overrides: Partial<StrokeOptions> = {}): StrokeOptions => ({
    tool: spec,
    opacity: settings.opacity,
    flow: settings.flow,
    wetness: settings.wetness,
    density,
    allow: null,
    magnetic: false,
    seed: 7,
    ...overrides,
  });
  if (spec.kind === "eyedropper") return;
  if (spec.kind === "fill") {
    const job = surface.beginFill(0, opts(), W * 0.25, H / 2);
    surface.finishFill(job);
    for (let k = 0; k < 20; k++) surface.step(1 / 30);
    surface.dryAll();
    return;
  }
  const stroke = (o: StrokeOptions, sizeOverride?: number) => {
    const size = sizeOverride ?? settings.size;
    const rMax = Math.max(1.2, Math.min(H * 0.34, size * 0.55));
    surface.beginStroke(o);
    let last: [number, number] | null = null;
    for (let x = 28; x <= W - 28; x += 0.75) {
      const t = (x - 28) / (W - 56);
      const y = H / 2 + Math.sin(t * Math.PI * 2) * H * 0.2;
      if (last && Math.hypot(x - last[0], y - last[1]) < Math.max(0.6, rMax * o.tool.spacing)) continue;
      const angle = last ? Math.atan2(y - last[1], x - last[0]) : 0;
      const pressure = 0.55 + 0.45 * Math.sin(Math.PI * t);
      surface.dab({ x, y, radius: rMax, angle, pressure });
      last = [x, y];
    }
    surface.endStroke();
  };
  if (spec.kind === "eraser") {
    // Lay a wash first so there is something to lift.
    stroke(opts({ tool: TOOLS.flat, opacity: 0.8, flow: 0.8, wetness: 0.8 }), 120);
    surface.dryAll();
    stroke(opts());
  } else {
    stroke(opts());
  }
  for (let k = 0; k < 24; k++) surface.step(1 / 30);
  surface.dryAll();
}
