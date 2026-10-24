'use client';

import * as React from 'react';
import { Check, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { saveCheckin } from '@/actions/social';
import { MoodDot } from '@/components/player/reflection-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MOODS } from '@/lib/constants';
import type { Checkin } from '@/lib/types';
import { cn } from '@/lib/utils';

export function CheckinCard({ day, existing }: { day: string; existing: Checkin | null }) {
  const [editing, setEditing] = React.useState(!existing);
  const [mood, setMood] = React.useState<number | null>(existing?.mood ?? null);
  const [intention, setIntention] = React.useState(existing?.intention ?? '');
  const [saved, setSaved] = React.useState(existing);
  const [pending, startTransition] = React.useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveCheckin({ day, mood, intention });
      if (result.ok) {
        setSaved({ id: saved?.id ?? 'new', user_id: '', day, mood, intention: intention.trim() || null });
        setEditing(false);
      } else {
        toast.error(result.error);
      }
    });
  };

  if (!editing && saved) {
    const moodLabel = MOODS.find((m) => m.value === saved.mood)?.label;
    return (
      <Card className="flex items-center gap-4 p-5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary">
          {saved.mood ? <MoodDot value={saved.mood} /> : <Check className="size-4 text-secondary-foreground" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Today’s intention</p>
          <p className="truncate font-display text-lg">{saved.intention || (moodLabel ? `Feeling ${moodLabel.toLowerCase()}` : 'Checked in')}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setEditing(true)} aria-label="Edit today’s check-in">
          <Pencil />
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-5 sm:p-6">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">How are you arriving today?</h2>
          <p className="text-sm text-muted-foreground">A quick check-in helps you notice patterns over time.</p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Mood">
          {MOODS.map((m) => (
            <button
              key={m.value}
              type="button"
              aria-pressed={mood === m.value}
              onClick={() => setMood(mood === m.value ? null : m.value)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border py-1.5 pl-1.5 pr-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                mood === m.value ? 'border-sage bg-secondary text-secondary-foreground' : 'hover:bg-muted',
              )}
            >
              <MoodDot value={m.value} />
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="intention" className="sr-only">
            Intention for today
          </label>
          <Input
            id="intention"
            value={intention}
            onChange={(e) => setIntention(e.target.value)}
            placeholder="Set an intention — e.g. “Be patient with myself”"
            maxLength={200}
          />
          <Button type="submit" disabled={pending || (!mood && !intention.trim())} className="h-11 shrink-0">
            {pending ? 'Saving…' : 'Check in'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
