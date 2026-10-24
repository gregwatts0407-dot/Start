import type { Play } from './types';

/** A day counts toward the streak once you've spent a minute in practice. */
const MINDFUL_DAY_SECONDS = 60;

export function localDate(value: string | Date, timeZone: string) {
  const date = typeof value === 'string' ? new Date(value) : value;
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function localHour(date: Date, timeZone: string) {
  try {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(date));
  } catch {
    return date.getUTCHours();
  }
}

/** Minutes since local midnight. */
export function localMinutes(date: Date, timeZone: string) {
  try {
    const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .format(date)
      .split(':')
      .map(Number);
    return h! * 60 + m!;
  } catch {
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }
}

export function localWeekday(date: Date, timeZone: string) {
  const day = localDate(date, timeZone);
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

export function shiftDay(day: string, delta: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export interface ChartPoint {
  key: string;
  label: string;
  minutes: number;
  sessions: number;
  isToday?: boolean;
}

export interface PracticeStats {
  totalMinutes: number;
  sessionsCompleted: number;
  currentStreak: number;
  longestStreak: number;
  meditatedToday: boolean;
  minutesToday: number;
  minutesThisWeek: number;
  week: ChartPoint[];
  month: ChartPoint[];
  year: ChartPoint[];
  favouriteCategoryCounts: Map<string, number>;
}

export function computeStats(plays: Play[], timeZone: string, now = new Date(), categories?: Map<string, string>): PracticeStats {
  const daily = new Map<string, { seconds: number; sessions: number }>();
  const favouriteCategoryCounts = new Map<string, number>();
  let totalSeconds = 0;
  let sessionsCompleted = 0;

  for (const play of plays) {
    const day = localDate(play.started_at, timeZone);
    const entry = daily.get(day) ?? { seconds: 0, sessions: 0 };
    entry.seconds += play.listened_seconds;
    if (play.completed) entry.sessions += 1;
    daily.set(day, entry);
    totalSeconds += play.listened_seconds;
    if (play.completed) {
      sessionsCompleted += 1;
      const category = categories?.get(play.meditation_id);
      if (category) favouriteCategoryCounts.set(category, (favouriteCategoryCounts.get(category) ?? 0) + 1);
    }
  }

  const today = localDate(now, timeZone);
  const isMindful = (day: string) => (daily.get(day)?.seconds ?? 0) >= MINDFUL_DAY_SECONDS;
  const meditatedToday = isMindful(today);

  // The streak stays alive until the end of today, so start counting from
  // yesterday if today hasn't happened yet.
  let currentStreak = 0;
  let cursor = meditatedToday ? today : shiftDay(today, -1);
  while (isMindful(cursor)) {
    currentStreak += 1;
    cursor = shiftDay(cursor, -1);
  }

  let longestStreak = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of Array.from(daily.keys()).filter(isMindful).sort()) {
    run = previous && shiftDay(previous, 1) === day ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    previous = day;
  }

  const point = (day: string, label: string): ChartPoint => ({
    key: day,
    label,
    minutes: Math.round((daily.get(day)?.seconds ?? 0) / 60),
    sessions: daily.get(day)?.sessions ?? 0,
    isToday: day === today,
  });

  const weekdayFmt = new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' });
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = shiftDay(today, i - 6);
    return point(day, weekdayFmt.format(new Date(`${day}T12:00:00Z`)));
  });

  const month = Array.from({ length: 30 }, (_, i) => {
    const day = shiftDay(today, i - 29);
    return point(day, String(Number(day.slice(8, 10))));
  });

  const monthFmt = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' });
  const thisMonth = today.slice(0, 7);
  const year = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(`${thisMonth}-01T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - (11 - i));
    const key = d.toISOString().slice(0, 7);
    let seconds = 0;
    let sessions = 0;
    for (const [day, value] of daily) {
      if (day.startsWith(key)) {
        seconds += value.seconds;
        sessions += value.sessions;
      }
    }
    return { key, label: monthFmt.format(d), minutes: Math.round(seconds / 60), sessions, isToday: key === thisMonth };
  });

  return {
    totalMinutes: Math.round(totalSeconds / 60),
    sessionsCompleted,
    currentStreak,
    longestStreak,
    meditatedToday,
    minutesToday: Math.round((daily.get(today)?.seconds ?? 0) / 60),
    minutesThisWeek: week.reduce((sum, p) => sum + p.minutes, 0),
    week,
    month,
    year,
    favouriteCategoryCounts,
  };
}
