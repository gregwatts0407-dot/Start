'use strict';
// "I've got this under control" - a cartoon office worker vs. a fire hose.
// Everything is deterministic and periodic over T seconds so the GIF loops.

const W = 640, H = 420, FPS = 25, T = 6.0, N = Math.round(T * FPS), DT = 1 / FPS;
const GROUND = 330;
const INK = '#2b2340';
const C = {
  skin: '#f7c9a2', skinSh: '#e6a982', shirt: '#f6f8fd', shirtSh: '#d2dcee', shirtWet: '#c3d4ee',
  pants: '#3f4c78', pantsSh: '#2f3a5f', tie: '#de4352', tieSh: '#a92f3c', hair: '#6d4227',
  hairWet: '#3f2615', shoe: '#3b2b29', shoeHi: '#6a514c', sock: '#ef5f7a', hose: '#d83a3a', hoseHi: '#f4867b',
  brass: '#f0c04f', brassSh: '#c58b26', brassHi: '#fff3bd', water: '#8fd8ff', waterInk: '#2a78c8',
  blush: 'rgba(242,108,108,0.38)', belt: '#5a3b2a',
};

let SS = 2, CAPTION = '';
let canvas, ctx, bg;

// ---------------------------------------------------------------- math
const V = (x, y) => ({ x, y });
const add = (a, b) => V(a.x + b.x, a.y + b.y), sub = (a, b) => V(a.x - b.x, a.y - b.y);
const mul = (a, s) => V(a.x * s, a.y * s), len = a => Math.hypot(a.x, a.y);
const norm = a => { const l = len(a) || 1; return V(a.x / l, a.y / l); };
const rot = (a, t) => { const c = Math.cos(t), s = Math.sin(t); return V(a.x * c - a.y * s, a.x * s + a.y * c); };
const dirv = t => V(Math.cos(t), Math.sin(t));
const vlerp = (a, b, u) => V(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, u) => a + (b - a) * u;
const smooth = (e0, e1, x) => { const u = clamp((x - e0) / (e1 - e0), 0, 1); return u * u * (3 - 2 * u); };
const pulse = (t, a, b, r) => smooth(a - r, a, t) * (1 - smooth(b, b + r, t));
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
const lerpAng = (a, b, u) => a + angDiff(b, a) * u;
const TAU = Math.PI * 2;

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let rng = mulberry32(1);
const rr = (a, b) => a + (b - a) * rng();

const EASE = {
  lin: u => u, io: u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2,
  out: u => 1 - Math.pow(1 - u, 3), in: u => u * u * u, sine: u => -(Math.cos(Math.PI * u) - 1) / 2,
  back: u => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); },
};
function mix(a, b, u) { return Array.isArray(a) ? a.map((x, i) => x + (b[i] - x) * u) : a + (b - a) * u; }
function track(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1], [t1, v1, e] = keys[i];
      return mix(v0, v1, EASE[e || 'io']((t - t0) / (t1 - t0)));
    }
  }
  return keys[keys.length - 1][1];
}

// ---------------------------------------------------------------- timeline
// 0.00 smug, dribbling   0.62 water stops, he peers into the nozzle   1.20 BLAST to the face
// 1.45 wrestles it away, skids   1.85 yanked into the air, flaps like a flag   2.30 loses a shoe
// 3.62 hovers   3.80 water cuts out, looks at camera   4.02 drops   4.30 lands, soaked
// 4.85 shoe bonks his head   5.25 shoe lands back on foot, he shakes off   5.68 smug again
const TR = {
  P: [[0, [300, 263]], [0.62, [300, 263]], [0.9, [302, 262]], [1.12, [305, 261]], [1.2, [305, 261]],
    [1.34, [284, 266], 'out'], [1.5, [280, 266]], [1.62, [268, 268]], [1.85, [238, 270], 'in'],
    [4.30, [305, 263], 'lin'], [5.3, [305, 263]], [5.9, [300, 263]], [6, [300, 263]]],
  B: [[0, 0], [0.62, 0], [0.9, 0.06], [1.12, 0.17], [1.2, 0.17], [1.32, -0.38, 'out'], [1.48, -0.28],
    [1.62, -0.42], [1.85, -0.5], [4.30, 0, 'lin'], [6, 0]],
  hl: [[0, [30, -30]], [0.62, [30, -30]], [0.86, [40, -36]], [1.12, [47, -37]], [1.2, [47, -37]],
    [1.3, [42, -40], 'out'], [1.45, [42, -40]], [1.62, [38, -32]], [1.85, [40, -34]],
    [4.30, [-5, -92], 'lin'], [4.5, [24, -16], 'out'], [5.28, [24, -16]], [5.62, [27, -24]], [5.9, [30, -30]], [6, [30, -30]]],
  A: [[0, -0.12], [0.62, -0.12], [0.8, -0.6], [1.45, -0.6], [1.66, -0.1], [1.76, 0.15], [1.85, 0.55],
    [4.30, 1.45, 'lin'], [5.30, 1.45], [5.85, -0.12], [6, -0.12]],
  aim: [[0, 0], [0.72, 0], [1.08, 1], [1.45, 1], [1.62, 0], [6, 0]],
  head: [[0, -0.10], [0.62, -0.10], [0.82, 0.06], [1.1, 0.26], [1.2, 0.26], [1.27, -0.6, 'out'], [1.45, -0.45],
    [1.66, -0.12], [1.85, -0.18], [4.30, 0.06, 'lin'], [5.28, 0.06], [5.85, -0.10], [6, -0.10]],
  wNoz: [[0, 0], [0.64, 0], [0.98, 1], [4.30, 1], [4.42, 0], [6, 0]],
  wSide: [[0, 0], [4.30, 0], [4.42, 1], [5.30, 1], [5.6, 0.5], [5.9, 0], [6, 0]],
  fB: [[0, -16], [1.2, -16], [1.36, -4, 'out'], [1.85, 4], [4.30, -13, 'lin'], [5.3, -13], [5.9, -16], [6, -16]],
  fF: [[0, 16], [1.2, 16], [1.36, 24, 'out'], [1.85, 26], [4.30, 14, 'lin'], [5.3, 14], [5.9, 16], [6, 16]],
  ik: [[0, 1], [1.80, 1], [1.95, 0], [4.27, 0], [4.30, 1, 'lin'], [6, 1]],
  sq: [[0, 1], [1.18, 1], [1.21, 0.92], [1.30, 1.04], [1.4, 1], [4.29, 1], [4.33, 0.76, 'out'], [4.45, 1.07],
    [4.56, 0.97], [4.66, 1], [4.85, 1], [4.885, 0.86, 'out'], [4.98, 1.04], [5.06, 1], [6, 1]],
  flail: [[0, 0], [1.85, 0], [2.05, 1], [3.55, 1], [3.72, 0.22], [4.02, 0.22], [4.15, 0.04], [6, 0]],
  wet: [[0, 0], [4.27, 0], [4.32, 1], [5.33, 1], [5.42, 0], [6, 0]],
};
const EXT = [[0, 'smug'], [0.66, 'huh'], [0.88, 'peek'], [1.205, 'blast'], [1.47, 'scream'], [1.64, 'grit'],
  [1.88, 'scream'], [2.5, 'grit'], [3.35, 'scream'], [3.78, 'deadpan'], [4.85, 'wince'], [5.02, 'deadpan'],
  [5.25, 'shake'], [5.56, 'deadpan'], [5.66, 'smug']];
