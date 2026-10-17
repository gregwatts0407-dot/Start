/**
 * Pure breathing-pattern sequencing. A pattern is four phases
 * (in, hold, out, hold); phases with zero length are skipped.
 */

export interface BreathPattern {
  id: string;
  name: string;
  description: string;
  inhale: number;
  holdIn: number;
  exhale: number;
  holdOut: number;
}

export type BreathPhaseKind = 'inhale' | 'holdIn' | 'exhale' | 'holdOut';

export interface BreathPhase {
  kind: BreathPhaseKind;
  /** Seconds. */
  duration: number;
}

export interface BreathState {
  phase: BreathPhaseKind;
  /** Index into getPhases(pattern). */
  phaseIndex: number;
  /** Zero-based count of completed cycles. */
  cycle: number;
  phaseElapsedMs: number;
  phaseRemainingMs: number;
  /** 0–1 progress through the current phase. */
  phaseProgress: number;
  /** 0 (empty) to 1 (full) — drives the circle size. */
  fullness: number;
}

export const CUSTOM_PATTERN_ID = 'custom';
export const MAX_PHASE_SEC = 20;

export const PRESET_PATTERNS: BreathPattern[] = [
  {
    id: 'box',
    name: 'Box',
    description: 'In 4, hold 4, out 4, hold 4. Steadying and focusing.',
    inhale: 4,
    holdIn: 4,
    exhale: 4,
    holdOut: 4,
  },
  {
    id: '478',
    name: '4-7-8',
    description: 'In 4, hold 7, out 8. A slow, relaxing breath for winding down.',
    inhale: 4,
    holdIn: 7,
    exhale: 8,
    holdOut: 0,
  },
  {
    id: 'coherent',
    name: 'Coherent',
    description: 'In 5.5, out 5.5. An even rhythm of about five breaths a minute.',
    inhale: 5.5,
    holdIn: 0,
    exhale: 5.5,
    holdOut: 0,
  },
];

export const DEFAULT_CUSTOM_PATTERN: BreathPattern = {
  id: CUSTOM_PATTERN_ID,
  name: 'Custom',
  description: 'Your own rhythm.',
  inhale: 4,
  holdIn: 2,
  exhale: 6,
  holdOut: 0,
};

const ORDER: BreathPhaseKind[] = ['inhale', 'holdIn', 'exhale', 'holdOut'];

export function getPhases(pattern: BreathPattern): BreathPhase[] {
  return ORDER.map((kind) => ({ kind, duration: pattern[kind] })).filter(
    (phase) => phase.duration > 0,
  );
}

export function cycleLengthMs(pattern: BreathPattern): number {
  return getPhases(pattern).reduce((sum, phase) => sum + phase.duration * 1000, 0);
}

/** A pattern is usable when it has a breath in and a breath out. */
export function isValidPattern(pattern: BreathPattern): boolean {
  const values = [pattern.inhale, pattern.holdIn, pattern.exhale, pattern.holdOut];
  return (
    values.every((v) => Number.isFinite(v) && v >= 0 && v <= MAX_PHASE_SEC) &&
    pattern.inhale > 0 &&
    pattern.exhale > 0
  );
}

/** Gentle ease so the circle starts and settles softly. */
export function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * Math.min(1, Math.max(0, t))) - 1) / 2;
}

export function getBreathState(elapsedMs: number, pattern: BreathPattern): BreathState {
  const phases = getPhases(pattern);
  const cycleMs = cycleLengthMs(pattern);
  if (phases.length === 0 || cycleMs <= 0) {
    throw new Error('Breathing pattern has no phases');
  }

  const elapsed = Math.max(0, elapsedMs);
  const cycle = Math.floor(elapsed / cycleMs);
  let intoCycle = elapsed - cycle * cycleMs;

  let phaseIndex = 0;
  for (; phaseIndex < phases.length - 1; phaseIndex++) {
    const lengthMs = phases[phaseIndex].duration * 1000;
    if (intoCycle < lengthMs) break;
    intoCycle -= lengthMs;
  }

  const phase = phases[phaseIndex];
  const lengthMs = phase.duration * 1000;
  const phaseElapsedMs = Math.min(intoCycle, lengthMs);
  const phaseProgress = phaseElapsedMs / lengthMs;

  return {
    phase: phase.kind,
    phaseIndex,
    cycle,
    phaseElapsedMs,
    phaseRemainingMs: lengthMs - phaseElapsedMs,
    phaseProgress,
    fullness: fullnessFor(phase.kind, phaseProgress),
  };
}

function fullnessFor(kind: BreathPhaseKind, progress: number): number {
  switch (kind) {
    case 'inhale':
      return easeInOutSine(progress);
    case 'holdIn':
      return 1;
    case 'exhale':
      return 1 - easeInOutSine(progress);
    case 'holdOut':
      return 0;
  }
}

export function phaseLabel(kind: BreathPhaseKind): string {
  switch (kind) {
    case 'inhale':
      return 'Breathe in';
    case 'exhale':
      return 'Breathe out';
    case 'holdIn':
    case 'holdOut':
      return 'Hold';
  }
}

/** True when the state has moved to a different phase (or a new cycle). */
export function isNewPhase(prev: BreathState | null, next: BreathState): boolean {
  return prev === null || prev.phaseIndex !== next.phaseIndex || prev.cycle !== next.cycle;
}

export function describePattern(pattern: BreathPattern): string {
  const fmt = (n: number) => String(Number(n.toFixed(1)));
  return getPhases(pattern)
    .map((p) => fmt(p.duration))
    .join('-');
}
