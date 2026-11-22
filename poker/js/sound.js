/* sound.js — small synthesized sound effects (no audio files needed). */
(function (root) {
  'use strict';
  let ctx = null, master = null, enabled = true, volume = 0.6;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function noiseBuffer(dur) {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    return buf;
  }
  function tone(freq, dur, type, gain, when, slide) {
    const t = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, freq, q, gain, when) {
    const t = ctx.currentTime + (when || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    const g = ctx.createGain();
    g.gain.value = gain || 0.3;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  const FX = {
    deal: () => noise(0.07, 3200, 0.8, 0.35),
    flip: () => { noise(0.05, 2400, 1.2, 0.3); noise(0.04, 4200, 1, 0.15, 0.03); },
    chip: () => { tone(2600, 0.05, 'triangle', 0.08); tone(3400, 0.04, 'triangle', 0.06, 0.02); noise(0.03, 5000, 2, 0.12); },
    chips: () => { for (let i = 0; i < 5; i++) { tone(2400 + Math.random() * 1600, 0.045, 'triangle', 0.06, i * 0.035); noise(0.03, 5200, 2, 0.08, i * 0.035); } },
    check: () => { tone(220, 0.06, 'sine', 0.25); tone(200, 0.06, 'sine', 0.2, 0.09); },
    fold: () => noise(0.12, 1400, 0.6, 0.18),
    turn: () => { tone(880, 0.12, 'sine', 0.12); tone(1320, 0.18, 'sine', 0.1, 0.1); },
    win: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, 'triangle', 0.12, i * 0.09)); },
    lose: () => { tone(330, 0.25, 'sine', 0.1); tone(262, 0.35, 'sine', 0.1, 0.18); },
    allin: () => { tone(160, 0.4, 'sawtooth', 0.06, 0, 90); noise(0.25, 900, 0.5, 0.15); },
    tick: () => tone(1500, 0.03, 'square', 0.04),
    coach: () => { tone(988, 0.1, 'sine', 0.08); tone(1318, 0.14, 'sine', 0.07, 0.08); },
    correct: () => { tone(660, 0.1, 'triangle', 0.12); tone(990, 0.16, 'triangle', 0.12, 0.08); },
    wrong: () => { tone(220, 0.18, 'square', 0.05); },
  };

  root.Sound = {
    play(name) {
      if (!enabled) return;
      try { if (!ensure()) return; (FX[name] || (() => {}))(); } catch (e) { /* ignore */ }
    },
    setEnabled(v) { enabled = !!v; },
    isEnabled: () => enabled,
    setVolume(v) { volume = v; if (master) master.gain.value = v; },
    unlock() { try { ensure(); } catch (e) { /* ignore */ } },
  };
})(window);
