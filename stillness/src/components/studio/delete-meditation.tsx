'use client';

import { deleteMeditation, deleteProgram } from '@/actions/studio';
import { RowMenu } from './row-actions';

export function MeditationRowMenu({ id, title }: { id: string; title: string }) {
  return <RowMenu editHref={`/studio/meditations/${id}`} label={title} onDelete={() => deleteMeditation(id)} />;
}

export function ProgramRowMenu({ id, title }: { id: string; title: string }) {
  return <RowMenu editHref={`/studio/programs/${id}`} label={title} onDelete={() => deleteProgram(id)} />;
}
