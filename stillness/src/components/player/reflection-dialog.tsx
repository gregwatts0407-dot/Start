'use client';

import * as React from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { saveJournalEntry } from '@/actions/journal';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { MOODS, reflectionPrompt, VISIBILITY_OPTIONS } from '@/lib/constants';
import type { Visibility } from '@/lib/types';
import { cn } from '@/lib/utils';
import type { PlayerTrack } from './player-provider';

interface ReflectionDialogProps {
  open: boolean;
  track: PlayerTrack | null;
  playId: string | null;
  defaultVisibility: Visibility;
  onClose: () => void;
}

export function ReflectionDialog({ open, track, playId, defaultVisibility, onClose }: ReflectionDialogProps) {
  const [mood, setMood] = React.useState<number | null>(null);
  const [body, setBody] = React.useState('');
  const [visibility, setVisibility] = React.useState<Visibility>(defaultVisibility);
  const [pending, startTransition] = React.useTransition();
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const prompt = React.useMemo(() => (track ? reflectionPrompt(track.category, new Date().getDate()) : ''), [track]);

  if (!track) return null;

  const save = () => {
    startTransition(async () => {
      const result = await saveJournalEntry({
        meditationId: track.meditationId,
        playId,
        mood,
        prompt,
        body,
        visibility,
      });
      if (result.ok) {
        toast.success(visibility === 'private' ? 'Saved to your journal' : 'Shared — thank you');
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="max-w-md"
        onOpenAutoFocus={(event) => {
          // Start in the writing box rather than on the first mood.
          event.preventDefault();
          textareaRef.current?.focus();
        }}
      >
        <DialogHeader>
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-gold/15 text-gold sm:mx-0">
            <Sparkles className="size-5" aria-hidden />
          </div>
          <DialogTitle>Well done for taking this time</DialogTitle>
          <DialogDescription>You finished “{track.title}”. Take a moment to notice how you feel.</DialogDescription>
        </DialogHeader>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">How are you feeling?</legend>
          <div className="grid grid-cols-5 gap-1.5">
            {MOODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMood(mood === m.value ? null : m.value)}
                aria-pressed={mood === m.value}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-2xl border px-1 py-2.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  mood === m.value ? 'border-sage bg-secondary text-secondary-foreground' : 'hover:bg-muted',
                )}
              >
                <MoodDot value={m.value} />
                {m.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          <Label htmlFor="reflection">{prompt}</Label>
          <Textarea
            id="reflection"
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="A few words, or nothing at all…"
            maxLength={4000}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="visibility">Who can see this?</Label>
          <Select id="visibility" value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
            {VISIBILITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} — {option.description}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Skip
          </Button>
          <Button onClick={save} disabled={pending || (!body.trim() && visibility === 'private' && mood === null)}>
            {pending ? 'Saving…' : visibility === 'private' ? 'Save to journal' : 'Save and share'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A small filled circle whose size and warmth grow with the mood. */
export function MoodDot({ value, className }: { value: number; className?: string }) {
  const colours = ['bg-[#7b86a3]', 'bg-[#9aa4b8]', 'bg-[#b9b9a8]', 'bg-sage', 'bg-gold'];
  return (
    <span className={cn('flex size-6 items-center justify-center', className)} aria-hidden>
      <span className={cn('aspect-square rounded-full', colours[value - 1])} style={{ width: `${40 + value * 12}%` }} />
    </span>
  );
}
