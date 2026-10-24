import { PageHeader } from '@/components/page-header';
import { ProgramCard } from '@/components/program-card';
import { EmptyState } from '@/components/empty-state';
import { getEnrollments, getPlays, getProgramItems, listPrograms } from '@/lib/data/catalogue';
import { requireViewer } from '@/lib/data/session';
import { programProgress } from '@/lib/programs';

export const metadata = { title: 'Programs' };

export default async function ProgramsPage() {
  const viewer = await requireViewer();
  const [programs, enrollments, plays] = await Promise.all([
    listPrograms(),
    getEnrollments(viewer.profile.id),
    getPlays(viewer.profile.id),
  ]);
  const items = await getProgramItems(enrollments.map((e) => e.program_id));
  const enrollment = new Map(enrollments.map((e) => [e.program_id, e]));

  return (
    <div>
      <PageHeader
        eyebrow="Programs"
        title="Guided journeys"
        description="Multi-day courses that build a skill step by step. Start one, and we’ll keep your place."
      />
      {programs.length ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {programs.map((program) => {
            const e = enrollment.get(program.id);
            const progress = e ? programProgress(items.get(program.id) ?? [], plays, e, program.unlock_mode).percent : undefined;
            return (
              <ProgramCard
                key={program.id}
                program={program}
                days={program.items[0]?.count ?? 0}
                instructorName={program.instructor?.display_name}
                progress={progress}
                locked={program.is_premium && !viewer.canAccessPremium}
              />
            );
          })}
        </div>
      ) : (
        <EmptyState title="Programs are on their way" description="Our instructors are preparing guided journeys. Check back soon." />
      )}
    </div>
  );
}
