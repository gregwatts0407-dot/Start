import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Artwork } from '@/components/brand/artwork';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { ProgramRowMenu } from '@/components/studio/delete-meditation';
import { ProgramPublishSwitch } from '@/components/studio/publish-toggles';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { requireRole } from '@/lib/data/session';
import { createClient } from '@/lib/supabase/server';
import type { Program } from '@/lib/types';

export const metadata = { title: 'Programs' };

export default async function StudioProgramsPage() {
  const viewer = await requireRole(['instructor', 'admin']);
  const supabase = await createClient();
  let query = supabase.from('programs').select('*, items:program_items(count), enrollments:program_enrollments(count)').order('created_at', { ascending: false });
  if (viewer.profile.role !== 'admin') query = query.eq('instructor_id', viewer.profile.id);
  const { data } = await query;
  const programs = (data ?? []) as (Program & { items: { count: number }[]; enrollments: { count: number }[] })[];

  return (
    <div>
      <PageHeader
        title="Programs"
        description="Sequence sessions into multi-day journeys."
        actions={
          <Button asChild>
            <Link href="/studio/programs/new">
              <Plus aria-hidden /> New program
            </Link>
          </Button>
        }
      />
      {programs.length ? (
        <div className="space-y-3">
          {programs.map((p) => (
            <Card key={p.id} className="flex items-center gap-4 p-3 pr-4">
              <Artwork palette={p.artwork} seed={p.slug} className="size-14 shrink-0 rounded-2xl" />
              <div className="min-w-0 flex-1">
                <Link href={`/studio/programs/${p.id}`} className="font-medium hover:underline">
                  {p.title}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {p.items[0]?.count ?? 0} days · {p.enrollments[0]?.count ?? 0} enrolled
                  {p.is_premium && (
                    <Badge variant="gold" className="ml-2 py-0">
                      Premium
                    </Badge>
                  )}
                </p>
              </div>
              <ProgramPublishSwitch id={p.id} published={p.published} title={p.title} />
              <ProgramRowMenu id={p.id} title={p.title} />
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No programs yet"
          description="Programs guide people through a series of sessions, one day at a time."
          action={
            <Button asChild>
              <Link href="/studio/programs/new">Create a program</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
