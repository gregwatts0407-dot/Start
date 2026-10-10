"use client";

import { useMemo, useState } from "react";
import { Check, Crosshair, Hash, Lock, Magnet, Palette as PaletteIcon, ScanEye, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SETTING_LABELS, TOOLS, TOOL_ORDER, type ToolId, type ToolSettings } from "@/lib/engine/brushes";
import { hexToRgb, luminance } from "@/lib/engine/color";
import type { LockMode } from "@/lib/engine/engine";
import { cn } from "@/lib/utils";
import { ColorWheel } from "./color-wheel";
import { StrokePreview } from "./stroke-preview";
import { useStudio } from "./studio-context";
import { ToolGlyph } from "./tool-glyph";

export function LeftPanel() {
  return (
    <div className="thin-scroll flex h-full flex-col gap-5 overflow-y-auto p-4">
      <ToolSection />
      <PaletteSection />
      <PrecisionSection />
    </div>
  );
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{children}</h2>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Implements
// ---------------------------------------------------------------------------

function ToolSection() {
  const tool = useStudio((s) => s.tool);
  const color = useStudio((s) => s.color);
  const setTool = useStudio((s) => s.setTool);
  const spec = TOOLS[tool];
  return (
    <section className="flex flex-col gap-3" aria-labelledby="implements-title">
      <SectionTitle hint={spec.name}>
        <span id="implements-title">Implements</span>
      </SectionTitle>
      <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Painting implement">
        {TOOL_ORDER.map((id) => (
          <ToolButton key={id} id={id} active={id === tool} color={color} onSelect={() => setTool(id)} />
        ))}
      </div>
      <ToolSettingsCard />
    </section>
  );
}

function ToolButton({ id, active, color, onSelect }: { id: ToolId; active: boolean; color: string; onSelect: () => void }) {
  const spec = TOOLS[id];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          role="radio"
          aria-checked={active}
          aria-label={spec.name}
          onClick={onSelect}
          className={cn(
            "group flex flex-col items-center gap-1 rounded-lg border px-1 pt-1.5 pb-1 text-[11px] font-medium transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            active ? "border-primary/50 bg-primary/8 text-foreground shadow-sm" : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <ToolGlyph id={id} color={color} active={active} />
          {spec.short}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex max-w-56 flex-col gap-1">
        <span className="flex items-center justify-between gap-3 font-medium">
          {spec.name} <Kbd className="border-background/20 bg-background/15 text-background">{spec.shortcut}</Kbd>
        </span>
        <span className="opacity-80">{spec.description}</span>
      </TooltipContent>
    </Tooltip>
  );
}

/** Logarithmic mapping for the size slider: fine control at small sizes. */
function sizeToSlider(size: number, [min, max]: [number, number]) {
  if (max <= min) return 0;
  return (Math.log(size / min) / Math.log(max / min)) * 100;
}
function sliderToSize(v: number, [min, max]: [number, number]) {
  return Math.round(min * Math.pow(max / min, v / 100));
}

function ToolSettingsCard() {
  const tool = useStudio((s) => s.tool);
  const settings = useStudio((s) => s.toolSettings[s.tool]);
  const setSetting = useStudio((s) => s.setToolSetting);
  const spec = TOOLS[tool];
  const controls = spec.controls;
  const sizeLabel = spec.kind === "eyedropper" ? "Sample size" : SETTING_LABELS.size.label;

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card/70 p-3">
      <StrokePreview />
      {controls.map((key) => {
        const meta = SETTING_LABELS[key];
        const isSize = key === "size";
        const value = settings[key];
        const display = isSize ? `${value}px` : `${Math.round(value * 100)}%`;
        return (
          <div key={key} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Label className="cursor-help text-xs">{isSize ? sizeLabel : meta.label}</Label>
                </TooltipTrigger>
                <TooltipContent side="right">{meta.hint}</TooltipContent>
              </Tooltip>
              <span className="text-xs text-muted-foreground tabular-nums">{display}</span>
            </div>
            <Slider
              aria-label={meta.label}
              min={0}
              max={100}
              step={isSize ? 0.5 : 1}
              value={[isSize ? sizeToSlider(value, spec.sizeRange) : value * 100]}
              onValueChange={([v]) => setSetting(key as keyof ToolSettings, isSize ? sliderToSize(v, spec.sizeRange) : Math.max(0.02, v / 100))}
            />
          </div>
        );
      })}
      {spec.kind === "fill" && <p className="text-xs text-muted-foreground">Tap a region to flood it with a flowing wash.</p>}
      {spec.kind === "eyedropper" && <p className="text-xs text-muted-foreground">Tap paint to sample it, or an unpainted region to pick its numbered colour.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

/** Deterministic hand-painted swatch silhouette per number. */
export function swatchRadius(n: number) {
  const a = 38 + ((n * 17) % 24), b = 62 - ((n * 11) % 22), c = 44 + ((n * 7) % 20), d = 56 - ((n * 13) % 18);
  return `${a}% ${100 - a}% ${c}% ${100 - c}% / ${b}% ${d}% ${100 - d}% ${100 - b}%`;
}

function PaletteSection() {
  const def = useStudio((s) => s.def);
  const activeNumber = useStudio((s) => s.activeNumber);
  const color = useStudio((s) => s.color);
  const perNumber = useStudio((s) => s.progress?.perNumber);
  const selectNumber = useStudio((s) => s.selectNumber);
  const engine = useStudio((s) => s.engine);
  const active = def.palette.find((p) => p.number === activeNumber);
  const custom = !active || active.hex.toLowerCase() !== color.toLowerCase();
  const pn = activeNumber != null ? perNumber?.[activeNumber] : undefined;

  return (
    <section data-tour="palette" className="flex flex-col gap-3" aria-labelledby="palette-title">
      <SectionTitle hint={`${def.palette.length} colours`}>
        <span id="palette-title">Palette</span>
      </SectionTitle>
      <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Numbered colours">
        {def.palette.map((p) => {
          const prog = perNumber?.[p.number];
          const complete = !!prog && prog.total > 0 && prog.complete === prog.total;
          const dark = luminance(hexToRgb(p.hex)) < 0.36;
          const isActive = p.number === activeNumber;
          return (
            <Tooltip key={p.number}>
              <TooltipTrigger asChild>
                <button
                  role="radio"
                  aria-checked={isActive}
                  aria-label={`${p.number} ${p.name}${complete ? ", complete" : ""}`}
                  onClick={() => selectNumber(p.number)}
                  className={cn(
                    "relative flex aspect-square items-center justify-center text-sm font-semibold transition-transform outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    isActive ? "scale-110" : "hover:scale-105",
                  )}
                  style={{ borderRadius: swatchRadius(p.number) }}
                >
                  <span
                    className={cn("absolute inset-0 shadow-[inset_0_-3px_6px_rgba(0,0,0,0.12),inset_0_2px_3px_rgba(255,255,255,0.35)]", isActive && "ring-2 ring-primary ring-offset-2 ring-offset-sidebar")}
                    style={{ background: p.hex, borderRadius: swatchRadius(p.number) }}
                  />
                  <span className={cn("relative tabular-nums", dark ? "text-white/95" : "text-black/65")}>{p.number}</span>
                  {complete && (
                    <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-sage text-white shadow">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {p.number} · {p.name}
                {prog ? ` — ${prog.complete}/${prog.total}` : ""}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <div className="flex items-center gap-3 rounded-xl border bg-card/70 p-2.5">
        <span className="size-9 shrink-0 shadow-inner" style={{ background: color, borderRadius: swatchRadius(activeNumber ?? 3) }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{active ? `${active.number} · ${active.name}` : "No number selected"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {custom ? `Custom colour ${color.toUpperCase()}` : pn ? `${pn.complete} of ${pn.total} regions painted` : active?.hex.toUpperCase()}
          </p>
        </div>
        {activeNumber != null && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Find next unpainted region" onClick={() => engine?.focusNextUnfinished(activeNumber)}>
                <Crosshair />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Find the next unpainted {activeNumber}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <CustomColour />
    </section>
  );
}

function CustomColour() {
  const color = useStudio((s) => s.color);
  const recent = useStudio((s) => s.recentColors);
  const setColor = useStudio((s) => s.setColor);
  const [hex, setHex] = useState(color);
  const [open, setOpen] = useState(false);
  const recents = useMemo(() => recent.slice(0, 10), [recent]);

  return (
    <div className="flex items-center gap-2">
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) setHex(color);
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <PaletteIcon className="size-4" /> Colour wheel
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="flex w-auto flex-col items-center gap-3">
          <ColorWheel
            value={color}
            onChange={(h) => {
              setHex(h);
              setColor(h, { remember: false });
            }}
          />
          <div className="flex w-full items-center gap-2">
            <span className="size-8 shrink-0 rounded-md border" style={{ background: color }} />
            <Input
              value={hex}
              onChange={(e) => {
                setHex(e.target.value);
                if (/^#?[0-9a-f]{6}$/i.test(e.target.value)) setColor(e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`, { remember: false });
              }}
              aria-label="Hex colour"
              className="h-8 font-mono text-xs uppercase"
            />
            <Button
              size="sm"
              onClick={() => {
                setColor(color, { remember: true });
                setOpen(false);
              }}
            >
              Use
            </Button>
          </div>
          <p className="max-w-52 text-center text-xs text-muted-foreground">Custom colours still respect region locking for the selected number.</p>
        </PopoverContent>
      </Popover>
      <div className="flex min-w-0 flex-1 gap-1 overflow-hidden" aria-label="Recent colours">
        {recents.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c, { remember: false })}
            className={cn("size-5 shrink-0 rounded-full border shadow-sm transition-transform hover:scale-110", c.toLowerCase() === color.toLowerCase() && "ring-2 ring-primary ring-offset-1 ring-offset-sidebar")}
            style={{ background: c }}
            aria-label={`Recent colour ${c}`}
            title={c}
          />
        ))}
        {!recents.length && <span className="truncate text-xs text-muted-foreground">Recent colours appear here</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Precision (region automation)
// ---------------------------------------------------------------------------

function PrecisionSection() {
  const lock = useStudio((s) => s.lock);
  const strict = useStudio((s) => s.strict);
  const magnetic = useStudio((s) => s.magnetic);
  const guide = useStudio((s) => s.display.guide);
  const setLock = useStudio((s) => s.setLock);
  const setStrict = useStudio((s) => s.setStrict);
  const setMagnetic = useStudio((s) => s.setMagnetic);
  const setDisplay = useStudio((s) => s.setDisplay);

  const lockHelp: Record<LockMode, string> = {
    region: "Each stroke stays inside the region where it starts.",
    number: "Paint flows into every region of the selected number.",
    off: "Free painting – no boundaries.",
  };

  return (
    <section data-tour="precision" className="flex flex-col gap-3" aria-labelledby="precision-title">
      <SectionTitle>
        <span id="precision-title">Precision</span>
      </SectionTitle>
      <ToggleGroup type="single" value={lock} onValueChange={(v) => v && setLock(v as LockMode)} aria-label="Region lock">
        <ToggleGroupItem value="region">
          <Lock /> Region
        </ToggleGroupItem>
        <ToggleGroupItem value="number">
          <Hash /> Number
        </ToggleGroupItem>
        <ToggleGroupItem value="off">
          <Unlock /> Free
        </ToggleGroupItem>
      </ToggleGroup>
      <p className="-mt-1 text-xs text-muted-foreground">{lockHelp[lock]}</p>
      <SwitchRow
        id="strict"
        icon={<Hash className="size-4" />}
        label="Strict numbers"
        hint="Only paint regions that match the selected number."
        checked={strict}
        onChange={setStrict}
        disabled={lock !== "region"}
      />
      <SwitchRow
        id="magnetic"
        icon={<Magnet className="size-4" />}
        label="Magnetic edges"
        hint="Strokes snap out to nearby borders – no white slivers."
        checked={magnetic}
        onChange={setMagnetic}
        disabled={lock === "off"}
      />
      <SwitchRow
        id="guide"
        icon={<ScanEye className="size-4" />}
        label="Guide mode"
        hint="Highlight the regions for the selected number."
        checked={guide}
        onChange={(v) => setDisplay({ guide: v })}
      />
    </section>
  );
}

function SwitchRow({ id, icon, label, hint, checked, onChange, disabled }: {
  id: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={cn("flex items-start gap-3", disabled && "opacity-50")}>
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="flex-1">
        <Label htmlFor={id} className="text-sm">{label}</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
