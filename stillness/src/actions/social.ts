'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionResult } from '@/lib/types';
import { authed, failure, notSignedIn } from './helpers';

const uuid = z.string().uuid();

export async function toggleFavourite(meditationId: string, favourite: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(meditationId).success) return { ok: false, error: 'Unknown session.' };
  const ctx = await authed();
  if (!ctx) return notSignedIn;
  const { error } = favourite
    ? await ctx.supabase.from('favourites').insert({ user_id: ctx.user.id, meditation_id: meditationId })
    : await ctx.supabase.from('favourites').delete().eq('user_id', ctx.user.id).eq('meditation_id', meditationId);
  if (error && error.code !== '23505') return failure(error);
  revalidatePath('/library');
  return { ok: true };
}

export async function toggleFollow(profileId: string, follow: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(profileId).success) return { ok: false, error: 'Unknown person.' };
  const ctx = await authed();
  if (!ctx) return notSignedIn;
  if (profileId === ctx.user.id) return { ok: false, error: 'You can’t follow yourself.' };
  const { error } = follow
    ? await ctx.supabase.from('follows').insert({ follower_id: ctx.user.id, followee_id: profileId })
    : await ctx.supabase.from('follows').delete().eq('follower_id', ctx.user.id).eq('followee_id', profileId);
  if (error && error.code !== '23505') return failure(error);
  revalidatePath(`/profile/${profileId}`);
  revalidatePath('/community');
  return { ok: true };
}

const checkinSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mood: z.number().int().min(1).max(5).nullable(),
  intention: z.string().trim().max(200),
});

export async function saveCheckin(input: z.infer<typeof checkinSchema>): Promise<ActionResult> {
  const parsed = checkinSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Please check your check-in.' };
  const ctx = await authed();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.from('checkins').upsert(
    {
      user_id: ctx.user.id,
      day: parsed.data.day,
      mood: parsed.data.mood,
      intention: parsed.data.intention || null,
    },
    { onConflict: 'user_id,day' },
  );
  if (error) return failure(error);
  revalidatePath('/home');
  return { ok: true };
}

export async function enrollInProgram(programId: string, slug: string): Promise<ActionResult> {
  if (!uuid.safeParse(programId).success) return { ok: false, error: 'Unknown program.' };
  const ctx = await authed();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.from('program_enrollments').insert({ user_id: ctx.user.id, program_id: programId });
  if (error?.code === '42501') return { ok: false, error: 'This program is part of Premium.' };
  if (error && error.code !== '23505') return failure(error);
  revalidatePath(`/programs/${slug}`);
  revalidatePath('/home');
  return { ok: true };
}

export async function restartProgram(programId: string, slug: string): Promise<ActionResult> {
  const ctx = await authed();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase
    .from('program_enrollments')
    .update({ started_at: new Date().toISOString(), completed_at: null })
    .eq('user_id', ctx.user.id)
    .eq('program_id', programId);
  if (error) return failure(error);
  revalidatePath(`/programs/${slug}`);
  return { ok: true };
}

export async function leaveProgram(programId: string, slug: string): Promise<ActionResult> {
  const ctx = await authed();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase
    .from('program_enrollments')
    .delete()
    .eq('user_id', ctx.user.id)
    .eq('program_id', programId);
  if (error) return failure(error);
  revalidatePath(`/programs/${slug}`);
  revalidatePath('/home');
  return { ok: true };
}

export async function toggleChallenge(challengeId: string, join: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(challengeId).success) return { ok: false, error: 'Unknown challenge.' };
  const ctx = await authed();
  if (!ctx) return notSignedIn;
  const { error } = join
    ? await ctx.supabase.from('challenge_participants').insert({ challenge_id: challengeId, user_id: ctx.user.id })
    : await ctx.supabase.from('challenge_participants').delete().eq('challenge_id', challengeId).eq('user_id', ctx.user.id);
  if (error && error.code !== '23505') return failure(error, 'This challenge has ended.');
  revalidatePath('/community');
  return { ok: true };
}

export async function toggleRsvp(eventId: string, attending: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(eventId).success) return { ok: false, error: 'Unknown event.' };
  const ctx = await authed();
  if (!ctx) return notSignedIn;
  const { error } = attending
    ? await ctx.supabase.from('live_event_rsvps').insert({ event_id: eventId, user_id: ctx.user.id })
    : await ctx.supabase.from('live_event_rsvps').delete().eq('event_id', eventId).eq('user_id', ctx.user.id);
  if (error && error.code !== '23505') return failure(error);
  revalidatePath('/community');
  revalidatePath(`/live/${eventId}`);
  return { ok: true };
}
