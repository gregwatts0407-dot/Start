'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ARTWORKS } from '@/lib/constants';
import { parseScript } from '@/lib/script';
import type { ActionResult, Role } from '@/lib/types';
import { slugify } from '@/lib/utils';
import { authed, failure } from './helpers';

async function instructor() {
  const ctx = await authed();
  if (!ctx) return null;
  const { data } = await ctx.supabase.from('profiles').select('role, is_suspended').eq('id', ctx.user.id).single();
  const role = data?.role as Role | undefined;
  if (!role || role === 'user' || data?.is_suspended) return null;
  return { ...ctx, role };
}

const notInstructor: ActionResult<never> = { ok: false, error: 'Only instructors can do that.' };

function uniqueSlug(title: string) {
  return `${slugify(title) || 'session'}-${Math.random().toString(36).slice(2, 6)}`;
}

const artwork = z.enum(ARTWORKS as [string, ...string[]]);

const meditationSchema = z.object({
  id: z.string().uuid().nullable(),
  title: z.string().trim().min(2, 'Give the session a title.').max(120),
  description: z.string().trim().max(4000),
  category: z.string().min(1),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(12),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  voice: z.string().trim().max(60).nullable(),
  artwork,
  cover_url: z.string().url().nullable(),
  is_premium: z.boolean(),
  published: z.boolean(),
  duration_seconds: z.number().int().min(30, 'Sessions need to be at least 30 seconds.').max(14400),
  source: z.enum(['upload', 'url', 'script']),
  audio_path: z.string().max(300).nullable(),
  audio_url: z.string().url().startsWith('https://', 'Audio links must use https.').nullable(),
  script_text: z.string().max(40000).nullable(),
});

export type MeditationInput = z.infer<typeof meditationSchema>;

export async function saveMeditation(input: MeditationInput): Promise<ActionResult<{ id: string; slug: string }>> {
  const parsed = meditationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  const ctx = await instructor();
  if (!ctx) return notInstructor;
  const d = parsed.data;

  const media = { audio_path: null as string | null, audio_url: null as string | null, script: null as unknown };
  if (d.source === 'upload') {
    if (!d.audio_path) return { ok: false, error: 'Upload an audio file first.' };
    if (!d.audio_path.startsWith(`${ctx.user.id}/`) && ctx.role !== 'admin') return { ok: false, error: 'Invalid upload.' };
    media.audio_path = d.audio_path;
  } else if (d.source === 'url') {
    if (!d.audio_url) return { ok: false, error: 'Add a link to the audio file.' };
    media.audio_url = d.audio_url;
  } else {
    const { cues, errors } = parseScript(d.script_text ?? '');
    if (errors.length) return { ok: false, error: `Script line ${errors[0]} needs a time like “1:30 Your text”.` };
    if (!cues.length) return { ok: false, error: 'Add at least one line of guidance.' };
    if (cues[cues.length - 1]!.at >= d.duration_seconds) return { ok: false, error: 'The last cue is after the end of the session.' };
    media.script = cues;
  }

  const row = {
    title: d.title,
    description: d.description,
    category: d.category,
    tags: Array.from(new Set(d.tags)),
    difficulty: d.difficulty,
    voice: d.voice || null,
    artwork: d.artwork,
    cover_url: d.cover_url,
    is_premium: d.is_premium,
    published: d.published,
    duration_seconds: d.duration_seconds,
  };

  let id = d.id;
  let slug: string;
  if (id) {
    const { data, error } = await ctx.supabase.from('meditations').update(row).eq('id', id).select('slug').single();
    if (error || !data) return failure(error, 'We couldn’t save this session.');
    slug = data.slug as string;
  } else {
    const { data, error } = await ctx.supabase
      .from('meditations')
      .insert({ ...row, slug: uniqueSlug(d.title), instructor_id: ctx.user.id })
      .select('id, slug')
      .single();
    if (error || !data) return failure(error, 'We couldn’t create this session.');
    id = data.id as string;
    slug = data.slug as string;
  }

  const { error: mediaError } = await ctx.supabase
    .from('meditation_media')
    .upsert({ meditation_id: id, ...media }, { onConflict: 'meditation_id' });
  if (mediaError) return failure(mediaError, 'The session was saved, but its audio wasn’t.');

  revalidatePath('/studio');
  revalidatePath('/library');
  revalidatePath(`/meditations/${slug}`);
  return { ok: true, data: { id, slug } };
}

