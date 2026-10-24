// Ambient soundscapes synthesised with the Web Audio API, so there are no
// audio files to host and every layer loops seamlessly under the voice.

export type AmbientKind = 'rain' | 'ocean' | 'white' | 'brown' | 'bowls';

export const AMBIENT_SOUNDS: { id: AmbientKind; label: string }[] = [
  { id: 'rain', label: 'Soft rain' },
  { id: 'ocean', label: 'Ocean waves' },
  { id: 'white', label: 'White noise' },
  { id: 'brown', label: 'Deep hum' },
  { id: 'bowls', label: 'Singing bowls' },
];

type NoiseColour = 'white' | 'pink' | 'brown';

interface Layer {
  output: GainNode;
  stop: () => void;
}

const FADE = 1.5;

export class AmbientEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private layer: Layer | null = null;
  private kind: AmbientKind | null = null;
  private buffers = new Map<NoiseColour, AudioBuffer>();
  private volume = 0.4;
  private active = false;

  /** Must first be called from a user gesture so the browser allows audio. */
  private ensure() {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
    this.bus = this.ctx.createGain();
    this.bus.gain.value = this.volume;
    this.bus.connect(this.master);
    return this.ctx;
  }

  unlock() {
    const ctx = this.ensure();
    if (ctx?.state === 'suspended') void ctx.resume();
  }

  get current() {
    return this.kind;
  }

  setKind(kind: AmbientKind | null) {
    if (kind === this.kind) return;
    this.kind = kind;
    const ctx = this.ensure();
    if (!ctx || !this.bus) return;
    const now = ctx.currentTime;

    if (this.layer) {
      const old = this.layer;
      old.output.gain.cancelScheduledValues(now);
      old.output.gain.setValueAtTime(old.output.gain.value, now);
      old.output.gain.linearRampToValueAtTime(0, now + FADE);
      window.setTimeout(() => old.stop(), FADE * 1000 + 100);
      this.layer = null;
    }

    if (!kind) return;
    const layer = this.build(ctx, kind);
    layer.output.gain.setValueAtTime(0, now);
    layer.output.gain.linearRampToValueAtTime(1, now + FADE);
    layer.output.connect(this.bus);
    this.layer = layer;
  }

  setVolume(volume: number) {
    this.volume = volume;
    if (this.ctx && this.bus) this.bus.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.1);
  }

  /** Fade the whole ambient bed in or out with playback. */
  setActive(active: boolean) {
    this.active = active;
    const ctx = this.active ? this.ensure() : this.ctx;
    if (!ctx || !this.master) return;
    if (active && ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(active ? 1 : 0, now + (active ? FADE : 0.6));
  }

  /** A soft singing-bowl strike to open and close guided sessions. */
  chime(volume = 0.5) {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = volume * 0.35;
    out.connect(ctx.destination);
    const base = 220;
    const partials: [number, number, number][] = [
      [1, 1, 7],
      [2.71, 0.5, 4.5],
      [5.13, 0.25, 2.6],
      [8.41, 0.12, 1.4],
    ];
    for (const [ratio, gain, decay] of partials) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = base * ratio;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(gain, now + 0.015);
      env.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      osc.connect(env).connect(out);
      osc.start(now);
      osc.stop(now + decay + 0.1);
    }
  }

  dispose() {
    this.layer?.stop();
    this.layer = null;
    void this.ctx?.close();
    this.ctx = null;
  }

  private noise(ctx: AudioContext, colour: NoiseColour) {
    const cached = this.buffers.get(colour);
    if (cached) return cached;
    const length = ctx.sampleRate * 8;
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        if (colour === 'white') {
          data[i] = white * 0.5;
        } else if (colour === 'pink') {
          // Paul Kellet's refined pink noise filter.
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
      // Cross-fade the loop point so the buffer repeats without a click.
      const fade = Math.floor(ctx.sampleRate * 0.05);
      for (let i = 0; i < fade; i++) {
        const t = i / fade;
        data[i] = data[i]! * t + data[length - fade + i]! * (1 - t);
      }
    }
    this.buffers.set(colour, buffer);
    return buffer;
  }

  private source(ctx: AudioContext, colour: NoiseColour) {
    const src = ctx.createBufferSource();
    src.buffer = this.noise(ctx, colour);
    src.loop = true;
    // Start at a random offset so repeated sessions don't sound identical.
    src.start(0, Math.random() * 8);
    return src;
  }

  private build(ctx: AudioContext, kind: AmbientKind): Layer {
    const output = ctx.createGain();
    const nodes: AudioScheduledSourceNode[] = [];

    if (kind === 'rain') {
      const src = this.source(ctx, 'pink');
      const hp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 400 });
      const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 6500 });
      const level = new GainNode(ctx, { gain: 0.9 });
      src.connect(hp).connect(lp).connect(level).connect(output);
      // A low bed under the hiss gives the rain some body.
      const bed = this.source(ctx, 'brown');
      const bedLp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 300 });
      const bedLevel = new GainNode(ctx, { gain: 0.35 });
      bed.connect(bedLp).connect(bedLevel).connect(output);
      nodes.push(src, bed);
    } else if (kind === 'ocean') {
      const src = this.source(ctx, 'brown');
      const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 1100 });
      const swell = new GainNode(ctx, { gain: 0.55 });
      const lfo = new OscillatorNode(ctx, { frequency: 0.075 });
      const depth = new GainNode(ctx, { gain: 0.45 });
      lfo.connect(depth).connect(swell.gain);
      const filterLfo = new GainNode(ctx, { gain: 500 });
      lfo.connect(filterLfo).connect(lp.frequency);
      src.connect(lp).connect(swell).connect(output);
      lfo.start();
      nodes.push(src, lfo);
    } else if (kind === 'white') {
      const src = this.source(ctx, 'white');
      const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 8000 });
      const level = new GainNode(ctx, { gain: 0.35 });
      src.connect(lp).connect(level).connect(output);
      nodes.push(src);
    } else if (kind === 'brown') {
      const src = this.source(ctx, 'brown');
      const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 420 });
      const level = new GainNode(ctx, { gain: 0.9 });
      src.connect(lp).connect(level).connect(output);
      nodes.push(src);
    } else {
      // Slightly detuned sine pairs beat slowly against each other.
      const level = new GainNode(ctx, { gain: 0.08 });
      const lfo = new OscillatorNode(ctx, { frequency: 0.05 });
      const depth = new GainNode(ctx, { gain: 0.03 });
      lfo.connect(depth).connect(level.gain);
      for (const freq of [130.8, 131.3, 196, 196.6, 261.6, 329.6]) {
        const osc = new OscillatorNode(ctx, { type: 'sine', frequency: freq });
        osc.connect(level);
        osc.start();
        nodes.push(osc);
      }
      level.connect(output);
      lfo.start();
      nodes.push(lfo);
    }

    return {
      output,
      stop: () => {
        for (const node of nodes) {
          try {
            node.stop();
          } catch {
            // already stopped
          }
        }
        output.disconnect();
      },
    };
  }
}
