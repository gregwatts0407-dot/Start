import Link from 'next/link';
import { Bell, Flame, Sparkles, Timer } from 'lucide-react';
import { CheckinCard } from '@/components/checkin-card';
import { ContinueCard } from '@/components/continue-card';
import { LiveEventCard } from '@/components/live-event-card';
import { MeditationCard } from '@/components/meditation-card';
import { ProgramCard } from '@/components/program-card';
import { CardRail, Section } from '@/components/section';
import { StatTile } from '@/components/stat-tile';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
import {
  getCategories,
  getEnrollments,
  getPlays,
  getPopularity,
  getProgramItems,
  latestPlayPerMeditation,
  listMeditations,
  listPrograms,
} from '@/lib/data/catalogue';
import { getFollowing, getUpcomingLive } from '@/lib/data/community';
import { getFlags, requireViewer } from '@/lib/data/session';
import { buildTrack } from '@/lib/data/track';
import { programProgress } from '@/lib/programs';
import { recommend } from '@/lib/recommend';
import { computeStats, localDate, localHour, localMinutes, localWeekday } from '@/lib/stats';
import { createClient } from '@/lib/supabase/server';
import type { Checkin } from '@/lib/types';
import { formatTotalMinutes } from '@/lib/utils';

export const metadata = { title: 'Home' };