const EX = {
  smug: { open: [1, 1], lid: [.46, .44], sq: 0, pup: 1, brow: [[1, 0.12], [-3, -0.2]], look: 'viewer', mouth: 'smirk', mo: 0 },
  huh: { open: [1.08, 1.08], lid: [0, 0], sq: 0, pup: 1, brow: [[-1, -0.15], [-5, 0.25]], look: 'tip', mouth: 'o', mo: 0.25 },
  peek: { open: [0.9, 1.25], lid: [.85, 0], sq: 0, pup: 1, brow: [[2, 0.15], [-6, -0.1]], look: 'tip', mouth: 'o', mo: 0.15 },
  blast: { open: [1, 1], lid: [0, 0], sq: 1, pup: 1, brow: [[-3, -0.3], [-3, 0.3]], look: 'tip', mouth: 'scream', mo: 0.85 },
  scream: { open: [1.38, 1.38], lid: [0, 0], sq: 0, pup: 0.55, brow: [[-8, -0.28], [-8, 0.28]], look: 'tip', mouth: 'scream', mo: 1 },
  grit: { open: [1.12, 1.12], lid: [0.1, 0.1], sq: 0, pup: 0.85, brow: [[2, 0.38], [2, -0.38]], look: 'tip', mouth: 'grit', mo: 1 },
  deadpan: { open: [1, 1], lid: [.56, .56], sq: 0, pup: 1, brow: [[0, 0.02], [0, -0.02]], look: 'viewer', mouth: 'flat', mo: 0 },
  wince: { open: [1, 1], lid: [0, 0], sq: 1, pup: 1, brow: [[-2, -0.3], [-2, 0.3]], look: 'viewer', mouth: 'wavy', mo: 0.6 },
  shake: { open: [1, 1], lid: [0, 0], sq: 1, pup: 1, brow: [[-3, -0.2], [-3, 0.2]], look: 'viewer', mouth: 'wavy', mo: 1 },
};
function exprAt(t) {
  let i = 0; while (i + 1 < EXT.length && t >= EXT[i + 1][0]) i++;
  const cur = EX[EXT[i][1]], prev = EX[EXT[Math.max(0, i - 1)][1]];
  const u = i === 0 ? 1 : smooth(EXT[i][0], EXT[i][0] + 0.07, t);
  const pick = u > 0.5 ? cur : prev;
  return {
    open: mix(prev.open, cur.open, u), lid: mix(prev.lid, cur.lid, u), pup: mix(prev.pup, cur.pup, u),
    brow: [mix(prev.brow[0], cur.brow[0], u), mix(prev.brow[1], cur.brow[1], u)], mo: mix(prev.mo, cur.mo, u),
    sq: pick.sq, mouth: pick.mouth, look: pick.look, name: EXT[i][1],
  };
}

const waterSpeed = t => 660 * smooth(1.19, 1.235, t) * (1 - smooth(3.72, 3.86, t));
const dribbling = t => t < 0.6 || t > 5.8;
const airW = t => t < 3 ? smooth(1.80, 1.95, t) : 1 - smooth(4.27, 4.305, t);

// ---------------------------------------------------------------- ground pose
function groundPose(t) {
  const P = track(TR.P, t), hl = track(TR.hl, t);
  let B = track(TR.B, t), head = track(TR.head, t);
  const p = V(P[0], P[1]);
  // breathing, period 1.5s (divides the loop)
  p.y += 1.2 * Math.sin(TAU * t / 1.5) * (1 - pulse(t, 1.1, 4.4, 0.1));
  // face-blast head jitter
  head += 0.09 * Math.sin(TAU * 17 * t) * pulse(t, 1.22, 1.45, 0.03);
  // shake-off like a dog
  const sh = pulse(t, 5.27, 5.53, 0.04);
  B += 0.24 * Math.sin(TAU * 10 * (t - 5.25)) * sh;
  head -= 0.38 * Math.sin(TAU * 10 * (t - 5.25)) * sh;
  return { P: p, B, hl: V(hl[0], hl[1]), A: track(TR.A, t), head };
}
const groundG = t => { const g = groundPose(t); return add(g.P, rot(g.hl, g.B)); };

// ---------------------------------------------------------------- air path (hands)
const AIRK = [[1.85, null], [2.12, [372, 150]], [2.40, [440, 126]], [2.66, [460, 160]], [2.92, [400, 170]],
  [3.20, [275, 160]], [3.44, [250, 118]], [3.66, [298, 92]], [3.85, [306, 86]], [4.02, [306, 88]]];
let airPts = null, airTan = null;
function buildAir() {
  airPts = AIRK.map(k => k[1] ? V(k[1][0], k[1][1]) : groundG(1.85));
  airTan = airPts.map((p, i) => {
    if (i === 0) return mul(sub(groundG(1.85), groundG(1.83)), 1 / 0.02);
    if (i === airPts.length - 1) return V(0, 0);
    return mul(sub(airPts[i + 1], airPts[i - 1]), 1 / (AIRK[i + 1][0] - AIRK[i - 1][0]));
  });
}
function Gair(t) {
  if (t <= 1.85) return groundG(t);
  if (t >= 4.02) {
    const L = groundG(4.30), s = airPts[airPts.length - 1], u = clamp((t - 4.02) / 0.28, 0, 1);
    return V(lerp(s.x, L.x, u), s.y + (L.y - s.y) * u * u);
  }
  let i = 0; while (AIRK[i + 1][0] < t) i++;
  const t0 = AIRK[i][0], t1 = AIRK[i + 1][0], h = t1 - t0, u = (t - t0) / h;
  const h00 = 2 * u * u * u - 3 * u * u + 1, h10 = u * u * u - 2 * u * u + u, h01 = -2 * u * u * u + 3 * u * u, h11 = u * u * u - u * u;
  const p0 = airPts[i], p1 = airPts[i + 1], m0 = airTan[i], m1 = airTan[i + 1];
  return V(h00 * p0.x + h10 * h * m0.x + h01 * p1.x + h11 * h * m1.x, h00 * p0.y + h10 * h * m0.y + h01 * p1.y + h11 * h * m1.y);
}
const Gvel = t => mul(sub(Gair(t + 0.01), Gair(t - 0.01)), 50);
const Gacc = t => mul(add(sub(Gair(t + 0.01), mul(Gair(t), 2)), Gair(t - 0.01)), 10000);

// ---------------------------------------------------------------- simulation state
let S;
const ROPE_N = 50, ROPE_L = 13.5, HYD_OUT = V(104, 294), ROPE_GROUND = GROUND + 4;
function resetSim() {
  S = {
    Bair: 0, wair: 0, Aair: 0, tieA: Math.PI / 2, tieW: 0, prevNeck: null, prevNeckV: V(0, 0),
    particles: [], seq: 0, prevTip: null, prevA: 0, rope: [], prevAttach: null, prevDir: 0,
    prevAnkleF: null, ankleFV: V(0, 0), shoeLaunch: null, crowns: [], bursts: [], pose: null, frame: 0,
    hitsThisFrame: [],
  };
  const g = groundPose(0), G = add(g.P, rot(g.hl, g.B)), back = sub(G, mul(dirv(g.A), 22));
  for (let i = 0; i < ROPE_N; i++) {
    const u = i / (ROPE_N - 1);
    const x = lerp(HYD_OUT.x, back.x, u);
    const y = i < 2 ? HYD_OUT.y : ROPE_GROUND;
    S.rope.push({ x: x + Math.sin(u * 9) * 30 * u * (1 - u), y, px: x, py: y });
  }
}

// ---------------------------------------------------------------- pose (full)
const SHOULDER_F = V(3, -46), SHOULDER_B = V(-3, -47), NECK = V(2, -50), HIP_F = V(5, 0), HIP_B = V(-5, 0);
const ARM_A = 23, ARM_B = 22, LEG_A = 32, LEG_B = 30;
function ik2(a, b, la, lb, target, prefer) {
  // returns elbow; allows rubber-hose stretch if out of reach
  let d = sub(target, a), dist = len(d);
  let s = 1;
  if (dist > la + lb - 0.5) { s = dist / (la + lb - 0.5); }
  la *= s; lb *= s;
  dist = Math.max(1e-3, Math.min(dist, la + lb - 1e-3));
  const ca = clamp((la * la + dist * dist - lb * lb) / (2 * la * dist), -1, 1);
  const base = Math.atan2(d.y, d.x), off = Math.acos(ca);
  const e1 = add(a, mul(dirv(base + off), la)), e2 = add(a, mul(dirv(base - off), la));
  return prefer(e1, e2) ? e1 : e2;
}

