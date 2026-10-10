"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2Icon, ClockIcon, MoreHorizontalIcon, PlayIcon, RotateCcwIcon, Trash2Icon, RotateCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { resolveImage } from "@/lib/custom-images";
import { formatTime, timeAgo } from "@/lib/format";
import type { SaveRecord } from "@/lib/puzzle/types";
import { cn } from "@/lib/utils";

export function SaveCard({
  save,
  onDelete,
  onRestart,
  compact,
}: {
  save: SaveRecord;
  onDelete?: (s: SaveRecord) => void;
  onRestart?: (s: SaveRecord) => void;
  compact?: boolean;
}) {
  // Card art is the source image; the saved board snapshot is shown as an inset.
  const [imageThumb, setImageThumb] = useState<string | undefined>();
  useEffect(() => {
    let alive = true;
    resolveImage(save.config.imageId).then((img) => alive && setImageThumb(img?.thumb));
    return () => {
      alive = false;
    };
  }, [save.config.imageId]);
  const thumb = imageThumb ?? save.thumb;
  const showInset = !!save.thumb && !!imageThumb && save.progress > 0 && !save.completed;

  const pct = Math.round(save.progress * 100);
  const pieces = save.config.rows * save.config.cols;
  const href = `/play?id=${save.id}`;

  return (
    <div className={cn("group relative overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-lg", compact ? "w-72 shrink-0" : "")}>
      <Link href={href} className="block">
        <div className="relative aspect-[3/2] overflow-hidden bg-muted">
          {thumb && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
          {showInset && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={save.thumb}
              alt="Board progress"
              className="absolute bottom-2 left-2 w-[38%] rounded-md shadow-lg ring-1 ring-white/30"
            />
          )}
          <div className="absolute top-2 left-2 flex gap-1.5">
            <Badge variant="glass">{pieces} pieces</Badge>
            {save.config.rotation && (
              <Badge variant="glass">
                <RotateCwIcon /> Rotation
              </Badge>
            )}
          </div>
          {save.completed ? (
            <Badge className="absolute top-2 right-2 bg-emerald-500/90 text-white">
              <CheckCircle2Icon /> Completed
            </Badge>
          ) : (
            <span className="absolute right-3 bottom-2 font-display text-2xl font-semibold text-white drop-shadow">{pct}%</span>
          )}
          <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
            <span className="flex size-12 items-center justify-center rounded-full bg-white/90 text-black shadow-lg">
              <PlayIcon className="ml-0.5 size-5 fill-current" />
            </span>
          </span>
        </div>
      </Link>
      <div className="space-y-2.5 p-3.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <Link href={href} className="block truncate font-medium hover:underline">
              {save.config.title}
            </Link>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ClockIcon className="size-3" />
              {formatTime(save.elapsedMs)} · {save.moves} moves · {timeAgo(save.updatedAt)}
            </p>
          </div>
          {(onDelete || onRestart) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Puzzle actions">
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={href}>
                    <PlayIcon /> {save.completed ? "View" : "Continue"}
                  </Link>
                </DropdownMenuItem>
                {onRestart && (
                  <DropdownMenuItem onSelect={() => onRestart(save)}>
                    <RotateCcwIcon /> Restart…
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => onDelete(save)}>
                      <Trash2Icon /> Delete save
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {!save.completed && <Progress value={pct} />}
      </div>
    </div>
  );
}
