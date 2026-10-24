'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionResult } from '@/lib/types';
import { authed, failure, notSignedIn } from './helpers';

const entrySchema = z.object({
  meditationId: z.string().uuid().nullable(),
  playId: z.string().uuid().nullable(),
  mood: z.number().int().min(1).max(5).nullable(),
  prompt: z.string().max(300).nullable(),
  body: z.string().trim().max(4000),
  visibility: z.enum(['private', 'friends', 'public']),
});

export async function saveJournalEntry(input: z.infer<typeof entrySchema>): Promise<ActionResult> {
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Please check your entry and try again.' };
  const { meditationId, playId, mood, prompt, body, visibility } = parsed.data;
  if (!body && !meditationId) return { ok: false, error: 'Write a few words first.' };

  const ctx = await authed();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.from('journal_entries').insert({
    user_id: ctx.user.id,
    meditation_id: meditationId,
    play_id: playId,
    mood,
    prompt: body ? prompt : null,
    body,
    visibility,
  });
  if (error) return failure(error, 'We couldn’t save your reflection.');
  revalidatePath('/journal');
  revalidatePath('/community');
  return { ok: true };
}

export async function updateJournalVisibility(id: string, visibility: 'private' | 'friends' | 'public'): Promise<ActionResult> {
  const ctx = await authed();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.from('journal_entries').update({ visibility }).eq('id', id).eq('user_id', ctx.user.id);
  if (error) return failure(error);
  revalidatePath('/journal');
  revalidatePath('/community');
  return { ok: true };
}

export async function deleteJournalEntry(id: string): Promise<ActionResult> {
  const ctx = await authed();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.from('journal_entries').delete().eq('id', id).eq('user_id', ctx.user.id);
  if (error) return failure(error);
  revalidatePath('/journal');
  revalidatePath('/community');
  return { ok: true };
}

export async function toggleReaction(entryId: string, reacted: boolean): Promise<ActionResult> {
  const ctx = await authed();
  if (!ctx) return notSignedIn;
  const { error } = reacted
    ? await ctx.supabase.from('reactions').delete().eq('entry_id', entryId).eq('user_id', ctx.user.id)
    : await ctx.supabase.from('reactions').insert({ entry_id: entryId, user_id: ctx.user.id });
  if (error && error.code !== '23505') return failure(error);
  return { ok: true };
}

export async function reportEntry(entryId: string, reason: string): Promise<ActionResult> {
  const trimmed = reason.trim();
  if (trimmed.length < 3) return { ok: false, error: 'Please tell us briefly what’s wrong.' };
  const ctx = await authed();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase
    .from('content_reports')
    .insert({ entry_id: entryId, reporter_id: ctx.user.id, reason: trimmed.slice(0, 500) });
  if (error?.code === '23505') return { ok: true, message: 'You’ve already reported this. Thank you.' };
  if (error) return failure(error);
  return { ok: true, message: 'Thank you. Our team will take a look.' };
}
