import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { DURATION_FILTERS } from '@/lib/constants';
import type {
  Category,
  Enrollment,
  Meditation,
  MeditationMedia,
  MeditationWithInstructor,
  Play,
  Program,
  ProgramItemWithMeditation,
} from '@/lib/types';

export const MEDITATION_SELECT = '*, instructor:profiles!meditations_instructor_id_fkey(id, display_name, avatar_url, role)';

export const getCategories = cache(async (): Promise<Category[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from('categories').select('*').order('sort_order');
  return (data ?? []) as Category[];
});

export interface LibraryFilters {
  q?: string;
  category?: string;
  duration?: string;
  difficulty?: string;
  voice?: string;
  instructor?: string;
  sort?: 'newest' | 'shortest' | 'longest' | 'title';
}

export async function listMeditations(filters: LibraryFilters = {}, limit = 60) {
  const supabase = await createClient();
  let query = supabase.from('meditations').select(MEDITATION_SELECT).eq('published', true);

  // Characters that would break PostgREST's filter syntax are dropped.
  const q = filters.q
    ?.replace(/[%,(){}"\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  if (q) {
    const term = `%${q}%`;
    query = query.or(`title.ilike.${term},description.ilike.${term},tags.cs.{${q.toLowerCase()}}`);
  }
  if (filters.category) query = query.eq('category', filters.category);
  if (filters.difficulty) query = query.eq('difficulty', filters.difficulty);
  if (filters.voice) query = query.eq('voice', filters.voice);
  if (filters.instructor) query = query.eq('instructor_id', filters.instructor);
  const range = DURATION_FILTERS.find((d) => d.value === filters.duration);
  if (range) query = query.gte('duration_seconds', range.min).lte('duration_seconds', range.max);

  switch (filters.sort) {
    case 'shortest':
      query = query.order('duration_seconds', { ascending: true });
      break;
    case 'longest':
      query = query.order('duration_seconds', { ascending: false });
      break;
    case 'title':
      query = query.order('title');
      break;
    default:
      query = query.order('published_at', { ascending: false });
  }

  const { data, error } = await query.limit(limit);
  if (error) console.error('listMeditations', error.message);
  return (data ?? []) as MeditationWithInstructor[];
}

export async function listVoices() {
  const supabase = await createClient();
  const { data } = await supabase.from('meditations').select('voice').eq('published', true).not('voice', 'is', null);
  return Array.from(new Set((data ?? []).map((row) => row.voice as string))).sort();
}

export async function getMeditationBySlug(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase.from('meditations').select(MEDITATION_SELECT).eq('slug', slug).maybeSingle();
  return data as MeditationWithInstructor | null;
}

export async function getMeditationsByIds(ids: string[]) {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase.from('meditations').select(MEDITATION_SELECT).in('id', ids);
  return (data ?? []) as MeditationWithInstructor[];
}

/** Media is only returned when RLS lets the viewer play the session. */
export async function getPlayableMedia(meditationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('meditation_media')
    .select('*')
    .eq('meditation_id', meditationId)
    .maybeSingle<MeditationMedia>();
  if (!data) return null;

  let src: string | null = data.audio_url;
  if (data.audio_path) {
    const { data: signed } = await supabase.storage.from('audio').createSignedUrl(data.audio_path, 60 * 60 * 6);
    src = signed?.signedUrl ?? null;
  }
  return { src, script: data.script };
}

export async function getRelatedMeditations(meditation: Meditation, limit = 4) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('meditations')
    .select(MEDITATION_SELECT)
    .eq('published', true)
    .neq('id', meditation.id)
    .or(`category.eq.${meditation.category},instructor_id.eq.${meditation.instructor_id}`)
    .limit(12);
  const rows = (data ?? []) as MeditationWithInstructor[];
  // Same category first, then closest in length.
  return rows
    .sort((a, b) => {
      const cat = Number(b.category === meditation.category) - Number(a.category === meditation.category);
      if (cat !== 0) return cat;
      return Math.abs(a.duration_seconds - meditation.duration_seconds) - Math.abs(b.duration_seconds - meditation.duration_seconds);
    })
    .slice(0, limit);
}

export async function getFavouriteIds(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from('favourites').select('meditation_id').eq('user_id', userId);
  return new Set((data ?? []).map((row) => row.meditation_id as string));
}

export async function getFavourites(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('favourites')
    .select(`created_at, meditation:meditations(${MEDITATION_SELECT})`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return ((data ?? []) as unknown as { meditation: MeditationWithInstructor | null }[])
    .map((row) => row.meditation)
    .filter((m): m is MeditationWithInstructor => Boolean(m?.published));
}

export async function getPlays(userId: string, sinceDays = 400) {
  const supabase = await createClient();
  const since = new Date(Date.now() - sinceDays * 86400_000).toISOString();
  const { data } = await supabase
    .from('plays')
    .select('*')
    .eq('user_id', userId)
    .gte('started_at', since)
    .order('started_at', { ascending: false })
    .limit(2000);
  return (data ?? []) as Play[];
}

/** Most recent play per meditation, newest first. */
export function latestPlayPerMeditation(plays: Play[]) {
  const seen = new Map<string, Play>();
  for (const play of plays) if (!seen.has(play.meditation_id)) seen.set(play.meditation_id, play);
  return Array.from(seen.values());
}

export async function getPopularity() {
  const supabase = await createClient();
  const { data } = await supabase.rpc('popular_meditations', { p_days: 30 });
  return new Map(((data ?? []) as { meditation_id: string; plays: number }[]).map((r) => [r.meditation_id, Number(r.plays)]));
}

export async function listPrograms() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('programs')
    .select('*, instructor:profiles!programs_instructor_id_fkey(id, display_name, avatar_url, role), items:program_items(count)')
    .eq('published', true)
    .order('created_at');
  return (data ?? []) as (Program & {
    instructor: MeditationWithInstructor['instructor'];
    items: { count: number }[];
  })[];
}

export async function getProgramBySlug(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('programs')
    .select('*, instructor:profiles!programs_instructor_id_fkey(id, display_name, avatar_url, role, bio)')
    .eq('slug', slug)
    .maybeSingle();
  if (!data) return null;
  const { data: items } = await supabase
    .from('program_items')
    .select('*, meditation:meditations(*)')
    .eq('program_id', data.id)
    .order('day_number');
  return {
    program: data as Program & { instructor: (MeditationWithInstructor['instructor'] & { bio: string | null }) | null },
    items: ((items ?? []) as ProgramItemWithMeditation[]).filter((item) => item.meditation),
  };
}

export async function getEnrollments(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('program_enrollments')
    .select('*, program:programs(*)')
    .eq('user_id', userId)
    .order('started_at', { ascending: false });
  return ((data ?? []) as (Enrollment & { program: Program | null })[]).filter((row) => row.program);
}

export async function getProgramItems(programIds: string[]) {
  if (programIds.length === 0) return new Map<string, ProgramItemWithMeditation[]>();
  const supabase = await createClient();
  const { data } = await supabase
    .from('program_items')
    .select('*, meditation:meditations(*)')
    .in('program_id', programIds)
    .order('day_number');
  const map = new Map<string, ProgramItemWithMeditation[]>();
  for (const item of (data ?? []) as ProgramItemWithMeditation[]) {
    if (!item.meditation) continue;
    map.set(item.program_id, [...(map.get(item.program_id) ?? []), item]);
  }
  return map;
}
