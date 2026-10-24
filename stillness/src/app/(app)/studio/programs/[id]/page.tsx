import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { ProgramForm } from '@/components/studio/program-form';
import { getCategories } from '@/lib/data/catalogue';
import { requireRole } from '@/lib/data/session';
import { getStudioMeditations } from '@/lib/data/studio';
import { createClient } from '@/lib/supabase/server';
import type { Program, ProgramItem } from '@/lib/types';

export const metadata = { title: 'Edit program' };

export default async function EditProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const viewer = await requireRole(['instructor', 'admin']);
  const supabase = await createClient();
  const [{ data: program }, { data: items }, categories] = await Promise.all([
    supabase.from('programs').select('*').eq('id', id).maybeSingle<Program>(),
    supabase.from('program_items').select('*').eq('program_id', id).order('day_number'),
    getCategories(),
  ]);
  if (!program || (program.instructor_id !== viewer.profile.id && viewer.profile.role !== 'admin')) notFound();
  const meditations = await getStudioMeditations(program.instructor_id, viewer.profile.role);

  return (
    <div>
      <PageHeader title={`Edit “${program.title}”`} />
      <ProgramForm categories={categories} meditations={meditations} program={program} items={(items ?? []) as ProgramItem[]} />
    </div>
  );
}
