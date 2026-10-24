'use client';

import { setMeditationPublished, setProgramPublished } from '@/actions/studio';
import { PublishSwitch } from './row-actions';

export function MeditationPublishSwitch({ id, published, title }: { id: string; published: boolean; title: string }) {
  return <PublishSwitch id={id} published={published} label={title} action={setMeditationPublished} />;
}

export function ProgramPublishSwitch({ id, published, title }: { id: string; published: boolean; title: string }) {
  return <PublishSwitch id={id} published={published} label={title} action={setProgramPublished} />;
}
