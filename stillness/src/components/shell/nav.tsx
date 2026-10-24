'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, BookOpen, Compass, Home, LayoutDashboard, Mic2, Shield, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Role } from '@/lib/types';

const PRIMARY = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/library', label: 'Library', icon: Compass },
  { href: '/programs', label: 'Programs', icon: BookOpen },
  { href: '/progress', label: 'Progress', icon: BarChart3 },
  { href: '/community', label: 'Community', icon: Users },
];

function isActive(pathname: string, href: string) {
  if (href === '/library') return pathname.startsWith('/library') || pathname.startsWith('/meditations');
  if (href === '/progress') return pathname.startsWith('/progress') || pathname.startsWith('/journal');
  if (href === '/community') return pathname.startsWith('/community') || pathname.startsWith('/live') || pathname.startsWith('/profile');
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const staff = [
    ...(role !== 'user' ? [{ href: '/studio', label: 'Studio', icon: Mic2 }] : []),
    ...(role === 'admin' ? [{ href: '/admin', label: 'Admin', icon: Shield }] : []),
  ];
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {PRIMARY.map((item) => (
        <NavLink key={item.href} {...item} active={isActive(pathname, item.href)} />
      ))}
      {staff.length > 0 && (
        <>
          <p className="mt-6 px-3 pb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <LayoutDashboard className="mr-1.5 inline size-3" aria-hidden />
            Manage
          </p>
          {staff.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(pathname, item.href)} />
          ))}
        </>
      )}
    </nav>
  );
}

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Home; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-full px-3 py-2.5 text-[15px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'bg-secondary font-medium text-secondary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="size-[18px]" aria-hidden />
      {label}
    </Link>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 backdrop-blur-lg md:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-md grid-cols-5">
        {PRIMARY.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-full flex-col items-center justify-center gap-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  active ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', active && 'bg-secondary')}>
                  <Icon className="size-[18px]" aria-hidden />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
