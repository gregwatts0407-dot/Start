import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { MyPuzzlesView } from "@/components/my-puzzles/my-puzzles-view";

export const metadata: Metadata = { title: "My Puzzles" };

export default function MyPuzzlesPage() {
  return (
    <>
      <SiteHeader />
      <main className="min-h-[70vh]">
        <MyPuzzlesView />
      </main>
      <SiteFooter />
    </>
  );
}
