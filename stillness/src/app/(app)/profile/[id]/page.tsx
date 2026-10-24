import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FollowButton } from '@/components/follow-button';
import { JournalEntryCard } from '@/components/journal-entry-card';
import { LiveEventCard } from '@/components/live-event-card';
import { MeditationCard } from '@/components/meditation-card';
import { ProgramCard } from '@/components/program-card';
import { Section } from '@/components/section';
import { EmptyState } from '@/components/empty-state';
import { UserAvatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { listMeditations, listPrograms } from '@/lib/data/catalogue';
import { getEntriesByUser, getFollowers, getFollowing, getUpcomingLive } from '@/lib/data/community';
import { requireViewer } from '@/lib/data/session';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types';

export const metadata = { title: 'Profile' };

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const viewer = await requireViewer();
  const supabase = await createClient();
  const { data } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle<Profile>();
  if (!data) notFound();
  const profile = data;
  const isMe = profile.id === viewer.profile.id;
  const isTeacher = profile.role !== 'user';

  const [followers, following, viewerFollowing, viewerFollowers, entries] = await Promise.all([
    getFollowers(profile.id),
    getFollowing(profile.id),
    getFollowing(viewer.profile.id),
    getFollowers(viewer.profile.id),
    getEntriesByUser(profile.id, viewer.profile.id, 10),
  ]);
  const [meditations, programs, live] = isTeacher
    ? await Promise.all([
        listMeditations({ instructor: profile.id }, 24),
        listPrograms().then((all) => all.filter((p) => p.instructor_id === profile.id)),
        getUpcomingLive(viewer.profile.id, 4, profile.id),
      ])
    : [[], [], []];
  const sharedEntries = entries.filter((e) => e.visibility !== 'private');

  return (
    <div className="space-y-12">
      <header className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-start sm:text-left">
        <UserAvatar name={profile.display_name} src={profile.avatar_url} className="size-24 text-2xl sm:size-28" />
        <div className="flex-1 space-y-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <h1 className="text-3xl font-semibold">{profile.display_name}</h1>
              {profile.role === 'instructor' && <Badge variant="gold">Instructor</Badge>}
              {profile.role === 'admin' && <Badge variant="muted">Team</Badge>}
            </div>
            {profile.credentials && <p className="text-sm text-muted-foreground">{profile.credentials}</p>}
          </div>
          {profile.bio && <p className="max-w-2xl leading-relaxed text-muted-foreground">{profile.bio}</p>}
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{followers.size}</span> followers ·{' '}
            <span className="font-medium text-foreground">{following.size}</span> following
          </p>
          <div className="flex justify-center gap-2 sm:justify-start">
            {isMe ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/settings">Edit profile</Link>
              </Button>
            ) : (
              <FollowButton
                profileId={profile.id}
                initial={viewerFollowing.has(profile.id)}
                followsYou={viewerFollowers.has(profile.id)}
                name={profile.display_name}
              />
            )}
          </div>
        </div>
      </header>

      {live.length > 0 && (
        <Section title="Upcoming live sessions">
          <div className="grid gap-4 md:grid-cols-2">
            {live.map((event) => (
              <LiveEventCard key={event.id} event={event} />
            ))}
          </div>
        </Section>
      )}

      {programs.length > 0 && (
        <Section title="Programs">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {programs.map((p) => (
              <ProgramCard key={p.id} program={p} days={p.items[0]?.count ?? 0} locked={p.is_premium && !viewer.canAccessPremium} />
            ))}
          </div>
        </Section>
      )}

      {meditations.length > 0 && (
        <Section title="Sessions" href={`/library?instructor=${profile.id}`}>
          <div className="grid grid-cols-1 gap-x-5 gap-y-8 min-[440px]:grid-cols-2 lg:grid-cols-4">
            {meditations.map((m) => (
              <MeditationCard key={m.id} meditation={m} locked={m.is_premium && !viewer.canAccessPremium} />
            ))}
          </div>
        </Section>
      )}

      <Section title={isMe ? 'Your shared reflections' : 'Shared reflections'}>
        {sharedEntries.length ? (
          <div className="mx-auto max-w-2xl space-y-4">
            {sharedEntries.map((entry) => (
              <JournalEntryCard key={entry.id} entry={entry} viewerId={viewer.profile.id} showAuthor={false} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nothing shared yet"
            description={isMe ? 'Reflections you share with friends or the community will appear here.' : 'When they share a reflection you can see, it will appear here.'}
          />
        )}
      </Section>
    </div>
  );
}
