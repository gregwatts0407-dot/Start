"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Workspace } from "@/components/puzzle/workspace";
import { Button } from "@/components/ui/button";

export function PlayClient() {
  const id = useSearchParams().get("id");
  if (!id) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">No puzzle selected.</p>
        <Button asChild>
          <Link href="/">Choose a puzzle</Link>
        </Button>
      </div>
    );
  }
  // Re-mount the workspace when switching puzzles.
  return <Workspace key={id} id={id} />;
}
