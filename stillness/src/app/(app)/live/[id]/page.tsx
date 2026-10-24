import { notFound } from 'next/navigation';
import { LiveRoom } from '@/components/live-room';
import { PageHeader } from '@/components/page-header';
import { getMeditationsByIds } from '@/lib/data/catalogue';
import { requireViewer } from '@/lib/data/session';
import { buildTrack } from '@/lib/data/track';
import { createClient } from '@/lib/supabase/server';
import type { LiveEvent, ProfileCard } from '@/lib/types';
import { formatEventTime } from '@/lib/utils';

export const metadata = { title: 'Live session' };

export default async function LivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const viewer = await requireViewer();
  const supabase = await createClient();
  const { data } = await supabase
    .from('live_events')
    .select('*, host:profiles!live_events_host_id_fkey(id, display_name, avatar_url, role)')
    .eq('id', id)
    .maybeSingle();
  if (!data) notFound();
  const event = data as LiveEvent & { host: ProfileCard | null };

  const meditation = event.meditation_id ? (await getMeditationsByIds([event.meditation_id]))[0] : null;
  const track = meditation ? await buildTrack(meditation) : null;
  const hostName = event.host?.display_name ?? 'The host';

  return (
    <div>
      <PageHeader
        eyebrow={`Live · ${event.duration_minutes} min`}
        title={event.title}
        description={
          <>
            <p>
              With {hostName} · <span suppressHydrationWarning>{formatEventTime(event.starts_at, viewer.prefs.timezone)}</span>
            </p>
            {event.description && <p className="mt-2">{event.description}</p>}
          </>
        }
      />
      <LiveRoom
        event={event}
        hostName={hostName}
        isHost={event.host_id === viewer.profile.id || viewer.profile.role === 'admin'}
        me={{ id: viewer.profile.id, name: viewer.profile.display_name, avatar: viewer.profile.avatar_url }}
        track={track}
      />
    </div>
  );
}
