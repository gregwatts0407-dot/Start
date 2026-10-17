import type { AmbientId, BellTone, BreathCue } from '../lib/types';
import type { BreathPhaseKind } from '../lib/breathing';
import { buildAmbient, type AmbientLayer } from './ambient';
import { strikeBell } from './bells';
import { AudioUnlocker, defaultContextFactory } from './unlock';

const FADE_SEC = 1.2;

/**
 * The single owner of Web Audio for the app. Signal path:
 *
 *   bells ─┐
 *   cues  ─┼─▶ compressor ─▶ destination
 *   ambient layers ─▶ ambient bus ─┘
 */
class AudioEngine {
  readonly unlocker = new AudioUnlocker(defaultContextFactory);
  private graph: {
    ctx: AudioContext;
    bells: GainNode;
    cues: GainNode;
    ambient: GainNode;
  } | null = null;
  private layers = new Map<AmbientId, AmbientLayer>();
  private desired = new Map<AmbientId, { on: boolean; volume: number }>();
  private ambientMaster = 0.6;

  install(): void {
    this.unlocker.install();
  }

  /** Returns a running graph, unlocking the context if needed. */
  private async ready() {
    const ctx = await this.unlocker.unlock();
    if (!ctx) return null;
    if (!this.graph || this.graph.ctx !== ctx) {
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.ratio.value = 6;
      limiter.connect(ctx.destination);
      const bells = ctx.createGain();
      const cues = ctx.createGain();
      const ambient = ctx.createGain();
      ambient.gain.value = this.ambientMaster;
      bells.connect(limiter);
      cues.connect(limiter);
      ambient.connect(limiter);
      this.graph = { ctx, bells, cues, ambient };
    }
    return this.graph;
  }

  /** Call from a tap handler to make sure audio will be allowed. */
  prime(): void {
    void this.ready();
  }

  async playBell(tone: BellTone, volume: number, strikes = 1): Promise<void> {
    if (tone === 'none' || volume <= 0) return;
    const graph = await this.ready();
    if (!graph) return;
    const start = graph.ctx.currentTime + 0.05;
    for (let i = 0; i < strikes; i++) {
      strikeBell(graph.ctx, graph.bells, tone, start + i * 2.6, volume * (i === 0 ? 1 : 0.85));
    }
  }

  async playCue(cue: BreathCue, phase: BreathPhaseKind, volume: number): Promise<void> {
    if (cue === 'none' || volume <= 0) return;
    const graph = await this.ready();
    if (!graph) return;
    const { ctx } = graph;
    const now = ctx.currentTime + 0.01;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    if (cue === 'tick') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(phase === 'inhale' ? 1400 : 1100, now);
      env.gain.setValueAtTime(0.0001, now);
      env.gain.exponentialRampToValueAtTime(0.25 * volume, now + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
      osc.connect(env).connect(graph.cues);
      osc.start(now);
      osc.stop(now + 0.08);
      return;
    }

    // Soft tone: rising for in, falling for out, steady for holds.
    const pitch: Record<BreathPhaseKind, [number, number]> = {
      inhale: [392, 440],
      holdIn: [440, 440],
      exhale: [392, 330],
      holdOut: [330, 330],
    };
    const [from, to] = pitch[phase];
    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.linearRampToValueAtTime(to, now + 0.6);
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.22 * volume, now + 0.08);
    env.gain.setTargetAtTime(0, now + 0.15, 0.25);
    osc.connect(env).connect(graph.cues);
    osc.start(now);
    osc.stop(now + 1.8);
  }

  async setAmbientMaster(volume: number): Promise<void> {
    this.ambientMaster = volume;
    if (!this.graph) return;
    const { ctx, ambient } = this.graph;
    ambient.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
  }

  /** Turns a layer on/off or changes its level, fading smoothly. */
  async setLayer(id: AmbientId, on: boolean, volume: number): Promise<void> {
    this.desired.set(id, { on, volume });
    if (on && !(await this.ready())) return;
    this.applyLayer(id);
  }

  /** Brings a layer in line with the latest request (requests may overlap while unlocking). */
  private applyLayer(id: AmbientId): void {
    const graph = this.graph;
    const want = this.desired.get(id);
    if (!graph || !want) return;
    const { ctx } = graph;
    const existing = this.layers.get(id);

    if (!want.on) {
      if (!existing) return;
      this.layers.delete(id);
      const gain = existing.output.gain;
      gain.cancelScheduledValues(ctx.currentTime);
      gain.setValueAtTime(gain.value, ctx.currentTime);
      gain.linearRampToValueAtTime(0, ctx.currentTime + FADE_SEC);
      window.setTimeout(() => {
        existing.stop();
        existing.output.disconnect();
      }, FADE_SEC * 1000 + 100);
      return;
    }

    if (existing) {
      const gain = existing.output.gain;
      gain.cancelScheduledValues(ctx.currentTime);
      gain.setValueAtTime(gain.value, ctx.currentTime);
      gain.setTargetAtTime(want.volume, ctx.currentTime, 0.08);
      return;
    }
    const layer = buildAmbient(ctx, id);
    layer.output.gain.setValueAtTime(0, ctx.currentTime);
    layer.output.gain.linearRampToValueAtTime(want.volume, ctx.currentTime + FADE_SEC * 2);
    layer.output.connect(graph.ambient);
    this.layers.set(id, layer);
  }

  stopAllAmbient(): void {
    for (const id of [...this.layers.keys()]) void this.setLayer(id, false, 0);
  }
}

export const audio = new AudioEngine();
