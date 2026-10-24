import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BarChart2, Clock, Mic, Tag } from 'lucide-react';
import { Artwork } from '@/components/brand/artwork';
import { FavouriteButton } from '@/components/favourite-button';
import { FollowButton } from '@/components/follow-button';
import { MeditationCard } from '@/components/meditation-card';
import { OfflineButton } from '@/components/offline-button';
import { PlayButton } from '@/components/play-button';
import { Section } from '@/components/section';
import { UserAvatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  getCategories,
  getFavouriteIds,
  getMeditationBySlug,
  getPlays,
  getRelatedMeditations,
} from '@/lib/data/catalogue';
import { getFollowing } from '@/lib/data/community';
import { requireViewer } from '@/lib/data/session';
import { buildTrack } from '@/lib/data/track';
import { DIFFICULTIES } from '@/lib/constants';
import { formatMinutes } from '@/lib/utils';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ program?: string }>;
}

export async function generateMetadata({ params }: Props) {
  const meditation = await getMeditationBySlug((await params).slug);
  return { title: meditation?.title ?? 'Session', description: meditation?.description.slice(0, 160) };
}

export default async function MeditationPage({ params, searchParams }: Props) {
  const [{ slug }, { program }] = await Promise.all([params, searchParams]);
  const viewer = await requireViewer();
  const meditation = await getMeditationBySlug(slug);
  if (!meditation) notFound();

  const programId = program && /^[0-9a-f-]{36}$/i.test(program) ? program : null;
  const [plays, favourites, following, related, categories] = await Promise.all([
    getPlays(viewer.profile.id, 365),
    getFavouriteIds(viewer.profile.id),
    getFollowing(viewer.profile.id),
    getRelatedMeditations(meditation),
    getCategories(),
  ]);

  const myPlays = plays.filter((p) => p.meditation_id === meditation.id);
  const unfinished = myPlays.find(
    (p) =>
      !p.completed &&
      p.position_seconds > 30 &&
      p.position_seconds < meditation.duration_seconds - 15 &&
      Date.now() - new Date(p.updated_at).getTime() < 14 * 86400_000,
  );
  const completions = myPlays.filter((p) => p.completed).length;
  const locked = meditation.is_premium && !viewer.canAccessPremium;
  const track = locked ? null : await buildTrack(meditation, { programId, resume: unfinished ?? null });
  const category = categories.find((c) => c.slug === meditation.category);
  const instructor = meditation.instructor;
  const difficulty = DIFFICULTIES.find((d) => d.value === meditation.difficulty)?.label;

  return (
    <article className="space-y-12">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:gap-12">
        <Artwork
          palette={meditation.artwork}
          seed={meditation.slug}
          coverUrl={meditation.cover_url}
          className="aspect-square w-full rounded-[2rem] shadow-xl shadow-navy/10 sm:aspect-[4/3] lg:aspect-square"
        />
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {category && (
                <Link href={`/library?category=${category.slug}`}>
                  <Badge variant="secondary" className="hover:bg-secondary/80">
                    {category.name}
                  </Badge>
                </Link>
              )}
              {meditation.is_premium && <Badge variant="gold">Premium</Badge>}
              {completions > 0 && <Badge variant="outline">Completed {completions === 1 ? 'once' : `${completions} times`}</Badge>}
            </div>
            <h1 className="text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl">{meditation.title}</h1>
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <Clock className="size-4" aria-hidden /> {formatMinutes(meditation.duration_seconds)}
              </li>
              {difficulty && (
                <li className="flex items-center gap-1.5">
                  <BarChart2 className="size-4" aria-hidden /> {difficulty}
                </li>
              )}
              {meditation.voice && (
                <li className="flex items-center gap-1.5">
                  <Mic className="size-4" aria-hidden /> {meditation.voice}
                </li>
              )}
            </ul>
          </div>

          <p className="whitespace-pre-line text-[17px] leading-relaxed text-muted-foreground">{meditation.description}</p>

          <div className="flex flex-wrap items-center gap-3">
            <PlayButton track={track} locked={locked} label={unfinished ? 'Resume' : 'Begin'} />
            <FavouriteButton meditationId={meditation.id} initial={favourites.has(meditation.id)} title={meditation.title} />
            {track?.src && <OfflineButton meditationId={meditation.id} src={track.src} allowed={viewer.isPremium} />}
          </div>
          {track?.script && !track.src && (
            <p className="text-xs text-muted-foreground">
              This session’s guidance is spoken by your device’s voice, with captions in the player.
            </p>
          )}

          {meditation.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Tag className="size-3.5 text-muted-foreground" aria-hidden />
              {meditation.tags.map((tag) => (
                <Link key={tag} href={`/library?q=${encodeURIComponent(tag)}`} className="text-sm text-muted-foreground hover:text-foreground hover:underline">
                  #{tag}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {instructor && (
        <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <Link href={`/profile/${instructor.id}`} className="flex flex-1 items-center gap-4 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <UserAvatar name={instructor.display_name} src={instructor.avatar_url} className="size-14" />
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Guided by</p>
              <p className="font-display text-lg font-medium">{instructor.display_name}</p>
            </div>
          </Link>
          {instructor.id !== viewer.profile.id && (
            <FollowButton profileId={instructor.id} initial={following.has(instructor.id)} name={instructor.display_name} />
          )}
        </Card>
      )}

      {related.length > 0 && (
        <Section title="You might also like">
          <div className="grid grid-cols-1 gap-x-5 gap-y-8 min-[440px]:grid-cols-2 lg:grid-cols-4">
            {related.map((m) => (
              <MeditationCard
                key={m.id}
                meditation={m}
                locked={m.is_premium && !viewer.canAccessPremium}
                categoryName={categories.find((c) => c.slug === m.category)?.name}
              />
            ))}
          </div>
        </Section>
      )}
    </article>
  );
}