export async function setMeditationPublished(id: string, published: boolean): Promise<ActionResult> {
  const ctx = await instructor();
  if (!ctx) return notInstructor;
  if (published) {
    const { data } = await ctx.supabase.from('meditation_media').select('meditation_id').eq('meditation_id', id).maybeSingle();
    if (!data) return { ok: false, error: 'Add audio or a guidance script before publishing.' };
  }
  const { error } = await ctx.supabase.from('meditations').update({ published }).eq('id', id);
  if (error) return failure(error);
  revalidatePath('/studio');
  revalidatePath('/admin');
  revalidatePath('/library');
  return { ok: true };
}

export async function setMeditationPremium(id: string, isPremium: boolean): Promise<ActionResult> {
  const ctx = await instructor();
  if (!ctx) return notInstructor;
  const { error } = await ctx.supabase.from('meditations').update({ is_premium: isPremium }).eq('id', id);
  if (error) return failure(error);
  revalidatePath('/studio');
  revalidatePath('/admin');
  return { ok: true };
}

export async function deleteMeditation(id: string): Promise<ActionResult> {
  const ctx = await instructor();
  if (!ctx) return notInstructor;
  const { data: media } = await ctx.supabase.from('meditation_media').select('audio_path').eq('meditation_id', id).maybeSingle();
  const { error } = await ctx.supabase.from('meditations').delete().eq('id', id);
  if (error) return failure(error, 'We couldn’t delete this session.');
  if (media?.audio_path) await ctx.supabase.storage.from('audio').remove([media.audio_path as string]);
  revalidatePath('/studio');
  revalidatePath('/admin');
  revalidatePath('/library');
  return { ok: true };
}

const programSchema = z.object({
  id: z.string().uuid().nullable(),
  title: z.string().trim().min(2, 'Give the program a title.').max(120),
  subtitle: z.string().trim().max(160).nullable(),
  description: z.string().trim().max(4000),
  category: z.string().min(1),
  artwork,
  unlock_mode: z.enum(['sequential', 'free']),
  is_premium: z.boolean(),
  published: z.boolean(),
  items: z
    .array(
      z.object({
        meditation_id: z.string().uuid(),
        title: z.string().trim().max(120).nullable(),
        note: z.string().trim().max(600).nullable(),
      }),
    )
    .min(1, 'Add at least one day.')
    .max(90),
});

export type ProgramInput = z.infer<typeof programSchema>;

export async function saveProgram(input: ProgramInput): Promise<ActionResult<{ id: string; slug: string }>> {
  const parsed = programSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  const ctx = await instructor();
  if (!ctx) return notInstructor;
  const { items, id: existingId, ...d } = parsed.data;
  const row = { ...d, subtitle: d.subtitle || null };

  let id = existingId;
  let slug: string;
  if (id) {
    const { data, error } = await ctx.supabase.from('programs').update(row).eq('id', id).select('slug').single();
    if (error || !data) return failure(error, 'We couldn’t save this program.');
    slug = data.slug as string;
  } else {
    const { data, error } = await ctx.supabase
      .from('programs')
      .insert({ ...row, slug: uniqueSlug(d.title), instructor_id: ctx.user.id })
      .select('id, slug')
      .single();
    if (error || !data) return failure(error, 'We couldn’t create this program.');
    id = data.id as string;
    slug = data.slug as string;
  }

  const { error: clearError } = await ctx.supabase.from('program_items').delete().eq('program_id', id);
  if (clearError) return failure(clearError);
  const { error: itemsError } = await ctx.supabase.from('program_items').insert(
    items.map((item, index) => ({
      program_id: id,
      meditation_id: item.meditation_id,
      day_number: index + 1,
      title: item.title || null,
      note: item.note || null,
    })),
  );
  if (itemsError) return failure(itemsError, 'The program was saved, but its days weren’t.');

  revalidatePath('/studio/programs');
  revalidatePath('/programs');
  revalidatePath(`/programs/${slug}`);
  return { ok: true, data: { id, slug } };
}

