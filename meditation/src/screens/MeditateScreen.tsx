import { useMemo, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { BELL_OPTIONS } from '../audio/bells';
import { ProgressRing } from '../components/ProgressRing';
import { SessionShell } from '../components/SessionShell';
import {
  logIfComplete,
  MIN_LOGGABLE_SEC,
  SessionSummary,
  type FinishedSession,
} from '../components/SessionSummary';
import { PlayIcon } from '../components/Icons';
import { Card, ChoiceChips, Select, Slider, Stepper, Toggle } from '../components/ui';
import { useSessionClock } from '../hooks/useSessionClock';
import { useWakeLock } from '../hooks/useWakeLock';
import {
  dueBells,
  formatClock,
  formatDuration,
  getBellSchedule,
  getTimerSnapshot,
  MAX_DURATION_MIN,
  MIN_DURATION_MIN,
  normaliseConfig,
  type BellEvent,
  type TimerConfig,
} from '../lib/timer';
import type { Settings } from '../lib/types';
import { getSettings, updateSettings, useSettings } from '../state/store';

export const PRESET_MINUTES = [3, 5, 10, 15, 20, 30];
const CUSTOM = -1;

export const INTERVAL_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 1, label: 'Every minute' },
  { value: 2, label: 'Every 2 min' },
  { value: 5, label: 'Every 5 min' },
  { value: 10, label: 'Every 10 min' },
  { value: 15, label: 'Every 15 min' },
];

function vibrate(pattern: number | number[]) {
  if (getSettings().haptics && 'vibrate' in navigator) navigator.vibrate(pattern);
}

function ringBell(bell: BellEvent, settings: Settings) {
  const tone =
    bell.kind === 'start' ? settings.startBell : bell.kind === 'interval' ? settings.intervalBell : settings.endBell;
  const strikes = bell.kind === 'end' ? 3 : 1;
  const level = bell.kind === 'interval' ? settings.bellVolume * 0.7 : settings.bellVolume;
  void audio.playBell(tone, level, strikes);
  vibrate(bell.kind === 'end' ? [200, 120, 200] : 80);
}

