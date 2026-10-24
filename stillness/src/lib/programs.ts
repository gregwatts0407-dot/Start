import type { Enrollment, Play, ProgramItemWithMeditation, UnlockMode } from './types';

export interface ProgramDay extends ProgramItemWithMeditation {
  completed: boolean;
  unlocked: boolean;
}

export interface ProgramProgress {
  days: ProgramDay[];
  completedCount: number;
  percent: number;
  next: ProgramDay | null;
  finished: boolean;
}

/**
 * A day is complete when its session was finished after the person enrolled.
 * In sequential programs each day opens once the one before is complete.
 */
export function programProgress(
  items: ProgramItemWithMeditation[],
  plays: Play[],
  enrollment: Enrollment | null,
  unlockMode: UnlockMode,
): ProgramProgress {
  const since = enrollment ? new Date(enrollment.started_at).getTime() : Number.POSITIVE_INFINITY;
  const finished = new Set(
    plays
      .filter((p) => p.completed && new Date(p.completed_at ?? p.started_at).getTime() >= since)
      .map((p) => p.meditation_id),
  );

  const days: ProgramDay[] = [];
  items.forEach((item, index) => {
    const completed = Boolean(enrollment) && finished.has(item.meditation_id);
    const unlocked = unlockMode === 'free' || index === 0 || Boolean(days[index - 1]?.completed);
    days.push({ ...item, completed, unlocked });
  });

  const completedCount = days.filter((d) => d.completed).length;
  return {
    days,
    completedCount,
    percent: days.length ? Math.round((completedCount / days.length) * 100) : 0,
    next: days.find((d) => !d.completed && d.unlocked) ?? null,
    finished: days.length > 0 && completedCount === days.length,
  };
}
