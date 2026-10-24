'use client';

import * as React from 'react';
import Link from 'next/link';
import { Lock, Pause, Play } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { usePlayer, type PlayerTrack } from '@/components/player/player-provider';
import { offlineUrl } from '@/lib/offline';
import { cn } from '@/lib/utils';

interface PlayButtonProps extends Omit<ButtonProps, 'onClick'> {
  track: PlayerTrack | null;
  locked?: boolean;
  label?: string;
}

export function PlayButton({ track, locked, label = 'Begin', className, size = 'lg', ...props }: PlayButtonProps) {
  const player = usePlayer();
  const [offlineSrc, setOfflineSrc] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!track?.src) return;
    let url: string | null = null;
    void offlineUrl(track.meditationId)
      .then((u) => {
        url = u;
        setOfflineSrc(u);
      })
      .catch(() => undefined);
    return () => {
      // The player may still be using it; only revoke if it isn't.
      if (url && player.track?.src !== url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.meditationId, track?.src]);

  if (locked) {
    return (
      <Button asChild size={size} variant="gold" className={className} {...props}>
        <Link href="/pricing">
          <Lock aria-hidden /> Unlock with Premium
        </Link>
      </Button>
    );
  }

  if (!track) {
    return (
      <Button size={size} disabled className={className} {...props}>
        Audio coming soon
      </Button>
    );
  }

  const isCurrent = player.track?.meditationId === track.meditationId;
  const playing = isCurrent && (player.status === 'playing' || player.status === 'loading');

  return (
    <Button
      size={size}
      className={cn('min-w-36', className)}
      onClick={() => {
        if (playing) player.pause();
        else player.load(offlineSrc ? { ...track, src: offlineSrc } : track);
      }}
      aria-label={playing ? `Pause ${track.title}` : `${label}: ${track.title}`}
      {...props}
    >
      {playing ? <Pause className="fill-current" aria-hidden /> : <Play className="fill-current" aria-hidden />}
      {playing ? 'Pause' : isCurrent && player.status === 'paused' ? 'Resume' : label}
    </Button>
  );
}