function fullPose(t) {
  const g = groundPose(t), m = airW(t);
  const B = lerpAng(g.B, S.Bair, m);
  const hlAir = vlerp(groundPose(1.85).hl, V(-5, -92), smooth(1.85, 2.15, t));
  const hl = vlerp(g.hl, hlAir, m);
  const Pair = sub(Gair(t), rot(hl, B));
  const P = vlerp(g.P, Pair, m);
  const L = p => add(P, rot(p, B));           // body-local -> world
  const G = L(hl);
  const headTilt = lerp(g.head, lerp(-0.38 + clamp(-S.wair * 0.04, -0.3, 0.3), 0.12, smooth(3.68, 3.84, t)), m);
  const headAng = B + headTilt;
  const neck = L(NECK);
  const headC = add(neck, rot(V(3, -24), headAng));
  const H = p => add(headC, rot(p, headAng));  // head-local -> world
  // nozzle direction
  const eye = H(V(16, -5));
  const aimA = Math.atan2(eye.y - G.y, eye.x - G.x);
  const Ag = lerpAng(g.A, aimA, track(TR.aim, t));
  const A = lerpAng(Ag, S.Aair, m);
  const d = dirv(A);
  const tip = add(G, mul(d, 28)), back = sub(G, mul(d, 22));
  // arms
  const shF = L(SHOULDER_F), shB = L(SHOULDER_B);
  const lowerLocal = (e1, e2) => rot(sub(e1, P), -B).y > rot(sub(e2, P), -B).y;
  const handF = G;
  const wNoz = track(TR.wNoz, t), wSide = track(TR.wSide, t);
  let handB = vlerp(L(V(-17, -12)), sub(G, mul(d, 10)), wNoz);
  handB = vlerp(handB, L(V(-6, -2)), wSide);
  // shake-off: arms flop
  const sh = pulse(t, 5.27, 5.53, 0.04);
  handB = add(handB, mul(V(Math.sin(TAU * 10 * t), Math.cos(TAU * 10 * t)), 6 * sh));
  const elbF = ik2(shF, handF, ARM_A, ARM_B, handF, lowerLocal);
  const elbB = ik2(shB, handB, ARM_A, ARM_B, handB, (e1, e2) => wNoz + wSide < 0.5 ? rot(sub(e1, P), -B).x < rot(sub(e2, P), -B).x : lowerLocal(e1, e2));
  // legs
  const ikw = track(TR.ik, t), fl = track(TR.flail, t);
  const legs = [[HIP_B, track(TR.fB, t), 0], [HIP_F, track(TR.fF, t), 1]].map(([hipL, off, idx]) => {
    const hip = L(hipL);
    const target = V(P.x + off, GROUND - 6);
    const kneeIK = ik2(hip, target, LEG_A, LEG_B, target, (e1, e2) => rot(sub(e1, P), -B).x > rot(sub(e2, P), -B).x);
    const ph = idx ? Math.PI : 0, w = TAU * 2.7;
    const a = (idx ? 0.25 : -0.15) + fl * 0.75 * Math.sin(w * t + ph) + (1 - fl) * 0.05;
    const bnd = 0.35 + fl * 0.55 * (0.5 + 0.5 * Math.sin(w * t + ph + 1.3));
    const thigh = rot(V(0, 1), -a), shin = rot(thigh, bnd);
    const kneeFK = add(hip, mul(rot(thigh, B), LEG_A));
    const ankFK = add(kneeFK, mul(rot(shin, B), LEG_B));
    const knee = vlerp(kneeFK, kneeIK, ikw), ank = vlerp(ankFK, target, ikw);
    const sd = sub(ank, knee), footA = lerpAng(Math.atan2(sd.y, sd.x) - Math.PI / 2, 0, ikw);
    return { hip, knee, ank, footA };
  });
  return {
    t, P, B, hl, G, A, d, tip, back, neck, headC, headAng, H, L, shF, shB, elbF, elbB, handF, handB, legs,
    expr: exprAt(t), sq: track(TR.sq, t), wet: track(TR.wet, t), m,
  };
}

// ---------------------------------------------------------------- per-frame step
function step(t, fi) {
  rng = mulberry32((fi % N) * 7919 + 17);
  const dt = DT;
  // body pendulum while airborne
  if (t < 1.80 || t > 4.31) {
    const g = groundPose(t); S.Bair = g.B; S.wair = 0; S.Aair = lerpAng(g.A, 0, 0); S.Aair = g.A;
  } else {
    const v = Gvel(t), a = Gacc(t);
    const hx = -a.x * 0.9 - v.x * 2.3, hy = 900 - a.y * 0.9 - v.y * 2.3;
    const calm = smooth(3.55, 3.8, t);
    const target = lerpAng(clamp(Math.atan2(-hx, hy), -1.45, 1.45), 0, calm);
    for (let k = 0; k < 4; k++) {
      S.wair += (115 * angDiff(target, S.Bair) - (6.5 + 14 * calm) * S.wair) * dt / 4;
      S.Bair = clamp(S.Bair + S.wair * dt / 4, -1.7, 1.7);
    }
    const cal = smooth(3.92, 4.24, t);
    S.Bair = lerpAng(S.Bair, 0, cal * 0.35); S.wair *= 1 - cal * 0.3;
    let tgt = Math.atan2(v.y, v.x) + 0.55 * Math.sin(TAU * 1.7 * t);
    tgt = lerpAng(tgt, 0.95, smooth(3.45, 3.68, t));
    tgt = lerpAng(tgt, 1.45, smooth(3.86, 4.25, t));
    S.Aair = lerpAng(S.Aair, tgt, 1 - Math.exp(-13 * dt));
  }
  const pose = fullPose(t);
  S.pose = pose;

  // tie / hair wind: from body motion + water blast
  const neckV = S.prevNeck ? mul(sub(pose.neck, S.prevNeck), 1 / dt) : V(0, 0);
  const neckA = mul(sub(neckV, S.prevNeckV), 1 / dt);
  S.prevNeck = pose.neck; S.prevNeckV = neckV;
  const blast = pulse(t, 1.21, 1.47, 0.03);
  const wind = add(mul(neckV, -1), mul(V(-1, -0.2), 700 * blast));
  pose.wind = wind;
  const down = rot(V(0.35, 1), pose.B);
  const tv = add(add(mul(down, 900), mul(neckA, -0.25)), mul(wind, 1.1));
  const tieT = Math.atan2(tv.y, tv.x);
  for (let k = 0; k < 3; k++) {
    S.tieW += (160 * angDiff(tieT, S.tieA) - 9 * S.tieW) * dt / 3;
    S.tieA += S.tieW * dt / 3;
  }
  pose.tieA = S.tieA + 0.25 * Math.sin(TAU * 7 * t) * clamp(len(wind) / 600, 0, 1);

  // shoe
  const ank = pose.legs[1].ank;
  if (S.prevAnkleF) S.ankleFV = mul(sub(ank, S.prevAnkleF), 1 / dt);
  S.prevAnkleF = ank;
  if (t >= 2.30 && t - dt < 2.30) S.shoeLaunch = { p: ank, v: V(clamp(S.ankleFV.x * 0.2, -60, 60) + 80, -1150), a: pose.legs[1].footA };

  stepRope(t, pose);
  stepWater(t, pose);
  S.prevTip = pose.tip; S.prevA = pose.A;
}

// ---------------------------------------------------------------- rope (hose) physics
function stepRope(t, pose) {
  const R = S.rope, sub_ = 4, dt = DT / sub_;
  if (!S.prevAttach) { S.prevAttach = pose.back; S.prevDir = pose.A; }
  const pressure = smooth(1.2, 1.3, t) * (1 - smooth(3.8, 3.95, t));
  for (let s = 0; s < sub_; s++) {
    const u = (s + 1) / sub_;
    const A = vlerp(S.prevAttach, pose.back, u), D = lerpAng(S.prevDir, pose.A, u);
    const n = R.length;
    R[0].x = HYD_OUT.x; R[0].y = HYD_OUT.y; R[1].x = HYD_OUT.x + ROPE_L; R[1].y = HYD_OUT.y;
    R[n - 1].x = A.x; R[n - 1].y = A.y;
    const b = sub(A, mul(dirv(D), ROPE_L)); R[n - 2].x = b.x; R[n - 2].y = b.y;
    const tt = t + s * dt;
    for (let i = 2; i < n - 2; i++) {
      const p = R[i];
      const vx = (p.x - p.px) * 0.99, vy = (p.y - p.py) * 0.99;
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy + 1500 * dt * dt;
      if (pressure > 0) {   // snake-like writhing while pressurised
        const q = R[i + 1], dx = q.x - R[i - 1].x, dy = q.y - R[i - 1].y, l = Math.hypot(dx, dy) || 1;
        const f = Math.sin(i * 0.55 - tt * 26) * 0.55 * pressure;
        p.x += -dy / l * f; p.y += dx / l * f;
      }
    }
    for (let it = 0; it < 18; it++) {
      for (let i = 0; i < n - 1; i++) {
        const a = R[i], c = R[i + 1];
        const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 1e-6;
        const diff = (d - ROPE_L) / d;
        const pa = i < 2 || i >= n - 2, pc = i + 1 < 2 || i + 1 >= n - 2;
        if (pa && pc) continue;
        const wa = pa ? 0 : pc ? 1 : 0.5, wc = pc ? 0 : pa ? 1 : 0.5;
        a.x += dx * diff * wa; a.y += dy * diff * wa;
        c.x -= dx * diff * wc; c.y -= dy * diff * wc;
      }
      for (let i = 2; i < n - 2; i++) {
        const p = R[i];
        if (p.y > ROPE_GROUND) { p.y = ROPE_GROUND; p.px = p.x - (p.x - p.px) * 0.55; }
      }
    }
  }
  S.prevAttach = pose.back; S.prevDir = pose.A;
}

