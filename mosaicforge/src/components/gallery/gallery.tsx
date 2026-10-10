"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
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
import { CATEGORIES, GALLERY, type GalleryImage } from "@/lib/images";
import { useCustomImages } from "@/hooks/use-custom-images";
import { deleteImage } from "@/lib/storage";
import { resolveImage } from "@/lib/custom-images";
import type { SaveRecord } from "@/lib/puzzle/types";
import { cn } from "@/lib/utils";
import { ImageCard } from "./image-card";
import { UploadCard } from "./upload-card";
import { StartDialog } from "./start-dialog";

type Filter = "All" | (typeof CATEGORIES)[number] | "Yours";

export function Gallery({ saves }: { saves: SaveRecord[] }) {
  const custom = useCustomImages();
  const [filter, setFilter] = useState<Filter>("All");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<GalleryImage | null>(null);
  const [toDelete, setToDelete] = useState<GalleryImage | null>(null);

  // Next.js keeps visited routes alive (hidden) via <Activity>; make sure the
  // start dialog doesn't stay open in the background after navigating away.
  useLayoutEffect(
    () => () => {
      setSelected(null);
      setToDelete(null);
    },
    [],
  );

  const inProgress = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of saves) if (!s.completed) m.set(s.config.imageId, (m.get(s.config.imageId) ?? 0) + 1);
    return m;
  }, [saves]);

  const all = useMemo(() => [...custom, ...GALLERY], [custom]);
  const q = query.trim().toLowerCase();
  const shown = all.filter((img) => {
    if (filter === "Yours" && !img.custom) return false;
    if (filter !== "All" && filter !== "Yours" && (img.custom || img.category !== filter)) return false;
    if (!q) return true;
    return (
      img.title.toLowerCase().includes(q) ||
      img.category.toLowerCase().includes(q) ||
      img.credit.toLowerCase().includes(q)
    );
  });

  const filters: Filter[] = ["All", ...CATEGORIES, ...(custom.length ? (["Yours"] as Filter[]) : [])];
  const counts = (f: Filter) =>
    f === "All" ? all.length : f === "Yours" ? custom.length : GALLERY.filter((g) => g.category === f).length;

  async function confirmDelete() {
    if (!toDelete?.custom) return;
    await deleteImage(toDelete.id.slice(7));
    setToDelete(null);
    toast("Image removed");
  }

  return (
    <section id="gallery" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-display text-3xl font-semibold tracking-tight">Gallery</h2>
          <p className="mt-1 text-muted-foreground">
            {GALLERY.length} curated high-resolution images. Pick one to choose your piece count.
          </p>
        </div>
        <div className="relative w-full md:w-72">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search images…"
            className="h-10 pl-9"
            aria-label="Search images"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <XIcon className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div className="scrollbar-thin -mx-1 mb-6 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              filter === f
                ? "border-foreground bg-foreground text-background"
                : "text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            )}
          >
            {f}
            <span className={cn("text-xs tabular-nums", filter === f ? "opacity-60" : "opacity-50")}>{counts(f)}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {(filter === "All" || filter === "Yours") && !q && (
          <UploadCard
            onImported={(id) => {
              void resolveImage(id).then((img) => img && setSelected(img));
            }}
          />
        )}
        {shown.map((img) => (
          <ImageCard
            key={img.id}
            image={img}
            inProgress={inProgress.get(img.id)}
            onSelect={setSelected}
            onDelete={img.custom ? setToDelete : undefined}
          />
        ))}
      </div>
      {shown.length === 0 && (
        <p className="py-16 text-center text-muted-foreground">No images match “{query}”.</p>
      )}

      <StartDialog image={selected} saves={saves} onOpenChange={(o) => !o && setSelected(null)} />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{toDelete?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The image is deleted from this browser. Puzzles that use it will no longer open.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={confirmDelete}>
              Remove image
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
