"use client";

import { useState } from "react";
import { DownloadIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Full-screen, full-resolution image viewer (click to toggle fit / 100%). */
export function ImageViewer({
  open,
  onOpenChange,
  src,
  title,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  src: string;
  title: string;
}) {
  const [actual, setActual] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden border-white/10 bg-black p-0 sm:max-w-[calc(100vw-2rem)]">
        <div className="absolute top-3 left-4 z-10 flex items-center gap-2">
          <DialogTitle className="text-sm font-medium text-white/80">{title}</DialogTitle>
        </div>
        <div className="absolute top-2.5 right-12 z-10 flex gap-1">
          <Button size="icon-sm" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={() => setActual((a) => !a)} aria-label={actual ? "Fit to screen" : "Actual size"}>
            {actual ? <ZoomOutIcon /> : <ZoomInIcon />}
          </Button>
          <Button size="icon-sm" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" asChild>
            <a href={src} download={`${title}.webp`} aria-label="Download image">
              <DownloadIcon />
            </a>
          </Button>
        </div>
        <div className={cn("size-full", actual ? "overflow-auto" : "flex items-center justify-center p-10")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={title}
            onClick={() => setActual((a) => !a)}
            className={cn(actual ? "max-w-none cursor-zoom-out" : "max-h-full max-w-full cursor-zoom-in object-contain")}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
