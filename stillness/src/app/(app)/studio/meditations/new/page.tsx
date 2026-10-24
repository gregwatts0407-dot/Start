import { PageHeader } from '@/components/page-header';
import { MeditationForm } from '@/components/studio/meditation-form';
import { getCategories } from '@/lib/data/catalogue';
import { requireRole } from '@/lib/data/session';

export const metadata = { title: 'New session' };

export default async function NewMeditationPage() {
  const viewer = await requireRole(['instructor', 'admin']);
  const categories = await getCategories();
  return (
    <div>
      <PageHeader title="New session" description="Drafts stay private until you publish them." />
      <MeditationForm userId={viewer.profile.id} categories={categories} />
    </div>
  );
}
