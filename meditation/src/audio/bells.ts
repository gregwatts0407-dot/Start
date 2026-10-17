import type { BellTone } from '../lib/types';

/**
 * Bells are additive synthesis: a handful of sine partials at inharmonic
 * ratios, each with its own decay, plus a pair of slightly detuned partials
 * that "beat" against each other like a real singing bowl.
 */

interface Partial {
  ratio: number;
  gain: number;
  /** Seconds for the partial to fall to ~1/1000. */
  decay: number;
}

interface BellVoice {
  label: string;
  fundamental: number;
  partials: Partial[];
  /** Hz of beating applied to the strongest partials. */
  beat: number;
  attack: number;
}

export const BELL_VOICES: Record<Exclude<BellTone, 'none'>, BellVoice> = {
  bowl: {
    label: 'Singing bowl',
    fundamental: 220,
    beat: 1.6,
    attack: 0.012,
    partials: [
      { ratio: 1, gain: 0.55, decay: 9 },
      { ratio: 2.71, gain: 0.3, decay: 6.5 },
      { ratio: 5.15, gain: 0.12, decay: 4 },
      { ratio: 8.43, gain: 0.05, decay: 2.5 },
    ],
  },
  temple: {
    label: 'Temple bell',
    fundamental: 131,
    beat: 0.8,
    attack: 0.006,
    partials: [
      { ratio: 1, gain: 0.5, decay: 10 },
      { ratio: 2.0, gain: 0.28, decay: 7 },
      { ratio: 2.42, gain: 0.22, decay: 6 },
      { ratio: 3.0, gain: 0.14, decay: 4.5 },
      { ratio: 4.18, gain: 0.08, decay: 3 },
      { ratio: 5.43, gain: 0.05, decay: 2 },
    ],
  },
  chime: {
    label: 'Bright chime',
    fundamental: 784,
    beat: 2.4,
    attack: 0.003,
    partials: [
      { ratio: 1, gain: 0.5, decay: 4 },
      { ratio: 2.76, gain: 0.22, decay: 2.5 },
      { ratio: 5.4, gain: 0.1, decay: 1.4 },
    ],
  },
  gong: {
    label: 'Soft gong',
    fundamental: 98,
    beat: 0.5,
    attack: 0.08,
    partials: [
      { ratio: 1, gain: 0.5, decay: 11 },
      { ratio: 1.52, gain: 0.25, decay: 8 },
      { ratio: 2.31, gain: 0.18, decay: 6 },
      { ratio: 3.17, gain: 0.1, decay: 4 },
      { ratio: 4.6, gain: 0.05, decay: 3 },
    ],
  },
};

export const BELL_OPTIONS: { value: BellTone; label: string }[] = [
  { value: 'bowl', label: BELL_VOICES.bowl.label },
  { value: 'temple', label: BELL_VOICES.temple.label },
  { value: 'chime', label: BELL_VOICES.chime.label },
  { value: 'gong', label: BELL_VOICES.gong.label },
  { value: 'none', label: 'No bell' },
];

/** Strikes a bell at `when` (context time) into `output`. Returns its length in seconds. */
export function strikeBell(
  ctx: BaseAudioContext,
  output: AudioNode,
  tone: Exclude<BellTone, 'none'>,
  when: number,
  level = 1,
): number {
  const voice = BELL_VOICES[tone];
  const strike = ctx.createGain();
  strike.gain.value = level * 0.5;
  strike.connect(output);

  let longest = 0;
  voice.partials.forEach((partial, index) => {
    const freq = voice.fundamental * partial.ratio;
    // The two strongest partials get a detuned twin for a gentle shimmer.
    const twins = index < 2 ? [0, voice.beat] : [0];
    for (const detune of twins) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq + detune;
      const env = ctx.createGain();
      const peak = partial.gain / twins.length;
      env.gain.setValueAtTime(0, when);
      env.gain.linearRampToValueAtTime(peak, when + voice.attack);
      // setTargetAtTime reaches ~0.1% after ~6.9 time constants.
      env.gain.setTargetAtTime(0, when + voice.attack, partial.decay / 6.9);
      osc.connect(env).connect(strike);
      osc.start(when);
      osc.stop(when + partial.decay + 0.5);
      longest = Math.max(longest, partial.decay);
    }
  });

  // A soft felt "thump" at the strike for a little realism.
  const thump = ctx.createOscillator();
  thump.type = 'triangle';
  thump.frequency.setValueAtTime(voice.fundamental * 0.5, when);
  const thumpEnv = ctx.createGain();
  thumpEnv.gain.setValueAtTime(0.0001, when);
  thumpEnv.gain.exponentialRampToValueAtTime(0.08, when + 0.005);
  thumpEnv.gain.exponentialRampToValueAtTime(0.0001, when + 0.12);
  thump.connect(thumpEnv).connect(strike);
  thump.start(when);
  thump.stop(when + 0.15);

  return longest;
}
