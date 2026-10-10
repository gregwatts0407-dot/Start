import { cn } from "@/lib/utils";

/** MosaicForge mark: a single stylised jigsaw piece in gold. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <path
        d="M6 6h7.2c-.9-3.6 6.5-3.6 5.6 0H26v7.2c3.6-.9 3.6 6.5 0 5.6V26h-7.2c.9 3.6-6.5 3.6-5.6 0H6v-7.2c-3.6.9-3.6-6.5 0-5.6z"
        className="fill-gold"
      />
      <path d="M6 6h7.2c-.9-3.6 6.5-3.6 5.6 0H26v7.2" className="fill-none stroke-white/40" strokeWidth="1.2" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark />
      <span className="font-display text-xl font-semibold tracking-tight">
        Mosaic<span className="text-gold">Forge</span>
      </span>
    </span>
  );
}
