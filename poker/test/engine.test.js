const test = require('node:test');
const assert = require('node:assert');
const C = require('../js/cards.js');
const E = require('../js/engine.js');
const AI = require('../js/ai.js');
const Q = require('../js/equity.js');

const ev = (s) => C.evaluate(C.parseCards(s));

test('hand categories', () => {
  const cases = [
    ['As Ks Qs Js Ts 2d 3c', 'Royal Flush'],
    ['9h 8h 7h 6h 5h Ad Ac', 'Straight Flush, Nine high'],
    ['Ah 2h 3h 4h 5h Kd Kc', 'Straight Flush, Five high'],
    ['7s 7h 7d 7c Ks 2d 3c', 'Four Sevens'],
    ['Ks Kh Kd 2c 2s 2d 3c', 'Full House, Kings full of Twos'],
    ['Ks Kh Kd Qc Qs 2d 2c', 'Full House, Kings full of Queens'],
    ['As 9s 7s 4s 2s Kd Kc', 'Flush, Ace high'],
    ['Ad 2c 3h 4s 5d 9c Kh', 'Straight, Five high'],
    ['Td Jc Qh Ks Ad 2c 3h', 'Straight, Ace high'],
    ['8c 8d 8h As Kd 2c 3h', 'Three Eights'],
    ['Ac Ad 7h 7s Kd Kc 3h', 'Two Pair, Aces and Kings'],
    ['Jc Jd 7h 4s 2d 9c Kh', 'Pair of Jacks'],
    ['Ac Jd 7h 4s 2d 9c Kh', 'Ace High'],
  ];
  for (const [cards, name] of cases) assert.strictEqual(C.describe(ev(cards)), name, cards);
});

test('hand comparisons and kickers', () => {
  assert.ok(ev('Ac Ad Kh 7s 2d 3c 9h') > ev('Ac Ad Qh 7s 2d 3c 9h'));
  assert.ok(ev('Kc Kd Kh 2s 2d') > ev('Qc Qd Qh As Ad'));
  assert.ok(ev('2c 3c 4c 5c 7c') > ev('Ad Kc Qh Js Td'));
  assert.strictEqual(ev('As Kd Qh Js 9c 2d 3c'), ev('Ad Kc Qs Jh 9d 2s 3h'));
  // two pair: third pair on board doesn't count, kicker does
  assert.ok(ev('Ac Ad Kh Ks Qd Qc 2h') > ev('Ac Ad Kh Ks Jd Jc Th'));
  // wheel loses to six-high straight
  assert.ok(ev('2c 3d 4h 5s 6d') > ev('Ac 2d 3h 4s 5d'));
  // flush kicker deep comparison
  assert.ok(ev('Ah Kh 9h 5h 3h') > ev('Ah Kh 9h 5h 2h'));
});

test('bestFive picks the right five cards', () => {
  const r = C.bestFive(C.parseCards('As Ks Qs Js Ts 2d 3c'));
  assert.strictEqual(r.cards.map(C.cardStr).sort().join(), ['As', 'Ks', 'Qs', 'Js', 'Ts'].sort().join());
});

test('hand classes and grid', () => {
  assert.strictEqual(C.handClass(C.parseCard('Kh'), C.parseCard('Ah')), 'AKs');
  assert.strictEqual(C.handClass(C.parseCard('2c'), C.parseCard('7d')), '72o');
  for (const cls of C.allClasses()) {
    const { row, col } = C.classGrid(cls);
    assert.strictEqual(C.gridClass(row, col), cls);
  }
  assert.strictEqual(C.allClasses().reduce((a, c) => a + C.classCombos(c), 0), 1326);
});

function game(stacks, opts) {
  return E.createGame(Object.assign({
    smallBlind: 5, bigBlind: 10,
    players: stacks.map((s, i) => ({ name: 'P' + i, stack: s })),
  }, opts));
}
const total = (g) => g.seats.reduce((a, s) => a + s.stack + (g.street === 'complete' ? 0 : s.total), 0);
function runOut(g) { while (E.needsAdvance(g)) E.advance(g); }

test('heads-up: button posts small blind and acts first preflop, last postflop', () => {
  const g = game([1000, 1000]);
  E.startHand(g, C.makeRng(1));
  assert.strictEqual(g.sbSeat, g.button);
  assert.strictEqual(g.toAct, g.button);
  E.act(g, g.toAct, { type: 'call' });
  assert.strictEqual(g.toAct, g.bbSeat); // BB option
  E.act(g, g.toAct, { type: 'check' });
  assert.ok(E.needsAdvance(g));
  E.advance(g);
  assert.strictEqual(g.street, 'flop');
  assert.strictEqual(g.toAct, g.bbSeat);
});

