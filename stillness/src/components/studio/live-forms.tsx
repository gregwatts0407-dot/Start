'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createChallenge, createLiveEvent } from '@/actions/studio';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ARTWORKS } from '@/lib/constants';
import type { Artwork, Meditation, Program } from '@/lib/types';

type Option = Pick<Meditation, 'id' | 'title' | 'duration_seconds' | 'published'>;

export function LiveEventForm({ meditations }: { meditations: Option[] }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const formRef = React.useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const local = String(data.get('starts_at') ?? '');
        startTransition(async () => {
          const result = await createLiveEvent({
            title: String(data.get('title') ?? ''),
            description: String(data.get('description') ?? ''),
            // datetime-local has no zone; the browser's Date applies the host's.
            starts_at: local ? new Date(local).toISOString() : '',
            duration_minutes: Number(data.get('duration_minutes') ?? 30),
            join_url: String(data.get('join_url') ?? '').trim() || null,
            meditation_id: String(data.get('meditation_id') ?? '') || null,
            artwork: String(data.get('artwork') ?? 'dusk') as Artwork,
          });
          if (result.ok) {
            toast.success(result.message ?? 'Scheduled');
            formRef.current?.reset();
            router.refresh();
          } else {
            toast.error(result.error);
          }
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="le-title">Title</Label>
        <Input id="le-title" name="title" required maxLength={120} placeholder="e.g. Sunday Evening Sit" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="le-description">Description</Label>
        <Textarea id="le-description" name="description" rows={3} maxLength={2000} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="le-start">Starts</Label>
          <Input id="le-start" name="starts_at" type="datetime-local" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="le-duration">Length (minutes)</Label>
          <Input id="le-duration" name="duration_minutes" type="number" min={5} max={240} defaultValue={30} required />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="le-meditation">Play a session together (optional)</Label>
        <Select id="le-meditation" name="meditation_id" defaultValue="">
          <option value="">None — I’ll guide live</option>
          {meditations
            .filter((m) => m.published)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="le-url">Video link (optional)</Label>
        <Input id="le-url" name="join_url" type="url" placeholder="https://meet.example.com/…" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="le-artwork">Artwork</Label>
        <Select id="le-artwork" name="artwork" defaultValue="dusk">
          {ARTWORKS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? 'Scheduling…' : 'Schedule live session'}
      </Button>
    </form>
  );
}

export function ChallengeForm({ programs }: { programs: Pick<Program, 'id' | 'title'>[] }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [today, setToday] = React.useState('');
  React.useEffect(() => setToday(new Date().toISOString().slice(0, 10)), []);

  return (
    <form
      ref={formRef}
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(async () => {
          const result = await createChallenge({
            title: String(data.get('title') ?? ''),
            description: String(data.get('description') ?? ''),
            goal_type: data.get('goal_type') === 'minutes' ? 'minutes' : 'sessions',
            goal_value: Number(data.get('goal_value') ?? 0),
            starts_on: String(data.get('starts_on') ?? ''),
            ends_on: String(data.get('ends_on') ?? ''),
            program_id: String(data.get('program_id') ?? '') || null,
          });
          if (result.ok) {
            toast.success(result.message ?? 'Created');
            formRef.current?.reset();
            router.refresh();
          } else {
            toast.error(result.error);
          }
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="ch-title">Title</Label>
        <Input id="ch-title" name="title" required maxLength={120} placeholder="e.g. Ten Mindful Days" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ch-description">Description</Label>
        <Textarea id="ch-description" name="description" rows={3} maxLength={2000} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ch-goal-type">Goal</Label>
          <Select id="ch-goal-type" name="goal_type" defaultValue="sessions">
            <option value="sessions">Sessions completed</option>
            <option value="minutes">Minutes practised</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ch-goal">Target</Label>
          <Input id="ch-goal" name="goal_value" type="number" min={1} max={10000} defaultValue={10} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ch-start">Starts</Label>
          <Input id="ch-start" name="starts_on" type="date" required defaultValue={today} key={today} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ch-end">Ends</Label>
          <Input id="ch-end" name="ends_on" type="date" required />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="ch-program">Only count a program (optional)</Label>
        <Select id="ch-program" name="program_id" defaultValue="">
          <option value="">Any session</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? 'Creating…' : 'Create challenge'}
      </Button>
    </form>
  );
}
