'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { saveProgram, type ProgramInput } from '@/actions/studio';
import { Artwork } from '@/components/brand/artwork';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ARTWORKS } from '@/lib/constants';
import type { Artwork as ArtworkName, Category, Meditation, Program, ProgramItem } from '@/lib/types';
import { cn, formatMinutes } from '@/lib/utils';

interface Day {
  key: string;
  meditation_id: string;
  title: string;
  note: string;
}

interface ProgramFormProps {
  categories: Category[];
  meditations: Pick<Meditation, 'id' | 'title' | 'duration_seconds' | 'published'>[];
  program?: Program | null;
  items?: ProgramItem[];
}

export function ProgramForm({ categories, meditations, program, items = [] }: ProgramFormProps) {
  const router = useRouter();
  const [title, setTitle] = React.useState(program?.title ?? '');
  const [subtitle, setSubtitle] = React.useState(program?.subtitle ?? '');
  const [description, setDescription] = React.useState(program?.description ?? '');
  const [category, setCategory] = React.useState(program?.category ?? categories[0]?.slug ?? '');
  const [artwork, setArtwork] = React.useState<ArtworkName>(program?.artwork ?? 'night');
  const [unlockMode, setUnlockMode] = React.useState<ProgramInput['unlock_mode']>(program?.unlock_mode ?? 'sequential');
  const [isPremium, setIsPremium] = React.useState(program?.is_premium ?? false);
  const [published, setPublished] = React.useState(program?.published ?? false);
  const [days, setDays] = React.useState<Day[]>(
    items.map((item) => ({ key: item.id, meditation_id: item.meditation_id, title: item.title ?? '', note: item.note ?? '' })),
  );
  const [pending, startTransition] = React.useTransition();
  const byId = new Map(meditations.map((m) => [m.id, m]));

  const addDay = () =>
    setDays((d) => [...d, { key: crypto.randomUUID(), meditation_id: meditations[0]?.id ?? '', title: '', note: '' }]);
  const updateDay = (index: number, patch: Partial<Day>) => setDays((d) => d.map((day, i) => (i === index ? { ...day, ...patch } : day)));
  const move = (index: number, delta: number) =>
    setDays((d) => {
      const next = [...d];
      const [day] = next.splice(index, 1);
      next.splice(index + delta, 0, day!);
      return next;
    });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveProgram({
        id: program?.id ?? null,
        title,
        subtitle: subtitle || null,
        description,
        category,
        artwork,
        unlock_mode: unlockMode,
        is_premium: isPremium,
        published,
        items: days.map((d) => ({ meditation_id: d.meditation_id, title: d.title || null, note: d.note || null })),
      });
      if (result.ok) {
        toast.success('Program saved');
        router.push('/studio/programs');
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="p-title">Title</Label>
              <Input id="p-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} placeholder="e.g. 7-Day Sleep Reset" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-subtitle">Subtitle</Label>
              <Input id="p-subtitle" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={160} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-description">Description</Label>
              <Textarea id="p-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={5} maxLength={4000} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-category">Category</Label>
              <Select id="p-category" value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Days</CardTitle>
            <CardDescription>One session per day. Drag order with the arrows.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {meditations.length === 0 && <p className="text-sm text-muted-foreground">Create a session first, then add it here.</p>}
            <ol className="space-y-3">
              {days.map((day, index) => {
                const m = byId.get(day.meditation_id);
                return (
                  <li key={day.key} className="space-y-3 rounded-2xl border p-4">
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold">{index + 1}</span>
                      <div className="flex-1">
                        <Select
                          aria-label={`Session for day ${index + 1}`}
                          value={day.meditation_id}
                          onChange={(e) => updateDay(index, { meditation_id: e.target.value })}
                        >
                          {meditations.map((med) => (
                            <option key={med.id} value={med.id}>
                              {med.title} · {formatMinutes(med.duration_seconds)}
                              {med.published ? '' : ' (draft)'}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <Button type="button" variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move day ${index + 1} up`}>
                        <ArrowUp />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={index === days.length - 1}
                        onClick={() => move(index, 1)}
                        aria-label={`Move day ${index + 1} down`}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDays((d) => d.filter((_, i) => i !== index))}
                        aria-label={`Remove day ${index + 1}`}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input
                        aria-label={`Day ${index + 1} title`}
                        value={day.title}
                        onChange={(e) => updateDay(index, { title: e.target.value })}
                        placeholder={m?.title ?? 'Day title'}
                        maxLength={120}
                      />
                      <Input
                        aria-label={`Day ${index + 1} note`}
                        value={day.note}
                        onChange={(e) => updateDay(index, { note: e.target.value })}
                        placeholder="A short note for this day"
                        maxLength={600}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
            <Button type="button" variant="outline" onClick={addDay} disabled={meditations.length === 0}>
              <Plus aria-hidden /> Add day
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Look</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Artwork palette={artwork} seed={title || 'program'} className="h-36 rounded-2xl" />
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Artwork palette">
              {ARTWORKS.map((a) => (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={artwork === a}
                  aria-label={a}
                  onClick={() => setArtwork(a)}
                  className={cn('rounded-full ring-offset-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', artwork === a && 'ring-2 ring-sage')}
                >
                  <Artwork palette={a} seed={a} className="size-9 rounded-full" />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="unlock">Unlocking</Label>
              <Select id="unlock" value={unlockMode} onChange={(e) => setUnlockMode(e.target.value as ProgramInput['unlock_mode'])}>
                <option value="sequential">One day at a time</option>
                <option value="free">All days open</option>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="p-premium">Premium</Label>
              <Switch id="p-premium" checked={isPremium} onCheckedChange={setIsPremium} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="p-published">Published</Label>
              <Switch id="p-published" checked={published} onCheckedChange={setPublished} />
            </div>
            <Button type="submit" className="w-full" disabled={pending || days.length === 0}>
              {pending ? 'Saving…' : 'Save program'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
