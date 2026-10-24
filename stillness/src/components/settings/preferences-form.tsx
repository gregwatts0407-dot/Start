'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { updatePreferences } from '@/actions/preferences';
import { AMBIENT_SOUNDS } from '@/components/player/ambient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { EXPERIENCE_LEVELS, GOALS, PREFERRED_LENGTHS, VISIBILITY_OPTIONS, WEEKDAYS } from '@/lib/constants';
import type { Preferences, Visibility } from '@/lib/types';
import { cn } from '@/lib/utils';

type Ambient = 'rain' | 'ocean' | 'white' | 'brown' | 'bowls';

function timezones() {
  try {
    return (Intl as unknown as { supportedValuesOf(key: string): string[] }).supportedValuesOf('timeZone');
  } catch {
    return ['UTC'];
  }
}

export function PreferencesForm({ prefs, emailEnabled }: { prefs: Preferences; emailEnabled: boolean }) {
  const [state, setState] = React.useState({
    goals: prefs.goals,
    experience_level: prefs.experience_level,
    preferred_duration: prefs.preferred_duration,
    preferred_ambient: prefs.preferred_ambient as Ambient | null,
    timezone: prefs.timezone,
    reminder_enabled: prefs.reminder_enabled,
    reminder_time: prefs.reminder_time.slice(0, 5),
    reminder_days: prefs.reminder_days,
    email_reminders: prefs.email_reminders,
    inapp_reminders: prefs.inapp_reminders,
    default_visibility: prefs.default_visibility,
  });
  const [zones, setZones] = React.useState<string[]>([prefs.timezone]);
  const [pending, startTransition] = React.useTransition();
  React.useEffect(() => setZones(timezones()), []);

  const set = <K extends keyof typeof state>(key: K, value: (typeof state)[K]) => setState((s) => ({ ...s, [key]: value }));
  const toggleIn = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  return (
    <form
      className="space-y-10"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await updatePreferences(state);
          if (result.ok) toast.success(result.message ?? 'Saved');
          else toast.error(result.error);
        });
      }}
    >
      <fieldset className="space-y-4">
        <legend className="mb-1 text-lg font-semibold">Your practice</legend>
        <div className="space-y-2">
          <p className="text-sm font-medium" id="goals-label">
            What you’re working on
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="goals-label">
            {GOALS.map((goal) => (
              <button
                key={goal.slug}
                type="button"
                aria-pressed={state.goals.includes(goal.slug)}
                onClick={() => set('goals', toggleIn(state.goals, goal.slug))}
                className={cn(
                  'rounded-full border px-4 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  state.goals.includes(goal.slug) ? 'border-sage bg-secondary text-secondary-foreground' : 'hover:bg-muted',
                )}
              >
                {goal.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="duration">Usual session length</Label>
            <Select id="duration" value={state.preferred_duration} onChange={(e) => set('preferred_duration', Number(e.target.value))}>
              {PREFERRED_LENGTHS.map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="experience">Experience</Label>
            <Select id="experience" value={state.experience_level} onChange={(e) => set('experience_level', e.target.value as Preferences['experience_level'])}>
              {EXPERIENCE_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ambient">Default ambient sound</Label>
            <Select id="ambient" value={state.preferred_ambient ?? ''} onChange={(e) => set('preferred_ambient', (e.target.value || null) as Ambient | null)}>
              <option value="">None</option>
              {AMBIENT_SOUNDS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-1 text-lg font-semibold">Gentle reminders</legend>
        <div className="flex items-center justify-between gap-4 rounded-2xl border p-4">
          <div>
            <Label htmlFor="reminder-enabled">Daily reminder</Label>
            <p className="text-sm text-muted-foreground">A soft nudge if you haven’t practised yet that day.</p>
          </div>
          <Switch id="reminder-enabled" checked={state.reminder_enabled} onCheckedChange={(v) => set('reminder_enabled', v)} />
        </div>
        <div className={cn('space-y-4', !state.reminder_enabled && 'pointer-events-none opacity-50')} aria-disabled={!state.reminder_enabled}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="reminder-time">Time</Label>
              <Input id="reminder-time" type="time" value={state.reminder_time} onChange={(e) => set('reminder_time', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Time zone</Label>
              <Select id="timezone" value={state.timezone} onChange={(e) => set('timezone', e.target.value)}>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium" id="days-label">
              On these days
            </p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="days-label">
              {WEEKDAYS.map((day, i) => (
                <button
                  key={day}
                  type="button"
                  aria-pressed={state.reminder_days.includes(i)}
                  onClick={() => set('reminder_days', toggleIn(state.reminder_days, i).sort())}
                  className={cn(
                    'size-11 rounded-full border text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    state.reminder_days.includes(i) ? 'border-sage bg-secondary text-secondary-foreground' : 'hover:bg-muted',
                  )}
                >
                  {day.slice(0, 2)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="inapp">Show in the app</Label>
            <Switch id="inapp" checked={state.inapp_reminders} onCheckedChange={(v) => set('inapp_reminders', v)} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="email-reminders">Send an email</Label>
              {!emailEnabled && <p className="text-sm text-muted-foreground">Email reminders are currently turned off for everyone.</p>}
            </div>
            <Switch id="email-reminders" checked={state.email_reminders} onCheckedChange={(v) => set('email_reminders', v)} disabled={!emailEnabled} />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-1 text-lg font-semibold">Privacy</legend>
        <div className="space-y-2">
          <Label htmlFor="visibility">Who sees your reflections by default</Label>
          <Select id="visibility" value={state.default_visibility} onChange={(e) => set('default_visibility', e.target.value as Visibility)}>
            {VISIBILITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} — {o.description}
              </option>
            ))}
          </Select>
          <p className="text-sm text-muted-foreground">You can change this for each entry, and your listening history is always private.</p>
        </div>
      </fieldset>

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save preferences'}
      </Button>
    </form>
  );
}
