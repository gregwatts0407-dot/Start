'use client';

import * as React from 'react';
import Link from 'next/link';
import { Flag, Globe, Heart, Lock, MoreHorizontal, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { deleteJournalEntry, reportEntry, toggleReaction, updateJournalVisibility } from '@/actions/journal';
import { MoodDot } from '@/components/player/reflection-dialog';
import { UserAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { MOODS } from '@/lib/constants';
import type { FeedEntry, Visibility } from '@/lib/types';
import { cn, formatMinutes, relativeTime } from '@/lib/utils';

const VISIBILITY_ICON = { private: Lock, friends: Users, public: Globe } as const;
const VISIBILITY_LABEL = { private: 'Only you', friends: 'Friends', public: 'Community' } as const;

export function JournalEntryCard({ entry, viewerId, showAuthor = true }: { entry: FeedEntry; viewerId: string; showAuthor?: boolean }) {
  const [visibility, setVisibility] = React.useState<Visibility>(entry.visibility);
  const [reacted, setReacted] = React.useState(entry.reacted);
  const [count, setCount] = React.useState(entry.reaction_count);
  const [deleted, setDeleted] = React.useState(false);
  const [reporting, setReporting] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [time, setTime] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  React.useEffect(() => setTime(relativeTime(entry.created_at)), [entry.created_at]);

  if (deleted) return null;
  const mine = entry.user_id === viewerId;
  const VisibilityIcon = VISIBILITY_ICON[visibility];
  const mood = MOODS.find((m) => m.value === entry.mood);

  return (
    <article className="rounded-3xl border bg-card p-5">
      <header className="flex items-start gap-3">
        {showAuthor && entry.author && (
          <Link href={`/profile/${entry.author.id}`} className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <UserAvatar name={entry.author.display_name} src={entry.author.avatar_url} />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          {showAuthor && entry.author && (
            <Link href={`/profile/${entry.author.id}`} className="font-medium hover:underline">
              {entry.author.display_name}
            </Link>
          )}
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span suppressHydrationWarning>{time ?? ' '}</span>
            <span className="inline-flex items-center gap-1">
              <VisibilityIcon className="size-3" aria-hidden /> {VISIBILITY_LABEL[visibility]}
            </span>
            {mood && (
              <span className="inline-flex items-center gap-0.5">
                <MoodDot value={mood.value} className="size-4" /> {mood.label}
              </span>
            )}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Entry options" disabled={pending}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {mine ? (
              <>
                <DropdownMenuLabel>Who can see this</DropdownMenuLabel>
                {(['private', 'friends', 'public'] as const).map((v) => {
                  const Icon = VISIBILITY_ICON[v];
                  return (
                    <DropdownMenuItem
                      key={v}
                      disabled={v === visibility}
                      onSelect={() =>
                        startTransition(async () => {
                          const result = await updateJournalVisibility(entry.id, v);
                          if (result.ok) setVisibility(v);
                          else toast.error(result.error);
                        })
                      }
                    >
                      <Icon /> {VISIBILITY_LABEL[v]}
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() =>
                    startTransition(async () => {
                      const result = await deleteJournalEntry(entry.id);
                      if (result.ok) setDeleted(true);
                      else toast.error(result.error);
                    })
                  }
                >
                  <Trash2 /> Delete
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem onSelect={() => setReporting(true)}>
                <Flag /> Report
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {entry.prompt && entry.body && <p className="mt-4 text-sm italic text-muted-foreground">{entry.prompt}</p>}
      {entry.body ? (
        <p className="mt-2 whitespace-pre-line leading-relaxed">{entry.body}</p>
      ) : (
        entry.meditation && <p className="mt-3">Completed a session.</p>
      )}

      {entry.meditation && (
        <Link
          href={`/meditations/${entry.meditation.slug}`}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {entry.meditation.title} · {formatMinutes(entry.meditation.duration_seconds)}
        </Link>
      )}

      {visibility !== 'private' && (
        <footer className="mt-4 flex items-center gap-2">
          <button
            type="button"
            disabled={mine}
            aria-pressed={reacted}
            onClick={() => {
              const next = !reacted;
              setReacted(next);
              setCount((c) => c + (next ? 1 : -1));
              startTransition(async () => {
                const result = await toggleReaction(entry.id, !next);
                if (!result.ok) {
                  setReacted(!next);
                  setCount((c) => c + (next ? -1 : 1));
                }
              });
            }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default',
              reacted ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted enabled:hover:text-foreground',
            )}
            aria-label={mine ? `${count} people sent calm` : reacted ? 'Remove your calm' : 'Send calm'}
          >
            <Heart className={cn('size-3.5', reacted && 'fill-current')} aria-hidden />
            {mine ? `${count} sent calm` : reacted ? 'Calm sent' : 'Send calm'}
            {!mine && count > 0 && <span className="tabular-nums">· {count}</span>}
          </button>
        </footer>
      )}

      <Dialog open={reporting} onOpenChange={setReporting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report this reflection</DialogTitle>
            <DialogDescription>Tell us what’s wrong. Reports are private and reviewed by our team.</DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What’s the concern?" maxLength={500} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReporting(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending || reason.trim().length < 3}
              onClick={() =>
                startTransition(async () => {
                  const result = await reportEntry(entry.id, reason);
                  if (result.ok) {
                    toast.success(result.message ?? 'Reported');
                    setReporting(false);
                  } else {
                    toast.error(result.error);
                  }
                })
              }
            >
              Send report
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </article>
  );
}
