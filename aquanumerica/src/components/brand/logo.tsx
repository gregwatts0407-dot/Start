import { cn } from "@/lib/utils";

/** Watercolour drop mark with a numeral, plus the wordmark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-8", className)} aria-hidden>
      <defs>
        <radialGradient id="an-drop" cx="35%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#9cc3e6" />
          <stop offset="55%" stopColor="#6f8fcf" />
          <stop offset="100%" stopColor="#7c5aa6" />
        </radialGradient>
      </defs>
      <path
        d="M20 3c5.5 7.4 12 13.6 12 21.2C32 31 26.6 36.5 20 36.5S8 31 8 24.2C8 16.6 14.5 10.4 20 3Z"
        fill="url(#an-drop)"
        opacity="0.92"
      />
      <path d="M20 3c5.5 7.4 12 13.6 12 21.2C32 31 26.6 36.5 20 36.5" fill="none" stroke="#3e5c86" strokeOpacity="0.35" strokeWidth="1.2" />
      <ellipse cx="15.5" cy="20" rx="2.4" ry="4" fill="#fff" opacity="0.45" transform="rotate(-20 15.5 20)" />
      <text x="21" y="29" textAnchor="middle" fontSize="11" fontFamily="var(--font-fraunces), Georgia, serif" fill="#fff" fontWeight="600">
        7
      </text>
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="font-display text-xl font-medium tracking-tight">
        Aqua<span className="text-primary">Numerica</span>
      </span>
    </span>
  );
}
