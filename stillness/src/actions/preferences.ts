'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { GOALS } from '@/lib/constants';
import type { ActionResult } from '@/lib/types';
import { authed, failure, notSignedIn } from './helpers';

const goalSlugs = GOALS.map((g) => g.slug) as [string, ...string[]];
const timeSchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);
const timezoneSchema = z.string().max(64).refine((tz) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
});

const onboardingSchema = z.object({
  goals: z.array(z.enum(goalSlugs)).max(7),
  experience: z.enum(['new', 'some', 'regular']),
  duration: z.number().int().min(1).max(120),
  reminderEnabled: z.boolean(),
  reminderTime: timeSchema,
  timezone: timezoneSchema,
});

export async function completeOnboarding(input: z.infer<typeof onboardingSchema>): Promise<ActionResult> {
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Please check your answers.' };
  const ctx = await authed();
  if (!ctx) return notSignedIn;
  const d = parsed.data;
  const { error } = await ctx.supabase
    .from('user_preferences')
    .update({
      goals: d.goals,
      experience_level: d.experience,
      preferred_duration: d.duration,
      reminder_enabled: d.reminderEnabled,
      reminder_time: d.reminderTime,
      timezone: d.timezone,
      onboarded_at: new Date().toISOString(),
    })
    .eq('user_id', ctx.user.id);
  if (error) return failure(error);
  redirect('/home?welcome=1');
}

const preferencesSchema = z.object({
  goals: z.array(z.enum(goalSlugs)).max(7),
  experience_level: z.enum(['new', 'some', 'regular']),
  preferred_duration: z.number().int().min(1).max(120),
  preferred_ambient: z.enum(['rain', 'ocean', 'white', 'brown', 'bowls']).nullable(),
  timezone: timezoneSchema,
  reminder_enabled: z.boolean(),
  reminder_time: timeSchema,
  reminder_days: z.array(z.number().int().min(0).max(6)).max(7),
  email_reminders: z.boolean(),
  inapp_reminders: z.boolean(),
  default_visibility: z.enum(['private', 'friends', 'public']),
});

export async function updatePreferences(input: z.infer<typeof preferencesSchema>): Promise<ActionResult> {
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Please check your settings.' };
  const ctx = await authed();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.from('user_preferences').update(parsed.data).eq('user_id', ctx.user.id);
  if (error) return failure(error);
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Preferences saved' };
}

const profileSchema = z.object({
  display_name: z.string().trim().min(1).max(60),
  bio: z.string().trim().max(1200).nullable(),
  credentials: z.string().trim().max(300).nullable(),
  avatar_url: z.string().url().nullable(),
});

export async function updateProfile(input: z.infer<typeof profileSchema>): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Please check your profile details.' };
  const ctx = await authed();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase
    .from('profiles')
    .update({ ...parsed.data, bio: parsed.data.bio || null, credentials: parsed.data.credentials || null })
    .eq('id', ctx.user.id);
  if (error) return failure(error);
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Profile saved' };
}
