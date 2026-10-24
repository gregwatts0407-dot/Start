import { PageHeader } from '@/components/page-header';
import { ProgramForm } from '@/components/studio/program-form';
import { getCategories } from '@/lib/data/catalogue';
import { requireRole } from '@/lib/data/session';
import { getStudioMeditations } from '@/lib/data/studio';

export const metadata = { title: 'New program' };

export default async function NewProgramPage() {
  const viewer = await requireRole(['instructor', 'admin']);
  const [categories, meditations] = await Promise.all([getCategories(), getStudioMeditations(viewer.profile.id, viewer.profile.role)]);
  return (
    <div>
      <PageHeader title="New program" />
      <ProgramForm categories={categories} meditations={meditations} />
    </div>
  );
}
