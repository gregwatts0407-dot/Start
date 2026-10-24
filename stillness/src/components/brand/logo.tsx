import Link from 'next/link';
import { cn } from '@/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-7', className)} aria-hidden>
      <circle cx="16" cy="16" r="15" className="fill-primary" />
      <circle cx="16" cy="16" r="9" className="fill-none stroke-gold" strokeWidth="1.5" opacity="0.9" />
      <circle cx="16" cy="16" r="4" className="fill-gold" />
    </svg>
  );
}

export function Logo({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn('inline-flex items-center gap-2.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}>
      <LogoMark />
      <span className="font-display text-lg font-semibold tracking-tight">Stillness</span>
    </Link>
  );
}
