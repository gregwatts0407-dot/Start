"use client";

import Link from "next/link";
import {
  ArrowLeftIcon,
  CheckIcon,
  CloudAlertIcon,
  Loader2Icon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  Redo2Icon,
  RotateCwIcon,
  SaveIcon,
  TimerIcon,
  Undo2Icon,
  MousePointerClickIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoMark } from "@/components/logo";
import { useWorkspace } from "@/store/workspace";
import { usePrefs } from "@/store/prefs";
import { formatTime, timeAgo } from "@/lib/format";
import type { WorkspaceActions } from "./actions";

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" onClick={onClick} disabled={disabled} aria-label={label}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function TopBar({
  title,
  pieces,
  rotation,
  panelOpen,
  actions,
}: {
  title: string;
  pieces: number;
  rotation: boolean;
  panelOpen: boolean;
  actions: WorkspaceActions;
}) {
  const stats = useWorkspace((s) => s.stats);
  const saveStatus = useWorkspace((s) => s.saveStatus);
  const lastSavedAt = useWorkspace((s) => s.lastSavedAt);
  const ready = useWorkspace((s) => s.status === "ready");
  const showTimer = usePrefs((s) => s.showTimer);
  const showMoves = usePrefs((s) => s.showMoves);
  const pct = Math.floor(stats.progress * 1000) / 10;

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-2 backdrop-blur-xl sm:gap-3 sm:px-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href="/" aria-label="Back to gallery">
              <ArrowLeftIcon />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Back to gallery (progress is saved)</TooltipContent>
      </Tooltip>
      <LogoMark className="hidden size-6 sm:block" />
      <div className="min-w-0">
        <h1 className="truncate text-sm leading-tight font-semibold sm:text-base">{title}</h1>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          {pieces.toLocaleString()} pieces
          {rotation && (
            <>
              · <RotateCwIcon className="size-3" /> rotation
            </>
          )}
        </p>
      </div>

      {/* Progress */}
      <div className="mx-auto hidden w-full max-w-xs items-center gap-3 lg:flex xl:max-w-sm">
        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-gold/70 to-gold transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="w-14 text-right text-sm font-semibold tabular-nums">{pct.toFixed(pct < 10 ? 1 : 0)}%</span>
      </div>
      <span className="ml-auto text-sm font-semibold tabular-nums lg:hidden">{Math.floor(pct)}%</span>

      <div className="flex items-center gap-0.5 sm:gap-1">
        {showTimer && <TimerReadout />}
        {showMoves && (
          <span className="hidden items-center gap-1 px-2 text-sm text-muted-foreground tabular-nums lg:flex" title="Moves">
            <MousePointerClickIcon className="size-3.5" />
            {stats.moves}
          </span>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <span className="hidden h-8 items-center gap-1.5 px-2 text-xs text-muted-foreground sm:flex" aria-live="polite">
              {saveStatus === "saving" ? (
                <>
                  <Loader2Icon className="size-3.5 animate-spin" /> Saving
                </>
              ) : saveStatus === "error" ? (
                <>
                  <CloudAlertIcon className="size-3.5 text-destructive" /> Not saved
                </>
              ) : saveStatus === "unsaved" ? (
                <>
                  <span className="size-1.5 rounded-full bg-gold" /> Unsaved
                </>
              ) : saveStatus === "saved" ? (
                <>
                  <CheckIcon className="size-3.5 text-emerald-500" /> Saved
                </>
              ) : null}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {lastSavedAt ? `Last saved ${timeAgo(lastSavedAt)}` : "Progress saves automatically"}
          </TooltipContent>
        </Tooltip>

        <IconBtn label="Undo (Ctrl+Z)" onClick={actions.undo} disabled={!ready || !stats.canUndo}>
          <Undo2Icon />
        </IconBtn>
        <IconBtn label="Redo (Ctrl+Shift+Z)" onClick={actions.redo} disabled={!ready || !stats.canRedo}>
          <Redo2Icon />
        </IconBtn>
        <IconBtn label="Save progress (Ctrl+S)" onClick={actions.save} disabled={!ready}>
          <SaveIcon />
        </IconBtn>
        <ThemeToggle className="size-8" />
        <IconBtn label={panelOpen ? "Hide panel (P)" : "Show panel (P)"} onClick={actions.togglePanel}>
          {panelOpen ? <PanelRightCloseIcon /> : <PanelRightOpenIcon />}
        </IconBtn>
      </div>
    </header>
  );
}

function TimerReadout() {
  const elapsed = useWorkspace((s) => s.elapsedMs);
  return (
    <span className="flex items-center gap-1 px-2 text-sm text-muted-foreground tabular-nums" title="Time">
      <TimerIcon className="size-3.5" />
      {formatTime(elapsed)}
    </span>
  );
}