// ---------------------------------------------------------------- water
function spawn(o) { S.particles.push(Object.assign({ age: 0, r: 3, gy: GROUND + 10 }, o)); }
function stepWater(t, pose) {
  const P = S.particles, sub_ = 2, dt = DT / sub_;
  const spd = waterSpeed(t);
  if (!S.prevTip) { S.prevTip = pose.tip; S.prevA = pose.A; }
  S.hitsThisFrame = [];
  const headR = 27;
  const faceHits = t > 1.18 && t < 1.56;
  for (let s = 0; s < sub_; s++) {
    const u = (s + 1) / sub_;
    const tip = vlerp(S.prevTip, pose.tip, u), A = lerpAng(S.prevA, pose.A, u);
    if (spd > 40) {
      const d = dirv(A);
      spawn({ kind: 'core', x: tip.x, y: tip.y, vx: d.x * spd, vy: d.y * spd, seq: S.seq++, brk: rr(0.32, 0.58), gy: GROUND + rr(6, 14), r: 4 });
      for (let k = 0; k < 2; k++) {
        const a = A + rr(-0.13, 0.13), sp = spd * rr(0.7, 1.0);
        spawn({ kind: 'drop', x: tip.x, y: tip.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, gy: GROUND + rr(2, 26), r: rr(1.8, 3.4) });
      }
    } else if (dribbling(t) && s === 0 && rng() < 0.32) {
      const d = dirv(A);
      spawn({ kind: 'drip', x: pose.tip.x + d.x * 2, y: pose.tip.y + d.y * 2, vx: d.x * 30 + rr(-5, 5), vy: d.y * 30 + 10, gy: GROUND + rr(4, 12), r: rr(2.2, 3) });
    }
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.age += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += (p.kind === 'clod' ? 1100 : 900) * dt;
      if (p.kind === 'core' && p.age > p.brk && !p.broken) { p.broken = true; p.vx += rr(-40, 40); p.vy += rr(-40, 40); }
      if (faceHits && (p.kind === 'core' || p.kind === 'drop') && p.age < 0.25) {
        const hc = pose.headC, dx = p.x - hc.x, dy = p.y - hc.y, dd = Math.hypot(dx, dy);
        if (dd < headR) {
          S.hitsThisFrame.push(V(p.x, p.y));
          const nx = dx / dd, ny = dy / dd;
          if (rng() < 0.7) {
            const a = Math.atan2(ny, nx) + rr(-1.2, 1.2), sp = rr(80, 240);
            spawn({ kind: 'splash', x: p.x, y: p.y, vx: Math.cos(a) * sp - 60, vy: Math.sin(a) * sp - 40, r: rr(1.6, 3.2), gy: GROUND + rr(2, 20) });
          }
          P.splice(i, 1); continue;
        }
      }
      if (p.y > p.gy) {
        if (p.kind === 'core' || (p.kind === 'drop' && rng() < 0.5)) {
          for (let k = 0; k < (p.kind === 'core' ? 2 : 1); k++) spawn({ kind: 'splash', x: p.x, y: p.gy - 1, vx: p.vx * 0.15 + rr(-90, 90), vy: -rr(90, 260), r: rr(1.4, 2.6), gy: p.gy + 1 });
          if (p.kind === 'core' && rng() < 0.45) S.crowns.push({ x: p.x, y: p.gy, age: 0 });
        }
        P.splice(i, 1); continue;
      }
      if (p.x < -60 || p.x > W + 60 || p.y < -400 || p.age > 3) { P.splice(i, 1); continue; }
    }
  }
  if (S.hitsThisFrame.length) {
    const c = S.hitsThisFrame.reduce((a, b) => add(a, b), V(0, 0));
    S.bursts = [{ p: mul(c, 1 / S.hitsThisFrame.length), seed: rng() * 1e6 | 0 }];
  } else S.bursts = [];
  for (let i = S.crowns.length - 1; i >= 0; i--) { S.crowns[i].age += DT; if (S.crowns[i].age > 0.22) S.crowns.splice(i, 1); }

  // skid clods
  if (t > 1.3 && t < 1.85) {
    for (const lg of pose.legs) if (rng() < 0.6) spawn({ kind: 'clod', x: lg.ank.x + 10, y: GROUND - 2, vx: rr(40, 200), vy: -rr(120, 300), r: rr(1.8, 3.2), gy: GROUND + rr(2, 14), col: rng() < 0.5 ? '#6b8f3a' : '#8a6a44' });
  }
  // drips while soaked
  const wet = pose.wet;
  if (wet > 0.5 && t < 5.25) {
    const pts = [pose.H(V(12, 24)), pose.H(V(26, 10)), pose.tip, pose.handF, pose.L(V(-14, 4)), pose.L(V(16, 4)), pose.elbF, pose.H(V(-18, 14))];
    for (const q of pts) if (rng() < 0.16) spawn({ kind: 'drip', x: q.x + rr(-2, 2), y: q.y, vx: rr(-6, 6), vy: rr(10, 40), gy: GROUND + rr(4, 14), r: rr(1.8, 2.8) });
  }
  // shake-off spray
  const sh = pulse(t, 5.27, 5.53, 0.03);
  if (sh > 0.2) {
    const c = pose.L(V(2, -40));
    for (let k = 0; k < 4; k++) {
      const a = rr(-0.5, 0.5) + (rng() < 0.5 ? 0 : Math.PI), rad = rr(14, 34), sp = rr(150, 300);
      spawn({ kind: 'drop', x: c.x + Math.cos(a) * rad, y: c.y + Math.sin(a) * rad * 1.4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, r: rr(1.6, 3.2), gy: GROUND + rr(2, 24) });
    }
  }
}

// ---------------------------------------------------------------- drawing helpers
function poly(pts) { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); }
function limb(pts, w, col, ink = 5) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  poly(pts); ctx.strokeStyle = INK; ctx.lineWidth = w + ink; ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
}
function circ(p, r, fill, stroke = INK, lw = 2.5) {
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function smoothPath(pts) {
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const m = vlerp(pts[i], pts[i + 1], 0.5);
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y);
  }
  const l = pts[pts.length - 1]; ctx.lineTo(l.x, l.y);
}
function withFrame(origin, ang, fn) { ctx.save(); ctx.translate(origin.x, origin.y); ctx.rotate(ang); fn(); ctx.restore(); }
function lerpColor(a, b, u) {
  const pa = [1, 3, 5].map(i => parseInt(a.substr(i, 2), 16)), pb = [1, 3, 5].map(i => parseInt(b.substr(i, 2), 16));
  return 'rgb(' + pa.map((x, i) => Math.round(x + (pb[i] - x) * u)).join(',') + ')';
}