test('uncontested pot returns uncalled bet', () => {
  const g = game([1000, 1000, 1000]);
  E.startHand(g, C.makeRng(2));
  const first = g.toAct;
  E.act(g, first, { type: 'raise', amount: 30 });
  E.act(g, g.toAct, { type: 'fold' });
  E.act(g, g.toAct, { type: 'fold' });
  assert.strictEqual(g.street, 'complete');
  assert.strictEqual(g.seats[first].stack, 1015);
  assert.strictEqual(total(g), 3000);
});

test('min-raise rules and incomplete all-in raise does not reopen', () => {
  const g = game([1000, 1000, 125]);
  g.button = 2; // so seat 0 is SB, seat 1 is BB, seat 2 is button
  E.startHand(g, C.makeRng(3)); // button moves to seat 0
  // find the seats
  const btn = g.button, sb = g.sbSeat, bb = g.bbSeat;
  assert.strictEqual(g.toAct, btn);
  let L = E.legalActions(g);
  assert.strictEqual(L.minRaiseTo, 20);
  E.act(g, btn, { type: 'raise', amount: 100 }); // raise of 90
  L = E.legalActions(g);
  assert.strictEqual(L.minRaiseTo, 190);
  void sb; void bb;
});

test('incomplete raise: earlier actor may only call or fold', () => {
  const g = game([1000, 1000, 1000]);
  E.startHand(g, C.makeRng(4));
  const a = g.toAct; // button (UTG in 3-handed)
  g.seats[g.sbSeat].stack = 115; // SB will have 120 total
  E.act(g, a, { type: 'raise', amount: 100 });
  const sbIdx = g.toAct;
  assert.strictEqual(sbIdx, g.sbSeat);
  E.act(g, sbIdx, { type: 'allin' }); // to 120: incomplete raise (needs 190)
  assert.strictEqual(g.currentBet, 120);
  const bbIdx = g.toAct;
  let L = E.legalActions(g);
  assert.ok(L.canRaise, 'BB has not acted and may raise');
  E.act(g, bbIdx, { type: 'call' });
  assert.strictEqual(g.toAct, a);
  L = E.legalActions(g);
  assert.ok(!L.canRaise, 'original raiser cannot re-raise an incomplete raise');
  assert.strictEqual(L.toCall, 20);
});

test('side pots are built and awarded correctly', () => {
  const g = game([100, 300, 1000]);
  E.startHand(g, C.makeRng(5));
  // force known cards
  const [p0, p1, p2] = g.seats;
  p0.cards = C.parseCards('As Ad'); p1.cards = C.parseCards('Ks Kd'); p2.cards = C.parseCards('Qs Qd');
  g.deck = C.parseCards('2c 3d 7h 8s 9c Jd 4h 5h 6c').reverse(); // burn 2c, flop 3d 7h 8s, burn 9c, turn Jd, burn 4h, river 5h
  g.deck.unshift(...C.parseCards('2h 2d'));
  while (g.street !== 'complete') {
    if (E.needsAdvance(g)) { E.advance(g); continue; }
    E.act(g, g.toAct, { type: 'allin' });
  }
  const pots = g.result.pots;
  assert.strictEqual(pots.length, 2); // the uncalled 700 goes straight back
  assert.strictEqual(pots[0].amount, 300); // 100 x3
  assert.deepStrictEqual(pots[0].winners, [0]);
  assert.strictEqual(pots[1].amount, 400); // 200 x2
  assert.deepStrictEqual(pots[1].winners, [1]);
  assert.strictEqual(p0.stack, 300); assert.strictEqual(p1.stack, 400); assert.strictEqual(p2.stack, 700);
});

test('split pot with odd chip', () => {
  const g = game([1000, 1000, 1000]);
  E.startHand(g, C.makeRng(6));
  for (const s of g.seats) s.cards = [];
  g.seats[0].cards = C.parseCards('2c 3c'); g.seats[1].cards = C.parseCards('2d 3d'); g.seats[2].cards = C.parseCards('4h 4s');
  // board: A K Q J T straight on board → all tie
  g.deck = C.parseCards('9h As Ks Qd 9d Jc 9s Th').reverse();
  while (g.street !== 'complete') {
    if (E.needsAdvance(g)) { E.advance(g); continue; }
    E.act(g, g.toAct, { type: g.toAct === g.sbSeat ? 'call' : E.legalActions(g).canCheck ? 'check' : 'call' });
  }
  assert.strictEqual(g.result.pots[0].winners.length, 3);
  assert.strictEqual(total(g), 3000);
});

