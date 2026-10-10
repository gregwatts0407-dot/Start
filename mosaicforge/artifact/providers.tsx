"use client";

import { useEffect } from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Standalone providers: follow the viewer's theme (an explicit
 * `data-theme` on the root, else the OS setting); the in-app toggle still works.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="mosaicforge-theme">
      <HostThemeSync />
      <TooltipProvider>
        {children}
        <ThemedToaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}

function HostThemeSync() {
  const { setTheme } = useTheme();
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const t = root.getAttribute("data-theme");
      if (t === "dark" || t === "light") setTheme(t);
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, [setTheme]);
  return null;
}

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="bottom-right"
      closeButton
      theme={resolvedTheme === "light" ? "light" : "dark"}
      toastOptions={{ className: "!rounded-xl !shadow-xl" }}
    />
  );
}
