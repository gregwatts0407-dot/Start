import { useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { PlayIcon } from '../components/Icons';
import { SessionShell } from '../components/SessionShell';
import {
  logIfComplete,
  MIN_LOGGABLE_SEC,
  SessionSummary,
  type FinishedSession,
} from '../components/SessionSummary';
import { Card, ChoiceChips, Stepper } from '../components/ui';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useSessionClock } from '../hooks/useSessionClock';
import { useWakeLock } from '../hooks/useWakeLock';
import {
  cycleLengthMs,
  CUSTOM_PATTERN_ID,
  describePattern,
  getBreathState,
  isNewPhase,
  isValidPattern,
  MAX_PHASE_SEC,
  phaseLabel,
  PRESET_PATTERNS,
  type BreathPattern,
  type BreathState,
} from '../lib/breathing';
import { formatClock } from '../lib/timer';
import type { BreathCue, Settings } from '../lib/types';
import { getSettings, updateSettings, useSettings } from '../state/store';

const LENGTH_OPTIONS = [
  { value: 1, label: '1 min', ariaLabel: '1 minute' },
  { value: 3, label: '3 min', ariaLabel: '3 minutes' },
  { value: 5, label: '5 min', ariaLabel: '5 minutes' },
  { value: 10, label: '10 min', ariaLabel: '10 minutes' },
  { value: 0, label: 'No limit' },
];

const CUE_OPTIONS: { value: BreathCue; label: string }[] = [
  { value: 'tone', label: 'Soft tone' },
  { value: 'tick', label: 'Tick' },
  { value: 'none', label: 'Silent' },
];

export function selectedPattern(settings: Settings): BreathPattern {
  if (settings.breathPatternId === CUSTOM_PATTERN_ID) return settings.customPattern;
  return PRESET_PATTERNS.find((p) => p.id === settings.breathPatternId) ?? PRESET_PATTERNS[0];
}

/** Sessions end at the close of a full cycle, so you're never cut off mid-breath. */
function sessionLengthMs(pattern: BreathPattern, minutes: number): number {
  if (minutes <= 0) return Infinity;
  const cycle = cycleLengthMs(pattern);
  return Math.ceil((minutes * 60_000) / cycle) * cycle;
}

export function BreatheScreen({ onActiveChange }: { onActiveChange: (active: boolean) => void }) {
  const settings = useSettings();
  const [active, setActive] = useState<{ pattern: BreathPattern; lengthMs: number } | null>(null);
  const [finished, setFinished] = useState<FinishedSession | null>(null);
  const startedAtRef = useRef('');
  const lastStateRef = useRef<BreathState | null>(null);
  const activeRef = useRef(false);
  const reducedMotion = useReducedMotion();

  const pattern = selectedPattern(settings);
  const patternOk = isValidPattern(pattern);

  const finish = (elapsedMs: number, completed: boolean) => {
    if (!activeRef.current) return;
    activeRef.current = false;
    clock.stop();
    const name = active?.pattern.name;
    setActive(null);
    onActiveChange(false);
    const session: FinishedSession = {
      type: 'breathing',
      startedAt: startedAtRef.current,
      durationSec: elapsedMs / 1000,
      completed,
      pattern: name,
    };
    if (completed) void audio.playBell(getSettings().endBell, getSettings().bellVolume * 0.8);
    if (completed || session.durationSec >= MIN_LOGGABLE_SEC) setFinished(logIfComplete(session));
  };

  const clock = useSessionClock((elapsed) => {
    if (!active || !activeRef.current) return;
    if (elapsed >= active.lengthMs) {
      finish(active.lengthMs, true);
      return;
    }
    const state = getBreathState(elapsed, active.pattern);
    if (isNewPhase(lastStateRef.current, state)) {
      const s = getSettings();
      void audio.playCue(s.breathCue, state.phase, s.bellVolume);
      if (s.haptics && 'vibrate' in navigator) {
        navigator.vibrate(state.phase === 'inhale' ? 40 : state.phase === 'exhale' ? [20, 60, 20] : 15);
      }
    }
    lastStateRef.current = state;
  });

  useWakeLock(active !== null && clock.running);

  const start = () => {
    if (!patternOk) return;
    audio.prime();
    startedAtRef.current = new Date().toISOString();
    lastStateRef.current = null;
    activeRef.current = true;
    setActive({ pattern, lengthMs: sessionLengthMs(pattern, settings.breathMinutes) });
    onActiveChange(true);
    clock.start();
  };

  if (active) {
    const state = getBreathState(Math.min(clock.elapsedMs, active.lengthMs - 1), active.pattern);
    const open = !Number.isFinite(active.lengthMs);
    return (
      <SessionShell
        title={`${active.pattern.name} breathing`}
        paused={!clock.running}
        onTogglePause={() => (clock.running ? clock.pause() : clock.resume())}
        onEnd={() => finish(clock.elapsedMs, false)}
      >
        <BreathCircle state={state} reducedMotion={reducedMotion} paused={!clock.running} />
        <p className="mt-8 text-sm text-muted tabular-nums">
          {open
            ? `${formatClock(clock.elapsedMs)} elapsed`
            : `${formatClock(active.lengthMs - clock.elapsedMs)} left`}
        </p>
      </SessionShell>
    );
  }

  return (
    <div className="space-y-5">
      <header className="pt-2">
        <h1 className="text-3xl font-semibold">Breathe</h1>
        <p className="mt-1 text-muted">Follow the circle: in as it grows, out as it softens.</p>
      </header>

      <Card>
        <ChoiceChips
          label="Pattern"
          value={settings.breathPatternId}
          options={[...PRESET_PATTERNS, settings.customPattern].map((p) => ({
            value: p.id,
            label: p.name,
          }))}
          onChange={(breathPatternId) => updateSettings({ breathPatternId })}
        />
        <p className="mt-3 text-sm text-muted" aria-live="polite">
          {pattern.id === CUSTOM_PATTERN_ID
            ? `Your rhythm: ${describePattern(pattern)} seconds.`
            : pattern.description}
        </p>
        {pattern.id === CUSTOM_PATTERN_ID && <CustomPatternEditor pattern={pattern} />}
      </Card>

      <div className="flex justify-center py-2">
        <button
          type="button"
          onClick={start}
          disabled={!patternOk}
          className="flex h-36 w-36 flex-col items-center justify-center gap-1 rounded-full bg-accent text-accent-ink shadow-lg ring-8 ring-accent-soft transition active:scale-95 disabled:opacity-50"
        >
          <PlayIcon size={34} />
          <span className="text-lg font-semibold">Begin</span>
          <span className="sr-only">{pattern.name} breathing</span>
        </button>
      </div>

      <Card className="space-y-5">
        <ChoiceChips
          label="Session length"
          value={settings.breathMinutes}
          options={LENGTH_OPTIONS}
          onChange={(breathMinutes) => updateSettings({ breathMinutes })}
        />
        <ChoiceChips
          label="Sound on each phase"
          value={settings.breathCue}
          options={CUE_OPTIONS}
          onChange={(breathCue) => {
            updateSettings({ breathCue });
            void audio.playCue(breathCue, 'inhale', settings.bellVolume);
          }}
        />
      </Card>

      <SessionSummary session={finished} onClose={() => setFinished(null)} />
    </div>
  );
}

