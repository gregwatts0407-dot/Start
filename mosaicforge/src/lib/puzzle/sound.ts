/**
 * Tiny synthesised sound effects (no audio assets needed).
 * A soft wooden "click" for snaps and a gentle chime for completion.
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Short percussive click; `big` makes it slightly deeper (group joins / board lock). */
export function playSnap(big = false) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const len = 0.06;
  const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * len), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 4);
  const noise = ac.createBufferSource();
  noise.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = big ? 1400 : 2200;
  bp.Q.value = 1.4;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.35, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  noise.connect(bp).connect(g).connect(ac.destination);
  noise.start(t);

  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(big ? 180 : 260, t);
  osc.frequency.exponentialRampToValueAtTime(big ? 90 : 140, t + 0.08);
  const og = ac.createGain();
  og.gain.setValueAtTime(0.18, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  osc.connect(og).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.12);
}

/** Rising arpeggio for a completed puzzle. */
export function playComplete() {
  const ac = audio();
  if (!ac) return;
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
  notes.forEach((f, i) => {
    const t = ac.currentTime + i * 0.11;
    const osc = ac.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = f;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    osc.connect(g).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 1);
  });
}
