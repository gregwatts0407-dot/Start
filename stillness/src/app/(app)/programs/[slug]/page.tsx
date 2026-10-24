import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Check, Lock, Play } from 'lucide-react';
import { Artwork } from '@/components/brand/artwork';
import { ProgramActions } from '@/components/program-actions';
import { UserAvatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { getPlays, getProgramBySlug, getEnrollments } from '@/lib/data/catalogue';
import { requireViewer } from '@/lib/data/session';
import { programProgress } from '@/lib/programs';
import { cn, formatMinutes } from '@/lib/utils';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props) {
  const result = await getProgramBySlug((await params).slug);
  return { title: result?.program.title ?? 'Program' };
}

export default async function ProgramPage({ params }: Props) {
  const { slug } = await params;
  const viewer = await requireViewer();
  const result = await getProgramBySlug(slug);
  if (!result) notFound();
  const { program, items } = result;

  const [plays, enrollments] = await Promise.all([getPlays(viewer.profile.id), getEnrollments(viewer.profile.id)]);
  const enrollment = enrollments.find((e) => e.program_id === program.id) ?? null;
  const progress = programProgress(items, plays, enrollment, program.unlock_mode);
  const locked = program.is_premium && !viewer.canAccessPremium;
  const totalSeconds = items.reduce((sum, item) => sum + item.meditation.duration_seconds, 0);
  const dayHref = (meditationSlug: string) => `/meditations/${meditationSlug}?program=${program.id}`;

  return (
    <div className="space-y-10">
      <Artwork palette={program.artwork} seed={program.slug} coverUrl={program.cover_url} className="-mx-4 -mt-6 sm:mx-0 sm:mt-0 sm:rounded-[2rem]">
        <div className="relative flex min-h-[18rem] flex-col justify-end bg-gradient-to-t from-navy-deep/80 via-navy-deep/30 to-transparent p-6 text-white sm:min-h-[22rem] sm:p-10">
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge variant="glass">{items.length} days</Badge>
            <Badge variant="glass">{formatMinutes(totalSeconds)} total</Badge>
            <Badge variant="glass">{program.unlock_mode === 'sequential' ? 'Unlocks day by day' : 'Any order'}</Badge>
            {program.is_premium && <Badge variant="glass">Premium</Badge>}
          </div>
          <h1 className="max-w-2xl text-3xl font-semibold leading-tight sm:text-5xl">{program.title}</h1>
          {program.subtitle && <p className="mt-2 max-w-xl text-white/80 sm:text-lg">{program.subtitle}</p>}
        </div>
      </Artwork>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <ProgramActions
              programId={program.id}
              slug={program.slug}
              enrolled={Boolean(enrollment)}
              locked={locked}
              nextHref={progress.next ? dayHref(progress.next.meditation.slug) : null}
              nextLabel={progress.next ? `Continue: Day ${progress.next.day_number}` : 'Completed'}
            />
            {enrollment && (
              <div className="flex min-w-48 items-center gap-3">
                <Progress value={progress.percent} label={`${progress.completedCount} of ${progress.days.length} days complete`} />
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {progress.completedCount}/{progress.days.length}
                </span>
              </div>
            )}
          </div>

          {enrollment && progress.finished && (
            <Card className="border-gold/30 bg-gold/10 p-5">
              <p className="font-display text-lg font-medium">You completed {program.title}.</p>
              <p className="text-sm text-muted-foreground">That’s real commitment. Revisit any day, or start again for a refresher.</p>
            </Card>
          )}

          <ol className="space-y-3" aria-label="Program days">
            {progress.days.map((day) => {
              const canOpen = !locked && (!enrollment ? day.day_number === 1 || program.unlock_mode === 'free' : day.unlocked);
              const isNext = enrollment && progress.next?.id === day.id;
              const content = (
                <>
                  <span
                    className={cn(
                      'flex size-11 shrink-0 items-center justify-center rounded-full border text-sm font-semibold tabular-nums',
                      day.completed && 'border-sage bg-sage text-sage-foreground',
                      isNext && 'border-gold bg-gold/15',
                    )}
                    aria-hidden
                  >
                    {day.completed ? <Check className="size-4" /> : canOpen ? day.day_number : <Lock className="size-3.5 text-muted-foreground" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs uppercase tracking-[0.16em] text-muted-foreground">Day {day.day_number}</span>
                    <span className="block font-medium">{day.title ?? day.meditation.title}</span>
                    <span className="block text-sm text-muted-foreground">
                      {day.title ? `${day.meditation.title} · ` : ''}
                      {formatMinutes(day.meditation.duration_seconds)}
                    </span>
                    {day.note && <span className="mt-1 block text-sm text-muted-foreground/90">{day.note}</span>}
                  </span>
                  {canOpen && <Play className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                </>
              );
              const label = `Day ${day.day_number}: ${day.title ?? day.meditation.title}${day.completed ? ', completed' : canOpen ? '' : ', locked'}`;
              return (
                <li key={day.id}>
                  {canOpen ? (
                    <Link
                      href={dayHref(day.meditation.slug)}
                      aria-label={label}
                      className={cn(
                        'flex items-start gap-4 rounded-3xl border bg-card p-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        isNext && 'border-gold/50',
                      )}
                    >
                      {content}
                    </Link>
                  ) : (
                    <div aria-label={label} className="flex items-start gap-4 rounded-3xl border border-dashed p-4 opacity-70">
                      {content}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        <aside className="space-y-6">
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">About this program</h2>
            <p className="whitespace-pre-line leading-relaxed text-muted-foreground">{program.description}</p>
          </div>
          {program.instructor && (
            <Card className="space-y-3 p-5">
              <Link href={`/profile/${program.instructor.id}`} className="flex items-center gap-3 hover:underline">
                <UserAvatar name={program.instructor.display_name} src={program.instructor.avatar_url} className="size-12" />
                <span>
                  <span className="block text-xs uppercase tracking-[0.16em] text-muted-foreground">Your guide</span>
                  <span className="font-display text-lg font-medium">{program.instructor.display_name}</span>
                </span>
              </Link>
              {program.instructor.bio && <p className="line-clamp-4 text-sm text-muted-foreground">{program.instructor.bio}</p>}
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
