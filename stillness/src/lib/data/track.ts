import 'server-only';
import type { PlayerTrack } from '@/components/player/player-provider';
import type { MeditationWithInstructor, Play } from '@/lib/types';
import { getPlayableMedia } from './catalogue';

/** Everything the player needs, or null when the viewer can't play it. */
export async function buildTrack(
  meditation: MeditationWithInstructor,
  options: { programId?: string | null; resume?: Play | null } = {},
): Promise<PlayerTrack | null> {
  const media = await getPlayableMedia(meditation.id);
  if (!media || (!media.src && !media.script)) return null;
  const resume = options.resume;
  return {
    meditationId: meditation.id,
    slug: meditation.slug,
    title: meditation.title,
    instructorName: meditation.instructor?.display_name ?? 'Stillness',
    category: meditation.category,
    artwork: meditation.artwork,
    coverUrl: meditation.cover_url,
    durationSeconds: meditation.duration_seconds,
    src: media.src,
    script: media.script,
    programId: options.programId ?? resume?.program_id ?? null,
    resume:
      resume && !resume.completed
        ? { playId: resume.id, position: resume.position_seconds, listened: resume.listened_seconds }
        : null,
  };
}
