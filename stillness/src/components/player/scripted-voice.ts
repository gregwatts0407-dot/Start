import type { ScriptCue } from '@/lib/types';

// Plays a session that has a timed guidance script instead of a recording.
// A virtual clock advances in real time (scaled by playback speed) and each cue
// is spoken with the browser's speech synthesis as the clock passes it, so the
// player can treat it exactly like an audio element: play, pause, seek, rate.

const PREFERRED_VOICES = [
  /samantha/i,
  /serena/i,
  /karen/i,
  /moira/i,
  /google uk english female/i,
  /microsoft (aria|jenny|libby|sonia).*natural/i,
  /natural/i,
  /google us english/i,
];

let cachedVoice: SpeechSynthesisVoice | null | undefined;

function pickVoice() {
  if (cachedVoice !== undefined) return cachedVoice;
  const voices = window.speechSynthesis?.getVoices() ?? [];
  if (voices.length === 0) return null; // not loaded yet; try again next cue
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  cachedVoice =
    PREFERRED_VOICES.map((pattern) => english.find((v) => pattern.test(v.name))).find(Boolean) ??
    english.find((v) => v.localService) ??
    english[0] ??
    null;
  return cachedVoice;
}

export function speechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export class ScriptedVoice {
  private cues: ScriptCue[];
  private base = 0;
  private startedAt: number | null = null;
  private lastChecked = 0;
  private rate = 1;
  private volume = 1;

  constructor(
    cues: ScriptCue[],
    private duration: number,
    private onCaption: (text: string | null) => void,
  ) {
    this.cues = [...cues].sort((a, b) => a.at - b.at);
    if (speechSupported()) window.speechSynthesis.getVoices();
  }

  get playing() {
    return this.startedAt !== null;
  }

  get currentTime() {
    if (this.startedAt === null) return this.base;
    return Math.min(this.duration, this.base + ((performance.now() - this.startedAt) / 1000) * this.rate);
  }

  play() {
    if (this.startedAt !== null) return;
    this.startedAt = performance.now();
    this.lastChecked = Math.min(this.lastChecked, this.base);
    // Resuming exactly on a cue should still speak it.
    if (this.lastChecked === this.base) this.lastChecked = this.base - 0.001;
    this.tick();
  }

  pause() {
    this.base = this.currentTime;
    this.startedAt = null;
    this.stopSpeaking();
  }

  seek(seconds: number) {
    this.base = Math.max(0, Math.min(this.duration, seconds));
    if (this.startedAt !== null) this.startedAt = performance.now();
    this.lastChecked = this.base - 0.001;
    this.stopSpeaking();
    this.onCaption(null);
  }

  setRate(rate: number) {
    this.base = this.currentTime;
    if (this.startedAt !== null) this.startedAt = performance.now();
    this.rate = rate;
  }

  setVolume(volume: number) {
    this.volume = volume;
  }

  /** Advance the clock and speak any cue that was just reached. */
  tick() {
    const now = this.currentTime;
    if (this.startedAt === null) return now;
    const due = this.cues.filter((cue) => cue.at > this.lastChecked && cue.at <= now);
    this.lastChecked = now;
    // If several cues were skipped (e.g. a throttled background tab), only
    // speak the most recent one, and only if it's still fresh.
    const cue = due[due.length - 1];
    if (cue && now - cue.at < 4) this.speak(cue.text);
    return now;
  }

  destroy() {
    this.startedAt = null;
    this.stopSpeaking();
  }

  private speak(text: string) {
    this.onCaption(text);
    if (!speechSupported() || this.volume === 0) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = 'en-GB';
    }
    // Meditation guidance reads best slow and slightly low.
    utterance.rate = Math.max(0.6, Math.min(1.2, 0.86 * this.rate));
    utterance.pitch = 0.95;
    utterance.volume = this.volume;
    synth.speak(utterance);
  }

  private stopSpeaking() {
    if (speechSupported()) window.speechSynthesis.cancel();
  }
}
