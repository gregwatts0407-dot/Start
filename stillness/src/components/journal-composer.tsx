'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { saveJournalEntry } from '@/actions/journal';
import { MoodDot } from '@/components/player/reflection-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { MOODS, VISIBILITY_OPTIONS } from '@/lib/constants';
import type { Visibility } from '@/lib/types';
import { cn } from '@/lib/utils';

const PROMPTS = [
  'What is on your mind right now?',
  'What are you grateful for today?',
  'What would make tomorrow feel lighter?',
  'What did you notice about yourself today?',
];

export function JournalComposer({ defaultVisibility }: { defaultVisibility: Visibility }) {
  const router = useRouter();
  const [body, setBody] = React.useState('');
  const [mood, setMood] = React.useState<number | null>(null);
  const [visibility, setVisibility] = React.useState<Visibility>(defaultVisibility);
  const [prompt] = React.useState(() => PROMPTS[new Date().getDay() % PROMPTS.length]!);
  const [pending, startTransition] = React.useTransition();

  return (
    <Card className="p-5">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const result = await saveJournalEntry({ meditationId: null, playId: null, mood, prompt, body, visibility });
            if (result.ok) {
              setBody('');
              setMood(null);
              toast.success('Saved');
              router.refresh();
            } else {
              toast.error(result.error);
            }
          });
        }}
      >
        <label htmlFor="journal-body" className="font-display text-lg font-medium">
          {prompt}
        </label>
        <Textarea id="journal-body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write freely…" maxLength={4000} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex gap-1" role="group" aria-label="Mood">
            {MOODS.map((m) => (
              <button
                key={m.value}
                type="button"
                title={m.label}
                aria-label={m.label}
                aria-pressed={mood === m.value}
                onClick={() => setMood(mood === m.value ? null : m.value)}
                className={cn(
                  'flex size-9 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  mood === m.value ? 'bg-secondary ring-1 ring-sage' : 'hover:bg-muted',
                )}
              >
                <MoodDot value={m.value} />
              </button>
            ))}
          </div>
          <div className="flex flex-1 gap-2 sm:justify-end">
            <div className="flex-1 sm:max-w-44">
              <Select aria-label="Who can see this" value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
                {VISIBILITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" className="h-11" disabled={pending || !body.trim()}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}
