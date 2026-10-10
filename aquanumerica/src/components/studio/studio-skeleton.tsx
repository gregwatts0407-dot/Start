import { Droplets } from "lucide-react";

/** Static shell shown while a canvas route resolves. Mirrors the studio layout. */
export function StudioSkeleton() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background" aria-busy="true" aria-label="Opening canvas">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b bg-card/80 px-3">
        <div className="size-8 rounded-md bg-muted" />
        <div className="h-4 w-40 rounded bg-muted" />
        <div className="ml-auto h-8 w-36 rounded-md bg-muted" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-[300px] shrink-0 flex-col gap-3 border-r bg-sidebar p-4 lg:flex">
          <div className="grid grid-cols-4 gap-1.5">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="h-14 rounded-lg bg-muted/70" />
            ))}
          </div>
          <div className="h-48 rounded-xl bg-muted/50" />
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="aspect-square rounded-full bg-muted/70" />
            ))}
          </div>
        </div>
        <div className="relative flex min-w-0 flex-1 items-center justify-center bg-viewport">
          <Droplets className="animate-drip size-8 text-primary/60" />
        </div>
        <div className="hidden w-[320px] shrink-0 border-l bg-sidebar xl:block" />
      </div>
    </div>
  );
}
