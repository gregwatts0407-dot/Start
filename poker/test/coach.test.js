const test = require('node:test');
const assert = require('node:assert');
const C = require('../js/cards.js');
const E = require('../js/engine.js');
const AI = require('../js/ai.js');
const Coach = require('../js/coach.js');

test('coach gives legal, explained advice in random spots', () => {
  const rng = C.makeRng(42);
  let spots = 0;
  const seen = {};
  for (let gm = 0; gm < 6; gm++) {
    const n = 2 + gm;
    const g = E.createGame({ smallBlind: 5, bigBlind: 10, startingStack: 1000,
      players: Array.from({ length: n }, (_, i) => ({ name: 'B' + i, isBot: true, profile: Object.keys(AI.PROFILES)[i % 7] })) });
    for (let h = 0; h < 25; h++) {
      for (const s of g.seats) if (s.stack === 0) s.stack = 1000;
      E.startHand(g, rng);
      while (g.street !== 'complete') {
        if (E.needsAdvance(g)) { E.advance(g); continue; }
        const adv = Coach.advise(g, g.toAct, null, { iterations: 200 });
        assert.ok(adv && adv.rec, 'has recommendation');
        assert.ok(adv.reasons.length > 0);
        for (const r of adv.reasons) assert.ok(!/undefined|NaN/.test(r), r);
        const L = E.legalActions(g);
        if (adv.rec.type === 'check') assert.ok(L.canCheck, 'check only when legal');
        if (adv.rec.type === 'raise') assert.ok(L.canRaise, 'raise only when legal: ' + adv.rec.label);
        if (adv.rec.type === 'raise') assert.ok(adv.rec.amount >= L.minRaiseTo && adv.rec.amount <= L.maxRaiseTo);
        seen[adv.rec.type] = (seen[adv.rec.type] || 0) + 1;
        const a = AI.decide(g, g.toAct, rng);
        const gr = Coach.grade(adv, a);
        assert.ok(gr && gr.label && !/undefined|NaN/.test(gr.note), JSON.stringify(gr));
        E.act(g, g.toAct, a);
        spots++;
      }
    }
  }
  assert.ok(spots > 300);
  assert.ok(seen.fold && seen.call && seen.raise && seen.check, JSON.stringify(seen));
});
