import Link from 'next/link';
import { ChallengeCard } from '@/components/challenge-card';
import { EmptyState } from '@/components/empty-state';
import { FollowButton } from '@/components/follow-button';
import { JournalEntryCard } from '@/components/journal-entry-card';
import { LiveEventCard } from '@/components/live-event-card';
import { PageHeader } from '@/components/page-header';
import { UserAvatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { listPrograms } from '@/lib/data/catalogue';
import { getChallenges, getFeed, getFollowers, getFollowing, getInstructors, getUpcomingLive } from '@/lib/data/community';
import { getFlags, requireViewer } from '@/lib/data/session';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Community' };

type Tab = 'feed' | 'challenges' | 'live' | 'teachers';

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ tab?: string; scope?: string }> }) {
  const params = await searchParams;
  const viewer = await requireViewer();
  const flags = await getFlags();
  const tabs = (
    [
      { value: 'feed', label: 'Reflections', enabled: flags.community_feed !== false },
      { value: 'challenges', label: 'Challenges', enabled: flags.challenges !== false },
      { value: 'live', label: 'Live', enabled: flags.live_events !== false },
      { value: 'teachers', label: 'Teachers', enabled: true },
    ] as { value: Tab; label: string; enabled: boolean }[]
  ).filter((t) => t.enabled);
  const tab: Tab = tabs.find((t) => t.value === params.tab)?.value ?? tabs[0]!.value;
  const viewerId = viewer.profile.id;

  let content: React.ReactNode = null;

  if (tab === 'feed') {
    const scope = params.scope === 'friends' ? 'friends' : 'everyone';
    const entries = await getFeed(viewerId, scope);
    content = (
      <div className="max-w-2xl space-y-4">
        <div className="flex gap-2" role="group" aria-label="Whose reflections">
          {(['everyone', 'friends'] as const).map((s) => (
            <Link
              key={s}
              href={`/community?tab=feed${s === 'friends' ? '&scope=friends' : ''}`}
              aria-current={scope === s ? 'true' : undefined}
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm transition-colors',
                scope === s ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
            >
              {s === 'everyone' ? 'Everyone' : 'Friends'}
            </Link>
          ))}
        </div>
        {entries.length ? (
          entries.map((entry) => <JournalEntryCard key={entry.id} entry={entry} viewerId={viewerId} />)
        ) : (
          <EmptyState
            title={scope === 'friends' ? 'Quiet among friends' : 'No shared reflections yet'}
            description={
              scope === 'friends'
                ? 'Friends are people you follow who follow you back. Their shared reflections will appear here.'
                : 'When people share a reflection after a session, it will appear here.'
            }
          />
        )}
      </div>
    );
  } else if (tab === 'challenges') {
    const [challenges, programs] = await Promise.all([getChallenges(viewerId), listPrograms()]);
    const programTitle = new Map(programs.map((p) => [p.id, p.title]));
    content = challenges.length ? (
      <div className="grid gap-4 md:grid-cols-2">
        {challenges.map((c) => (
          <ChallengeCard key={c.challenge.id} {...c} programTitle={c.challenge.program_id ? programTitle.get(c.challenge.program_id) : undefined} />
        ))}
      </div>
    ) : (
      <EmptyState title="No challenges right now" description="Instructors run group challenges from time to time. Check back soon." />
    );
  } else if (tab === 'live') {
    const events = await getUpcomingLive(viewerId, 20);
    content = events.length ? (
      <div className="grid gap-4 md:grid-cols-2">
        {events.map((event) => (
          <LiveEventCard key={event.id} event={event} />
        ))}
      </div>
    ) : (
      <EmptyState title="No live sessions scheduled" description="Follow instructors to hear about their next live sit." />
    );
  } else {
    const [instructors, following, followers] = await Promise.all([getInstructors(), getFollowing(viewerId), getFollowers(viewerId)]);
    content = (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {instructors.map((instructor) => (
          <Card key={instructor.id} className="flex flex-col gap-4 p-5">
            <Link href={`/profile/${instructor.id}`} className="flex items-center gap-3 hover:underline">
              <UserAvatar name={instructor.display_name} src={instructor.avatar_url} className="size-14" />
              <span>
                <span className="block font-display text-lg font-medium">{instructor.display_name}</span>
                {instructor.credentials && <span className="block text-xs text-muted-foreground">{instructor.credentials}</span>}
              </span>
            </Link>
            {instructor.bio && <p className="line-clamp-3 text-sm text-muted-foreground">{instructor.bio}</p>}
            {instructor.id !== viewerId && (
              <div className="mt-auto">
                <FollowButton
                  profileId={instructor.id}
                  initial={following.has(instructor.id)}
                  followsYou={followers.has(instructor.id)}
                  name={instructor.display_name}
                />
              </div>
            )}
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div>
      <PageHeader eyebrow="Community" title="Practising together" description="Share reflections, join a challenge, or sit with others live." />
      <nav aria-label="Community sections" className="scrollbar-none -mx-4 mb-8 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {tabs.map((t) => (
          <Link
            key={t.value}
            href={`/community?tab=${t.value}`}
            aria-current={tab === t.value ? 'page' : undefined}
            className={cn(
              'shrink-0 rounded-full px-4 py-2 text-sm transition-colors',
              tab === t.value ? 'bg-secondary font-medium text-secondary-foreground' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {content}
    </div>
  );
}
