import { GOALS } from './constants';
import { localHour } from './stats';
import type { MeditationWithInstructor, Play, Preferences } from './types';

export interface Recommendation {
  meditation: MeditationWithInstructor;
  reason: string;
  score: number;
}

interface RecommendInput {
  meditations: MeditationWithInstructor[];
  prefs: Pick<Preferences, 'goals' | 'preferred_duration' | 'experience_level' | 'timezone'>;
  plays: Play[];
  popularity: Map<string, number>;
  followedIds: Set<string>;
  canAccessPremium: boolean;
  now?: Date;
}

/**
 * Score every published session for this person and return the best few with
 * a short, honest reason. Signals: stated goals, preferred length, time of
 * day, what they've finished before, who they follow, experience level and
 * recent popularity. Recently finished sessions are pushed down so the list
 * keeps moving.
 */
export function recommend(input: RecommendInput, limit = 8): Recommendation[] {
  const { meditations, prefs, plays, popularity, followedIds, canAccessPremium } = input;
  const now = input.now ?? new Date();
  const hour = localHour(now, prefs.timezone);

  const goalCategories = new Map<string, string>();
  for (const goal of GOALS) {
    if (prefs.goals.includes(goal.slug)) {
      for (const category of goal.categories) if (!goalCategories.has(category)) goalCategories.set(category, goal.label.toLowerCase());
    }
  }

  const byId = new Map(meditations.map((m) => [m.id, m]));
  const categoryAffinity = new Map<string, number>();
  const lastCompleted = new Map<string, number>();
  for (const play of plays) {
    if (!play.completed) continue;
    const m = byId.get(play.meditation_id);
    if (m) categoryAffinity.set(m.category, (categoryAffinity.get(m.category) ?? 0) + 1);
    const t = new Date(play.completed_at ?? play.started_at).getTime();
    lastCompleted.set(play.meditation_id, Math.max(lastCompleted.get(play.meditation_id) ?? 0, t));
  }

  const preferred = prefs.preferred_duration * 60;
  const maxPopularity = Math.max(1, ...popularity.values());
  const evening = hour >= 19 || hour < 4;
  const morning = hour >= 5 && hour < 11;

  const scored = meditations.map((meditation) => {
    let score = 0;
    const reasons: [number, string][] = [];

    const goal = goalCategories.get(meditation.category);
    if (goal) {
      score += 3;
      reasons.push([3, `For ${goal}`]);
    }

    const lengthFit = 1 - Math.min(1, Math.abs(meditation.duration_seconds - preferred) / Math.max(preferred, 300));
    score += lengthFit * 2;
    if (lengthFit > 0.85) reasons.push([1.2, `Fits your ${prefs.preferred_duration}-minute practice`]);

    if (evening && (meditation.category === 'sleep' || meditation.tags.includes('evening'))) {
      score += 1.5;
      reasons.push([2.5, 'A good one for this evening']);
    }
    if (morning && (meditation.category === 'morning' || meditation.category === 'focus')) {
      score += 1.2;
      reasons.push([2.4, 'To start your day']);
    }

    const affinity = categoryAffinity.get(meditation.category) ?? 0;
    if (affinity) {
      score += Math.min(1.5, affinity * 0.3);
      reasons.push([1.5, 'Like sessions you’ve finished']);
    }

    if (followedIds.has(meditation.instructor_id)) {
      score += 1;
      reasons.push([1.8, `From ${meditation.instructor?.display_name ?? 'a teacher you follow'}`]);
    }

    if (prefs.experience_level === 'new') {
      if (meditation.difficulty === 'beginner') score += 1;
      if (meditation.difficulty === 'advanced') score -= 2;
    } else if (prefs.experience_level === 'regular' && meditation.difficulty !== 'beginner') {
      score += 0.5;
    }

    const plays30 = popularity.get(meditation.id) ?? 0;
    score += (plays30 / maxPopularity) * 0.8;
    if (plays30 / maxPopularity > 0.7) reasons.push([0.8, 'Popular this month']);

    const finishedAt = lastCompleted.get(meditation.id);
    if (finishedAt) {
      const daysAgo = (now.getTime() - finishedAt) / 86400_000;
      score -= daysAgo < 3 ? 3 : daysAgo < 10 ? 1 : 0;
    } else if (!plays.some((p) => p.meditation_id === meditation.id)) {
      score += 0.6;
      if (!reasons.length) reasons.push([0.5, 'Something new to try']);
    }

    if (meditation.is_premium && !canAccessPremium) score -= 0.8;

    reasons.sort((a, b) => b[0] - a[0]);
    return { meditation, score, reason: reasons[0]?.[1] ?? 'Picked for you' };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
