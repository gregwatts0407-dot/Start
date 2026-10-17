import type { AmbientId } from '../lib/types';

/**
 * Generated soundscapes. Each builder wires nodes into a gain that the
 * engine fades in and out, and returns a stop function.
 */

export interface AmbientLayer {
  output: GainNode;
  stop: () => void;
}

export const AMBIENT_INFO: Record<AmbientId, { label: string; description: string }> = {
  rain: { label: 'Rain', description: 'Soft, steady rainfall' },
  ocean: { label: 'Ocean swell', description: 'Slow waves rolling in' },
  brown: { label: 'Brown noise', description: 'Deep, warm rumble' },
  pink: { label: 'Pink noise', description: 'Balanced, gentle hush' },
  drone: { label: 'Soft drone', description: 'A low, warm hum' },
};

type NoiseColour = 'white' | 'pink' | 'brown';

const bufferCache = new WeakMap<BaseAudioContext, Map<NoiseColour, AudioBuffer>>();

/** Long, stereo noise buffers so the loop point is inaudible. */
function noiseBuffer(ctx: BaseAudioContext, colour: NoiseColour): AudioBuffer {
  let cache = bufferCache.get(ctx);
  if (!cache) {
    cache = new Map();
    bufferCache.set(ctx, cache);
  }
  const cached = cache.get(colour);
  if (cached) return cached;

  const seconds = 8;
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    // Paul Kellet's refined pink filter, and a leaky integrator for brown.
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (colour === 'white') {
        data[i] = white * 0.5;
      } else if (colour === 'pink') {
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      } else {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      }
    }
    // Crossfade the ends so the loop is seamless.
    const fade = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      data[i] = data[i] * t + data[length - fade + i] * (1 - t);
    }
  }
  cache.set(colour, buffer);
  return buffer;
}

function loop(ctx: BaseAudioContext, colour: NoiseColour): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, colour);
  source.loop = true;
  source.loopEnd = source.buffer.duration - 0.05;
  // Start each layer at a random offset so stacked layers don't phase.
  source.start(ctx.currentTime, Math.random() * (source.buffer.duration - 1));
  return source;
}

/** An LFO that sweeps `param` around `centre` by ±`depth`. */
function lfo(ctx: BaseAudioContext, param: AudioParam, rate: number, depth: number, centre: number) {
  param.value = centre;
  const osc = ctx.createOscillator();
  osc.frequency.value = rate;
  const amount = ctx.createGain();
  amount.gain.value = depth;
  osc.connect(amount).connect(param);
  osc.start();
  return osc;
}

function stopAll(nodes: AudioScheduledSourceNode[]) {
  return () => {
    for (const node of nodes) {
      try {
        node.stop();
      } catch {
        // Already stopped.
      }
    }
  };
}

function buildRain(ctx: BaseAudioContext): AmbientLayer {
  const output = ctx.createGain();

  // The bed: pink noise, band-limited to the "shhh" of distant rain.
  const bed = loop(ctx, 'pink');
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 300;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 6500;
  const bedGain = ctx.createGain();
  bedGain.gain.value = 0.7;
  bed.connect(hp).connect(lp).connect(bedGain).connect(output);

  // Patter: brighter white noise whose level flickers quickly.
  const patter = loop(ctx, 'white');
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 3200;
  bp.Q.value = 0.7;
  const patterGain = ctx.createGain();
  const flicker = lfo(ctx, patterGain.gain, 7.3, 0.06, 0.12);
  const drift = lfo(ctx, bp.frequency, 0.13, 900, 3200);
  patter.connect(bp).connect(patterGain).connect(output);

  return { output, stop: stopAll([bed, patter, flicker, drift]) };
}

function buildOcean(ctx: BaseAudioContext): AmbientLayer {
  const output = ctx.createGain();
  const source = loop(ctx, 'pink');
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.4;
  const swell = ctx.createGain();
  // One wave every ~9 seconds: the filter opens and the level rises together.
  const rate = 1 / 9;
  const filterLfo = lfo(ctx, lp.frequency, rate, 650, 900);
  const levelLfo = lfo(ctx, swell.gain, rate, 0.4, 0.55);
  const rumble = loop(ctx, 'brown');
  const rumbleGain = ctx.createGain();
  rumbleGain.gain.value = 0.35;
  source.connect(lp).connect(swell).connect(output);
  rumble.connect(rumbleGain).connect(output);
  return { output, stop: stopAll([source, rumble, filterLfo, levelLfo]) };
}

function buildNoise(ctx: BaseAudioContext, colour: 'pink' | 'brown'): AmbientLayer {
  const output = ctx.createGain();
  const source = loop(ctx, colour);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = colour === 'brown' ? 1200 : 9000;
  source.connect(lp).connect(output);
  return { output, stop: stopAll([source]) };
}

function buildDrone(ctx: BaseAudioContext): AmbientLayer {
  const output = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700;
  const bus = ctx.createGain();
  bus.gain.value = 0.18;
  bus.connect(lp).connect(output);

  // A2, E3, A3 and a quiet C#4: an open, consonant chord.
  const voices: [number, OscillatorType, number][] = [
    [110, 'sine', 1],
    [110.4, 'triangle', 0.5],
    [164.81, 'sine', 0.6],
    [220, 'sine', 0.45],
    [277.18, 'sine', 0.12],
  ];
  const nodes: AudioScheduledSourceNode[] = [];
  voices.forEach(([freq, type, level], i) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    nodes.push(lfo(ctx, g.gain, 0.05 + i * 0.023, level * 0.3, level));
    osc.connect(g).connect(bus);
    osc.start();
    nodes.push(osc);
  });
  nodes.push(lfo(ctx, lp.frequency, 0.04, 200, 700));
  return { output, stop: stopAll(nodes) };
}

export function buildAmbient(ctx: BaseAudioContext, id: AmbientId): AmbientLayer {
  switch (id) {
    case 'rain':
      return buildRain(ctx);
    case 'ocean':
      return buildOcean(ctx);
    case 'brown':
      return buildNoise(ctx, 'brown');
    case 'pink':
      return buildNoise(ctx, 'pink');
    case 'drone':
      return buildDrone(ctx);
  }
}
