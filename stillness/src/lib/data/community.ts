import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { Challenge, FeedEntry, LeaderboardRow, LiveEventWithHost, ProfileCard } from '@/lib/types';

const AUTHOR = 'author:profiles!journal_entries_user_id_fkey(id, display_name, avatar_url, role)';
const ENTRY_MEDITATION = 'meditation:meditations(id, slug, title, artwork, duration_seconds)';

async function withReactions(rows: Omit<FeedEntry, 'reaction_count' | 'reacted'>[], viewerId: string) {
  if (rows.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase.from('reactions').select('entry_id, user_id').in('entry_id', rows.map((r) => r.id));
  return rows.map((row) => {
    const reactions = (data ?? []).filter((r) => r.entry_id === row.id);
    return { ...row, reaction_count: reactions.length, reacted: reactions.some((r) => r.user_id === viewerId) };
  });
}

/** Shared reflections the viewer can see. RLS decides visibility. */
export async function getFeed(viewerId: string, scope: 'everyone' | 'friends', limit = 30) {
  const supabase = await createClient();
  let query = supabase
    .from('journal_entries')
    .select(`*, ${AUTHOR}, ${ENTRY_MEDITATION}`)
    .neq('visibility', 'private')
    .eq('hidden', false)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (scope === 'friends') {
    const friends = await getFriendIds(viewerId);
    query = query.in('user_id', [...friends, viewerId]);
  }
  const { data } = await query;
  return withReactions((data ?? []) as FeedEntry[], viewerId);
}

export async function getEntriesByUser(userId: string, viewerId: string, limit = 20) {
  const supabase = await createClient();
  let query = supabase
    .from('journal_entries')
    .select(`*, ${AUTHOR}, ${ENTRY_MEDITATION}`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (userId !== viewerId) query = query.neq('visibility', 'private').eq('hidden', false);
  const { data } = await query;
  return withReactions((data ?? []) as FeedEntry[], viewerId);
}

export async function getFollowing(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from('follows').select('followee_id').eq('follower_id', userId);
  return new Set((data ?? []).map((r) => r.followee_id as string));
}

export async function getFollowers(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from('follows').select('follower_id').eq('followee_id', userId);
  return new Set((data ?? []).map((r) => r.follower_id as string));
}

export async function getFriendIds(userId: string) {
  const [following, followers] = await Promise.all([getFollowing(userId), getFollowers(userId)]);
  return Array.from(following).filter((id) => followers.has(id));
}

export async function getInstructors() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, role, bio, credentials')
    .eq('role', 'instructor')
    .order('display_name');
  return (data ?? []) as (ProfileCard & { bio: string | null; credentials: string | null })[];
}

export async function getChallenges(viewerId: string) {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from('challenges')
    .select('*, participants:challenge_participants(user_id)')
    .gte('ends_on', today)
    .order('starts_on');
  const challenges = (data ?? []) as (Challenge & { participants: { user_id: string }[] })[];
  return Promise.all(
    challenges.map(async (challenge) => {
      const { data: board } = await supabase.rpc('challenge_leaderboard', { p_challenge: challenge.id });
      const leaderboard = ((board ?? []) as LeaderboardRow[]).map((row) => ({ ...row, progress: Number(row.progress) }));
      return {
        challenge,
        joined: challenge.participants.some((p) => p.user_id === viewerId),
        participantCount: challenge.participants.length,
        leaderboard,
        myProgress: leaderboard.find((row) => row.user_id === viewerId)?.progress ?? 0,
      };
    }),
  );
}

export async function getUpcomingLive(viewerId: string, limit = 6, hostId?: string) {
  const supabase = await createClient();
  const since = new Date(Date.now() - 3 * 3600_000).toISOString();
  let query = supabase
    .from('live_events')
    .select('*, host:profiles!live_events_host_id_fkey(id, display_name, avatar_url, role), rsvps:live_event_rsvps(user_id)')
    .in('status', ['scheduled', 'live'])
    .gte('starts_at', since)
    .order('starts_at')
    .limit(limit);
  if (hostId) query = query.eq('host_id', hostId);
  const { data } = await query;
  return ((data ?? []) as (LiveEventWithHost & { rsvps: { user_id: string }[] })[]).map(({ rsvps, ...event }) => ({
    ...event,
    rsvp_count: rsvps.length,
    rsvped: rsvps.some((r) => r.user_id === viewerId),
  })) as LiveEventWithHost[];
}