// ---------------------------------------------------------------- background
function drawBackground(c) {
  const g = c.createLinearGradient(0, 0, 0, GROUND);
  g.addColorStop(0, '#8fcaf3'); g.addColorStop(1, '#dff2fc');
  c.fillStyle = g; c.fillRect(0, 0, W, GROUND);
  // sun
  c.fillStyle = 'rgba(255,236,150,0.35)'; c.beginPath(); c.arc(565, 70, 50, 0, TAU); c.fill();
  c.fillStyle = '#ffe07a'; c.beginPath(); c.arc(565, 70, 31, 0, TAU); c.fill();
  // clouds
  const cloud = (x, y, s) => {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = '#ffffff';
    [[0, 0, 22], [24, -12, 26], [50, -2, 22], [70, 6, 16], [-20, 8, 15], [28, 8, 20]].forEach(([a, b, r]) => { c.beginPath(); c.arc(a, b, r, 0, TAU); c.fill(); });
    c.fillStyle = '#e4f1fb'; c.fillRect(-36, 14, 124, 10);
    c.restore();
  };
  cloud(120, 70, 0.9); cloud(360, 48, 0.7); cloud(250, 120, 0.45);
  // skyline
  const blds = [[330, 170, 46], [380, 140, 40], [424, 188, 34], [462, 120, 52], [518, 160, 38], [560, 135, 44], [608, 176, 40], [-10, 200, 50], [44, 176, 38], [150, 214, 44], [196, 190, 36]];
  blds.forEach(([x, y, w], k) => {
    c.fillStyle = k % 2 ? '#b4c9e2' : '#a9c0dc'; c.fillRect(x, y, w, GROUND - y);
    c.fillStyle = 'rgba(255,255,255,0.45)';
    for (let wy = y + 10; wy < GROUND - 30; wy += 16) for (let wx = x + 7; wx < x + w - 8; wx += 11) c.fillRect(wx, wy, 6, 8);
    if (k === 3) { c.fillStyle = '#a9c0dc'; c.fillRect(x + 22, y - 26, 4, 26); c.fillStyle = '#e66'; c.beginPath(); c.arc(x + 24, y - 27, 3, 0, TAU); c.fill(); }
  });
  // hedge row
  c.fillStyle = '#5fae5a';
  for (let x = -10; x < W + 30; x += 34) { c.beginPath(); c.arc(x, GROUND - 12, 22 + (x * 7 % 9), 0, TAU); c.fill(); }
  c.fillStyle = '#56a352'; c.fillRect(0, GROUND - 14, W, 14);
  // lawn with mowing stripes
  c.fillStyle = '#86cf6c'; c.fillRect(0, GROUND, W, H - GROUND);
  c.fillStyle = '#7cc664';
  for (let i = 0; i < 6; i++) { const y0 = GROUND + i * i * 3 + i * 6; c.fillRect(0, y0, W, 3 + i * 2); }
  c.fillStyle = '#6fb75a'; c.fillRect(0, GROUND, W, 3);
  // puddles
  const puddle = (x, y, rx, ry) => {
    c.fillStyle = '#9fd6f2'; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.ellipse(x - rx * 0.3, y - ry * 0.2, rx * 0.35, ry * 0.25, 0, 0, TAU); c.fill();
  };
  puddle(440, GROUND + 20, 56, 7); puddle(205, GROUND + 30, 34, 5);
  // wet floor sign (on a lawn - nobody knows why)
  c.save(); c.translate(548, GROUND + 22);
  c.lineJoin = 'round'; c.strokeStyle = INK; c.lineWidth = 2.5;
  c.fillStyle = '#e8b62a'; c.beginPath(); c.moveTo(-15, 0); c.lineTo(-4, -48); c.lineTo(4, -48); c.lineTo(15, 0); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#ffd23f'; c.beginPath(); c.moveTo(-13, 0); c.lineTo(-3, -44); c.lineTo(3, -44); c.lineTo(13, 0); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = INK; c.beginPath(); c.moveTo(0, -36); c.lineTo(-7, -22); c.lineTo(7, -22); c.closePath(); c.fill();
  c.fillStyle = '#ffd23f'; c.fillRect(-0.9, -32, 1.8, 6); c.fillRect(-0.9, -25, 1.8, 1.8);
  c.fillStyle = INK; c.fillRect(-8, -14, 16, 2.5); c.fillRect(-6, -9, 12, 2.5);
  c.restore();
  // sad thirsty office plant
  c.save(); c.translate(604, GROUND + 26);
  c.strokeStyle = INK; c.lineWidth = 2.5; c.lineJoin = 'round'; c.lineCap = 'round';
  [[-0.9, 26], [-0.3, 30], [0.4, 28], [1.0, 22]].forEach(([a, l]) => {
    c.strokeStyle = INK; c.lineWidth = 5; c.beginPath(); c.moveTo(0, -24); c.quadraticCurveTo(a * 12, -24 - l, a * 24, -20 - l * 0.35); c.stroke();
    c.strokeStyle = '#8aa64a'; c.lineWidth = 2.5; c.stroke();
    c.fillStyle = '#9fb957'; c.beginPath(); c.ellipse(a * 24, -18 - l * 0.35, 4, 7, a * 0.6, 0, TAU); c.fill(); c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
  });
  c.fillStyle = '#d8774a'; c.beginPath(); c.moveTo(-15, -26); c.lineTo(15, -26); c.lineTo(11, 0); c.lineTo(-11, 0); c.closePath(); c.fill(); c.lineWidth = 2.5; c.stroke();
  c.fillStyle = '#e8916a'; c.fillRect(-16, -30, 32, 7); c.strokeRect(-16, -30, 32, 7);
  c.restore();
  // hydrant
  c.save(); c.translate(76, 0);
  c.lineJoin = 'round'; c.strokeStyle = INK; c.lineWidth = 3;
  c.fillStyle = '#b52d31'; c.beginPath(); c.roundRect(-26, GROUND + 2, 52, 10, 3); c.fill(); c.stroke();
  const body = new Path2D(); body.roundRect(-17, 262, 34, GROUND + 4 - 262, 5);
  c.fillStyle = '#dc3b3d'; c.fill(body);
  c.save(); c.clip(body); c.fillStyle = '#b52d31'; c.fillRect(6, 250, 20, 100); c.fillStyle = '#ef6a62'; c.fillRect(-12, 250, 5, 100); c.restore();
  c.stroke(body);
  c.fillStyle = '#b52d31'; c.beginPath(); c.roundRect(-22, 258, 44, 9, 3); c.fill(); c.stroke();
  c.fillStyle = '#dc3b3d'; c.beginPath(); c.moveTo(-17, 259); c.bezierCurveTo(-17, 232, 17, 232, 17, 259); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#b52d31'; c.beginPath(); c.roundRect(-5, 230, 10, 9, 2); c.fill(); c.stroke();
  // side caps
  c.fillStyle = '#b52d31'; c.beginPath(); c.roundRect(-30, 286, 14, 16, 3); c.fill(); c.stroke();
  c.fillStyle = C.brassSh; c.beginPath(); c.roundRect(16, 285, 14, 18, 3); c.fill(); c.stroke();
  c.restore();
}

// ---------------------------------------------------------------- hose
function ropeSamples() {
  const R = S.rope, out = [];
  for (let i = 0; i < R.length - 1; i++) {
    const a = R[i], b = R[i + 1];
    for (let k = 0; k < 4; k++) out.push(V(lerp(a.x, b.x, k / 4), lerp(a.y, b.y, k / 4)));
  }
  out.push(V(R[R.length - 1].x, R[R.length - 1].y));
  return out;
}
function drawHose(t) {
  const pts = S.rope.map(p => V(p.x, p.y));
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // shadow where it lies on the grass
  ctx.fillStyle = 'rgba(40,80,30,0.18)';
  for (const p of pts) if (p.y > ROPE_GROUND - 3) { ctx.beginPath(); ctx.ellipse(p.x, ROPE_GROUND + 6, 9, 3, 0, 0, TAU); ctx.fill(); }
  // bulge travelling down the hose
  const amp = smooth(0.62, 0.72, t) * (1 - smooth(1.17, 1.22, t));
  let bul = [];
  if (amp > 0) {
    const sb = Math.pow(clamp((t - 0.62) / 0.58, 0, 1), 1.5);
    const smp = ropeSamples();
    smp.forEach((p, i) => {
      const s = i / (smp.length - 1), e = Math.exp(-Math.pow((s - sb) / 0.03, 2));
      if (e > 0.03) bul.push([p, 6 + 8 * amp * e]);
    });
  }
  smoothPath(pts); ctx.strokeStyle = INK; ctx.lineWidth = 15; ctx.stroke();
  for (const [p, r] of bul) circ(p, r + 2.5, INK, null);
  smoothPath(pts); ctx.strokeStyle = C.hose; ctx.lineWidth = 10; ctx.stroke();
  for (const [p, r] of bul) circ(p, r, C.hose, null);
  ctx.save(); ctx.translate(0, -2.2);
  smoothPath(pts); ctx.strokeStyle = C.hoseHi; ctx.lineWidth = 2.6; ctx.stroke();
  ctx.restore();
  for (const [p, r] of bul) { ctx.fillStyle = C.hoseHi; ctx.beginPath(); ctx.ellipse(p.x - r * 0.2, p.y - r * 0.45, r * 0.4, r * 0.18, 0, 0, TAU); ctx.fill(); }
  // coupling at the hydrant
  ctx.fillStyle = C.brass; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect(HYD_OUT.x - 4, HYD_OUT.y - 8, 10, 16, 2); ctx.fill(); ctx.stroke();
}

