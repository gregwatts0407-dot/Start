import type { Artwork, Difficulty, ExperienceLevel, Visibility } from './types';

export const GOALS = [
  { slug: 'stress', label: 'Less stress', description: 'Release tension and feel steadier', categories: ['stress-relief', 'breathwork'] },
  { slug: 'sleep', label: 'Better sleep', description: 'Wind down and rest more deeply', categories: ['sleep', 'body-scan'] },
  { slug: 'focus', label: 'Sharper focus', description: 'Work and think with clarity', categories: ['focus', 'morning'] },
  { slug: 'anxiety', label: 'Ease anxiety', description: 'Meet worry with calm', categories: ['anxiety', 'breathwork'] },
  { slug: 'gratitude', label: 'More gratitude', description: 'Notice what is good', categories: ['gratitude'] },
  { slug: 'compassion', label: 'Self-compassion', description: 'Be kinder to yourself and others', categories: ['loving-kindness'] },
  { slug: 'mindfulness', label: 'Be more present', description: 'Build a steady daily practice', categories: ['mindfulness', 'body-scan'] },
] as const;

export type GoalSlug = (typeof GOALS)[number]['slug'];

export const EXPERIENCE_LEVELS: { value: ExperienceLevel; label: string; description: string }[] = [
  { value: 'new', label: 'New to meditation', description: "I've never meditated, or only tried a few times" },
  { value: 'some', label: 'Some experience', description: "I've meditated on and off" },
  { value: 'regular', label: 'Regular practice', description: 'I meditate most weeks' },
];

export const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

export const DURATION_FILTERS = [
  { value: 'short', label: 'Under 5 min', min: 0, max: 299 },
  { value: '5-10', label: '5–10 min', min: 300, max: 659 },
  { value: '10-20', label: '10–20 min', min: 660, max: 1259 },
  { value: '20-45', label: '20–45 min', min: 1260, max: 2759 },
  { value: 'long', label: '45 min +', min: 2760, max: 1_000_000 },
] as const;

export const PREFERRED_LENGTHS = [3, 5, 10, 15, 20, 30];

export const VISIBILITY_OPTIONS: { value: Visibility; label: string; description: string }[] = [
  { value: 'private', label: 'Only me', description: 'Kept in your private journal' },
  { value: 'friends', label: 'Friends', description: 'People you follow who follow you back' },
  { value: 'public', label: 'Community', description: 'Anyone on Stillness' },
];

export const MOODS = [
  { value: 1, label: 'Heavy' },
  { value: 2, label: 'Unsettled' },
  { value: 3, label: 'Okay' },
  { value: 4, label: 'Calm' },
  { value: 5, label: 'Light' },
] as const;

export const PLAYBACK_RATES = [0.8, 0.9, 1, 1.1, 1.25] as const;

export const ARTWORKS: Artwork[] = ['dusk', 'night', 'sage', 'dawn', 'ocean', 'mist', 'ember'];

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const REFLECTION_PROMPTS: Record<string, string[]> = {
  sleep: ['What are you ready to let go of tonight?', 'How does your body feel as you settle?'],
  'stress-relief': ['How does your body feel right now?', 'What eased, even a little?'],
  anxiety: ['What did you notice about the anxiety?', 'What helped you feel more grounded?'],
  focus: ['What will you give your full attention to next?', 'What pulled at your attention?'],
  mindfulness: ['What did you notice that you usually miss?', 'What was it like to come back to the breath?'],
  'body-scan': ['Where did you find tension, and did it shift?', 'Which part of the body felt most alive?'],
  breathwork: ['How did your breath change?', 'What shifted for you during this session?'],
  'loving-kindness': ['Who came to mind, and how did it feel?', 'What would you like to offer yourself today?'],
  gratitude: ['What small thing are you grateful for right now?', 'Who would you like to thank?'],
  morning: ['What intention are you carrying into today?', 'How would you like today to feel?'],
};

export function reflectionPrompt(category: string, seed = 0) {
  const prompts = REFLECTION_PROMPTS[category] ?? ['What did you notice during this session?'];
  return prompts[seed % prompts.length]!;
}

export const FREE_TIER_SUMMARY = 'Free includes most of the library, the 7-Day Sleep Reset, journaling and community.';
