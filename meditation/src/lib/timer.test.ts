import { describe, expect, it } from 'vitest';
import {
  dueBells,
  formatClock,
  formatDuration,
  getBellSchedule,
  getTimerSnapshot,
  normaliseConfig,
  totalSessionMs,
  type TimerConfig,
} from './timer';

const tenMin: TimerConfig = { durationSec: 600, prepSec: 10, intervalSec: 0 };

describe('getTimerSnapshot', () => {
  it('counts down the preparation phase first', () => {
    expect(getTimerSnapshot(0, tenMin)).toEqual({
      phase: 'prep',
      remainingMs: 10_000,
      meditatedMs: 0,
      progress: 0,
    });
    expect(getTimerSnapshot(9_999, tenMin).phase).toBe('prep');
  });

  it('switches to meditating exactly when preparation ends', () => {
    const snap = getTimerSnapshot(10_000, tenMin);
    expect(snap.phase).toBe('meditate');
    expect(snap.remainingMs).toBe(600_000);
    expect(snap.progress).toBe(0);
  });

  it('reports progress through the meditation', () => {
    const snap = getTimerSnapshot(10_000 + 300_000, tenMin);
    expect(snap.progress).toBeCloseTo(0.5);
    expect(snap.remainingMs).toBe(300_000);
    expect(snap.meditatedMs).toBe(300_000);
  });

  it('completes at the end and never overshoots', () => {
    expect(getTimerSnapshot(totalSessionMs(tenMin), tenMin).phase).toBe('complete');
    const late = getTimerSnapshot(totalSessionMs(tenMin) + 99_000, tenMin);
    expect(late).toEqual({ phase: 'complete', remainingMs: 0, meditatedMs: 600_000, progress: 1 });
  });

  it('starts meditating immediately with no preparation', () => {
    expect(getTimerSnapshot(0, { ...tenMin, prepSec: 0 }).phase).toBe('meditate');
  });

  it('treats negative elapsed time as zero', () => {
    expect(getTimerSnapshot(-500, tenMin).remainingMs).toBe(10_000);
  });
});

describe('getBellSchedule', () => {
  it('rings start and end bells around the meditation', () => {
    expect(getBellSchedule(tenMin)).toEqual([
      { kind: 'start', atMs: 10_000 },
      { kind: 'end', atMs: 610_000 },
    ]);
  });

  it('adds interval bells but never on top of the end bell', () => {
    const bells = getBellSchedule({ durationSec: 600, prepSec: 0, intervalSec: 300 });
    expect(bells.map((b) => [b.kind, b.atMs])).toEqual([
      ['start', 0],
      ['interval', 300_000],
      ['end', 600_000],
    ]);
  });

  it('handles intervals that do not divide the duration evenly', () => {
    const bells = getBellSchedule({ durationSec: 420, prepSec: 5, intervalSec: 120 });
    expect(bells.filter((b) => b.kind === 'interval').map((b) => b.atMs)).toEqual([
      125_000, 245_000, 365_000,
    ]);
  });
});

describe('dueBells', () => {
  const schedule = getBellSchedule({ durationSec: 180, prepSec: 0, intervalSec: 60 });

  it('rings a bell at 0 ms on the first tick', () => {
    expect(dueBells(schedule, -1, 16).map((b) => b.kind)).toEqual(['start']);
  });

  it('rings each bell exactly once across consecutive ticks', () => {
    const rung: string[] = [];
    let prev = -1;
    for (let t = 0; t <= 181_000; t += 250) {
      rung.push(...dueBells(schedule, prev, t).map((b) => `${b.kind}@${b.atMs}`));
      prev = t;
    }
    expect(rung).toEqual(['start@0', 'interval@60000', 'interval@120000', 'end@180000']);
  });

  it('catches up on several bells after a long gap (e.g. a throttled tab)', () => {
    expect(dueBells(schedule, 10, 200_000)).toHaveLength(3);
  });

  it('rings nothing when time has not advanced', () => {
    expect(dueBells(schedule, 5_000, 5_000)).toEqual([]);
  });
});

describe('normaliseConfig', () => {
  it('clamps duration and preparation into range', () => {
    expect(normaliseConfig({ durationSec: 5, prepSec: 99, intervalSec: 0 })).toEqual({
      durationSec: 60,
      prepSec: 30,
      intervalSec: 0,
    });
  });

  it('drops an interval that is as long as the session', () => {
    expect(normaliseConfig({ durationSec: 300, prepSec: 0, intervalSec: 300 }).intervalSec).toBe(0);
  });
});

describe('formatting', () => {
  it('formats countdowns, rounding up', () => {
    expect(formatClock(600_000)).toBe('10:00');
    expect(formatClock(59_001)).toBe('1:00');
    expect(formatClock(1)).toBe('0:01');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(3_725_000)).toBe('1:02:05');
  });

  it('formats durations for people', () => {
    expect(formatDuration(45)).toBe('45 sec');
    expect(formatDuration(600)).toBe('10 min');
    expect(formatDuration(3600)).toBe('1 hr');
    expect(formatDuration(3900)).toBe('1 hr 5 min');
  });
});
