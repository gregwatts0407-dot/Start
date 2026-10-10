"use client";

import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import type { SaveRecord } from "@/lib/puzzle/types";
import { SaveCard } from "@/components/saves/save-card";

export function ContinueSection({ saves }: { saves: SaveRecord[] }) {
  const active = saves.filter((s) => !s.completed).slice(0, 8);
  if (!active.length) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">Continue where you left off</h2>
          <p className="text-sm text-muted-foreground">Your progress is saved automatically on this device.</p>
        </div>
        <Link href="/my-puzzles" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          All puzzles <ArrowRightIcon className="size-3.5" />
        </Link>
      </div>
      <div className="scrollbar-thin -mx-1 flex gap-4 overflow-x-auto px-1 pb-3">
        {active.map((s) => (
          <SaveCard key={s.id} save={s} compact />
        ))}
      </div>
    </section>
  );
}
