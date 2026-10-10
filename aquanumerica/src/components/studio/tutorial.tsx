"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { writeJSON } from "@/lib/storage";
import { useStudio } from "./studio-context";

export const TUTORIAL_KEY = "aquanumerica:tutorial-seen:v1";

interface Step {
  target?: string;
  title: string;
  body: React.ReactNode;
}

const STEPS: Step[] = [
  {
    title: "Welcome to the studio",
    body: (
      <>
        Every canvas is a numbered line drawing. Match each number to its colour and the watercolour engine does the
        rest – washes bloom, settle into the paper and dry with soft, pooled edges.
      </>
    ),
  },
  {
    target: "tools",
    title: "Choose an implement",
    body: (
      <>
        Soft mop, round, flat wash and detail liner brushes, a flowing <b>wash fill</b>, an eyedropper and a lifting
        eraser. Size, opacity, flow and wetness are adjustable – the preview strip shows the mark before you paint.
      </>
    ),
  },
  {
    target: "palette",
    title: "Pick a numbered colour",
    body: (
      <>
        Each swatch&apos;s number matches regions on the canvas. Tap one (or press <b>1–9</b>), and use the crosshair to
        jump to the next unpainted region. The colour wheel and recent colours are there for experiments.
      </>
    ),
  },
  {
    target: "precision",
    title: "Region locking keeps edges clean",
    body: (
      <>
        A stroke can never leave the region where it starts, and <b>strict numbers</b> only lets colour 7 into the 7s.
        <b> Magnetic edges</b> carry paint right up to borders, and <b>guide mode</b> highlights where to paint next.
      </>
    ),
  },
  {
    target: "canvas",
    title: "Paint, zoom and pan",
    body: (
      <>
        Scroll or pinch to zoom, hold <b>Space</b> and drag (or use two fingers) to pan. Paint into a wet wash for soft
        wet-in-wet blends; paint over dry paint to glaze and deepen colour. Press <b>D</b> to dry the paper instantly.
      </>
    ),
  },
  {
    target: "progress",
    title: "Track, adjust and export",
    body: (
      <>
        Follow progress region by region, tune paper grain, granulation and varnish layers, step back through history
        and export high-resolution PNG or PDF files. Everything saves automatically on this device.
      </>
    ),
  },
  {
    target: "reveal",
    title: "Finish & reveal",
    body: <>When you&apos;re done, reveal the painting: numbers disappear, pencil lines soften under the paint and a gentle varnish brings it all together.</>,
  },
];

export function Tutorial() {
  const open = useStudio((s) => s.tutorialOpen);
  const setUi = useStudio((s) => s.setUi);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = STEPS[index];

  const measure = useCallback(() => {
    if (!step?.target) return setRect(null);
    // Previously visited canvases can stay mounted (hidden) – use the visible match.
    const els = document.querySelectorAll<HTMLElement>(`[data-tour="${step.target}"]`);
    let found: DOMRect | null = null;
    els.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!found && r.width > 0 && r.height > 0) found = r;
    });
    setRect(found);
  }, [step]);

  // Measure the highlighted element after layout, and again whenever the window resizes.
  useEffect(() => {
    if (!open) return;
    let raf = requestAnimationFrame(measure);
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [open, measure]);

  const close = useCallback(() => {
    writeJSON(TUTORIAL_KEY, true);
    setUi({ tutorialOpen: false });
    setIndex(0);
  }, [setUi]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setIndex((i) => Math.min(STEPS.length - 1, i + 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, close]);

  if (!open || !step) return null;

  // Card placement: beside the target when there is room, otherwise centred.
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const cardW = Math.min(360, vw - 32);
  let style: React.CSSProperties = { left: (vw - cardW) / 2, top: vh / 2 - 120, width: cardW };
  if (rect) {
    const pad = 16;
    if (rect.right + cardW + pad * 2 < vw && rect.width < vw * 0.5) {
      style = { left: rect.right + pad, top: Math.min(Math.max(pad, rect.top + 24), vh - 300), width: cardW };
    } else if (rect.left - cardW - pad * 2 > 0 && rect.width < vw * 0.5) {
      style = { left: rect.left - cardW - pad, top: Math.min(Math.max(pad, rect.top + 24), vh - 300), width: cardW };
    } else if (rect.bottom + 260 < vh) {
      style = { left: Math.min(Math.max(pad, rect.left + rect.width / 2 - cardW / 2), vw - cardW - pad), top: rect.bottom + pad, width: cardW };
    } else {
      style = { left: (vw - cardW) / 2, top: Math.max(pad, rect.top + rect.height / 2 - 120), width: cardW };
    }
  }

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-primary/70 transition-all duration-300"
          style={{
            left: rect.left - 6,
            top: rect.top - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: "0 0 0 9999px rgba(15, 18, 30, 0.5)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgba(15,18,30,0.5)]" />
      )}
      <div className="absolute flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-2xl transition-all duration-300" style={style}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-primary">
              Step {index + 1} of {STEPS.length}
            </p>
            <h2 id="tour-title" className="mt-1 font-display text-xl leading-tight font-medium">
              {step.title}
            </h2>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={close} aria-label="Close tutorial">
            <X />
          </Button>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex gap-1" aria-hidden>
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/25"}`} />
            ))}
          </div>
          <div className="flex gap-2">
            {index > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => setIndex(index - 1)}>
                <ArrowLeft /> Back
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={close}>
                Skip
              </Button>
            )}
            {index < STEPS.length - 1 ? (
              <Button size="sm" onClick={() => setIndex(index + 1)}>
                Next <ArrowRight />
              </Button>
            ) : (
              <Button size="sm" onClick={close}>
                Start painting
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
