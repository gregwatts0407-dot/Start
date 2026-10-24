import Link from 'next/link';
import { Suspense } from 'react';
import { LibraryFilters } from '@/components/library-filters';
import { MeditationCard, MeditationRow } from '@/components/meditation-card';
import { OfflineLibrary } from '@/components/offline-library';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import {
  getCategories,
  getFavourites,
  getMeditationsByIds,
  getPlays,
  latestPlayPerMeditation,
  listMeditations,
  listVoices,
  type LibraryFilters as Filters,
} from '@/lib/data/catalogue';
import { getInstructors } from '@/lib/data/community';
import { requireViewer } from '@/lib/data/session';
import { cn, formatMinutes, relativeTime } from '@/lib/utils';

export const metadata = { title: 'Library' };

const VIEWS = [
  { value: 'all', label: 'Discover' },
  { value: 'favourites', label: 'Favourites' },
  { value: 'recent', label: 'Recently played' },
  { value: 'offline', label: 'Offline' },
];

type SearchParams = Filters & { view?: string };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const viewer = await requireViewer();
  const view = VIEWS.some((v) => v.value === params.view) ? params.view! : 'all';
  const [categories, voices, instructors] = await Promise.all([getCategories(), listVoices(), getInstructors()]);
  const categoryName = new Map(categories.map((c) => [c.slug, c.name]));
  const locked = (premium: boolean) => premium && !viewer.canAccessPremium;

  let content: React.ReactNode;
  if (view === 'favourites') {
    const favourites = await getFavourites(viewer.profile.id);
    content = favourites.length ? (
      <Grid>
        {favourites.map((m) => (
          <MeditationCard key={m.id} meditation={m} locked={locked(m.is_premium)} categoryName={categoryName.get(m.category)} />
        ))}
      </Grid>
    ) : (
      <EmptyState
        title="No favourites yet"
        description="Tap the heart on any session to keep it close."
        action={
          <Button asChild variant="outline">
            <Link href="/library">Browse the library</Link>
          </Button>
        }
      />
    );
  } else if (view === 'recent') {
    const recent = latestPlayPerMeditation(await getPlays(viewer.profile.id, 90)).slice(0, 30);
    const meditations = new Map((await getMeditationsByIds(recent.map((p) => p.meditation_id))).map((m) => [m.id, m]));
    content = recent.length ? (
      <div className="divide-y rounded-3xl border bg-card p-2">
        {recent.map((play) => {
          const m = meditations.get(play.meditation_id);
          if (!m) return null;
          return (
            <MeditationRow
              key={play.id}
              meditation={m}
              locked={locked(m.is_premium)}
              meta={`${formatMinutes(m.duration_seconds)} · ${play.completed ? 'Completed' : `${play.percent}% listened`} · ${relativeTime(play.updated_at)}`}
            />
          );
        })}
      </div>
    ) : (
      <EmptyState title="Nothing played yet" description="Sessions you listen to will appear here." />
    );
  } else if (view === 'offline') {
    content = <OfflineLibrary meditations={await listMeditations({}, 300)} />;
  } else {
    const results = await listMeditations(params);
    content = results.length ? (
      <>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {results.length} {results.length === 1 ? 'session' : 'sessions'}
        </p>
        <Grid>
          {results.map((m) => (
            <MeditationCard key={m.id} meditation={m} locked={locked(m.is_premium)} categoryName={categoryName.get(m.category)} />
          ))}
        </Grid>
      </>
    ) : (
      <EmptyState title="No sessions match" description="Try a different search, or clear some filters." />
    );
  }

  return (
    <div>
      <PageHeader eyebrow="Library" title="Find your practice" description="Guided sessions for sleep, stress, focus and everything in between." />

      <nav aria-label="Library views" className="scrollbar-none -mx-4 mb-6 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {VIEWS.map((v) => (
          <Link
            key={v.value}
            href={v.value === 'all' ? '/library' : `/library?view=${v.value}`}
            aria-current={view === v.value ? 'page' : undefined}
            className={cn(
              'shrink-0 rounded-full px-4 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              view === v.value ? 'bg-secondary font-medium text-secondary-foreground' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {view === 'all' && (
        <div className="mb-8">
          <Suspense>
            <LibraryFilters categories={categories} voices={voices} instructors={instructors} />
          </Suspense>
        </div>
      )}

      <div className="space-y-4">{content}</div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-x-5 gap-y-8 min-[440px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div>;
}