export async function setProgramPublished(id: string, published: boolean): Promise<ActionResult> {
  const ctx = await instructor();
  if (!ctx) return notInstructor;
  const { error } = await ctx.supabase.from('programs').update({ published }).eq('id', id);
  if (error) return failure(error);
  revalidatePath('/studio/programs');
  revalidatePath('/programs');
  revalidatePath('/admin');
  return { ok: true };
}

export async function deleteProgram(id: string): Promise<ActionResult> {
  const ctx = await instructor();
  if (!ctx) return notInstructor;
  const { error } = await ctx.supabase.from('programs').delete().eq('id', id);
  if (error) return failure(error);
  revalidatePath('/studio/programs');
  revalidatePath('/programs');
  return { ok: true };
}

const liveSchema = z.object({
  title: z.string().trim().min(2, 'Give the session a title.').max(120),
  description: z.string().trim().max(2000),
  starts_at: z.string().datetime({ offset: true }),
  duration_minutes: z.number().int().min(5).max(240),
  join_url: z.string().url().startsWith('https://', 'Links must use https.').nullable(),
  meditation_id: z.string().uuid().nullable(),
  artwork,
});

export async function createLiveEvent(input: z.infer<typeof liveSchema>): Promise<ActionResult> {
  const parsed = liveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  if (new Date(parsed.data.starts_at).getTime() < Date.now() - 60_000) return { ok: false, error: 'Choose a time in the future.' };
  const ctx = await instructor();
  if (!ctx) return notInstructor;
  const { error } = await ctx.supabase.from('live_events').insert({ ...parsed.data, host_id: ctx.user.id });
  if (error) return failure(error);
  revalidatePath('/studio/live');
  revalidatePath('/community');
  return { ok: true, message: 'Live session scheduled' };
}

export async function setLiveStatus(id: string, status: 'scheduled' | 'live' | 'ended' | 'cancelled'): Promise<ActionResult> {
  const ctx = await instructor();
  if (!ctx) return notInstructor;
  const update: Record<string, unknown> = { status };
  if (status === 'live') update.started_at = new Date().toISOString();
  const { error } = await ctx.supabase.from('live_events').update(update).eq('id', id);
  if (error) return failure(error);
  revalidatePath(`/live/${id}`);
  revalidatePath('/studio/live');
  revalidatePath('/community');
  return { ok: true };
}

const challengeSchema = z
  .object({
    title: z.string().trim().min(2, 'Give the challenge a title.').max(120),
    description: z.string().trim().max(2000),
    goal_type: z.enum(['sessions', 'minutes']),
    goal_value: z.number().int().min(1).max(10000),
    starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    program_id: z.string().uuid().nullable(),
  })
  .refine((c) => c.ends_on >= c.starts_on, 'The end date must be after the start date.');

export async function createChallenge(input: z.infer<typeof challengeSchema>): Promise<ActionResult> {
  const parsed = challengeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  const ctx = await instructor();
  if (!ctx) return notInstructor;
  const { data, error } = await ctx.supabase
    .from('challenges')
    .insert({ ...parsed.data, created_by: ctx.user.id })
    .select('id')
    .single();
  if (error || !data) return failure(error);
  await ctx.supabase.from('challenge_participants').insert({ challenge_id: data.id, user_id: ctx.user.id });
  revalidatePath('/studio/live');
  revalidatePath('/community');
  return { ok: true, message: 'Challenge created' };
}
