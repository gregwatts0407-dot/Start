import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { ChallengeForm, LiveEventForm } from '@/components/studio/live-forms';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRole } from '@/lib/data/session';
import { getStudioMeditations } from '@/lib/data/studio';
import { createClient } from '@/lib/supabase/server';
import type { Challenge, LiveEvent, Program } from '@/lib/types';
import { formatEventTime } from '@/lib/utils';

export const metadata = { title: 'Live & challenges' };

export default async function StudioLivePage() {
  const viewer = await requireRole(['instructor', 'admin']);
  const supabase = await createClient();
  const [meditations, { data: events }, { data: challenges }, { data: programs }] = await Promise.all([
    getStudioMeditations(viewer.profile.id, viewer.profile.role),
    supabase
      .from('live_events')
      .select('*, rsvps:live_event_rsvps(count)')
      .eq('host_id', viewer.profile.id)
      .gte('starts_at', new Date(Date.now() - 7 * 86400_000).toISOString())
      .order('starts_at'),
    supabase.from('challenges').select('*, participants:challenge_participants(count)').eq('created_by', viewer.profile.id).order('starts_on', { ascending: false }),
    supabase.from('programs').select('id, title').eq('published', true).order('title'),
  ]);
  const tz = viewer.prefs.timezone;

  return (
    <div className="space-y-8">
      <PageHeader title="Live sessions & challenges" description="Bring people together in real time, or around a shared goal." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Schedule a live session</CardTitle>
            <CardDescription>Listeners gather in a waiting room. When you begin, everyone hears the session in sync.</CardDescription>
          </CardHeader>
          <CardContent>
            <LiveEventForm meditations={meditations} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Start a group challenge</CardTitle>
            <CardDescription>Progress is counted automatically from people’s listening.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChallengeForm programs={(programs ?? []) as Pick<Program, 'id' | 'title'>[]} />
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Your live sessions</h2>
        {((events ?? []) as (LiveEvent & { rsvps: { count: number }[] })[]).map((event) => (
          <Card key={event.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="font-medium">{event.title}</p>
              <p className="text-sm text-muted-foreground">
                {formatEventTime(event.starts_at, tz)} · {event.rsvps[0]?.count ?? 0} going
              </p>
            </div>
            <Badge variant={event.status === 'live' ? 'gold' : 'muted'} className="self-start sm:self-auto">
              {event.status}
            </Badge>
            <Button asChild size="sm" variant="outline">
              <Link href={`/live/${event.id}`}>Open room</Link>
            </Button>
          </Card>
        ))}
        {!events?.length && <p className="text-sm text-muted-foreground">Nothing scheduled.</p>}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Your challenges</h2>
        {((challenges ?? []) as (Challenge & { participants: { count: number }[] })[]).map((c) => (
          <Card key={c.id} className="flex items-center gap-3 p-4">
            <div className="flex-1">
              <p className="font-medium">{c.title}</p>
              <p className="text-sm text-muted-foreground">
                {c.starts_on} → {c.ends_on} · {c.goal_value} {c.goal_type} · {c.participants[0]?.count ?? 0} taking part
              </p>
            </div>
          </Card>
        ))}
        {!challenges?.length && <p className="text-sm text-muted-foreground">No challenges yet.</p>}
      </section>
    </div>
  );
}
