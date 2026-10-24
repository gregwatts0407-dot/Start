'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Play, Radio, Send, Square } from 'lucide-react';
import { toast } from 'sonner';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { setLiveStatus } from '@/actions/studio';
import { usePlayer, type PlayerTrack } from '@/components/player/player-provider';
import { UserAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import type { LiveEvent, LiveStatus } from '@/lib/types';
import { formatClock } from '@/lib/utils';

interface Presence {
  id: string;
  name: string;
  avatar: string | null;
}

interface Intention {
  id: string;
  name: string;
  text: string;
}

interface LiveRoomProps {
  event: LiveEvent;
  hostName: string;
  isHost: boolean;
  me: Presence;
  track: PlayerTrack | null;
}

export function LiveRoom({ event, hostName, isHost, me, track }: LiveRoomProps) {
  const router = useRouter();
  const player = usePlayer();
  const [status, setStatus] = React.useState<LiveStatus>(event.status);
  const [startedAt, setStartedAt] = React.useState(event.started_at);
  const [people, setPeople] = React.useState<Presence[]>([]);
  const [intentions, setIntentions] = React.useState<Intention[]>([]);
  const [draft, setDraft] = React.useState('');
  const [now, setNow] = React.useState<number | null>(null);
  const [pending, startTransition] = React.useTransition();
  const channelRef = React.useRef<RealtimeChannel | null>(null);

  React.useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const { id: meId, name: meName, avatar: meAvatar } = me;

  React.useEffect(() => {
    const supabase = createClient();
    const presence: Presence = { id: meId, name: meName, avatar: meAvatar };
    const channel = supabase.channel(`live:${event.id}`, { config: { presence: { key: meId } } });
    let cancelled = false;
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<Presence>();
        setPeople(Object.values(state).map((entries) => entries[0]!).filter(Boolean));
      })
      .on('broadcast', { event: 'intention' }, ({ payload }) => {
        setIntentions((list) => [payload as Intention, ...list].slice(0, 30));
      })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'live_events', filter: `id=eq.${event.id}` },
        ({ new: row }) => {
          const next = row as LiveEvent;
          setStatus(next.status);
          setStartedAt(next.started_at);
          if (next.status === 'live') toast(`${hostName} has begun the session`);
        },
      );
    channelRef.current = channel;

    // Database changes are filtered by RLS, so the socket must carry the
    // signed-in user's token before subscribing (it starts out anonymous).
    void supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return;
      if (session) await supabase.realtime.setAuth(session.access_token);
      channel.subscribe(async (state) => {
        if (state === 'SUBSCRIBED') await channel.track(presence);
      });
    });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [event.id, hostName, meId, meName, meAvatar]);

  const startsIn = now === null ? null : new Date(event.starts_at).getTime() - now;
  const elapsed = startedAt && now !== null ? Math.max(0, (now - new Date(startedAt).getTime()) / 1000) : 0;
  const trackOver = track ? elapsed >= track.durationSeconds - 5 : false;

  const joinAudio = () => {
    if (!track) return;
    player.load({ ...track, startAt: Math.floor(elapsed) });
  };

  const changeStatus = (next: LiveStatus) =>
    startTransition(async () => {
      const result = await setLiveStatus(event.id, next);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setStatus(next);
      if (next === 'live') {
        setStartedAt(new Date().toISOString());
        if (track) player.load({ ...track, startAt: 0 });
      }
      router.refresh();
    });

  const share = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim().slice(0, 140);
    if (!text) return;
    const message: Intention = { id: crypto.randomUUID(), name: me.name, text };
    void channelRef.current?.send({ type: 'broadcast', event: 'intention', payload: message });
    setIntentions((list) => [message, ...list].slice(0, 30));
    setDraft('');
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <section className="relative flex flex-col items-center justify-center overflow-hidden rounded-[2rem] bg-navy-deep px-6 py-12 text-center text-white sm:py-16" aria-live="polite">
        <div className="relative mb-8 flex size-48 items-center justify-center sm:size-56">
          <span className="absolute inset-0 animate-breathe rounded-full bg-sage/20" aria-hidden />
          <span className="absolute inset-[18%] animate-breathe rounded-full bg-sage/30 [animation-delay:400ms]" aria-hidden />
          <span className="relative font-display text-5xl font-semibold tabular-nums">{people.length || 1}</span>
        </div>
        <p className="text-sm text-white/70">{people.length === 1 ? 'You’re the first one here' : `${people.length} people breathing together`}</p>

        <div className="mt-8 space-y-4">
          {status === 'scheduled' && (
            <>
              <p className="font-display text-2xl" suppressHydrationWarning>
                {startsIn === null ? ' ' : startsIn > 0 ? `Begins in ${formatCountdown(startsIn)}` : `Waiting for ${hostName} to begin`}
              </p>
              <p className="text-sm text-white/60">Settle in. Find a comfortable seat and let your breathing slow.</p>
              {isHost && (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="gold" disabled={pending} onClick={() => changeStatus('live')}>
                    <Radio aria-hidden /> Begin for everyone
                  </Button>
                  <Button variant="ghost" className="text-white hover:bg-white/10 hover:text-white" disabled={pending} onClick={() => changeStatus('cancelled')}>
                    Cancel session
                  </Button>
                </div>
              )}
            </>
          )}

          {status === 'live' && (
            <>
              <p className="font-display text-2xl">Live now{startedAt ? ` · ${formatClock(elapsed)}` : ''}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {track && !trackOver && (
                  <Button variant="gold" onClick={joinAudio}>
                    <Play className="fill-current" aria-hidden /> {player.track?.meditationId === track.meditationId ? 'Rejoin audio' : 'Join the session'}
                  </Button>
                )}
                {event.join_url && (
                  <Button asChild variant="gold">
                    <a href={event.join_url} target="_blank" rel="noreferrer noopener">
                      <ExternalLink aria-hidden /> Open video room
                    </a>
                  </Button>
                )}
                {isHost && (
                  <Button variant="ghost" className="text-white hover:bg-white/10 hover:text-white" disabled={pending} onClick={() => changeStatus('ended')}>
                    <Square aria-hidden /> End session
                  </Button>
                )}
              </div>
              {track && <p className="text-sm text-white/60">Everyone hears “{track.title}” in sync — joining late picks up where the group is.</p>}
            </>
          )}

          {status === 'ended' && <p className="font-display text-2xl">Thank you for sitting together</p>}
          {status === 'cancelled' && <p className="font-display text-2xl">This session was cancelled</p>}
        </div>
      </section>

      <aside className="space-y-6">
        <div>
          <h2 className="mb-3 text-lg font-semibold">In the room</h2>
          <ul className="flex flex-wrap gap-2">
            {people.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-3 text-sm">
                <UserAvatar name={p.name} src={p.avatar} className="size-7" />
                {p.id === me.id ? 'You' : p.name}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Shared intentions</h2>
          <p className="text-sm text-muted-foreground">Offer a word or a line to the group. These aren’t saved.</p>
          <form onSubmit={share} className="flex gap-2">
            <label htmlFor="intention-input" className="sr-only">
              Your intention
            </label>
            <Input id="intention-input" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={140} placeholder="e.g. Rest" />
            <Button type="submit" size="icon" className="size-11 shrink-0" aria-label="Share intention" disabled={!draft.trim()}>
              <Send />
            </Button>
          </form>
          <ul className="space-y-2" aria-live="polite">
            {intentions.map((i) => (
              <li key={i.id} className="animate-fade-up rounded-2xl bg-muted/60 px-4 py-2.5 text-sm">
                <span className="font-medium">{i.name}</span> <span className="text-muted-foreground">· {i.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function formatCountdown(ms: number) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
