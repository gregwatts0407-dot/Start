import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Artwork } from '@/components/brand/artwork';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { Program } from '@/lib/types';
import { cn } from '@/lib/utils';

interface ProgramCardProps {
  program: Program;
  days: number;
  instructorName?: string;
  progress?: number;
  locked?: boolean;
  className?: string;
}

export function ProgramCard({ program, days, instructorName, progress, locked, className }: ProgramCardProps) {
  return (
    <Link
      href={`/programs/${program.slug}`}
      className={cn(
        'group block overflow-hidden rounded-3xl border bg-card transition-shadow hover:shadow-lg hover:shadow-navy/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <Artwork palette={program.artwork} seed={program.slug} coverUrl={program.cover_url} className="h-36 sm:h-44">
        <div className="absolute left-4 top-4 flex gap-2">
          <Badge variant="glass">{days} days</Badge>
          {program.is_premium && (
            <Badge variant="glass">
              {locked && <Lock aria-hidden />} Premium
            </Badge>
          )}
        </div>
      </Artwork>
      <div className="space-y-2 p-5">
        <h3 className="font-display text-xl font-semibold leading-tight">{program.title}</h3>
        {program.subtitle && <p className="text-sm text-muted-foreground">{program.subtitle}</p>}
        <p className="text-xs text-muted-foreground">
          {instructorName ? `With ${instructorName} · ` : ''}
          {program.unlock_mode === 'sequential' ? 'One day at a time' : 'Any order'}
        </p>
        {typeof progress === 'number' && (
          <div className="flex items-center gap-3 pt-1">
            <Progress value={progress} label={`${progress}% of ${program.title} complete`} />
            <span className="text-xs tabular-nums text-muted-foreground">{progress}%</span>
          </div>
        )}
      </div>
    </Link>
  );
}
