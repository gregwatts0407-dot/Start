'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/studio', label: 'Overview' },
  { href: '/studio/programs', label: 'Programs' },
  { href: '/studio/live', label: 'Live & challenges' },
];

export function StudioNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Studio" className="scrollbar-none -mx-4 mb-8 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {LINKS.map((link) => {
        const active = link.href === '/studio' ? pathname === '/studio' || pathname.startsWith('/studio/meditations') : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'shrink-0 rounded-full px-4 py-2 text-sm transition-colors',
              active ? 'bg-secondary font-medium text-secondary-foreground' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
