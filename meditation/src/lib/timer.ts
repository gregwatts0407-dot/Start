/**
 * Pure meditation-timer logic. Everything is expressed in terms of elapsed
 * milliseconds since the session started (preparation included), so the UI
 * can derive state from a single clock value and pausing is just "stop
 * advancing the clock".
 */

export interface TimerConfig {
  /** Length of the meditation itself, in seconds. */
  durationSec: number;
  /** Preparation countdown before the start bell, in seconds (0–30). */
  prepSec: number;
  /** Seconds between interval bells; 0 disables them. */
  intervalSec: number;
}

export type TimerPhase = 'prep' | 'meditate' | 'complete';

export interface TimerSnapshot {
  phase: TimerPhase;
  /** Milliseconds left in the current phase (0 once complete). */
  remainingMs: number;
  /** Milliseconds of actual meditation completed so far. */
  meditatedMs: number;
  /** Meditation progress from 0 to 1 (0 throughout preparation). */
  progress: number;
}

export type BellKind = 'start' | 'interval' | 'end';

export interface BellEvent {
  kind: BellKind;
  /** Elapsed session time at which the bell rings. */
  atMs: number;
}

export const MAX_PREP_SEC = 30;
export const MIN_DURATION_MIN = 1;
export const MAX_DURATION_MIN = 180;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Clamps a config into sane bounds so bad input can never stall a session. */
export function normaliseConfig(config: TimerConfig): TimerConfig {
  const durationSec = clamp(
    Math.round(config.durationSec),
    MIN_DURATION_MIN * 60,
    MAX_DURATION_MIN * 60,
  );
  const prepSec = clamp(Math.round(config.prepSec), 0, MAX_PREP_SEC);
  const intervalSec =
    config.intervalSec > 0 && config.intervalSec < durationSec
      ? Math.round(config.intervalSec)
      : 0;
  return { durationSec, prepSec, intervalSec };
}

export function totalSessionMs(config: TimerConfig): number {
  return (config.prepSec + config.durationSec) * 1000;
}

export function getTimerSnapshot(elapsedMs: number, config: TimerConfig): TimerSnapshot {
  const prepMs = config.prepSec * 1000;
  const durationMs = config.durationSec * 1000;
  const elapsed = Math.max(0, elapsedMs);

  if (elapsed < prepMs) {
    return { phase: 'prep', remainingMs: prepMs - elapsed, meditatedMs: 0, progress: 0 };
  }

  const meditatedMs = Math.min(elapsed - prepMs, durationMs);
  if (meditatedMs >= durationMs) {
    return { phase: 'complete', remainingMs: 0, meditatedMs: durationMs, progress: 1 };
  }

  return {
    phase: 'meditate',
    remainingMs: durationMs - meditatedMs,
    meditatedMs,
    progress: durationMs === 0 ? 1 : meditatedMs / durationMs,
  };
}

/**
 * Every bell the session will ring, in order. Interval bells never coincide
 * with the end bell: a 10-minute sit with 5-minute intervals rings
 * start, interval (5:00), end.
 */
export function getBellSchedule(config: TimerConfig): BellEvent[] {
  const prepMs = config.prepSec * 1000;
  const durationMs = config.durationSec * 1000;
  const bells: BellEvent[] = [{ kind: 'start', atMs: prepMs }];

  if (config.intervalSec > 0) {
    const stepMs = config.intervalSec * 1000;
    for (let t = stepMs; t < durationMs; t += stepMs) {
      bells.push({ kind: 'interval', atMs: prepMs + t });
    }
  }

  bells.push({ kind: 'end', atMs: prepMs + durationMs });
  return bells;
}

/**
 * Bells whose time falls in (prevMs, nowMs]. Pass prevMs = -1 on the first
 * tick so a bell at 0 ms (no preparation) still rings.
 */
export function dueBells(schedule: BellEvent[], prevMs: number, nowMs: number): BellEvent[] {
  if (nowMs <= prevMs) return [];
  return schedule.filter((bell) => bell.atMs > prevMs && bell.atMs <= nowMs);
}

/** Formats a countdown as m:ss (or h:mm:ss), rounding up so 0:00 means done. */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`;
  return `${minutes}:${ss}`;
}

/** Human-friendly duration for history and screen readers, e.g. "1 hr 5 min". */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}
