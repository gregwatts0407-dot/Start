import { describe, expect, it } from 'vitest';
import {
  cycleLengthMs,
  describePattern,
  getBreathState,
  getPhases,
  isNewPhase,
  isValidPattern,
  phaseLabel,
  PRESET_PATTERNS,
  type BreathPattern,
} from './breathing';

const byId = (id: string) => PRESET_PATTERNS.find((p) => p.id === id)!;
const box = byId('box');
const fourSevenEight = byId('478');
const coherent = byId('coherent');

/** The phase kinds seen when sampling a pattern every `stepMs`. */
function sequence(pattern: BreathPattern, untilMs: number, stepMs = 100) {
  const kinds: string[] = [];
  let prev = null;
  for (let t = 0; t < untilMs; t += stepMs) {
    const state = getBreathState(t, pattern);
    if (isNewPhase(prev, state)) kinds.push(state.phase);
    prev = state;
  }
  return kinds;
}

describe('presets', () => {
  it('have the advertised timings', () => {
    expect(describePattern(box)).toBe('4-4-4-4');
    expect(describePattern(fourSevenEight)).toBe('4-7-8');
    expect(describePattern(coherent)).toBe('5.5-5.5');
  });

  it('are all valid', () => {
    for (const p of PRESET_PATTERNS) expect(isValidPattern(p)).toBe(true);
  });
});

describe('getPhases', () => {
  it('skips zero-length holds', () => {
    expect(getPhases(fourSevenEight).map((p) => p.kind)).toEqual(['inhale', 'holdIn', 'exhale']);
    expect(getPhases(coherent).map((p) => p.kind)).toEqual(['inhale', 'exhale']);
  });

  it('computes cycle length', () => {
    expect(cycleLengthMs(box)).toBe(16_000);
    expect(cycleLengthMs(fourSevenEight)).toBe(19_000);
    expect(cycleLengthMs(coherent)).toBe(11_000);
  });
});

describe('getBreathState', () => {
  it('walks box breathing in order: in, hold, out, hold', () => {
    expect(sequence(box, 32_000)).toEqual([
      'inhale', 'holdIn', 'exhale', 'holdOut',
      'inhale', 'holdIn', 'exhale', 'holdOut',
    ]);
  });

  it('walks 4-7-8 with no empty hold', () => {
    expect(sequence(fourSevenEight, 19_000 * 2)).toEqual([
      'inhale', 'holdIn', 'exhale', 'inhale', 'holdIn', 'exhale',
    ]);
  });

  it('changes phase exactly on the boundary', () => {
    expect(getBreathState(3_999, fourSevenEight).phase).toBe('inhale');
    expect(getBreathState(4_000, fourSevenEight).phase).toBe('holdIn');
    expect(getBreathState(11_000, fourSevenEight).phase).toBe('exhale');
    expect(getBreathState(19_000, fourSevenEight)).toMatchObject({ phase: 'inhale', cycle: 1 });
  });

  it('handles fractional phases (coherent 5.5 s)', () => {
    expect(getBreathState(5_499, coherent).phase).toBe('inhale');
    expect(getBreathState(5_500, coherent).phase).toBe('exhale');
    expect(getBreathState(11_000, coherent)).toMatchObject({ phase: 'inhale', cycle: 1 });
  });

  it('reports time remaining and progress within a phase', () => {
    const s = getBreathState(6_000, box); // 2 s into the first hold
    expect(s.phase).toBe('holdIn');
    expect(s.phaseElapsedMs).toBe(2_000);
    expect(s.phaseRemainingMs).toBe(2_000);
    expect(s.phaseProgress).toBeCloseTo(0.5);
  });

  it('drives fullness from empty to full and back', () => {
    expect(getBreathState(0, box).fullness).toBeCloseTo(0);
    expect(getBreathState(2_000, box).fullness).toBeCloseTo(0.5);
    expect(getBreathState(5_000, box).fullness).toBe(1);
    expect(getBreathState(10_000, box).fullness).toBeCloseTo(0.5);
    expect(getBreathState(13_000, box).fullness).toBe(0);
  });

  it('throws for a pattern with no phases', () => {
    const empty = { ...box, inhale: 0, holdIn: 0, exhale: 0, holdOut: 0 };
    expect(() => getBreathState(0, empty)).toThrow();
  });
});

describe('isNewPhase', () => {
  it('detects a repeat of the same phase in the next cycle', () => {
    // Coherent has only two phases; with coarse sampling we might jump
    // from one inhale straight to the next — that's still a new phase.
    const a = getBreathState(1_000, coherent);
    const b = getBreathState(12_000, coherent);
    expect(a.phaseIndex).toBe(b.phaseIndex);
    expect(isNewPhase(a, b)).toBe(true);
  });

  it('is false within the same phase', () => {
    expect(isNewPhase(getBreathState(100, box), getBreathState(900, box))).toBe(false);
  });
});

describe('validation and labels', () => {
  it('requires a breath in and out within limits', () => {
    expect(isValidPattern({ ...box, inhale: 0 })).toBe(false);
    expect(isValidPattern({ ...box, exhale: 0 })).toBe(false);
    expect(isValidPattern({ ...box, holdIn: -1 })).toBe(false);
    expect(isValidPattern({ ...box, holdIn: 21 })).toBe(false);
    expect(isValidPattern({ ...box, holdIn: Number.NaN })).toBe(false);
  });

  it('uses friendly cues', () => {
    expect(phaseLabel('inhale')).toBe('Breathe in');
    expect(phaseLabel('holdIn')).toBe('Hold');
    expect(phaseLabel('exhale')).toBe('Breathe out');
    expect(phaseLabel('holdOut')).toBe('Hold');
  });
});
