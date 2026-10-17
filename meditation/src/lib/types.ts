import type { BreathPattern } from './breathing';

export type SessionType = 'meditation' | 'breathing';

export interface SessionRecord {
  id: string;
  type: SessionType;
  /** ISO timestamp of when the session began. */
  startedAt: string;
  /** Seconds actually practised. */
  durationSec: number;
  /** Whether the session ran to its planned end. */
  completed: boolean;
  /** Breathing pattern name, for breathing sessions. */
  pattern?: string;
  /** Optional one-line reflection. */
  note?: string;
}

export type ThemePreference = 'system' | 'light' | 'dark';

export type BellTone = 'bowl' | 'temple' | 'chime' | 'gong' | 'none';

export type BreathCue = 'none' | 'tone' | 'tick';

export type AmbientId = 'rain' | 'ocean' | 'brown' | 'pink' | 'drone';

export interface AmbientLayerState {
  on: boolean;
  /** 0–1 */
  volume: number;
}

export interface Settings {
  theme: ThemePreference;
  meditationMinutes: number;
  prepSeconds: number;
  startBell: BellTone;
  intervalBell: BellTone;
  /** 0 = no interval bells. */
  intervalMinutes: number;
  endBell: BellTone;
  /** 0–1 */
  bellVolume: number;
  confirmEnd: boolean;
  haptics: boolean;
  breathPatternId: string;
  customPattern: BreathPattern;
  breathCue: BreathCue;
  /** 0 = open-ended. */
  breathMinutes: number;
  /** 0–1 master level for all ambient layers. */
  ambientVolume: number;
  ambient: Record<AmbientId, AmbientLayerState>;
}
