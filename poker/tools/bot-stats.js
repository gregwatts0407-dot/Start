// Simulates bot tables and prints per-profile VPIP / PFR / win rate.
const C = require('../js/cards.js'), E = require('../js/engine.js'), AI = require('../js/ai.js');
const profs = Object.keys(AI.PROFILES);
const st = {}; profs.forEach(p => st[p] = { hands: 0, vpip: 0, pfr: 0, net: 0, sd: 0, af_b: 0, af_c: 0 });
const rng = C.makeRng(5);
for (let t = 0; t < 14; t++) {
  const players = Array.from({ length: 6 }, (_, i) => ({ name: 'B' + i, isBot: true, profile: profs[(i + t) % profs.length] }));
  const g = E.createGame({ smallBlind: 5, bigBlind: 10, startingStack: 1000, players });
  for (let h = 0; h < 300; h++) {
    for (const s of g.seats) if (s.stack < 200) { st[s.profile].net -= (1000 - s.stack); s.stack = 1000; }
    E.startHand(g, rng);
    while (g.street !== 'complete') { if (E.needsAdvance(g)) { E.advance(g); continue; } E.act(g, g.toAct, AI.decide(g, g.toAct, rng)); }
    for (const s of g.seats) {
      const a = g.actions.filter(x => x.seat === s.index);
      const pre = a.filter(x => x.street === 'preflop');
      st[s.profile].hands++;
      if (pre.some(x => x.type === 'call' || x.type === 'raise')) st[s.profile].vpip++;
      if (pre.some(x => x.type === 'raise')) st[s.profile].pfr++;
      a.filter(x => x.street !== 'preflop').forEach(x => { if (x.type === 'raise') st[s.profile].af_b++; if (x.type === 'call') st[s.profile].af_c++; });
    }
  }
  for (const s of g.seats) st[s.profile].net += s.stack - 1000;
}
for (const p of profs) { const s = st[p]; console.log(p.padEnd(8), 'VPIP', (100*s.vpip/s.hands).toFixed(0).padStart(3)+'%', 'PFR', (100*s.pfr/s.hands).toFixed(0).padStart(3)+'%', 'AF', (s.af_b/Math.max(1,s.af_c)).toFixed(1), 'bb/100', (s.net/10/(s.hands/100)).toFixed(1)); }