function greeting(hour: number) {
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  const viewer = await requireViewer();
  const { profile, prefs } = viewer;
  const tz = prefs.timezone;
  const now = new Date();
  const today = localDate(now, tz);
  const supabase = await createClient();

  const [meditations, plays, popularity, following, flags, categories, enrollments, programs, live, checkinRes] = await Promise.all([
    listMeditations({}, 300),
    getPlays(profile.id),
    getPopularity(),
    getFollowing(profile.id),
    getFlags(),
    getCategories(),
    getEnrollments(profile.id),
    listPrograms(),
    getUpcomingLive(profile.id, 2),
    supabase.from('checkins').select('*').eq('user_id', profile.id).eq('day', today).maybeSingle<Checkin>(),
  ]);

  const categoryName = new Map(categories.map((c) => [c.slug, c.name]));
  const byId = new Map(meditations.map((m) => [m.id, m]));
  const stats = computeStats(plays, tz, now, new Map(meditations.map((m) => [m.id, m.category])));

  const forYou = recommend({ meditations, prefs, plays, popularity, followedIds: following, canAccessPremium: viewer.canAccessPremium, now }, 8);

  // Continue listening: unfinished sessions from the last two weeks.
  const unfinished = latestPlayPerMeditation(plays)
    .filter((p) => {
      const meditation = byId.get(p.meditation_id);
      return (
        meditation &&
        !p.completed &&
        p.position_seconds > 30 &&
        p.position_seconds < meditation.duration_seconds - 15 &&
        now.getTime() - new Date(p.updated_at).getTime() < 14 * 86400_000
      );
    })
    .slice(0, 3);
  const continueTracks = (
    await Promise.all(
      unfinished.map(async (play) => {
        const meditation = byId.get(play.meditation_id);
        const track = meditation ? await buildTrack(meditation, { resume: play }) : null;
        return track ? { track, percent: play.percent } : null;
      }),
    )
  ).filter((x): x is NonNullable<typeof x> => Boolean(x));

  // Active programs and the next day in each.
  const active = enrollments.filter((e) => !e.completed_at);
  const itemsByProgram = await getProgramItems(active.map((e) => e.program_id));
  const activePrograms = active.map((e) => ({
    enrollment: e,
    progress: programProgress(itemsByProgram.get(e.program_id) ?? [], plays, e, e.program!.unlock_mode),
  }));
  const enrolledIds = new Set(enrollments.map((e) => e.program_id));
  const suggestedProgram = programs.find((p) => !enrolledIds.has(p.id) && (!p.is_premium || viewer.canAccessPremium)) ?? null;

  // A gentle in-app reminder once the chosen time has passed on a chosen day.
  const [rh, rm] = prefs.reminder_time.split(':').map(Number);
  const showReminder =
    prefs.reminder_enabled &&
    prefs.inapp_reminders &&
    !stats.meditatedToday &&
    prefs.reminder_days.includes(localWeekday(now, tz)) &&
    localMinutes(now, tz) >= rh! * 60 + rm!;

  const firstName = profile.display_name.split(' ')[0];

  return (
    <div className="space-y-10">
      <header className="animate-fade-up space-y-2">
        <p className="text-sm text-muted-foreground" suppressHydrationWarning>
          {now.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric', timeZone: tz })}
        </p>
        <h1 className="text-3xl font-semibold sm:text-4xl">
          {welcome ? `Welcome, ${firstName}` : `${greeting(localHour(now, tz))}, ${firstName}`}
        </h1>
        <p className="text-muted-foreground">
          {welcome
            ? 'Your space is ready. Start with something short — even three minutes counts.'
            : stats.meditatedToday
              ? 'You’ve already made time for yourself today. Lovely.'
              : stats.currentStreak > 0
                ? `You’re on a ${stats.currentStreak}-day streak. A few minutes today keeps it going.`
                : 'Take a few minutes for yourself today.'}
        </p>
      </header>

      {showReminder && (
        <Card className="flex items-center gap-4 border-gold/30 bg-gold/10 p-4">
          <Bell className="size-5 shrink-0 text-gold" aria-hidden />
          <p className="flex-1 text-sm">
            A gentle reminder: your daily pause is waiting. {forYou[0] ? `“${forYou[0].meditation.title}” might be a good fit.` : ''}
          </p>
          {forYou[0] && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/meditations/${forYou[0].meditation.slug}`}>Begin</Link>
            </Button>
          )}
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <CheckinCard day={today} existing={checkinRes.data ?? null} />
        <div className="grid grid-cols-3 gap-3">
          <StatTile
            label="Streak"
            value={stats.currentStreak}
            hint={stats.currentStreak === 1 ? 'day' : 'days'}
            icon={<Flame className="size-4 text-gold" aria-hidden />}
            className="p-4"
          />
          <StatTile label="This week" value={stats.minutesThisWeek} hint="minutes" icon={<Timer className="size-4" aria-hidden />} className="p-4" />
          <StatTile
            label="All time"
            value={formatTotalMinutes(stats.totalMinutes).split(' ')[0]}
            hint={formatTotalMinutes(stats.totalMinutes).split(' ')[1] === 'hr' ? 'hours' : 'minutes'}
            icon={<Sparkles className="size-4" aria-hidden />}
            className="p-4"
          />
        </div>
      </div>

      {continueTracks.length > 0 && (
        <Section title="Continue listening">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {continueTracks.map(({ track, percent }) => (
              <ContinueCard key={track.meditationId} track={track} percent={percent} />
            ))}
          </div>
        </Section>
      )}

      <Section title="For you" description="Chosen from your goals, your history and the time of day." href="/library">
        {forYou.length ? (
          <CardRail>
            {forYou.slice(0, 4).map(({ meditation, reason }) => (
              <MeditationCard
                key={meditation.id}
                meditation={meditation}
                reason={reason}
                locked={meditation.is_premium && !viewer.canAccessPremium}
                categoryName={categoryName.get(meditation.category)}
              />
            ))}
          </CardRail>
        ) : (
          <EmptyState title="The library is being prepared" description="New sessions will appear here soon." />
        )}
      </Section>

      <Section title="Your programs" href="/programs" linkLabel="All programs">
        {activePrograms.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {activePrograms.map(({ enrollment, progress }) => (
              <Card key={enrollment.program_id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Day {progress.next?.day_number ?? progress.days.length} of {progress.days.length}
                  </p>
                  <Link href={`/programs/${enrollment.program!.slug}`} className="font-display text-lg font-medium hover:underline">
                    {enrollment.program!.title}
                  </Link>
                  <p className="truncate text-sm text-muted-foreground">
                    {progress.next ? `Next: ${progress.next.title ?? progress.next.meditation.title}` : 'All days complete'}
                  </p>
                </div>
                {progress.next && (
                  <Button asChild size="sm">
                    <Link href={`/meditations/${progress.next.meditation.slug}?program=${enrollment.program_id}`}>Continue</Link>
                  </Button>
                )}
              </Card>
            ))}
          </div>
        ) : suggestedProgram ? (
          <div className="max-w-md">
            <ProgramCard program={suggestedProgram} days={suggestedProgram.items[0]?.count ?? 0} instructorName={suggestedProgram.instructor?.display_name} />
          </div>
        ) : null}
      </Section>

      {forYou.length > 4 && (
        <Section title="More to explore">
          <CardRail>
            {forYou.slice(4, 8).map(({ meditation, reason }) => (
              <MeditationCard
                key={meditation.id}
                meditation={meditation}
                reason={reason}
                locked={meditation.is_premium && !viewer.canAccessPremium}
                categoryName={categoryName.get(meditation.category)}
              />
            ))}
          </CardRail>
        </Section>
      )}

      {flags.live_events && live.length > 0 && (
        <Section title="Live with instructors" href="/community?tab=live">
          <div className="grid gap-4 md:grid-cols-2">
            {live.map((event) => (
              <LiveEventCard key={event.id} event={event} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
