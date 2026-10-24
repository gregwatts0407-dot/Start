'use client';

import * as React from 'react';
import { MeditationRow } from '@/components/meditation-card';
import { EmptyState } from '@/components/empty-state';
import { listSavedOffline, offlineSupported } from '@/lib/offline';
import type { MeditationWithInstructor } from '@/lib/types';

export function OfflineLibrary({ meditations }: { meditations: MeditationWithInstructor[] }) {
  const [ids, setIds] = React.useState<string[] | null>(null);
  React.useEffect(() => {
    void listSavedOffline().then(setIds).catch(() => setIds([]));
  }, []);

  if (ids === null) return null;
  const saved = meditations.filter((m) => ids.includes(m.id));
  if (!offlineSupported() || saved.length === 0) {
    return (
      <EmptyState
        title="Nothing saved for offline yet"
        description="Premium members can save recorded sessions from their page to listen without a connection."
      />
    );
  }
  return (
    <div className="divide-y rounded-3xl border bg-card p-2">
      {saved.map((m) => (
        <MeditationRow key={m.id} meditation={m} />
      ))}
    </div>
  );
}
