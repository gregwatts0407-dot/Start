import Link from 'next/link';
import { Heart, Play, Plus, Trophy, Users } from 'lucide-react';
import { Artwork } from '@/components/brand/artwork';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { StatTile } from '@/components/stat-tile';
import { MeditationRowMenu } from '@/components/studio/delete-meditation';
import { MeditationPublishSwitch } from '@/components/studio/publish-toggles';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getCategories } from '@/lib/data/catalogue';
import { requireRole } from '@/lib/data/session';
import { createClient } from '@/lib/supabase/server';
import type { InstructorStat, Meditation } from '@/lib/types';
import { cn, formatMinutes } from '@/lib/utils';

export const metadata = { title: 'Overview' };

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { scope } = await searchParams;
  const viewer = await requireRole(['instructor', 'admin']);
  const showAll = viewer.profile.role === 'admin' && scope === 'all';
  const supabase = await createClient();

  let query = supabase.from('meditations').select('*').order('created_at', { ascending: false });
  if (!showAll) query = query.eq('instructor_id', viewer.profile.id);
  const [{ data: meditationRows }, { data: statRows }, { data: daily }, { data: followers }, categories] = await Promise.all([
    query,
    supabase.rpc('instructor_stats'),
    supabase.rpc('instructor_daily_plays', { p_days: 30 }),
    supabase.rpc('follower_count', { p_user: viewer.profile.id }),
    getCategories(),
  ]);
  const categoryName = new Map(categories.map((c) => [c.slug, c.name]));

  const meditations = (meditationRows ?? []) as Meditation[];
  const stats = new Map(((statRows ?? []) as InstructorStat[]).map((s) => [s.meditation_id, s]));
  const mine = meditations.map((m) => stats.get(m.id));
  const total = (key: keyof Omit<InstructorStat, 'meditation_id'>) => mine.reduce((sum, s) => sum + Number(s?.[key] ?? 0), 0);
  const days = (daily ?? []) as { day: string; plays: number; completions: number }[];
  const maxDaily = Math.max(1, ...days.map((d) => Number(d.plays)));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Your sessions"
        description="See how your work is landing, and publish new sessions."
        actions={
          <>
            {viewer.profile.role === 'admin' && (
              <Button asChild variant="outline">
                <Link href={showAll ? '/studio' : '/studio?scope=all'}>{showAll ? 'Only mine' : 'All instructors'}</Link>
              </Button>
            )}
            <Button asChild>
              <Link href="/studio/meditations/new">
                <Plus aria-hidden /> New session
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Plays" value={total('plays')} hint={`${total('minutes_listened')} minutes listened`} icon={<Play className="size-4" aria-hidden />} />
        <StatTile
          label="Completions"
          value={total('completions')}
          hint={total('plays') ? `${Math.round((total('completions') / total('plays')) * 100)}% completion rate` : 'No plays yet'}
          icon={<Trophy className="size-4" aria-hidden />}
        />
        <StatTile label="Favourites" value={total('favourites')} icon={<Heart className="size-4" aria-hidden />} />
        <StatTile label="Followers" value={Number(followers ?? 0)} hint={`${total('listeners')} unique listeners`} icon={<Users className="size-4" aria-hidden />} />
      </div>

      {!showAll && (
        <Card className="p-5 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold">Plays, last 30 days</h2>
          <div className="flex h-32 items-end gap-1" role="img" aria-label={`${days.reduce((s, d) => s + Number(d.plays), 0)} plays in the last 30 days`}>
            {days.map((d) => (
              <div
                key={d.day}
                className={cn('flex-1 rounded-t-md', Number(d.plays) ? 'bg-sage/80' : 'bg-muted')}
                style={{ height: Number(d.plays) ? `${Math.max(6, (Number(d.plays) / maxDaily) * 100)}%` : '3px' }}
                title={`${d.day}: ${d.plays} plays, ${d.completions} completions`}
              />
            ))}
          </div>
        </Card>
      )}

      {meditations.length ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Session</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Plays</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Completed</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Favourites</th>
                  <th scope="col" className="px-3 py-3 font-medium">Published</th>
                  <th scope="col" className="px-3 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {meditations.map((m) => {
                  const s = stats.get(m.id);
                  return (
                    <tr key={m.id} className="hover:bg-muted/30">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Artwork palette={m.artwork} seed={m.slug} coverUrl={m.cover_url} className="size-10 shrink-0 rounded-xl" />
                          <div className="min-w-0">
                            <Link href={`/studio/meditations/${m.id}`} className="font-medium hover:underline">
                              {m.title}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {formatMinutes(m.duration_seconds)} · {categoryName.get(m.category) ?? m.category}
                              {m.is_premium && (
                                <Badge variant="gold" className="ml-2 py-0">
                                  Premium
                                </Badge>
                              )}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{Number(s?.plays ?? 0)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{Number(s?.completions ?? 0)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{Number(s?.favourites ?? 0)}</td>
                      <td className="px-3 py-3">
                        <MeditationPublishSwitch id={m.id} published={m.published} title={m.title} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <MeditationRowMenu id={m.id} title={m.title} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <EmptyState
          title="Your studio is ready"
          description="Upload a recording or write a guidance script to publish your first session."
          action={
            <Button asChild>
              <Link href="/studio/meditations/new">Create a session</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