function CustomPatternEditor({ pattern }: { pattern: BreathPattern }) {
  const set = (patch: Partial<BreathPattern>) =>
    updateSettings({ customPattern: { ...pattern, ...patch } });
  const rows: { key: keyof Pick<BreathPattern, 'inhale' | 'holdIn' | 'exhale' | 'holdOut'>; label: string; min: number }[] = [
    { key: 'inhale', label: 'Breathe in', min: 1 },
    { key: 'holdIn', label: 'Hold (full)', min: 0 },
    { key: 'exhale', label: 'Breathe out', min: 1 },
    { key: 'holdOut', label: 'Hold (empty)', min: 0 },
  ];
  return (
    <div className="mt-3 divide-y divide-line fade-in">
      {rows.map((row) => (
        <Stepper
          key={row.key}
          label={row.label}
          unit="s"
          step={0.5}
          min={row.min}
          max={MAX_PHASE_SEC}
          value={pattern[row.key]}
          onChange={(v) => set({ [row.key]: v })}
        />
      ))}
    </div>
  );
}

/** The expanding/contracting guide. With reduced motion it stays still and shows a countdown ring. */
function BreathCircle({
  state,
  reducedMotion,
  paused,
}: {
  state: BreathState;
  reducedMotion: boolean;
  paused: boolean;
}) {
  const label = phaseLabel(state.phase);
  const scale = 0.42 + 0.58 * state.fullness;
  const seconds = Math.ceil(state.phaseRemainingMs / 1000);

  const size = 300;
  const r = 140;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="relative grid aspect-square w-[min(80vw,22rem)] place-items-center">
      <div className="absolute inset-0 rounded-full ring-2 ring-accent/25" aria-hidden="true" />
      {reducedMotion ? (
        <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden="true">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - state.phaseProgress)}
          />
        </svg>
      ) : null}
      <div
        className="absolute inset-[6%] rounded-full bg-accent/20"
        style={{
          transform: `scale(${reducedMotion ? 0.8 : scale})`,
          boxShadow: '0 0 60px 10px color-mix(in srgb, var(--accent) 18%, transparent)',
          willChange: 'transform',
        }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-[18%] rounded-full bg-accent/35"
        style={{ transform: `scale(${reducedMotion ? 0.8 : scale})`, willChange: 'transform' }}
        aria-hidden="true"
      />
      <div className="relative text-center">
        <p className="text-3xl font-medium">{paused ? 'Paused' : label}</p>
        <p className="mt-1 text-xl text-muted tabular-nums" aria-hidden="true">
          {seconds}
        </p>
      </div>
      <p className="sr-only" aria-live="polite">
        {paused ? 'Paused' : label}
      </p>
    </div>
  );
}
