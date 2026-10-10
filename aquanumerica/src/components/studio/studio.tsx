"use client";

import { useEffect, useState } from "react";
import { getCanvas } from "@/lib/canvases";
import { createStudioStore, loadPrefs, savePrefs } from "@/lib/store/studio-store";
import { readJSON } from "@/lib/storage";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { StudioProvider, useStudio } from "./studio-context";
import { useStudioShortcuts } from "./use-shortcuts";
import { TopBar } from "./top-bar";
import { LeftPanel } from "./left-panel";
import { RightPanel } from "./right-panel";
import { Viewport } from "./viewport";
import { Tutorial, TUTORIAL_KEY } from "./tutorial";
import { RevealDialog } from "./reveal-dialog";

export function Studio({ id }: { id: string }) {
  const [store] = useState(() => createStudioStore(getCanvas(id)!));

  useEffect(() => {
    store.getState().applyPrefs(loadPrefs());
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = store.subscribe((s, prev) => {
      if (
        s.tool !== prev.tool || s.toolSettings !== prev.toolSettings || s.lock !== prev.lock || s.strict !== prev.strict ||
        s.magnetic !== prev.magnetic || s.display !== prev.display || s.layers !== prev.layers || s.dryingSpeed !== prev.dryingSpeed
      ) {
        clearTimeout(timer);
        timer = setTimeout(() => savePrefs(store.getState().prefs()), 400);
      }
    });
    if (!readJSON<boolean>(TUTORIAL_KEY, false)) store.getState().setUi({ tutorialOpen: true });
    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, [store]);

  useStudioShortcuts(store);

  return (
    <StudioProvider store={store}>
      <StudioLayout />
    </StudioProvider>
  );
}

function StudioLayout() {
  const leftOpen = useStudio((s) => s.leftOpen);
  const rightOpen = useStudio((s) => s.rightOpen);
  const setUi = useStudio((s) => s.setUi);
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <aside data-tour="tools" className="hidden w-[300px] shrink-0 flex-col border-r bg-sidebar lg:flex">
          <LeftPanel />
        </aside>
        <main className="relative min-w-0 flex-1 bg-viewport">
          <Viewport />
        </main>
        <aside data-tour="progress" className="hidden w-[320px] shrink-0 flex-col border-l bg-sidebar xl:flex">
          <RightPanel />
        </aside>
      </div>
      <Sheet open={leftOpen} onOpenChange={(o) => setUi({ leftOpen: o })}>
        <SheetContent side="left" className="w-[320px] gap-0 p-0 lg:hidden" onOpenAutoFocus={(e) => e.preventDefault()}>
          <SheetTitle className="sr-only">Implements and palette</SheetTitle>
          <SheetDescription className="sr-only">Choose a brush, adjust it and pick a numbered colour.</SheetDescription>
          <LeftPanel />
        </SheetContent>
      </Sheet>
      <Sheet open={rightOpen} onOpenChange={(o) => setUi({ rightOpen: o })}>
        <SheetContent side="right" className="w-[340px] gap-0 p-0 xl:hidden" onOpenAutoFocus={(e) => e.preventDefault()}>
          <SheetTitle className="sr-only">Progress, layers, history and export</SheetTitle>
          <SheetDescription className="sr-only">Track progress, adjust layers, browse history and export.</SheetDescription>
          <RightPanel />
        </SheetContent>
      </Sheet>
      <Tutorial />
      <RevealDialog />
    </div>
  );
}
