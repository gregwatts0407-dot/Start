'use client';

import * as React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cn, initials } from '@/lib/utils';

interface UserAvatarProps {
  name: string;
  src?: string | null;
  className?: string;
}

/** Avatar with soft initials fallback. */
export function UserAvatar({ name, src, className }: UserAvatarProps) {
  return (
    <AvatarPrimitive.Root className={cn('relative flex size-10 shrink-0 overflow-hidden rounded-full', className)}>
      {src ? <AvatarPrimitive.Image src={src} alt="" className="aspect-square size-full object-cover" /> : null}
      <AvatarPrimitive.Fallback
        className="flex size-full items-center justify-center bg-secondary text-[0.8em] font-semibold text-secondary-foreground"
        delayMs={src ? 400 : 0}
      >
        <span aria-hidden>{initials(name) || '·'}</span>
        <span className="sr-only">{name}</span>
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
