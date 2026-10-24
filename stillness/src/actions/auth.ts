'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { safeNext, siteUrl } from '@/lib/utils';

export interface AuthState {
  error?: string;
  message?: string;
}

async function origin() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  return process.env.NEXT_PUBLIC_SITE_URL ? siteUrl() : host ? `${proto}://${host}` : siteUrl();
}

const credentials = z.object({
  email: z.string().trim().email('Please enter a valid email address.'),
  password: z.string().min(8, 'Passwords need at least 8 characters.'),
});

export async function signInWithPassword(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({ email: formData.get('email'), password: formData.get('password') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return {
      error: error.message.toLowerCase().includes('confirm')
        ? 'Please confirm your email first — check your inbox for the link.'
        : 'That email and password don’t match. Try again, or use a magic link.',
    };
  }
  redirect(safeNext(formData.get('next') as string | null));
}

export async function signInWithMagicLink(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = z.string().trim().email().safeParse(formData.get('email'));
  if (!email.success) return { error: 'Please enter a valid email address.' };
  const next = safeNext(formData.get('next') as string | null);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) return { error: error.message };
  return { message: `We’ve sent a sign-in link to ${email.data}. It may take a minute to arrive.` };
}

const signUpSchema = credentials.extend({
  displayName: z.string().trim().min(1, 'What should we call you?').max(60),
});

export async function signUp(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    displayName: formData.get('displayName'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${await origin()}/auth/callback?next=/onboarding`,
    },
  });
  if (error) return { error: error.message };
  if (data.session) redirect('/onboarding');
  return { message: `Almost there. We’ve sent a confirmation link to ${parsed.data.email}.` };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}

export async function updatePassword(_: AuthState, formData: FormData): Promise<AuthState> {
  const password = z.string().min(8).safeParse(formData.get('password'));
  if (!password.success) return { error: 'Passwords need at least 8 characters.' };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) return { error: error.message };
  return { message: 'Your password has been updated.' };
}
