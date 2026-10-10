"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, CircleHelp, Cloud, CloudOff, Loader2, PanelLeft, PanelRight, Redo2, Sparkles, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoMark } from "@/components/brand/logo";
import { CATEGORY_LABELS, DIFFICULTY_LABELS } from "@/lib/canvases/types";
import { timeAgo } from "@/lib/utils";
import { useStudio } from "./studio-context";

function IconButton({ label, shortcut, onClick, disabled, children, className }: {
  label: string;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" onClick={onClick} disabled={disabled} aria-label={label} className={className}>
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

function SaveIndicator() {
  const saveState = useStudio((s) => s.saveState);
  const lastSaved = useStudio((s) => s.lastSaved);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, []);
  const content =
    saveState === "saving" ? (
      <>
        <Loader2 className="size-3.5 animate-spin" /> Saving…
      </>
    ) : saveState === "error" ? (
      <>
        <CloudOff className="size-3.5 text-destructive" /> Not saved
      </>
    ) : lastSaved ? (
      <>
        <Check className="size-3.5 text-sage" /> Saved {timeAgo(lastSaved)}
      </>
    ) : (
      <>
        <Cloud className="size-3.5" /> Autosave on
      </>
    );
  return (
    <span className="hidden items-center gap-1.5 text-xs text-muted-foreground md:inline-flex" aria-live="polite">
      {content}
    </span>
  );
}

export function TopBar() {
  const def = useStudio((s) => s.def);
  const engine = useStudio((s) => s.engine);
  const canUndo = useStudio((s) => s.history.canUndo);
  const canRedo = useStudio((s) => s.history.canRedo);
  const done = useStudio((s) => s.progress?.completeRegions ?? 0);
  const total = useStudio((s) => s.progress?.totalRegions ?? 0);
  const setUi = useStudio((s) => s.setUi);
  const ready = useStudio((s) => s.status === "ready");

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card/80 px-2 backdrop-blur sm:px-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" asChild aria-label="Back to gallery">
            <Link href="/">
              <ArrowLeft />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Back to gallery</TooltipContent>
      </Tooltip>
      <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setUi({ leftOpen: true })} aria-label="Open implements and palette">
        <PanelLeft />
      </Button>
      <LogoMark className="hidden size-7 sm:block" />
      <div className="flex min-w-0 flex-col leading-tight">
        <h1 className="truncate font-display text-base font-medium sm:text-lg">{def.title}</h1>
        <span className="hidden truncate text-xs text-muted-foreground sm:block">
          {CATEGORY_LABELS[def.category]} · {DIFFICULTY_LABELS[def.difficulty]}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
        <SaveIndicator />
        <Separator orientation="vertical" className="mx-1 hidden !h-6 md:block" />
        <IconButton label="Undo" shortcut="⌘Z" onClick={() => engine?.undo()} disabled={!canUndo}>
          <Undo2 />
        </IconButton>
        <IconButton label="Redo" shortcut="⇧⌘Z" onClick={() => engine?.redo()} disabled={!canRedo}>
          <Redo2 />
        </IconButton>
        {total > 0 && (
          <Badge variant="outline" className="hidden tabular-nums sm:inline-flex xl:hidden">
            {done}/{total}
          </Badge>
        )}
        <IconButton label="Show tutorial" shortcut="?" onClick={() => setUi({ tutorialOpen: true })} className="hidden sm:inline-flex">
          <CircleHelp />
        </IconButton>
        <ThemeToggle className="hidden sm:inline-flex" />
        <Button variant="ghost" size="icon-sm" className="xl:hidden" onClick={() => setUi({ rightOpen: true })} aria-label="Open progress, layers and export">
          <PanelRight />
        </Button>
        <Button data-tour="reveal" size="sm" className="ml-1 gap-1.5" disabled={!ready} onClick={() => setUi({ revealOpen: true })}>
          <Sparkles className="size-4" />
          <span className="hidden sm:inline">Finish &amp; Reveal</span>
          <span className="sm:hidden">Reveal</span>
        </Button>
      </div>
    </header>
  );
}
