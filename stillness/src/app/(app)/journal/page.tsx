import { JournalComposer } from '@/components/journal-composer';
import { JournalEntryCard } from '@/components/journal-entry-card';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { getEntriesByUser } from '@/lib/data/community';
import { requireViewer } from '@/lib/data/session';

export const metadata = { title: 'Journal' };

export default async function JournalPage() {
  const viewer = await requireViewer();
  const entries = await getEntriesByUser(viewer.profile.id, viewer.profile.id, 100);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader eyebrow="Journal" title="Reflections" description="Private by default. Share an entry with friends or the community whenever you like." />
      <JournalComposer defaultVisibility={viewer.prefs.default_visibility} />
      {entries.length ? (
        <div className="space-y-4">
          {entries.map((entry) => (
            <JournalEntryCard key={entry.id} entry={entry} viewerId={viewer.profile.id} showAuthor={false} />
          ))}
        </div>
      ) : (
        <EmptyState title="Your journal is empty" description="After each session you’ll be invited to reflect. Your words will gather here." />
      )}
    </div>
  );
}
