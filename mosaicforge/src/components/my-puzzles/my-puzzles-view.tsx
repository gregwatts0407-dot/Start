"use client";

import { useLayoutEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PuzzleIcon } from "lucide-react";
import { toast } from "sonner";
import { useSaves } from "@/hooks/use-saves";
import { SaveCard } from "@/components/saves/save-card";
import { RestartDialog } from "@/components/saves/restart-dialog";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteSave } from "@/lib/storage";
import { restartAsCopy, restartOverwrite } from "@/lib/create-puzzle";
import type { SaveRecord } from "@/lib/puzzle/types";

type Tab = "active" | "completed" | "all";

export function MyPuzzlesView() {
  const router = useRouter();
  const { saves } = useSaves();
  const [tab, setTab] = useState<Tab>("active");
  const [toDelete, setToDelete] = useState<SaveRecord | null>(null);
  const [toRestart, setToRestart] = useState<SaveRecord | null>(null);

  // Close transient dialogs when this (preserved) route is hidden.
  useLayoutEffect(
    () => () => {
      setToDelete(null);
      setToRestart(null);
    },
    [],
  );

  const list = (saves ?? []).filter((s) => (tab === "all" ? true : tab === "active" ? !s.completed : s.completed));
  const activeCount = (saves ?? []).filter((s) => !s.completed).length;
  const doneCount = (saves ?? []).length - activeCount;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-tight">My Puzzles</h1>
          <p className="mt-1 text-muted-foreground">Every puzzle you start is saved here automatically.</p>
        </div>
        <ToggleGroup type="single" value={tab} onValueChange={(v) => v && setTab(v as Tab)}>
          <ToggleGroupItem value="active" className="px-3.5">
            In progress <span className="opacity-60">{activeCount}</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="completed" className="px-3.5">
            Completed <span className="opacity-60">{doneCount}</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="all" className="px-3.5">
            All
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {saves === null ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="aspect-[4/3.6] animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed py-20 text-center">
          <PuzzleIcon className="size-10 text-gold" />
          <div>
            <p className="font-medium">{tab === "completed" ? "No completed puzzles yet" : "No puzzles in progress"}</p>
            <p className="text-sm text-muted-foreground">Choose an image from the gallery to get started.</p>
          </div>
          <Button asChild>
            <Link href="/#gallery">Browse the gallery</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((s) => (
            <SaveCard key={s.id} save={s} onDelete={setToDelete} onRestart={setToRestart} />
          ))}
        </div>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this save?</AlertDialogTitle>
            <AlertDialogDescription>
              “{toDelete?.config.title}” ({toDelete && toDelete.config.rows * toDelete.config.cols} pieces,{" "}
              {toDelete && Math.round(toDelete.progress * 100)}% complete) will be removed permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                if (toDelete) await deleteSave(toDelete.id);
                toast("Save deleted");
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RestartDialog
        open={!!toRestart}
        onOpenChange={(o) => !o && setToRestart(null)}
        title={toRestart?.config.title ?? ""}
        onNewCopy={async () => {
          if (!toRestart) return;
          const id = await restartAsCopy(toRestart);
          router.push(`/play?id=${id}`);
        }}
        onOverwrite={async () => {
          if (!toRestart) return;
          await restartOverwrite(toRestart);
          router.push(`/play?id=${toRestart.id}`);
        }}
      />
    </div>
  );
}
