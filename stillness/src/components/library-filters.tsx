'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DIFFICULTIES, DURATION_FILTERS } from '@/lib/constants';
import type { Category, ProfileCard } from '@/lib/types';
import { cn } from '@/lib/utils';

interface LibraryFiltersProps {
  categories: Category[];
  voices: string[];
  instructors: ProfileCard[];
}

export function LibraryFilters({ categories, voices, instructors }: LibraryFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = React.useState(params.get('q') ?? '');
  const [, startTransition] = React.useTransition();

  const update = React.useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      next.delete('view');
      startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
    },
    [params, pathname, router],
  );

  // Debounce typing into the search box.
  React.useEffect(() => {
    if (query === (params.get('q') ?? '')) return;
    const id = window.setTimeout(() => update({ q: query.trim() || null }), 300);
    return () => window.clearTimeout(id);
  }, [params, query, update]);

  const category = params.get('category');
  const active = ['category', 'duration', 'difficulty', 'voice', 'instructor', 'q'].some((k) => params.get(k));

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sessions, feelings, teachers…"
          aria-label="Search the library"
          className="h-12 rounded-full pl-11"
        />
      </div>

      <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Category">
        <Chip active={!category} onClick={() => update({ category: null })}>
          All
        </Chip>
        {categories.map((c) => (
          <Chip key={c.slug} active={category === c.slug} onClick={() => update({ category: category === c.slug ? null : c.slug })}>
            {c.name}
          </Chip>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Select aria-label="Duration" value={params.get('duration') ?? ''} onChange={(e) => update({ duration: e.target.value || null })}>
          <option value="">Any length</option>
          {DURATION_FILTERS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </Select>
        <Select aria-label="Difficulty" value={params.get('difficulty') ?? ''} onChange={(e) => update({ difficulty: e.target.value || null })}>
          <option value="">Any level</option>
          {DIFFICULTIES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </Select>
        <Select aria-label="Voice" value={params.get('voice') ?? ''} onChange={(e) => update({ voice: e.target.value || null })}>
          <option value="">Any voice</option>
          {voices.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </Select>
        <Select aria-label="Instructor" value={params.get('instructor') ?? ''} onChange={(e) => update({ instructor: e.target.value || null })}>
          <option value="">Any teacher</option>
          {instructors.map((i) => (
            <option key={i.id} value={i.id}>
              {i.display_name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Sort"
          value={params.get('sort') ?? ''}
          onChange={(e) => update({ sort: e.target.value || null })}
          className="col-span-2 sm:col-span-1"
        >
          <option value="">Newest</option>
          <option value="shortest">Shortest first</option>
          <option value="longest">Longest first</option>
          <option value="title">A–Z</option>
        </Select>
      </div>

      {active && (
        <button
          type="button"
          onClick={() => {
            setQuery('');
            startTransition(() => router.replace(pathname, { scroll: false }));
          }}
          className="inline-flex items-center gap-1 rounded-full text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" aria-hidden /> Clear filters
        </button>
      )}
    </div>
  );
}

function Chip({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 rounded-full border px-4 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}
