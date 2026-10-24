import Link from 'next/link';
import { Award, CalendarDays, Flame, Timer } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { PracticeChart } from '@/components/practice-chart';
import { StatTile } from '@/components/stat-tile';
import { MoodDot } from '@/components/player/reflection-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { getCategories, getPlays, listMeditations } from '@/lib/data/catalogue';
import { requireViewer } from '@/lib/data/session';
import { computeStats, localDate, shiftDay } from '@/lib/stats';
import { createClient } from '@/lib/supabase/server';
import type { Checkin } from '@/lib/types';
import { formatTotalMinutes } from '@/lib/utils';

export const metadata = { title: 'Progress' };

export default async function ProgressPage() {
  const viewer = await requireViewer();
  const tz = viewer.prefs.timezone;
  const supabase = await createClient();
  const today = localDate(new Date(), tz);
  const [plays, meditations, categories, checkinsRes] = await Promise.all([
    getPlays(viewer.profile.id),
    listMeditations({}, 300),
    getCategories(),
    supabase
      .from('checkins')
      .select('*')
      .eq('user_id', viewer.profile.id)
      .gte('day', shiftDay(today, -13))
      .order('day'),
  ]);
  const stats = computeStats(plays, tz, new Date(), new Map(meditations.map((m) => [m.id, m.category])));
  const checkins = new Map(((checkinsRes.data ?? []) as Checkin[]).map((c) => [c.day, c]));
  const topCategories = Array.from(stats.favouriteCategoryCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const topMax = topCategories[0]?.[1] ?? 1;
  const categoryName = new Map(categories.map((c) => [c.slug, c.name]));
  const days = Array.from({ length: 14 }, (_, i) => shiftDay(today, i - 13));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Progress"
        title="Your practice"
        description="Every minute counts. Here’s how your practice has been growing."
        actions={
          <Button asChild variant="outline">
            <Link href="/journal">Open journal</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Current streak" value={stats.currentStreak} hint={stats.currentStreak === 1 ? 'day' : 'days'} icon={<Flame className="size-4 text-gold" aria-hidden />} />
        <StatTile label="Longest streak" value={stats.longestStreak} hint="days" icon={<Award className="size-4" aria-hidden />} />
        <StatTile label="Time meditated" value={formatTotalMinutes(stats.totalMinutes)} hint="all time" icon={<Timer className="size-4" aria-hidden />} />
        <StatTile label="Sessions completed" value={stats.sessionsCompleted} hint="all time" icon={<CalendarDays className="size-4" aria-hidden />} />
      </div>

      <Card className="p-5 sm:p-6">
        <PracticeChart week={stats.week} month={stats.month} year={stats.year} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4 p-5 sm:p-6">
          <h2 className="text-lg font-semibold">What you practise most</h2>
          {topCategories.length ? (
            <ul className="space-y-3">
              {topCategories.map(([slug, count]) => (
                <li key={slug} className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span>{categoryName.get(slug) ?? slug}</span>
                    <span className="tabular-nums text-muted-foreground">{count} sessions</span>
                  </div>
                  <Progress value={(count / topMax) * 100} label={`${categoryName.get(slug) ?? slug}: ${count} sessions`} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Complete a few sessions and your favourite themes will appear here.</p>
          )}
        </Card>

        <Card className="space-y-4 p-5 sm:p-6">
          <div>
            <h2 className="text-lg font-semibold">Mood over two weeks</h2>
            <p className="text-sm text-muted-foreground">From your daily check-ins.</p>
          </div>
          <ol className="grid grid-cols-7 gap-2" aria-label="Daily mood, last 14 days">
            {days.map((day) => {
              const c = checkins.get(day);
              const label = new Date(`${day}T12:00:00Z`).toLocaleDateString('en', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
              return (
                <li
                  key={day}
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl bg-muted/60"
                  aria-label={`${label}: ${c?.mood ? `mood ${c.mood} of 5` : 'no check-in'}`}
                  title={c?.intention ?? undefined}
                >
                  {c?.mood ? <MoodDot value={c.mood} /> : <span className="size-1.5 rounded-full bg-border" aria-hidden />}
                  <span className="text-[10px] text-muted-foreground" aria-hidden>
                    {Number(day.slice(8))}
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>
      </div>
    </div>
  );
}
