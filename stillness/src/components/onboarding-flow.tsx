'use client';

import * as React from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { toast } from 'sonner';
import { completeOnboarding } from '@/actions/preferences';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { EXPERIENCE_LEVELS, GOALS, PREFERRED_LENGTHS } from '@/lib/constants';
import type { ExperienceLevel } from '@/lib/types';
import { cn } from '@/lib/utils';

const STEPS = ['welcome', 'goals', 'experience', 'length', 'reminder'] as const;

export function OnboardingFlow({ name }: { name: string }) {
  const [step, setStep] = React.useState(0);
  const [goals, setGoals] = React.useState<string[]>([]);
  const [experience, setExperience] = React.useState<ExperienceLevel>('new');
  const [duration, setDuration] = React.useState(10);
  const [reminderEnabled, setReminderEnabled] = React.useState(true);
  const [reminderTime, setReminderTime] = React.useState('08:00');
  const [pending, startTransition] = React.useTransition();
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  // Move focus to each new step's heading for screen-reader and keyboard users.
  React.useEffect(() => {
    if (step > 0) headingRef.current?.focus();
  }, [step]);

  const current = STEPS[step]!;
  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const finish = () =>
    startTransition(async () => {
      const result = await completeOnboarding({
        goals,
        experience,
        duration,
        reminderEnabled,
        reminderTime,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      });
      if (result && !result.ok) toast.error(result.error);
    });

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        {step > 0 ? (
          <Button variant="ghost" size="icon" onClick={back} aria-label="Previous step">
            <ArrowLeft />
          </Button>
        ) : (
          <span className="size-10" aria-hidden />
        )}
        <div className="flex flex-1 gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label="Setup progress">
          {STEPS.map((s, i) => (
            <span key={s} className={cn('h-1 flex-1 rounded-full transition-colors duration-500', i <= step ? 'bg-sage' : 'bg-muted')} />
          ))}
        </div>
      </div>

      <div key={current} className="animate-fade-up space-y-6">
        {current === 'welcome' && (
          <>
            <div className="relative mx-auto size-32" aria-hidden>
              <span className="absolute inset-0 animate-breathe rounded-full bg-secondary" />
              <span className="absolute inset-[22%] animate-breathe rounded-full bg-sage/50 [animation-delay:500ms]" />
              <span className="absolute inset-[42%] rounded-full bg-gold" />
            </div>
            <div className="space-y-3 text-center">
              <h1 className="text-3xl font-semibold sm:text-4xl">Welcome{name ? `, ${name}` : ''}</h1>
              <p className="text-lg text-muted-foreground">
                Let’s shape Stillness around you. Four quick questions, and you can change any answer later.
              </p>
            </div>
            <Button size="lg" className="w-full" onClick={next}>
              Let’s begin
            </Button>
          </>
        )}

        {current === 'goals' && (
          <>
            <StepHeading ref={headingRef} title="What brings you here?" description="Choose as many as you like." />
            <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Goals">
              {GOALS.map((goal) => {
                const selected = goals.includes(goal.slug);
                return (
                  <button
                    key={goal.slug}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setGoals(selected ? goals.filter((g) => g !== goal.slug) : [...goals, goal.slug])}
                    className={cn(
                      'flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selected ? 'border-sage bg-secondary' : 'bg-card hover:bg-muted',
                    )}
                  >
                    <span className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border', selected && 'border-sage bg-sage text-sage-foreground')}>
                      {selected && <Check className="size-3" aria-hidden />}
                    </span>
                    <span>
                      <span className="block font-medium">{goal.label}</span>
                      <span className="block text-sm text-muted-foreground">{goal.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <Button size="lg" className="w-full" onClick={next} disabled={goals.length === 0}>
              Continue
            </Button>
          </>
        )}

        {current === 'experience' && (
          <>
            <StepHeading ref={headingRef} title="How familiar is meditation?" description="We’ll pitch guidance at the right level." />
            <div className="space-y-2" role="radiogroup" aria-label="Experience">
              {EXPERIENCE_LEVELS.map((level) => (
                <button
                  key={level.value}
                  type="button"
                  role="radio"
                  aria-checked={experience === level.value}
                  onClick={() => setExperience(level.value)}
                  className={cn(
                    'w-full rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    experience === level.value ? 'border-sage bg-secondary' : 'bg-card hover:bg-muted',
                  )}
                >
                  <span className="block font-medium">{level.label}</span>
                  <span className="block text-sm text-muted-foreground">{level.description}</span>
                </button>
              ))}
            </div>
            <Button size="lg" className="w-full" onClick={next}>
              Continue
            </Button>
          </>
        )}

        {current === 'length' && (
          <>
            <StepHeading ref={headingRef} title="How long would you like to sit?" description="Most people start with five or ten minutes." />
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Session length">
              {PREFERRED_LENGTHS.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={duration === m}
                  onClick={() => setDuration(m)}
                  className={cn(
                    'rounded-2xl border py-5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    duration === m ? 'border-sage bg-secondary' : 'bg-card hover:bg-muted',
                  )}
                >
                  <span className="block font-display text-2xl font-semibold">{m}</span>
                  <span className="text-xs text-muted-foreground">minutes</span>
                </button>
              ))}
            </div>
            <Button size="lg" className="w-full" onClick={next}>
              Continue
            </Button>
          </>
        )}

        {current === 'reminder' && (
          <>
            <StepHeading ref={headingRef} title="Would a gentle reminder help?" description="Habits form more easily at the same time each day." />
            <div className="space-y-4 rounded-3xl border bg-card p-5">
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="ob-reminder">Remind me each day</Label>
                <Switch id="ob-reminder" checked={reminderEnabled} onCheckedChange={setReminderEnabled} />
              </div>
              {reminderEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="ob-time">At</Label>
                  <Input id="ob-time" type="time" value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} />
                </div>
              )}
            </div>
            <Button size="lg" className="w-full" onClick={finish} disabled={pending}>
              {pending ? 'Preparing your space…' : 'Enter Stillness'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

const StepHeading = React.forwardRef<HTMLHeadingElement, { title: string; description: string }>(({ title, description }, ref) => (
  <div className="space-y-2">
    <h1 ref={ref} tabIndex={-1} className="text-3xl font-semibold outline-none">
      {title}
    </h1>
    <p className="text-muted-foreground">{description}</p>
  </div>
));
StepHeading.displayName = 'StepHeading';