export function MeditateScreen({ onActiveChange }: { onActiveChange: (active: boolean) => void }) {
  const settings = useSettings();
  const [customMode, setCustomMode] = useState(!PRESET_MINUTES.includes(settings.meditationMinutes));
  const [config, setConfig] = useState<TimerConfig | null>(null);
  const [finished, setFinished] = useState<FinishedSession | null>(null);
  const startedAtRef = useRef('');
  const lastTickRef = useRef(-1);
  const activeRef = useRef(false);

  const schedule = useMemo(() => (config ? getBellSchedule(config) : []), [config]);

  const finish = (meditatedMs: number, completed: boolean) => {
    if (!activeRef.current) return; // a late tick can arrive after the session ended
    activeRef.current = false;
    clock.stop();
    setConfig(null);
    onActiveChange(false);
    const session: FinishedSession = {
      type: 'meditation',
      startedAt: startedAtRef.current,
      durationSec: meditatedMs / 1000,
      completed,
    };
    if (completed || session.durationSec >= MIN_LOGGABLE_SEC) setFinished(logIfComplete(session));
  };

  const clock = useSessionClock((elapsed) => {
    if (!config || !activeRef.current) return;
    for (const bell of dueBells(schedule, lastTickRef.current, elapsed)) ringBell(bell, getSettings());
    lastTickRef.current = elapsed;
    const snap = getTimerSnapshot(elapsed, config);
    if (snap.phase === 'complete') finish(snap.meditatedMs, true);
  });

  useWakeLock(config !== null && clock.running);

  const start = () => {
    audio.prime(); // inside the tap, so iOS allows the bells
    const cfg = normaliseConfig({
      durationSec: settings.meditationMinutes * 60,
      prepSec: settings.prepSeconds,
      intervalSec: settings.intervalMinutes * 60,
    });
    startedAtRef.current = new Date().toISOString();
    lastTickRef.current = -1;
    activeRef.current = true;
    setConfig(cfg);
    onActiveChange(true);
    clock.start();
  };

  if (config) {
    const snap = getTimerSnapshot(clock.elapsedMs, config);
    const prep = snap.phase === 'prep';
    return (
      <SessionShell
        title="Meditation"
        paused={!clock.running}
        onTogglePause={() => (clock.running ? clock.pause() : clock.resume())}
        onEnd={() => finish(snap.meditatedMs, false)}
      >
        <ProgressRing progress={snap.progress} label="Meditation progress">
          <div>
            <p className="text-base text-muted">
              {!clock.running ? 'Paused' : prep ? 'Settle in' : 'Breathe naturally'}
            </p>
            <p
              className="mt-1 text-6xl font-light tracking-tight tabular-nums"
              aria-live="off"
            >
              {formatClock(snap.remainingMs)}
            </p>
            <p className="mt-2 text-sm text-muted">
              {prep ? 'Starting soon' : `of ${formatDuration(config.durationSec)}`}
            </p>
          </div>
        </ProgressRing>
        <p className="sr-only" aria-live="polite">
          {prep ? 'Preparing' : !clock.running ? 'Paused' : 'Meditation started'}
        </p>
      </SessionShell>
    );
  }

  const chipValue = customMode ? CUSTOM : settings.meditationMinutes;

  return (
    <div className="space-y-5">
      <header className="pt-2">
        <h1 className="text-3xl font-semibold">Meditate</h1>
        <p className="mt-1 text-muted">Choose a length, then press begin.</p>
      </header>

      <Card>
        <ChoiceChips
          label="Duration"
          value={chipValue}
          options={[
            ...PRESET_MINUTES.map((m) => ({ value: m, label: `${m} min`, ariaLabel: `${m} minutes` })),
            { value: CUSTOM, label: 'Custom' },
          ]}
          onChange={(v) => {
            if (v === CUSTOM) {
              setCustomMode(true);
            } else {
              setCustomMode(false);
              updateSettings({ meditationMinutes: v });
            }
          }}
        />
        {customMode && (
          <div className="mt-3 fade-in">
            <Stepper
              label="Custom length"
              unit="min"
              value={settings.meditationMinutes}
              min={MIN_DURATION_MIN}
              max={MAX_DURATION_MIN}
              onChange={(meditationMinutes) => updateSettings({ meditationMinutes })}
            />
          </div>
        )}
      </Card>

      <div className="flex justify-center py-2">
        <button
          type="button"
          onClick={start}
          className="group flex h-36 w-36 flex-col items-center justify-center gap-1 rounded-full bg-accent text-accent-ink shadow-lg ring-8 ring-accent-soft transition active:scale-95"
        >
          <PlayIcon size={34} />
          <span className="text-lg font-semibold">Begin</span>
          <span className="sr-only">{formatDuration(settings.meditationMinutes * 60)} meditation</span>
        </button>
      </div>

      <details className="group rounded-3xl bg-surface ring-1 ring-line">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-5 font-medium">
          Bells and preparation
          <span className="text-sm text-muted group-open:hidden">
            {settings.prepSeconds ? `${settings.prepSeconds} s prep` : 'No prep'} ·{' '}
            {settings.intervalMinutes ? `interval ${settings.intervalMinutes} min` : 'no interval'}
          </span>
        </summary>
        <div className="space-y-2 px-5 pb-5">
          <TimerOptions />
        </div>
      </details>

      <SessionSummary session={finished} onClose={() => setFinished(null)} />
    </div>
  );
}

/** Bell and preparation options — shared with the Settings screen. */
export function TimerOptions() {
  const settings = useSettings();
  const preview = (tone: Settings['startBell']) => void audio.playBell(tone, settings.bellVolume);
  return (
    <>
      <Slider
        label="Preparation countdown"
        min={0}
        max={30}
        step={5}
        value={settings.prepSeconds}
        format={(v) => (v === 0 ? 'Off' : `${v} s`)}
        onChange={(prepSeconds) => updateSettings({ prepSeconds })}
      />
      <Select
        label="Start bell"
        value={settings.startBell}
        options={BELL_OPTIONS}
        onChange={(startBell) => {
          updateSettings({ startBell });
          preview(startBell);
        }}
      />
      <Select
        label="Interval bells"
        value={settings.intervalMinutes}
        options={INTERVAL_OPTIONS}
        onChange={(intervalMinutes) => updateSettings({ intervalMinutes })}
      />
      {settings.intervalMinutes > 0 && (
        <Select
          label="Interval bell"
          value={settings.intervalBell}
          options={BELL_OPTIONS}
          onChange={(intervalBell) => {
            updateSettings({ intervalBell });
            preview(intervalBell);
          }}
        />
      )}
      <Select
        label="End bell"
        value={settings.endBell}
        options={BELL_OPTIONS}
        onChange={(endBell) => {
          updateSettings({ endBell });
          preview(endBell);
        }}
      />
      <Toggle
        label="Confirm before ending"
        description="Ask before stopping a session early"
        checked={settings.confirmEnd}
        onChange={(confirmEnd) => updateSettings({ confirmEnd })}
      />
    </>
  );
}
