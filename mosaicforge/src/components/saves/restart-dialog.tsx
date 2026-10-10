"use client";

import { CopyPlusIcon, RotateCcwIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Restart choice: overwrite this save, or keep it and start a fresh copy.
 */
export function RestartDialog({
  open,
  onOpenChange,
  title,
  onOverwrite,
  onNewCopy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  onOverwrite: () => void;
  onNewCopy: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Restart “{title}”?</DialogTitle>
          <DialogDescription>Choose whether to keep your current progress as a separate save.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2.5">
          <button
            onClick={onNewCopy}
            className="flex items-start gap-3 rounded-lg border p-3.5 text-left transition-colors hover:border-gold/60 hover:bg-muted/60"
          >
            <CopyPlusIcon className="mt-0.5 size-5 shrink-0 text-gold" />
            <span>
              <span className="block font-medium">Start a fresh copy</span>
              <span className="text-sm text-muted-foreground">Keep this save untouched and begin a new puzzle with a new cut.</span>
            </span>
          </button>
          <button
            onClick={onOverwrite}
            className="flex items-start gap-3 rounded-lg border p-3.5 text-left transition-colors hover:border-destructive/60 hover:bg-destructive/5"
          >
            <RotateCcwIcon className="mt-0.5 size-5 shrink-0 text-destructive" />
            <span>
              <span className="block font-medium">Restart and overwrite</span>
              <span className="text-sm text-muted-foreground">Scatter all pieces again and reset the timer. Current progress is lost.</span>
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
