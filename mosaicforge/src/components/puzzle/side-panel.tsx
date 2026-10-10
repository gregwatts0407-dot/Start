"use client";

import {
  EyeIcon,
  ExpandIcon,
  FocusIcon,
  KeyboardIcon,
  MaximizeIcon,
  MinusIcon,
  PaletteIcon,
  PlusIcon,
  RotateCcwIcon,
  ScanIcon,
  ShuffleIcon,
  SquareDashedIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useWorkspace } from "@/store/workspace";
import { usePrefs } from "@/store/prefs";
import type { PieceFilter } from "@/lib/puzzle/types";
import type { WorkspaceActions } from "./actions";
import { cn } from "@/lib/utils";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 px-4 py-4">
      <h3 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Row({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function SidePanel({
  open,
  thumb,
  info,
  actions,
}: {
  open: boolean;
  thumb?: string;
  info?: { pieces: number; rows: number; cols: number; pieceSize: number; atlasMB: number };
  actions: WorkspaceActions;
}) {
  const ghost = useWorkspace((s) => s.ghost);
  const filter = useWorkspace((s) => s.filter);
  const stats = useWorkspace((s) => s.stats);
  const prefs = usePrefs();

  return (
    <aside
      className={cn(
        "absolute top-0 right-0 bottom-0 z-20 flex w-72 shrink-0 flex-col border-l bg-background/95 backdrop-blur-xl transition-transform duration-300 lg:static lg:bg-background",
        open ? "translate-x-0" : "translate-x-full lg:hidden",
      )}
      aria-label="Puzzle controls"
    >
      <div className="flex items-center justify-between px-4 pt-3 lg:hidden">
        <span className="text-sm font-medium">Controls</span>
        <Button variant="ghost" size="icon-sm" onClick={actions.togglePanel} aria-label="Close panel">
          <XIcon />
        </Button>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto">
        <Section title="Reference">
          <button
            onClick={actions.openViewer}
            className="group relative block w-full overflow-hidden rounded-lg ring-1 ring-border"
            aria-label="View full image"
          >
            {thumb && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="Reference" className="w-full transition-transform duration-500 group-hover:scale-105" />
            )}
            <span className="absolute right-2 bottom-2 flex size-7 items-center justify-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
              <ExpandIcon className="size-3.5" />
            </span>
          </button>
          <Row id="ghost" label="Ghost image on board" checked={ghost} onChange={actions.setGhost} />
          <div className={cn("space-y-2 transition-opacity", !ghost && "pointer-events-none opacity-40")}>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <EyeIcon className="size-3" /> Opacity
              </span>
              <span className="tabular-nums">{Math.round(prefs.ghostOpacity * 100)}%</span>
            </div>
            <Slider
              value={[prefs.ghostOpacity * 100]}
              min={5}
              max={70}
              step={1}
              onValueChange={([v]) => actions.setGhostOpacity(v / 100)}
              aria-label="Ghost opacity"
            />
          </div>
        </Section>
        <Separator />

        <Section title="View">
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon-sm" onClick={actions.zoomOut} aria-label="Zoom out">
              <MinusIcon />
            </Button>
            <button
              onClick={actions.zoomActual}
              className="h-8 flex-1 rounded-md border text-sm tabular-nums hover:bg-muted"
              title="Zoom to actual image size"
            >
              {Math.round(stats.zoom * 100)}%
            </button>
            <Button variant="outline" size="icon-sm" onClick={actions.zoomIn} aria-label="Zoom in">
              <PlusIcon />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Button variant="outline" size="sm" onClick={actions.fit}>
              <MaximizeIcon /> Fit all
            </Button>
            <Button variant="outline" size="sm" onClick={actions.focusBoard}>
              <FocusIcon /> Board
            </Button>
          </div>
        </Section>
        <Separator />

        <Section title="Pieces">
          <ToggleGroup
            type="single"
            value={filter}
            onValueChange={(v) => v && actions.setFilter(v as PieceFilter)}
            className="w-full"
          >
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            <ToggleGroupItem value="edges">Edges</ToggleGroupItem>
            <ToggleGroupItem value="interior">Interior</ToggleGroupItem>
          </ToggleGroup>
          <p className="text-xs text-muted-foreground">
            Filtering dims the other loose pieces so you can focus. Placed: {stats.placed.toLocaleString()} /{" "}
            {info?.pieces.toLocaleString()}
          </p>
          <div className="space-y-1.5">
            <p className="text-xs font-medium">Organise loose pieces</p>
            <div className="grid grid-cols-1 gap-1.5">
              <Button variant="secondary" size="sm" className="justify-start" onClick={() => actions.organize("edges")} disabled={stats.completed}>
                <SquareDashedIcon /> Gather edge pieces
              </Button>
              <Button variant="secondary" size="sm" className="justify-start" onClick={() => actions.organize("colour")} disabled={stats.completed}>
                <PaletteIcon /> Sort by colour
              </Button>
              <Button variant="secondary" size="sm" className="justify-start" onClick={() => actions.organize("scatter")} disabled={stats.completed}>
                <ShuffleIcon /> Shuffle & spread out
              </Button>
            </div>
          </div>
        </Section>
        <Separator />

        <Section title="Preferences">
          <Row id="timer" label="Show timer" checked={prefs.showTimer} onChange={(v) => prefs.set({ showTimer: v })} />
          <Row id="moves" label="Show move counter" checked={prefs.showMoves} onChange={(v) => prefs.set({ showMoves: v })} />
          <Row id="sound" label="Snap sounds" checked={prefs.sound} onChange={(v) => prefs.set({ sound: v })} />
          <Row
            id="snapboard"
            label="Lock pieces to board"
            checked={prefs.snapToBoard}
            onChange={(v) => prefs.set({ snapToBoard: v })}
          />
        </Section>
        <Separator />

        <div className="grid gap-1.5 px-4 py-4">
          <Button variant="ghost" size="sm" className="justify-start" onClick={actions.openShortcuts}>
            <KeyboardIcon /> Controls & shortcuts
          </Button>
          <Button variant="ghost" size="sm" className="justify-start text-destructive hover:text-destructive" onClick={actions.restart}>
            <RotateCcwIcon /> Restart puzzle…
          </Button>
        </div>
      </div>
      {info && (
        <div className="flex items-center gap-1.5 border-t px-4 py-2.5 text-[11px] text-muted-foreground tabular-nums">
          <ScanIcon className="size-3" />
          {info.cols}×{info.rows} grid · {info.pieceSize}px pieces · {info.atlasMB} MB atlas
        </div>
      )}
    </aside>
  );
}
