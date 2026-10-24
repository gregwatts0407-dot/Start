import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import type { Preferences, Profile, Role } from '@/lib/types';

export interface Viewer {
  user: User;
  profile: Profile;
  prefs: Preferences;
  /** Subscribed (or staff). */
  isPremium: boolean;
  /** May play premium content — true for everyone when premium gating is off. */
  canAccessPremium: boolean;
}

/** The signed-in person, loaded once per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profileRes, prefsRes, premiumRes, accessRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single<Profile>(),
    supabase.from('user_preferences').select('*').eq('user_id', user.id).single<Preferences>(),
    supabase.rpc('has_premium', { p_user: user.id }),
    supabase.rpc('can_access_premium'),
  ]);

  if (!profileRes.data || !prefsRes.data) return null;

  return {
    user,
    profile: profileRes.data,
    prefs: prefsRes.data,
    isPremium: Boolean(premiumRes.data),
    canAccessPremium: Boolean(accessRes.data),
  };
});

export async function requireViewer() {
  const viewer = await getViewer();
  if (!viewer) redirect('/login');
  return viewer;
}

export async function requireRole(roles: Role[]) {
  const viewer = await requireViewer();
  if (!roles.includes(viewer.profile.role)) redirect('/home');
  return viewer;
}

export const getFlags = cache(async (): Promise<Record<string, boolean>> => {
  if (!isSupabaseConfigured()) return {};
  const supabase = await createClient();
  const { data } = await supabase.from('feature_flags').select('key, enabled');
  return Object.fromEntries((data ?? []).map((flag) => [flag.key as string, Boolean(flag.enabled)]));
});