test('tournament: blinds rise and the game ends with one winner', () => {
  const g = E.createGame({ mode: 'tournament', smallBlind: 10, bigBlind: 20, startingStack: 500, handsPerLevel: 3,
    players: [0, 1, 2, 3].map((i) => ({ name: 'B' + i, isBot: true, profile: ['maniac', 'lag', 'station', 'tag'][i] })) });
  const rng = C.makeRng(77);
  let guard = 0;
  while (!g.over && guard++ < 3000) {
    E.startHand(g, rng);
    while (g.street !== 'complete') {
      if (E.needsAdvance(g)) { E.advance(g); continue; }
      const a = AI.decide(g, g.toAct, rng);
      assert.ok(E.act(g, g.toAct, a).ok);
    }
    assert.strictEqual(g.seats.reduce((a, s) => a + s.stack, 0), 2000);
  }
  assert.ok(g.over, 'tournament finished');
  assert.strictEqual(g.finishOrder.length, 4);
  const places = g.finishOrder.map((f) => f.place).sort();
  assert.deepStrictEqual(places, [1, 2, 3, 4]);
  assert.ok(g.level > 0);
});

test('fuzz: thousands of bot hands keep chips constant and actions legal', () => {
  const profiles = Object.keys(AI.PROFILES);
  for (let seed = 1; seed <= 12; seed++) {
    const rng = C.makeRng(seed * 101);
    const n = 2 + (seed % 8);
    const g = E.createGame({ smallBlind: 5, bigBlind: 10, ante: seed % 3 === 0 ? 1 : 0, startingStack: 400 + seed * 50,
      players: Array.from({ length: n }, (_, i) => ({ name: 'X' + i, isBot: true, profile: profiles[(i + seed) % profiles.length] })) });
    const chips = g.seats.reduce((a, s) => a + s.stack, 0);
    for (let h = 0; h < 120; h++) {
      // rebuy busted players to keep the game going
      for (const s of g.seats) if (s.stack === 0) { s.stack = 400; }
      const bank = g.seats.reduce((a, s) => a + s.stack, 0);
      if (!E.startHand(g, rng)) break;
      let steps = 0;
      while (g.street !== 'complete') {
        assert.ok(steps++ < 500, 'hand terminates');
        if (E.needsAdvance(g)) { E.advance(g); continue; }
        const L = E.legalActions(g);
        assert.ok(L, 'someone to act');
        const a = AI.decide(g, g.toAct, rng);
        const r = E.act(g, g.toAct, a);
        assert.ok(r.ok, JSON.stringify(a) + ' ' + r.error);
        if (g.street !== 'complete') assert.strictEqual(g.seats.reduce((x, s) => x + s.stack + s.total, 0), bank);
        for (const s of g.seats) assert.ok(s.stack >= 0);
      }
      assert.strictEqual(g.seats.reduce((x, s) => x + s.stack, 0), bank, 'chips conserved after hand ' + g.handNo);
      if (g.result.uncontested === false) assert.strictEqual(g.board.length, 5);
    }
    void chips;
  }
});

test('equity sanity', () => {
  const rng = C.makeRng(9);
  const aa = Q.equity({ hero: C.parseCards('As Ah'), board: [], opponents: 1, iterations: 6000, rng });
  assert.ok(Math.abs(aa.equity - 0.85) < 0.02, 'AA vs random ≈ 85%: ' + aa.equity);
  const hu = Q.headsUpEquity(C.parseCards('Ah Kh'), C.parseCards('Qs Qd'), C.parseCards('2h 7h 9c'));
  assert.ok(hu.a > 0.45 && hu.a < 0.55, 'AKhh flush draw + overs vs QQ on flop ≈ 50%: ' + hu.a);
  const exact = Q.headsUpEquity(C.parseCards('As Ad'), C.parseCards('Ks Kd'), C.parseCards('2c 7h 9d Jc'));
  assert.ok(Math.abs(exact.a - 42 / 44) < 1e-9);
});

test('outs and draws', () => {
  const a = Q.analyze(C.parseCards('Ah Kh'), C.parseCards('2h 7h 9c'));
  assert.ok(a.flushDraw && a.nutFlushDraw);
  assert.strictEqual(a.outGroups.Flush.length, 9);
  const b = Q.analyze(C.parseCards('9s 8d'), C.parseCards('7c 6h 2s'));
  assert.ok(b.oesd);
  assert.strictEqual(b.outGroups.Straight.length, 8);
  const c = Q.analyze(C.parseCards('9s 8d'), C.parseCards('Jc 7h 2s'));
  assert.ok(c.gutshot && !c.oesd);
});

test('viewFor hides opponents cards', () => {
  const g = game([1000, 1000, 1000]);
  E.startHand(g, C.makeRng(8));
  const v = E.viewFor(g, 1);
  assert.ok(v.seats[1].cards.every((c) => c >= 0));
  assert.ok(v.seats[0].cards.every((c) => c === -1));
  assert.strictEqual(v.deck, undefined);
});
