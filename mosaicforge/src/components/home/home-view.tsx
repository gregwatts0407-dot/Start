"use client";

import { useSaves } from "@/hooks/use-saves";
import { Hero } from "./hero";
import { ContinueSection } from "./continue-section";
import { Gallery } from "@/components/gallery/gallery";

export function HomeView() {
  const { saves } = useSaves();
  return (
    <>
      <Hero onBrowse={() => document.getElementById("gallery")?.scrollIntoView({ behavior: "smooth" })} />
      <ContinueSection saves={saves ?? []} />
      <Gallery saves={saves ?? []} />
    </>
  );
}
