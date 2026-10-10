"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { CANVASES } from "@/lib/canvases";
import stats from "@/lib/canvases/stats.generated.json";
import { CATEGORY_LABELS, DIFFICULTY_LABELS, type CanvasCategory, type CanvasDifficulty } from "@/lib/canvases/types";
import { useProgressMeta } from "@/hooks/use-progress-meta";
import { CanvasCard } from "./canvas-card";

type Sort = "featured" | "regions-asc" | "regions-desc" | "recent";
const SORT_LABELS: Record<Sort, string> = {
  featured: "Featured",
  "regions-asc": "Fewest regions",
  "regions-desc": "Most regions",
  recent: "Recently painted",
};
const REGION_COUNTS = stats as Record<string, { regions: number }>;

export function Gallery() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CanvasCategory | "all">("all");
  const [difficulty, setDifficulty] = useState<CanvasDifficulty | "all">("all");
  const [sort, setSort] = useState<Sort>("featured");
  const progress = useProgressMeta();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = CANVASES.filter((c) => {
      if (category !== "all" && c.category !== category) return false;
      if (difficulty !== "all" && c.difficulty !== difficulty) return false;
      if (!q) return true;
      return [c.title, c.description, c.category, ...c.tags, ...c.palette.map((p) => p.name)].join(" ").toLowerCase().includes(q);
    });
    const regions = (id: string) => REGION_COUNTS[id]?.regions ?? 0;
    if (sort === "regions-asc") list.sort((a, b) => regions(a.id) - regions(b.id));
    if (sort === "regions-desc") list.sort((a, b) => regions(b.id) - regions(a.id));
    if (sort === "recent") list.sort((a, b) => (progress[b.id]?.updatedAt ?? 0) - (progress[a.id]?.updatedAt ?? 0));
    return list;
  }, [query, category, difficulty, sort, progress]);

  const inProgress = useMemo(
    () =>
      CANVASES.filter((c) => progress[c.id] && progress[c.id].percent > 0.5 && !progress[c.id].finished)
        .sort((a, b) => progress[b.id].updatedAt - progress[a.id].updatedAt)
        .slice(0, 3),
    [progress],
  );

  const clear = () => {
    setQuery("");
    setCategory("all");
    setDifficulty("all");
  };

  return (
    <div className="flex flex-col gap-8">
      {inProgress.length > 0 && (
        <section aria-labelledby="continue-heading" className="flex flex-col gap-4">
          <h2 id="continue-heading" className="font-display text-2xl font-medium">Continue painting</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {inProgress.map((c) => (
              <CanvasCard key={c.id} meta={c} regions={REGION_COUNTS[c.id]?.regions} progress={progress[c.id]} />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="gallery-heading" className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 id="gallery-heading" className="font-display text-2xl font-medium">The gallery</h2>
            <p className="text-sm text-muted-foreground">{CANVASES.length} numbered canvases, each with its own pigment palette.</p>
          </div>
          <div className="relative w-full lg:w-80">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search canvases, subjects, colours…"
              className="pl-9"
              aria-label="Search canvases"
            />
            {query && (
              <button className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" onClick={() => setQuery("")} aria-label="Clear search">
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <ToggleGroup
            type="single"
            value={category}
            onValueChange={(v) => v && setCategory(v as CanvasCategory | "all")}
            className="w-full overflow-x-auto md:w-auto"
            aria-label="Filter by category"
          >
            <ToggleGroupItem value="all" className="px-3">All</ToggleGroupItem>
            {(Object.keys(CATEGORY_LABELS) as CanvasCategory[]).map((c) => (
              <ToggleGroupItem key={c} value={c} className="px-3">
                {CATEGORY_LABELS[c]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <ToggleGroup
            type="single"
            value={difficulty}
            onValueChange={(v) => v && setDifficulty(v as CanvasDifficulty | "all")}
            className="w-full md:w-auto"
            aria-label="Filter by difficulty"
          >
            <ToggleGroupItem value="all" className="px-3">Any level</ToggleGroupItem>
            {(Object.keys(DIFFICULTY_LABELS) as CanvasDifficulty[]).map((d) => (
              <ToggleGroupItem key={d} value={d} className="px-3">
                {DIFFICULTY_LABELS[d]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="md:ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">Sort: {SORT_LABELS[sort]}</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(Object.keys(SORT_LABELS) as Sort[]).map((s) => (
                  <DropdownMenuItem key={s} onSelect={() => setSort(s)}>
                    {SORT_LABELS[s]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {filtered.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {filtered.map((c) => (
              <CanvasCard key={c.id} meta={c} regions={REGION_COUNTS[c.id]?.regions} progress={progress[c.id]} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-12 text-center">
            <p className="font-display text-lg">Nothing matches that just yet.</p>
            <Button variant="outline" size="sm" onClick={clear}>Clear filters</Button>
          </div>
        )}
      </section>
    </div>
  );
}
