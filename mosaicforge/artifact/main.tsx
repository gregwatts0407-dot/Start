/**
 * Standalone entry for the Artifact build: the same components as the
 * Next.js app, routed by an in-memory router.
 */
import { createRoot } from "react-dom/client";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { HomeView } from "@/components/home/home-view";
import { MyPuzzlesView } from "@/components/my-puzzles/my-puzzles-view";
import { PlayClient } from "@/app/play/play-client";
import { useRoute } from "./router";

function App() {
  const path = useRoute((s) => s.path);
  if (path === "/play") return <PlayClient />;
  return (
    <>
      <SiteHeader />
      <main className="min-h-[70vh]">{path === "/my-puzzles" ? <MyPuzzlesView /> : <HomeView />}</main>
      <SiteFooter />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <Providers>
    <App />
  </Providers>,
);