function drawNozzle(p) {
  withFrame(p.G, p.A, () => {
    ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 2.6;
    const body = new Path2D();
    body.moveTo(-15, -7.5); body.lineTo(22, -4.6); body.lineTo(22, 4.6); body.lineTo(-15, 7.5); body.closePath();
    ctx.fillStyle = C.brass; ctx.fill(body); ctx.stroke(body);
    ctx.fillStyle = C.brassHi; ctx.fillRect(-12, -5, 32, 2.2);
    ctx.fillStyle = C.brassSh; ctx.beginPath(); ctx.roundRect(-23, -9.5, 10, 19, 2.5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.brass; ctx.beginPath(); ctx.roundRect(20, -6, 8.5, 12, 2); ctx.fill(); ctx.stroke();
  });
}

// ---------------------------------------------------------------- character
function drawShoe(ank, a, sock) {
  withFrame(ank, a, () => {
    ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 2.6;
    if (sock) {
      ctx.fillStyle = C.sock; ctx.beginPath(); ctx.moveTo(-5, -4); ctx.lineTo(4, -4); ctx.quadraticCurveTo(13, -3, 13, 2); ctx.quadraticCurveTo(13, 5, 9, 5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(-1, -3); ctx.lineTo(-1, 4); ctx.moveTo(3, -3); ctx.lineTo(3, 4); ctx.stroke();
      return;
    }
    shoeShape();
  });
}
function shoeShape() {
  ctx.fillStyle = C.shoe; ctx.beginPath();
  ctx.moveTo(-7, -4); ctx.lineTo(4, -4); ctx.quadraticCurveTo(16, -3, 17, 3); ctx.lineTo(17, 6); ctx.lineTo(-7, 6); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.shoeHi; ctx.beginPath(); ctx.ellipse(9, -1, 3.5, 1.5, 0.2, 0, TAU); ctx.fill();
}

function drawEye(cx, cy, open, lid, sq, look, pup, idx) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = INK;
  if (sq) {
    ctx.lineWidth = 2.6; ctx.beginPath();
    const s = idx === 0 ? 1 : -1;
    ctx.moveTo(cx - 4 * s, cy - 5); ctx.lineTo(cx + 3 * s, cy); ctx.lineTo(cx - 4 * s, cy + 4); ctx.stroke();
    return;
  }
  const rx = idx === 0 ? 5 : 5.6, ry = 7 * open;
  const e = new Path2D(); e.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  ctx.fillStyle = '#fff'; ctx.fill(e);
  ctx.save(); ctx.clip(e);
  const px = cx + clamp(look.x, -1, 1) * (rx - 2.4), py = cy + clamp(look.y, -1, 1) * (ry - 2.6);
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(px, py, 2.9 * pup, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px + 0.9, py - 1, 0.9 * pup, 0, TAU); ctx.fill();
  if (lid > 0.01) {
    const ly = cy - ry + 2 * ry * lid;
    ctx.fillStyle = C.skin; ctx.fillRect(cx - rx - 1, cy - ry - 1, rx * 2 + 2, ly - (cy - ry) + 1);
    ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(cx - rx, ly); ctx.lineTo(cx + rx, ly); ctx.stroke();
  }
  ctx.restore();
  ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke(e);
}

function drawMouth(e, t) {
  const cx = 14, cy = 14;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
  const wob = e.name === 'blast' ? Math.sin(TAU * 13 * t) : 0;
  switch (e.mouth) {
    case 'smirk':
      ctx.beginPath(); ctx.moveTo(6, 14); ctx.quadraticCurveTo(13, 18, 20, 10); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(19, 8); ctx.quadraticCurveTo(21.5, 10, 21, 12.5); ctx.stroke();
      break;
    case 'flat':
      ctx.beginPath(); ctx.moveTo(7, 15); ctx.lineTo(19, 14.5); ctx.stroke(); break;
    case 'o': {
      const rx = 2 + 3 * e.mo, ry = 2.4 + 4 * e.mo;
      ctx.fillStyle = '#7a2233'; ctx.beginPath(); ctx.ellipse(14, 15, rx, ry, 0, 0, TAU); ctx.fill(); ctx.stroke(); break;
    }
    case 'scream': {
      const h = 6 + 12 * e.mo + wob * 2.5, w0 = 5 - wob, w1 = 23 + wob;
      const m = new Path2D();
      m.moveTo(w0, 9); m.quadraticCurveTo(cx, 6 + wob, w1, 8);
      m.quadraticCurveTo(w1 + 1, 9 + h, cx + 1, 10 + h); m.quadraticCurveTo(w0 - 1, 9 + h, w0, 9); m.closePath();
      ctx.fillStyle = '#6e1d2c'; ctx.fill(m);
      ctx.save(); ctx.clip(m);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 30, 11.5);
      ctx.fillStyle = '#e8707e'; ctx.beginPath(); ctx.ellipse(cx + 2, 10 + h, 7, 4.5, 0, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.stroke(m); break;
    }
    case 'grit': {
      const m = new Path2D(); m.roundRect(5, 9, 18, 9, 3.5);
      ctx.fillStyle = '#fff'; ctx.fill(m); ctx.stroke(m);
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(5, 13.5); ctx.lineTo(23, 13.5);
      for (const x of [9.5, 14, 18.5]) { ctx.moveTo(x, 9); ctx.lineTo(x, 18); }
      ctx.stroke(); break;
    }
    case 'wavy': {
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) { const x = 5 + i * 2, y = 15 + (i % 2 ? -2 : 2) * (0.6 + 0.4 * e.mo); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke(); break;
    }
  }
}

function drawHair(windL, wet, front) {
  const col = lerpColor(C.hair, C.hairWet, wet);
  const wl = len(windL), wd = wl > 1 ? mul(windL, 1 / wl) : V(0, 0), bend = Math.min(wl / 60, 12);
  const spikes = [[-15, -20, -2.55, 13], [-6, -25, -2.15, 15], [4, -27, -1.8, 15], [13, -24, -1.4, 13], [19, -18, -1.0, 9]];
  const shapes = [];
  const cap = new Path2D();
  cap.moveTo(-23, 9);
  cap.bezierCurveTo(-29, -14, -14, -30, 3, -28.5);
  cap.bezierCurveTo(16, -27.5, 24, -19, 22.5, -11);
  cap.quadraticCurveTo(14, -17, 7, -12);
  cap.quadraticCurveTo(-3, -11, -9, -3);
  cap.quadraticCurveTo(-13, 5, -23, 9); cap.closePath();
  shapes.push(cap);
  for (const [bx, by, a0, l0] of spikes) {
    const a = lerp(a0, Math.PI * 0.95, wet * 0.55), l = l0 * (1 - 0.45 * wet);
    const d = dirv(a), n = V(-d.y, d.x);
    const tip = add(add(V(bx, by), mul(d, l)), mul(wd, bend * (1 - wet * 0.5)));
    const s = new Path2D();
    s.moveTo(bx + n.x * 5, by + n.y * 5); s.quadraticCurveTo(bx + d.x * l * 0.6 + n.x * 2, by + d.y * l * 0.6 + n.y * 2, tip.x, tip.y);
    s.quadraticCurveTo(bx + d.x * l * 0.5 - n.x * 2, by + d.y * l * 0.5 - n.y * 2, bx - n.x * 5, by - n.y * 5); s.closePath();
    shapes.push(s);
  }
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK; ctx.lineWidth = 5; shapes.forEach(s => ctx.stroke(s));
  ctx.fillStyle = col; shapes.forEach(s => ctx.fill(s));
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-12, -20); ctx.quadraticCurveTo(-2, -26, 8, -24); ctx.stroke();
}
function drawWetStrands(wet) {
  if (wet < 0.05) return;
  const col = lerpColor(C.hair, C.hairWet, wet);
  ctx.lineCap = 'round';
  const strands = [[9, -14, 6, 2], [14, -14, 13, 4], [19, -13, 21, 0]];
  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass ? col : INK; ctx.lineWidth = pass ? 3.4 : 6;
    for (const [x0, y0, x1, y1] of strands) {
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 + 3, lerp(y0, y1, 0.5) * wet + y0 * (1 - wet), lerp(x0, x1, wet), lerp(y0, y1, wet)); ctx.stroke();
    }
  }
}

