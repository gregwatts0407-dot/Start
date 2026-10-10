"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { hexToRgb, hsvToRgb, rgbToHex, rgbToHsv } from "@/lib/engine/color";

/**
 * HSV colour wheel: a hue ring around a saturation/value square.
 * Drawn on canvas; fully pointer/touch driven with keyboard nudge support.
 */
export function ColorWheel({ value, onChange, size = 208 }: { value: string; onChange: (hex: string) => void; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hsv, setHsv] = useState(() => rgbToHsv(hexToRgb(value)));
  const dragRef = useRef<"ring" | "square" | null>(null);
  const lastEmitted = useRef(value);

  // Follow external changes (palette clicks, eyedropper).
  useEffect(() => {
    if (value.toLowerCase() !== lastEmitted.current.toLowerCase()) {
      setHsv(rgbToHsv(hexToRgb(value)));
      lastEmitted.current = value;
    }
  }, [value]);

  const R = size / 2;
  const ringW = 16;
  const sq = (R - ringW - 10) * Math.SQRT2;
  const sq0 = R - sq / 2;

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    // Hue ring
    if (typeof ctx.createConicGradient === "function") {
      const g = ctx.createConicGradient(0, R, R);
      for (let i = 0; i <= 12; i++) g.addColorStop(i / 12, `hsl(${i * 30}, 85%, 58%)`);
      ctx.strokeStyle = g;
    } else {
      ctx.strokeStyle = "#999";
    }
    ctx.lineWidth = ringW;
    ctx.beginPath();
    ctx.arc(R, R, R - ringW / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
    // SV square
    const [hr, hg, hb] = hsvToRgb(hsv[0], 1, 1);
    ctx.fillStyle = `rgb(${hr},${hg},${hb})`;
    ctx.fillRect(sq0, sq0, sq, sq);
    const white = ctx.createLinearGradient(sq0, 0, sq0 + sq, 0);
    white.addColorStop(0, "rgba(255,255,255,1)");
    white.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = white;
    ctx.fillRect(sq0, sq0, sq, sq);
    const black = ctx.createLinearGradient(0, sq0, 0, sq0 + sq);
    black.addColorStop(0, "rgba(0,0,0,0)");
    black.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = black;
    ctx.fillRect(sq0, sq0, sq, sq);
    // Markers
    const a = (hsv[0] * Math.PI) / 180;
    const rr = R - ringW / 2 - 1;
    const marker = (x: number, y: number, r: number) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.stroke();
    };
    marker(R + Math.cos(a) * rr, R + Math.sin(a) * rr, 7);
    marker(sq0 + hsv[1] * sq, sq0 + (1 - hsv[2]) * sq, 6);
  }, [hsv, size, R, sq, sq0]);

  const emit = useCallback(
    (next: [number, number, number]) => {
      setHsv(next);
      const hex = rgbToHex(hsvToRgb(next[0], next[1], next[2]));
      lastEmitted.current = hex;
      onChange(hex);
    },
    [onChange],
  );

  const handle = (e: React.PointerEvent, start = false) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (start) {
      const d = Math.hypot(x - R, y - R);
      dragRef.current = d > R - ringW - 6 ? "ring" : "square";
    }
    if (dragRef.current === "ring") {
      let h = (Math.atan2(y - R, x - R) * 180) / Math.PI;
      if (h < 0) h += 360;
      emit([h, hsv[1], hsv[2]]);
    } else if (dragRef.current === "square") {
      const s = Math.min(1, Math.max(0, (x - sq0) / sq));
      const v = Math.min(1, Math.max(0, 1 - (y - sq0) / sq));
      emit([hsv[0], s, v]);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      className="touch-none select-none"
      role="slider"
      aria-label="Colour wheel (hue)"
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(hsv[0])}
      aria-valuetext={value}
      tabIndex={0}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        handle(e, true);
      }}
      onPointerMove={(e) => dragRef.current && handle(e)}
      onPointerUp={() => (dragRef.current = null)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 10 : 2;
        if (e.key === "ArrowLeft") emit([(hsv[0] - step + 360) % 360, hsv[1], hsv[2]]);
        else if (e.key === "ArrowRight") emit([(hsv[0] + step) % 360, hsv[1], hsv[2]]);
        else if (e.key === "ArrowUp") emit([hsv[0], hsv[1], Math.min(1, hsv[2] + step / 100)]);
        else if (e.key === "ArrowDown") emit([hsv[0], hsv[1], Math.max(0, hsv[2] - step / 100)]);
        else return;
        e.preventDefault();
      }}
    />
  );
}
