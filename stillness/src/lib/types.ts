// Domain types mirroring supabase/migrations. Query results are annotated with
// these rather than generated database types so the app has no codegen step;
// run `supabase gen types typescript` if you prefer fully generated types.

export type Role = 'user' | 'instructor' | 'admin';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
export type ExperienceLevel = 'new' | 'some' | 'regular';
export type Visibility = 'private' | 'friends' | 'public';
export type UnlockMode = 'sequential' | 'free';
export type LiveStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';
export type ReportStatus = 'open' | 'resolved' | 'dismissed';
export type ChallengeGoal = 'sessions' | 'minutes';
export type Artwork = 'dusk' | 'night' | 'sage' | 'dawn' | 'ocean' | 'mist' | 'ember';

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  role: Role;
  bio: string | null;
  credentials: string | null;
  is_suspended: boolean;
  created_at: string;
}

export type ProfileCard = Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'role'>;

export interface Preferences {
  user_id: string;
  goals: string[];
  experience_level: ExperienceLevel;
  preferred_duration: number;
  preferred_ambient: string | null;
  timezone: string;
  reminder_enabled: boolean;
  reminder_time: string;
  reminder_days: number[];
  email_reminders: boolean;
  inapp_reminders: boolean;
  default_visibility: Visibility;
  onboarded_at: string | null;
}

export interface Category {
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
}

export interface Meditation {
  id: string;
  slug: string;
  title: string;
  description: string;
  instructor_id: string;
  category: string;
  tags: string[];
  duration_seconds: number;
  difficulty: Difficulty;
  voice: string | null;
  artwork: Artwork;
  cover_url: string | null;
  is_premium: boolean;
  published: boolean;
  published_at: string | null;
  created_at: string;
}

export interface MeditationWithInstructor extends Meditation {
  instructor: ProfileCard | null;
}

export interface ScriptCue {
  at: number;
  text: string;
}

export interface MeditationMedia {
  meditation_id: string;
  audio_path: string | null;
  audio_url: string | null;
  script: ScriptCue[] | null;
}

export interface Program {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string;
  instructor_id: string;
  category: string;
  artwork: Artwork;
  cover_url: string | null;
  unlock_mode: UnlockMode;
  is_premium: boolean;
  published: boolean;
  created_at: string;
}

export interface ProgramItem {
  id: string;
  program_id: string;
  meditation_id: string;
  day_number: number;
  title: string | null;
  note: string | null;
}

export interface ProgramItemWithMeditation extends ProgramItem {
  meditation: Meditation;
}

export interface Enrollment {
  user_id: string;
  program_id: string;
  started_at: string;
  completed_at: string | null;
}

export interface Play {
  id: string;
  user_id: string;
  meditation_id: string;
  program_id: string | null;
  started_at: string;
  updated_at: string;
  position_seconds: number;
  listened_seconds: number;
  percent: number;
  completed: boolean;
  completed_at: string | null;
}

export interface JournalEntry {
  id: string;
  user_id: string;
  meditation_id: string | null;
  play_id: string | null;
  mood: number | null;
  prompt: string | null;
  body: string;
  visibility: Visibility;
  hidden: boolean;
  created_at: string;
}

export interface FeedEntry extends JournalEntry {
  author: ProfileCard | null;
  meditation: Pick<Meditation, 'id' | 'slug' | 'title' | 'artwork' | 'duration_seconds'> | null;
  reaction_count: number;
  reacted: boolean;
}

export interface Checkin {
  id: string;
  user_id: string;
  day: string;
  mood: number | null;
  intention: string | null;
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
  program_id: string | null;
  goal_type: ChallengeGoal;
  goal_value: number;
  starts_on: string;
  ends_on: string;
  created_by: string;
}

export interface LeaderboardRow {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  progress: number;
}

export interface LiveEvent {
  id: string;
  host_id: string;
  title: string;
  description: string;
  starts_at: string;
  duration_minutes: number;
  join_url: string | null;
  meditation_id: string | null;
  artwork: Artwork;
  status: LiveStatus;
  started_at: string | null;
  created_at: string;
}

export interface LiveEventWithHost extends LiveEvent {
  host: ProfileCard | null;
  rsvp_count: number;
  rsvped: boolean;
}

export interface Subscription {
  user_id: string;
  source: 'stripe' | 'manual';
  stripe_customer_id: string | null;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export interface InstructorStat {
  meditation_id: string;
  plays: number;
  listeners: number;
  completions: number;
  favourites: number;
  minutes_listened: number;
}

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string | null;
}

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
