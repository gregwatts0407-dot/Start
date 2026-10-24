'use client';

import { Play } from 'lucide-react';
import { Artwork } from '@/components/brand/artwork';
import { usePlayer, type PlayerTrack } from '@/components/player/player-provider';
import { Progress } from '@/components/ui/progress';
import { formatClock } from '@/lib/utils';

export function ContinueCard({ track, percent }: { track: PlayerTrack; percent: number }) {
  const player = usePlayer();
  const remaining = track.durationSeconds - (track.resume?.position ?? 0);
  return (
    <button
      type="button"
      onClick={() => player.load(track)}
      className="group flex w-full items-center gap-4 rounded-3xl border bg-card p-3 pr-5 text-left transition-shadow hover:shadow-md hover:shadow-navy/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Resume ${track.title}, ${formatClock(remaining)} left`}
    >
      <Artwork palette={track.artwork} seed={track.slug} coverUrl={track.coverUrl} className="size-16 shrink-0 rounded-2xl">
        <span className="absolute inset-0 flex items-center justify-center bg-navy/20 opacity-0 transition-opacity group-hover:opacity-100">
          <Play className="size-5 fill-white text-white" aria-hidden />
        </span>
      </Artwork>
      <span className="min-w-0 flex-1 space-y-2">
        <span className="block truncate font-medium">{track.title}</span>
        <Progress value={percent} label={`${percent}% listened`} tone="gold" />
        <span className="block text-xs text-muted-foreground">
          {track.instructorName} · {formatClock(remaining)} left
        </span>
      </span>
    </button>
  );
}
