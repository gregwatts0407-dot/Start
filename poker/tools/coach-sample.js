// Prints coach advice for random spots so its wording and logic can be reviewed.
const C = require('../js/cards.js'), E = require('../js/engine.js'), AI = require('../js/ai.js'), Coach = require('../js/coach.js');
const rng = C.makeRng(Number(process.argv[2]) || 11);
const want = Number(process.argv[3]) || 12;
let shown = 0;
const g = E.createGame({ smallBlind: 5, bigBlind: 10, startingStack: 1000,
  players: ['hero', 'tag', 'station', 'lag', 'rock', 'maniac'].map((p, i) => ({ name: i ? 'B' + i : 'Hero', isBot: !!i, profile: i ? p : null })) });
while (shown < want) {
  for (const s of g.seats) if (s.stack < 300) s.stack = 1000;
  E.startHand(g, rng);
  while (g.street !== 'complete') {
    if (E.needsAdvance(g)) { E.advance(g); continue; }
    if (g.toAct === 0 && (process.argv[4] !== 'post' || g.street !== 'preflop') && rng() < 0.6) {
      const a = Coach.advise(g, 0, null, { iterations: 3000 });
      const h = g.seats[0].cards.map(C.cardStr).join(' ');
      console.log(`\n[${g.street}] ${E.positionOf(g, 0)}  hand ${h}  board ${g.board.map(C.cardStr).join(' ') || '-'}  pot ${a.pot} toCall ${a.toCall}`);
      console.log('  last actions:', g.actions.slice(-4).map((x) => g.seats[x.seat].name + ' ' + x.type + (x.type === 'raise' || x.type === 'call' ? ' ' + x.amount : '')).join(', '));
      console.log('  => ' + a.rec.label + '   (equity ' + Math.round(a.equity * 100) + '%)');
      a.reasons.forEach((r) => console.log('     - ' + r));
      if (a.alt) console.log('     alt: ' + a.alt);
      shown++;
    }
    const a2 = AI.decide(g, g.toAct, rng);
    E.act(g, g.toAct, a2);
  }
}
