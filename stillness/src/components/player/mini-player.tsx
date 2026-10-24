'use client';

import { ChevronUp, Loader2, Pause, Play, RotateCcw, X } from 'lucide-react';
import { Artwork } from '@/components/brand/artwork';
import { Button } from '@/components/ui/button';
import { cn, formatClock } from '@/lib/utils';
import { usePlayer } from './player-provider';

export function MiniPlayer() {
  const { track, status, currentTime, duration, toggle, play, setExpanded, close, expanded } = usePlayer();
  if (!track || expanded) return null;

  const progress = duration ? (currentTime / duration) * 100 : 0;
  const ended = status === 'ended';

  return (
    <div
      className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 px-3 pb-2 animate-fade-up md:bottom-4 md:left-64 md:px-6"
      role="region"
      aria-label="Now playing"
    >
      <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-navy text-white shadow-2xl shadow-navy/30">
        <div className="h-0.5 w-full bg-white/10" aria-hidden>
          <div className="h-full bg-gold transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex items-center gap-3 p-2 pr-3">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            aria-label={`Open player for ${track.title}`}
          >
            <Artwork palette={track.artwork} seed={track.slug} coverUrl={track.coverUrl} className="size-11 shrink-0 rounded-xl" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{track.title}</span>
              <span className="block truncate text-xs text-white/60">
                {track.instructorName} · {formatClock(currentTime)} / {formatClock(duration)}
              </span>
            </span>
          </button>
          <Button
            size="icon"
            variant="ghost"
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={() => setExpanded(true)}
            aria-label="Expand player"
          >
            <ChevronUp />
          </Button>
          <Button
            size="icon"
            className={cn('bg-white text-navy hover:bg-white/90')}
            onClick={ended ? play : toggle}
            aria-label={ended ? 'Play again' : status === 'playing' ? 'Pause' : 'Play'}
          >
            {status === 'loading' ? (
              <Loader2 className="animate-spin" />
            ) : ended ? (
              <RotateCcw />
            ) : status === 'playing' ? (
              <Pause className="fill-current" />
            ) : (
              <Play className="translate-x-px fill-current" />
            )}
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-white/70 hover:bg-white/10 hover:text-white"
            onClick={close}
            aria-label="Stop and close player"
          >
            <X />
          </Button>
        </div>
      </div>
    </div>
  );
}