function drawHead(p, t) {
  const e = p.expr;
  withFrame(p.headC, p.headAng, () => {
    const sqz = p.sq;
    ctx.scale(1 + (1 - sqz) * 0.4, sqz < 1 ? 1 - (1 - sqz) * 0.3 : 1);
    // head
    const hp = new Path2D(); hp.ellipse(0, 0, 24, 25.5, 0, 0, TAU);
    ctx.fillStyle = C.skin; ctx.fill(hp);
    ctx.save(); ctx.clip(hp); ctx.fillStyle = C.skinSh; ctx.beginPath(); ctx.ellipse(-22, 8, 15, 30, 0.1, 0, TAU); ctx.fill(); ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke(hp);
    // ear
    ctx.fillStyle = C.skin; ctx.beginPath(); ctx.ellipse(-12, 4, 5.5, 7.5, 0, 0, TAU); ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke();
    ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(-11.5, 4.5, 3, -1.2, 1.6); ctx.stroke();
    // eyes
    const lookL = (() => {
      if (e.look === 'viewer') return V(-0.85, 0.3);
      const v = rot(sub(p.tip, p.headC), -p.headAng); const l = len(v) || 1; return V(v.x / l, v.y / l);
    })();
    const eyes = [V(4, -5), V(16.5, -6)];
    eyes.forEach((c, i) => drawEye(c.x, c.y, e.open[i], e.lid[i], e.sq, lookL, e.pup, i));
    // brows
    ctx.strokeStyle = INK; ctx.lineWidth = 2.8; ctx.lineCap = 'round';
    eyes.forEach((c, i) => {
      const [h, a] = e.brow[i], y = c.y - 7 * e.open[i] - 4 + h;
      ctx.save(); ctx.translate(c.x, y); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.stroke(); ctx.restore();
    });
    // blush
    ctx.fillStyle = C.blush; ctx.beginPath(); ctx.ellipse(5, 9, 5, 3, 0, 0, TAU); ctx.fill();
    drawMouth(e, t);
    // nose
    ctx.fillStyle = C.skin; ctx.beginPath(); ctx.ellipse(24.5, 3.5, 6.5, 6, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(25.5, 1.5, 1.6, 0, TAU); ctx.fill();
    // hair
    drawHair(rot(p.wind || V(0, 0), -p.headAng), p.wet);
    drawWetStrands(p.wet);
    // sweat beads when panicking
    if (['scream', 'grit', 'huh'].includes(e.name)) {
      const bob = Math.sin(TAU * 4 * t) * 1.5;
      ctx.fillStyle = '#dff4ff'; ctx.strokeStyle = C.waterInk; ctx.lineWidth = 1.6;
      [[-24, -14 + bob], [28, -16 - bob]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.quadraticCurveTo(x + 4, y, x, y + 2.5); ctx.quadraticCurveTo(x - 4, y, x, y - 6); ctx.fill(); ctx.stroke(); });
    }
  });
}

function drawTorso(p) {
  withFrame(p.P, p.B, () => {
    const shirt = lerpColor(C.shirt, C.shirtWet, p.wet), shade = lerpColor(C.shirtSh, '#a9bddc', p.wet);
    const tp = new Path2D();
    tp.moveTo(-15, 3); tp.bezierCurveTo(-20, -14, -18, -38, -12, -50);
    tp.quadraticCurveTo(0, -55, 12, -50);
    tp.bezierCurveTo(21, -40, 27, -18, 16, 3); tp.closePath();
    ctx.fillStyle = shirt; ctx.fill(tp);
    ctx.save(); ctx.clip(tp);
    ctx.fillStyle = shade; ctx.beginPath(); ctx.ellipse(-20, -22, 10, 34, 0.05, 0, TAU); ctx.fill();
    // pocket + pen
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
    ctx.fillStyle = '#3d7ad8'; ctx.fillRect(-7, -40, 3, 8);
    ctx.fillStyle = shirt; ctx.beginPath(); ctx.roundRect(-10, -35, 10, 10, 2); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke(tp);
    // waist: pants + belt
    const wp = new Path2D(); wp.roundRect(-16, -3, 33, 14, 6);
    ctx.fillStyle = C.pants; ctx.fill(wp); ctx.stroke(wp);
    ctx.fillStyle = C.belt; ctx.fillRect(-15, -2, 31, 4.5);
    ctx.fillStyle = C.brass; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(7, -3, 6, 6.5, 1); ctx.fill(); ctx.stroke();
    // collar
    ctx.lineWidth = 2.2; ctx.fillStyle = shirt;
    ctx.beginPath(); ctx.moveTo(-6, -52); ctx.lineTo(3, -45); ctx.lineTo(-2, -42); ctx.lineTo(-9, -48); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(12, -51); ctx.lineTo(4, -45); ctx.lineTo(9, -41); ctx.lineTo(15, -47); ctx.closePath(); ctx.fill(); ctx.stroke();
  });
}

function drawTie(p) {
  const knot = p.L(V(4, -44));
  const a = p.tieA, bodyDown = p.B + Math.PI / 2 - 0.25;
  const a1 = lerpAng(bodyDown, a, 0.45);
  const mid = add(knot, mul(dirv(a1), 13)), tip = add(mid, mul(dirv(a), 14));
  const n1 = mul(dirv(a1 + Math.PI / 2), 1), n2 = mul(dirv(a + Math.PI / 2), 1);
  ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 2.4;
  ctx.fillStyle = C.tie; ctx.beginPath();
  const k0 = add(knot, mul(n1, 3)), k1 = sub(knot, mul(n1, 3));
  ctx.moveTo(k0.x, k0.y);
  const m0 = add(mid, mul(n1, 5.5)), m1 = sub(mid, mul(n1, 5.5));
  const e0 = add(tip, mul(dirv(a), -5)), w0 = add(e0, mul(n2, 5)), w1 = sub(e0, mul(n2, 5));
  ctx.quadraticCurveTo(m0.x, m0.y, w0.x, w0.y); ctx.lineTo(tip.x, tip.y); ctx.lineTo(w1.x, w1.y);
  ctx.quadraticCurveTo(m1.x, m1.y, k1.x, k1.y); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.tieSh; ctx.beginPath(); ctx.ellipse(knot.x, knot.y, 4.2, 3.6, p.B, 0, TAU); ctx.fill(); ctx.stroke();
}

function drawArm(sh, elb, hand, back) {
  const shirt = back ? lerpColor(C.shirtSh, '#a9bddc', S.pose.wet) : lerpColor(C.shirt, C.shirtWet, S.pose.wet);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  poly([sh, elb, hand]); ctx.strokeStyle = INK; ctx.lineWidth = 15; ctx.stroke();
  ctx.strokeStyle = back ? C.skinSh : C.skin; ctx.lineWidth = 9.5; poly([elb, hand]); ctx.stroke();
  // rolled sleeve
  const cuff = vlerp(elb, hand, 0.18);
  ctx.strokeStyle = shirt; ctx.lineWidth = 11; poly([sh, elb, cuff]); ctx.stroke();
  const d = norm(sub(hand, elb)), n = V(-d.y, d.x);
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath();
  ctx.moveTo(cuff.x + n.x * 6.5, cuff.y + n.y * 6.5); ctx.lineTo(cuff.x - n.x * 6.5, cuff.y - n.y * 6.5); ctx.stroke();
}
function drawFist(h, ang, back) {
  withFrame(h, ang, () => {
    ctx.fillStyle = back ? C.skinSh : C.skin; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(-6, -7, 12, 14, 5); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-1, -6); ctx.lineTo(-1, 6); ctx.stroke();
  });
}

function drawCharacter(t) {
  const p = S.pose;
  ctx.save();
  if (p.sq !== 1) { const sy = p.sq, sx = 1 + (1 - sy) * 0.9; ctx.translate(p.P.x, GROUND); ctx.scale(sx, sy); ctx.translate(-p.P.x, -GROUND); }
  const shoeOff = t >= 2.30 && t < 5.25;
  // back arm & leg
  drawArm(p.shB, p.elbB, p.handB, true);
  const [lb, lf] = p.legs;
  limb([lb.hip, lb.knee, lb.ank], 13, C.pantsSh);
  drawShoe(lb.ank, lb.footA, false);
  drawTorso(p);
  limb([lf.hip, lf.knee, lf.ank], 13, C.pants);
  drawShoe(lf.ank, lf.footA, shoeOff);
  drawTie(p);
  drawHead(p, t);
  drawNozzle(p);
  const wNoz = track(TR.wNoz, t);
  drawFist(p.handB, wNoz > 0.5 ? p.A + Math.PI / 2 : p.B, true);
  drawArm(p.shF, p.elbF, p.handF, false);
  drawFist(p.handF, p.A + Math.PI / 2, false);
  ctx.restore();
}

