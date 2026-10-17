import type { SessionRecord } from './types';

/** Local calendar day as YYYY-MM-DD (not UTC, so late-night sits count for today). */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Shifts by whole calendar days; using the Date constructor keeps DST changes harmless. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export interface StreakResult {
  current: number;
  longest: number;
}

/**
 * The current streak counts consecutive days with at least one session,
 * ending today — or yesterday, so the streak isn't shown as broken before
 * you've had a chance to sit today.
 */
export function calculateStreak(sessions: SessionRecord[], today: Date = new Date()): StreakResult {
  const days = new Set(sessions.map((s) => dayKey(new Date(s.startedAt))));
  if (days.size === 0) return { current: 0, longest: 0 };

  let cursor = days.has(dayKey(today)) ? today : addDays(today, -1);
  let current = 0;
  while (days.has(dayKey(cursor))) {
    current++;
    cursor = addDays(cursor, -1);
  }

  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const key of sorted) {
    if (prev !== null && dayKey(addDays(parseDayKey(prev), 1)) === key) {
      run++;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
    prev = key;
  }

  return { current, longest: Math.max(longest, current) };
}

export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function totalMinutes(sessions: SessionRecord[]): number {
  return Math.round(sessions.reduce((sum, s) => sum + s.durationSec, 0) / 60);
}

export interface DayTotal {
  key: string;
  /** Short weekday, e.g. "Mon". */
  label: string;
  minutes: number;
  isToday: boolean;
}

/** Minutes practised on each of the last seven days, oldest first, ending today. */
export function lastSevenDays(sessions: SessionRecord[], today: Date = new Date()): DayTotal[] {
  const totals = new Map<string, number>();
  for (const s of sessions) {
    const key = dayKey(new Date(s.startedAt));
    totals.set(key, (totals.get(key) ?? 0) + s.durationSec);
  }

  const todayKey = dayKey(today);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    const key = dayKey(date);
    return {
      key,
      label: date.toLocaleDateString('en-AU', { weekday: 'short' }),
      minutes: Math.round((totals.get(key) ?? 0) / 60),
      isToday: key === todayKey,
    };
  });
}
