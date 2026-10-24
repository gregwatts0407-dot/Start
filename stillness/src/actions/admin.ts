'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionResult } from '@/lib/types';
import { authed, failure } from './helpers';

async function admin() {
  const ctx = await authed();
  if (!ctx) return null;
  const { data } = await ctx.supabase.from('profiles').select('role').eq('id', ctx.user.id).single();
  return data?.role === 'admin' ? ctx : null;
}

const notAdmin: ActionResult<never> = { ok: false, error: 'Only administrators can do that.' };
const uuid = z.string().uuid();

export async function setUserRole(userId: string, role: 'user' | 'instructor' | 'admin'): Promise<ActionResult> {
  if (!uuid.safeParse(userId).success || !['user', 'instructor', 'admin'].includes(role)) return { ok: false, error: 'Invalid request.' };
  const ctx = await admin();
  if (!ctx) return notAdmin;
  if (userId === ctx.user.id && role !== 'admin') return { ok: false, error: 'You can’t remove your own admin access.' };
  const { error } = await ctx.supabase.from('profiles').update({ role }).eq('id', userId);
  if (error) return failure(error);
  revalidatePath('/admin');
  return { ok: true };
}

export async function setUserSuspended(userId: string, suspended: boolean): Promise<ActionResult> {
  const ctx = await admin();
  if (!ctx) return notAdmin;
  if (userId === ctx.user.id) return { ok: false, error: 'You can’t suspend yourself.' };
  const { error } = await ctx.supabase.from('profiles').update({ is_suspended: suspended }).eq('id', userId);
  if (error) return failure(error);
  revalidatePath('/admin');
  return { ok: true };
}

export async function setManualPremium(userId: string, premium: boolean): Promise<ActionResult> {
  const ctx = await admin();
  if (!ctx) return notAdmin;
  const { data: existing } = await ctx.supabase.from('subscriptions').select('source').eq('user_id', userId).maybeSingle();
  if (existing?.source === 'stripe') return { ok: false, error: 'This person pays through Stripe. Manage it in the Stripe dashboard.' };
  const { error } = premium
    ? await ctx.supabase.from('subscriptions').upsert({ user_id: userId, source: 'manual', status: 'active' }, { onConflict: 'user_id' })
    : await ctx.supabase.from('subscriptions').delete().eq('user_id', userId).eq('source', 'manual');
  if (error) return failure(error);
  revalidatePath('/admin');
  return { ok: true };
}

export async function setFeatureFlag(key: string, enabled: boolean): Promise<ActionResult> {
  const ctx = await admin();
  if (!ctx) return notAdmin;
  const { error } = await ctx.supabase.from('feature_flags').update({ enabled }).eq('key', key);
  if (error) return failure(error);
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function setEntryHidden(entryId: string, hidden: boolean): Promise<ActionResult> {
  const ctx = await admin();
  if (!ctx) return notAdmin;
  const { error } = await ctx.supabase.from('journal_entries').update({ hidden }).eq('id', entryId);
  if (error) return failure(error);
  if (hidden) {
    await ctx.supabase
      .from('content_reports')
      .update({ status: 'resolved', resolved_by: ctx.user.id, resolved_at: new Date().toISOString() })
      .eq('entry_id', entryId)
      .eq('status', 'open');
  }
  revalidatePath('/admin');
  revalidatePath('/community');
  return { ok: true };
}

export async function dismissReport(reportId: string): Promise<ActionResult> {
  const ctx = await admin();
  if (!ctx) return notAdmin;
  const { error } = await ctx.supabase
    .from('content_reports')
    .update({ status: 'dismissed', resolved_by: ctx.user.id, resolved_at: new Date().toISOString() })
    .eq('id', reportId);
  if (error) return failure(error);
  revalidatePath('/admin');
  return { ok: true };
}
