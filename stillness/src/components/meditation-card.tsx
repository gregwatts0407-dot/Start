import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Artwork, artworkIsDark } from '@/components/brand/artwork';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { MeditationWithInstructor } from '@/lib/types';
import { cn, formatMinutes } from '@/lib/utils';

interface MeditationCardProps {
  meditation: MeditationWithInstructor;
  locked?: boolean;
  reason?: string;
  progress?: number;
  categoryName?: string;
  className?: string;
}

export function MeditationCard({ meditation, locked, reason, progress, categoryName, className }: MeditationCardProps) {
  const dark = artworkIsDark(meditation.artwork) || Boolean(meditation.cover_url);
  return (
    <Link
      href={`/meditations/${meditation.slug}`}
      className={cn(
        'group block rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background',
        className,
      )}
    >
      <Artwork
        palette={meditation.artwork}
        seed={meditation.slug}
        coverUrl={meditation.cover_url}
        className="aspect-[4/3] rounded-3xl transition-transform duration-500 ease-out group-hover:scale-[1.015]"
      >
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <Badge variant={dark ? 'glass' : 'muted'} className={cn(!dark && 'bg-white/60 text-navy backdrop-blur')}>
            {formatMinutes(meditation.duration_seconds)}
          </Badge>
          {meditation.is_premium && (
            <Badge variant={dark ? 'glass' : 'muted'} className={cn(!dark && 'bg-white/60 text-navy backdrop-blur')}>
              {locked ? <Lock aria-hidden /> : null}
              Premium
            </Badge>
          )}
        </div>
        {typeof progress === 'number' && progress > 0 && (
          <div className="absolute inset-x-3 bottom-3">
            <Progress value={progress} label={`${progress}% listened`} className="bg-white/30" tone="gold" />
          </div>
        )}
      </Artwork>
      <div className="mt-3 space-y-0.5 px-1">
        {reason && <p className="text-xs font-medium text-sage">{reason}</p>}
        <h3 className="font-display text-[17px] font-medium leading-snug group-hover:underline group-hover:decoration-border group-hover:underline-offset-4">
          {meditation.title}
        </h3>
        <p className="text-sm text-muted-foreground">
          {meditation.instructor?.display_name ?? 'Stillness'}
          {categoryName ? ` · ${categoryName}` : ''}
        </p>
      </div>
    </Link>
  );
}

export function MeditationRow({
  meditation,
  locked,
  trailing,
  meta,
}: {
  meditation: MeditationWithInstructor;
  locked?: boolean;
  trailing?: React.ReactNode;
  meta?: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl p-2 transition-colors hover:bg-muted/60">
      <Link
        href={`/meditations/${meditation.slug}`}
        className="flex min-w-0 flex-1 items-center gap-4 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Artwork palette={meditation.artwork} seed={meditation.slug} coverUrl={meditation.cover_url} className="size-14 shrink-0 rounded-2xl" />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 font-medium">
            <span className="truncate">{meditation.title}</span>
            {locked && <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label="Premium" />}
          </span>
          <span className="block truncate text-sm text-muted-foreground">
            {meta ?? `${formatMinutes(meditation.duration_seconds)} · ${meditation.instructor?.display_name ?? 'Stillness'}`}
          </span>
        </span>
      </Link>
      {trailing}
    </div>
  );
}