function drawShadow() {
  const p = S.pose;
  const low = Math.max(p.legs[0].ank.y, p.legs[1].ank.y);
  const h = clamp((GROUND - 6 - low) / 200, 0, 1);
  ctx.fillStyle = `rgba(30,70,30,${0.28 * (1 - h * 0.7)})`;
  ctx.beginPath(); ctx.ellipse(p.P.x + 4, GROUND + 4, 36 * (1 - h * 0.5), 6.5 * (1 - h * 0.5), 0, 0, TAU); ctx.fill();
}

function drawSpeedLines(t) {
  const p = S.pose; if (p.m < 0.5) return;
  const v = Gvel(t), sp = len(v); if (sp < 250) return;
  const d = mul(v, 1 / sp), n = V(-d.y, d.x), c = p.L(V(0, -40));
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineCap = 'round'; ctx.lineWidth = 3;
  [-34, -12, 12, 34].forEach((o, i) => {
    const st = add(add(c, mul(n, o)), mul(d, -30 - (i % 2) * 14));
    const en = sub(st, mul(d, clamp(sp * 0.1, 20, 70)));
    ctx.beginPath(); ctx.moveTo(st.x, st.y); ctx.lineTo(en.x, en.y); ctx.stroke();
  });
}

// ---------------------------------------------------------------- water drawing
function drawWater() {
  const P = S.particles;
  const cores = P.filter(p => p.kind === 'core' && !p.broken).sort((a, b) => a.seq - b.seq);
  const segs = [];
  for (let i = 0; i + 1 < cores.length; i++) {
    const a = cores[i], b = cores[i + 1];
    if (b.seq - a.seq === 1 && Math.hypot(b.x - a.x, b.y - a.y) < 34) segs.push([a, b, 9 + Math.min(a.age, 0.5) * 12]);
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const drops = P.filter(p => p.kind === 'drop' || p.kind === 'splash' || (p.kind === 'core' && p.broken));
  // outlines
  ctx.strokeStyle = C.waterInk;
  for (const [a, b, w] of segs) { ctx.lineWidth = w + 4.5; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  ctx.fillStyle = C.waterInk;
  for (const d of drops) { ctx.beginPath(); ctx.arc(d.x, d.y, d.r + 1.2, 0, TAU); ctx.fill(); }
  // fill
  ctx.strokeStyle = C.water;
  for (const [a, b, w] of segs) { ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  ctx.fillStyle = C.water;
  for (const d of drops) { ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill(); }
  // highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  for (const [a, b, w] of segs) { ctx.lineWidth = Math.max(1.5, w * 0.25); ctx.beginPath(); ctx.moveTo(a.x, a.y - w * 0.18); ctx.lineTo(b.x, b.y - w * 0.18); ctx.stroke(); }
  ctx.fillStyle = '#fff';
  for (const d of drops) if (d.r > 2.4) { ctx.beginPath(); ctx.arc(d.x - d.r * 0.3, d.y - d.r * 0.35, d.r * 0.3, 0, TAU); ctx.fill(); }
  // drips (teardrops)
  for (const d of P) if (d.kind === 'drip') {
    const r = d.r;
    ctx.fillStyle = C.water; ctx.strokeStyle = C.waterInk; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(d.x, d.y - r * 2.4); ctx.quadraticCurveTo(d.x + r * 1.3, d.y - r * 0.2, d.x, d.y + r); ctx.quadraticCurveTo(d.x - r * 1.3, d.y - r * 0.2, d.x, d.y - r * 2.4);
    ctx.fill(); ctx.stroke();
  }
  // clods
  for (const d of P) if (d.kind === 'clod') { circ(V(d.x, d.y), d.r, d.col, INK, 1.4); }
  // impact burst on the face
  for (const b of S.bursts) {
    const r2 = mulberry32(b.seed);
    ctx.beginPath();
    const n = 12;
    for (let i = 0; i <= n * 2; i++) {
      const a = i / (n * 2) * TAU, rad = i % 2 ? 7 + r2() * 4 : 14 + r2() * 12;
      const x = b.p.x + Math.cos(a) * rad, y = b.p.y + Math.sin(a) * rad;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.fillStyle = '#e4f7ff'; ctx.fill(); ctx.strokeStyle = C.waterInk; ctx.lineWidth = 2.2; ctx.stroke();
    ctx.fillStyle = C.water; ctx.beginPath(); ctx.arc(b.p.x, b.p.y, 7, 0, TAU); ctx.fill();
  }
}
function drawCrowns() {
  for (const c of S.crowns) {
    const u = c.age / 0.22, rx = 4 + 14 * u;
    ctx.strokeStyle = `rgba(47,128,209,${0.8 * (1 - u)})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, rx * 0.28, 0, 0, TAU); ctx.stroke();
  }
}

function shoePos(t) {
  // detached shoe: flies off at 2.30, falls back onto his head at 4.85, bounces onto his foot at 5.25
  if (t < 2.30 || t >= 5.25 || !S.shoeLaunch) return null;
  if (t < 4.6) {
    const L = S.shoeLaunch, u = t - 2.30;
    // once it has left the top of the frame it stays 'up there' until it falls back
    const yOut = -40 - L.p.y, disc = L.v.y * L.v.y + 2 * 1500 * yOut;
    if (disc > 0 && u > (-L.v.y - Math.sqrt(disc)) / 1500) return null;
    return { p: V(L.p.x + L.v.x * u, L.p.y + L.v.y * u + 0.5 * 1500 * u * u), a: L.a + u * 14 };
  }
  const gp = groundPose(4.85), headTop = add(add(gp.P, rot(NECK, gp.B)), rot(V(3, -24 - 30), gp.B + gp.head));
  if (t < 4.85) {
    const tau = 4.85 - t, v0 = 600, g = 1800;
    return { p: V(headTop.x, headTop.y - (v0 * tau + 0.5 * g * tau * tau)), a: 2.4 + tau * 10 };
  }
  const gp2 = groundPose(5.25), foot = V(gp2.P.x + track(TR.fF, 5.25), GROUND - 6);
  const u = t - 4.85, T2 = 0.4, g = 3700;
  const vx = (foot.x - headTop.x) / T2, vy = (foot.y - headTop.y - 0.5 * g * T2 * T2) / T2;
  return { p: V(headTop.x + vx * u, headTop.y + vy * u + 0.5 * g * u * u), a: TAU * 2 * (1 - u / T2) };
}
function drawLooseShoe(t) {
  const s = shoePos(t); if (!s) return;
  withFrame(s.p, s.a, () => { ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 2.6; shoeShape(); });
}

function drawCaption() {
  if (!CAPTION) return;
  ctx.save();
  ctx.font = '800 25px Inter, "Inter Display", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.strokeText(CAPTION, W / 2, H - 28);
  ctx.fillStyle = '#ffffff'; ctx.fillText(CAPTION, W / 2, H - 28);
  ctx.restore();
}

function render(t) {
  ctx.setTransform(SS, 0, 0, SS, 0, 0);
  ctx.drawImage(bg, 0, 0, W, H);
  drawShadow();
  drawCrowns();
  drawHose(t);
  drawSpeedLines(t);
  drawCharacter(t);
  drawWater();
  drawLooseShoe(t);
  drawCaption();
}

// ---------------------------------------------------------------- API used by the renderer
function init(opts = {}) {
  SS = opts.ss || 2; CAPTION = opts.caption || '';
  canvas = document.getElementById('c'); canvas.width = W * SS; canvas.height = H * SS;
  ctx = canvas.getContext('2d');
  bg = document.createElement('canvas'); bg.width = W * SS; bg.height = H * SS;
  const bc = bg.getContext('2d'); bc.setTransform(SS, 0, 0, SS, 0, 0); drawBackground(bc);
  buildAir(); resetSim();
  return { N, FPS };
}
function frame(fi, draw) {
  const t = (fi % N) / N * T;
  step(t, fi);
  if (draw) { render(t); return canvas.toDataURL('image/png'); }
  return null;
}
window.HOSE = { init, frame, N, FPS };
