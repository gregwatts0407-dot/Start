/* Synthesised sound effects (Web Audio). No audio files needed. */
(function (root) {
  'use strict';

  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let enabled = true;
  let volume = 0.7;

  function ensure() {
    if (!enabled) return null;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      master.connect(comp);
      comp.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    master.gain.value = volume * 0.9;
    return ctx;
  }

  function noise(o) {
    const a = ensure(); if (!a) return;
    const t = a.currentTime + (o.delay || 0);
    const src = a.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = o.rate || 1;
    const f = a.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 2000, t);
    if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + o.dur);
    f.Q.value = o.q || 1;
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain || 0.3, t + (o.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random() * 0.3);
    src.stop(t + o.dur + 0.05);
  }

  function tone(o) {
    const a = ensure(); if (!a) return;
    const t = a.currentTime + (o.delay || 0);
    const osc = a.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t + o.dur);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain || 0.2, t + (o.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g); g.connect(master);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  }

  function bell(freq, delay, gain) {
    tone({ freq, dur: 0.9, gain: gain || 0.12, delay, attack: 0.008 });
    tone({ freq: freq * 2, dur: 0.5, gain: (gain || 0.12) * 0.35, delay, attack: 0.008 });
    tone({ freq: freq * 3.01, dur: 0.25, gain: (gain || 0.12) * 0.12, delay, attack: 0.005 });
  }

  const Sound = {
    get enabled() { return enabled; },
    set enabled(v) { enabled = !!v; },
    get volume() { return volume; },
    set volume(v) { volume = v; if (master) master.gain.value = v * 0.9; },
    unlock() { ensure(); },

    card() {
      noise({ dur: 0.11, freq: 3200, sweepTo: 1200, q: 0.7, gain: 0.35 });
      noise({ dur: 0.05, freq: 300, type: 'lowpass', gain: 0.25, delay: 0.06 });
    },
    flip() {
      noise({ dur: 0.06, freq: 4200, q: 1.2, gain: 0.22 });
      noise({ dur: 0.04, freq: 1500, q: 2, gain: 0.15, delay: 0.03 });
    },
    chip(n) {
      const count = Math.min(n || 1, 4);
      for (let i = 0; i < count; i++) {
        const d = i * 0.045 + Math.random() * 0.02;
        tone({ freq: 2600 + Math.random() * 900, dur: 0.07, type: 'triangle', gain: 0.08, delay: d, attack: 0.002 });
        tone({ freq: 5200 + Math.random() * 1200, dur: 0.04, type: 'sine', gain: 0.04, delay: d, attack: 0.001 });
        noise({ dur: 0.035, freq: 6000, q: 3, gain: 0.12, delay: d });
      }
    },
    click() { tone({ freq: 1800, dur: 0.03, type: 'square', gain: 0.025, attack: 0.001 }); },
    win() { [523.25, 659.25, 783.99].forEach((f, i) => bell(f, i * 0.09, 0.1)); },
    blackjack() { [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => bell(f, i * 0.08, 0.11)); },
    push() { bell(587.33, 0, 0.07); bell(587.33, 0.14, 0.05); },
    lose() {
      tone({ freq: 220, slideTo: 150, dur: 0.45, type: 'triangle', gain: 0.09 });
      tone({ freq: 330, slideTo: 220, dur: 0.35, type: 'sine', gain: 0.05, delay: 0.05 });
    },
    bust() {
      noise({ dur: 0.25, freq: 600, sweepTo: 150, type: 'lowpass', gain: 0.3 });
      tone({ freq: 180, slideTo: 90, dur: 0.4, type: 'sawtooth', gain: 0.04 });
    },
    shuffle() {
      for (let i = 0; i < 18; i++) {
        noise({ dur: 0.05, freq: 2500 + Math.random() * 2000, q: 0.8, gain: 0.12 + Math.random() * 0.08, delay: i * 0.035 + (i > 9 ? 0.25 : 0) });
      }
    },
    alert() { bell(880, 0, 0.06); bell(1174.7, 0.1, 0.05); },
  };

  root.Sound = Sound;
})(typeof window !== 'undefined' ? window : globalThis);
