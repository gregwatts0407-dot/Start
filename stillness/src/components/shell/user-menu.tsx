'use client';

import Link from 'next/link';
import { LogOut, Moon, Settings, Sparkles, Sun, User } from 'lucide-react';
import { signOut } from '@/actions/auth';
import { UserAvatar } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useTheme } from './theme-toggle';

interface UserMenuProps {
  id: string;
  name: string;
  avatarUrl: string | null;
  email: string;
  isPremium: boolean;
  showName?: boolean;
}

export function UserMenu({ id, name, avatarUrl, email, isPremium, showName }: UserMenuProps) {
  const { dark, toggle } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex items-center gap-3 rounded-full text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          showName ? 'w-full p-2 hover:bg-muted' : 'p-0.5',
        )}
        aria-label="Account menu"
      >
        <UserAvatar name={name} src={avatarUrl} className="size-9" />
        {showName && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{name}</span>
            <span className="block truncate text-xs text-muted-foreground">{isPremium ? 'Premium' : 'Free plan'}</span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/profile/${id}`}>
            <User /> Your profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings /> Settings
          </Link>
        </DropdownMenuItem>
        {!isPremium && (
          <DropdownMenuItem asChild>
            <Link href="/pricing">
              <Sparkles className="text-gold" /> Go Premium
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); toggle(); }}>
          {dark ? <Sun /> : <Moon />} {dark ? 'Light theme' : 'Dark theme'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
