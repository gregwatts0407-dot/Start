import type { Metadata } from "next";
import { Suspense } from "react";
import { PlayClient } from "./play-client";

export const metadata: Metadata = { title: "Puzzle" };

export default function PlayPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <PlayClient />
    </Suspense>
  );
}
