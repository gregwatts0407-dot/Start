import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { MeditationForm } from '@/components/studio/meditation-form';
import { getCategories } from '@/lib/data/catalogue';
import { requireRole } from '@/lib/data/session';
import { createClient } from '@/lib/supabase/server';
import type { Meditation, MeditationMedia } from '@/lib/types';

export const metadata = { title: 'Edit session' };

export default async function EditMeditationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const viewer = await requireRole(['instructor', 'admin']);
  const supabase = await createClient();
  const [{ data: meditation }, { data: media }, categories] = await Promise.all([
    supabase.from('meditations').select('*').eq('id', id).maybeSingle<Meditation>(),
    supabase.from('meditation_media').select('*').eq('meditation_id', id).maybeSingle<MeditationMedia>(),
    getCategories(),
  ]);
  if (!meditation || (meditation.instructor_id !== viewer.profile.id && viewer.profile.role !== 'admin')) notFound();

  return (
    <div>
      <PageHeader title={`Edit “${meditation.title}”`} />
      <MeditationForm userId={meditation.instructor_id} categories={categories} meditation={meditation} media={media} />
    </div>
  );
}
