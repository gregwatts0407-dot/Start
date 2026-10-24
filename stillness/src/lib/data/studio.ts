import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { Meditation, Role } from '@/lib/types';

/** Sessions an instructor can use in programs and live events (admins: all). */
export async function getStudioMeditations(userId: string, role: Role) {
  const supabase = await createClient();
  let query = supabase.from('meditations').select('id, title, duration_seconds, published').order('title');
  if (role !== 'admin') query = query.eq('instructor_id', userId);
  const { data } = await query;
  return (data ?? []) as Pick<Meditation, 'id' | 'title' | 'duration_seconds' | 'published'>[];
}
