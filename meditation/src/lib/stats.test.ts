import { describe, expect, it } from 'vitest';
import { addDays, calculateStreak, dayKey, lastSevenDays, totalMinutes } from './stats';
import type { SessionRecord } from './types';

let n = 0;
/** A session on a local calendar day, `daysAgo` before `today`, at the given hour. */
function session(today: Date, daysAgo: number, minutes = 10, hour = 8): SessionRecord {
  const d = addDays(today, -daysAgo);
  d.setHours(hour, 0, 0, 0);
  return {
    id: `s${n++}`,
    type: 'meditation',
    startedAt: d.toISOString(),
    durationSec: minutes * 60,
    completed: true,
  };
}

const today = new Date(2026, 9, 17, 12, 0, 0); // 17 Oct 2026, midday local

describe('calculateStreak', () => {
  it('is zero with no sessions', () => {
    expect(calculateStreak([], today)).toEqual({ current: 0, longest: 0 });
  });

  it('counts consecutive days ending today', () => {
    const sessions = [session(today, 0), session(today, 1), session(today, 2)];
    expect(calculateStreak(sessions, today).current).toBe(3);
  });

  it('keeps yesterday’s streak alive before you’ve sat today', () => {
    const sessions = [session(today, 1), session(today, 2)];
    expect(calculateStreak(sessions, today).current).toBe(2);
  });

  it('breaks after a missed day', () => {
    const sessions = [session(today, 2), session(today, 3)];
    expect(calculateStreak(sessions, today).current).toBe(0);
  });

  it('counts several sessions on one day once', () => {
    const sessions = [session(today, 0, 5, 7), session(today, 0, 5, 19), session(today, 1)];
    expect(calculateStreak(sessions, today).current).toBe(2);
  });

  it('uses local days, so a late-night sit counts for that day', () => {
    const sessions = [session(today, 0, 10, 23), session(today, 1, 10, 0)];
    expect(calculateStreak(sessions, today).current).toBe(2);
  });

  it('tracks the longest streak separately from the current one', () => {
    const sessions = [
      session(today, 0),
      ...[10, 11, 12, 13, 14].map((d) => session(today, d)),
    ];
    expect(calculateStreak(sessions, today)).toEqual({ current: 1, longest: 5 });
  });

  it('spans month boundaries', () => {
    const firstOfMonth = new Date(2026, 10, 1, 9); // 1 Nov
    const sessions = [session(firstOfMonth, 0), session(firstOfMonth, 1), session(firstOfMonth, 2)];
    expect(calculateStreak(sessions, firstOfMonth).current).toBe(3);
  });

  it('is order independent', () => {
    const sessions = [session(today, 2), session(today, 0), session(today, 1)];
    expect(calculateStreak(sessions, today).current).toBe(3);
  });
});

describe('totals', () => {
  it('sums minutes', () => {
    expect(totalMinutes([session(today, 0, 10), session(today, 3, 15)])).toBe(25);
  });

  it('builds the last seven days, oldest first, ending today', () => {
    const days = lastSevenDays([session(today, 0, 10), session(today, 0, 5), session(today, 6, 3), session(today, 7, 99)], today);
    expect(days).toHaveLength(7);
    expect(days[6]).toMatchObject({ key: dayKey(today), minutes: 15, isToday: true });
    expect(days[0]).toMatchObject({ key: dayKey(addDays(today, -6)), minutes: 3, isToday: false });
    expect(days.reduce((s, d) => s + d.minutes, 0)).toBe(18);
  });
});
