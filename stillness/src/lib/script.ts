import type { ScriptCue } from './types';

// Guidance scripts are written one cue per line as "m:ss Text to speak".
// For example:
//   0:02 Welcome. Let's begin.
//   1:30 Notice the breath.

export function parseScript(text: string): { cues: ScriptCue[]; errors: number[] } {
  const cues: ScriptCue[] = [];
  const errors: number[] = [];
  text.split('\n').forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const match = /^(?:(\d+):)?(\d{1,2}):(\d{2})\s+(.+)$/.exec(line);
    if (!match) {
      errors.push(index + 1);
      return;
    }
    const [, h, m, s, body] = match;
    const at = Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s);
    cues.push({ at, text: body!.trim().slice(0, 600) });
  });
  cues.sort((a, b) => a.at - b.at);
  return { cues, errors };
}

export function formatScript(cues: ScriptCue[] | null | undefined) {
  if (!cues?.length) return '';
  return cues
    .map((cue) => {
      const h = Math.floor(cue.at / 3600);
      const m = Math.floor((cue.at % 3600) / 60);
      const s = String(cue.at % 60).padStart(2, '0');
      return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${s} ${cue.text}`;
    })
    .join('\n');
}
