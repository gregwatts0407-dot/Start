'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, MoreHorizontal, RotateCcw, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { enrollInProgram, leaveProgram, restartProgram } from '@/actions/social';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface ProgramActionsProps {
  programId: string;
  slug: string;
  enrolled: boolean;
  locked: boolean;
  nextHref: string | null;
  nextLabel: string;
}

export function ProgramActions({ programId, slug, enrolled, locked, nextHref, nextLabel }: ProgramActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, success?: string) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        if (success) toast.success(success);
        router.refresh();
      } else {
        toast.error(result.error ?? 'Something went wrong.');
      }
    });

  if (locked) {
    return (
      <Button asChild size="lg" variant="gold">
        <Link href="/pricing">
          <Lock aria-hidden /> Unlock with Premium
        </Link>
      </Button>
    );
  }

  if (!enrolled) {
    return (
      <Button size="lg" disabled={pending} onClick={() => run(() => enrollInProgram(programId, slug), 'You’re in. Day one is ready when you are.')}>
        {pending ? 'Starting…' : 'Start program'}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {nextHref && (
        <Button asChild size="lg">
          <Link href={nextHref}>{nextLabel}</Link>
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="size-12" aria-label="Program options" disabled={pending}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => run(() => restartProgram(programId, slug), 'Program restarted from day one')}>
            <RotateCcw /> Start again
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => run(() => leaveProgram(programId, slug), 'You’ve left this program')}>
            <LogOut /> Leave program
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
