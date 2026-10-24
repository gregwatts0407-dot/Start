import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/types';

/** Supabase client plus the signed-in user, or null when signed out. */
export async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

export const notSignedIn: ActionResult<never> = { ok: false, error: 'Please sign in again.' };

export function failure(error: { message: string } | null | undefined, fallback = 'Something went wrong. Please try again.'): ActionResult<never> {
  if (error) console.error(error.message);
  return { ok: false, error: fallback };
}
