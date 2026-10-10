import { createRoot } from "react-dom/client";
import { useSyncExternalStore } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Studio } from "@/components/studio/studio";
import { getCanvasMeta } from "@/lib/canvases";
import Home from "@/app/page";
import { getPath, subscribe } from "./router";

function App() {
  const path = useSyncExternalStore(subscribe, getPath, getPath);
  const id = path.startsWith("/paint/") ? path.slice(7) : null;
  return id && getCanvasMeta(id) ? <Studio key={id} id={id} /> : <Home />;
}

createRoot(document.getElementById("root")!).render(
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
    <TooltipProvider>
      <App />
      <Toaster position="bottom-center" />
    </TooltipProvider>
  </ThemeProvider>,
);
