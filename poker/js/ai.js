/*
 * ai.js — computer opponents and opponent-range estimation.
 * Each bot has a personality (how loose, aggressive and tricky it is) and a
 * skill level (how well it reads ranges and respects pot odds).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cards.js'), require('./engine.js'), require('./equity.js'));
  else root.PokerAI = factory(root.PokerCards, root.PokerEngine, root.PokerEquity);
})(typeof self !== 'undefined' ? self : this, function (C, E, Q) {
  'use strict';

  const PROFILES = {
    rock:    { label: 'Rock',            blurb: 'Plays very few hands and rarely bluffs. When a Rock bets big, believe it.', open: 0.11, pfr: 0.85, threeBet: 0.025, call: 0.08, aggr: 0.35, bluff: 0.04, sticky: 0.3, skill: 0.65 },
    tag:     { label: 'Tight-Aggressive', blurb: 'Selective but aggressive — the classic winning style.', open: 0.19, pfr: 0.92, threeBet: 0.06, call: 0.13, aggr: 0.72, bluff: 0.16, sticky: 0.42, skill: 0.92 },
    lag:     { label: 'Loose-Aggressive', blurb: 'Plays many hands and applies constant pressure. Hard to read.', open: 0.3, pfr: 0.9, threeBet: 0.11, call: 0.2, aggr: 0.82, bluff: 0.28, sticky: 0.5, skill: 0.85 },
    station: { label: 'Calling Station',  blurb: 'Calls far too much and rarely raises. Value-bet them relentlessly; never bluff them.', open: 0.42, pfr: 0.25, threeBet: 0.015, call: 0.42, aggr: 0.18, bluff: 0.04, sticky: 0.9, skill: 0.35 },
    maniac:  { label: 'Maniac',           blurb: 'Raises with anything. Tighten up and let them bluff into your strong hands.', open: 0.58, pfr: 0.95, threeBet: 0.22, call: 0.35, aggr: 0.95, bluff: 0.45, sticky: 0.55, skill: 0.4 },
    shark:   { label: 'Shark',            blurb: 'A strong, balanced regular. Few mistakes to exploit.', open: 0.22, pfr: 0.95, threeBet: 0.08, call: 0.15, aggr: 0.7, bluff: 0.2, sticky: 0.45, skill: 1 },
    novice:  { label: 'Novice',           blurb: 'Still learning: plays too many hands and makes random mistakes.', open: 0.35, pfr: 0.45, threeBet: 0.03, call: 0.3, aggr: 0.35, bluff: 0.1, sticky: 0.7, skill: 0.25 },
  };

  const DIFFICULTY_MIX = {
    easy: ['novice', 'station', 'rock', 'novice', 'station', 'maniac', 'novice', 'station'],
    medium: ['tag', 'station', 'lag', 'rock', 'novice', 'maniac', 'tag', 'station'],
    hard: ['shark', 'tag', 'lag', 'shark', 'tag', 'lag', 'shark', 'rock'],
  };

  const BOT_NAMES = ['Viktor', 'Mei', 'Rafael', 'Amara', 'Lucas', 'Ingrid', 'Kenji', 'Sofia', 'Dmitri', 'Priya', 'Omar', 'Elena',
    'Tobias', 'Yuki', 'Mateo', 'Zara', 'Felix', 'Nadia', 'Hugo', 'Leila', 'Arjun', 'Clara', 'Bruno', 'Ana'];

  // ---------- range estimation ----------
  /**
   * Estimate an opponent's range from their actions this hand.
   * stats (optional): observed {hands, vpip, pfr} to widen/narrow for loose/tight players.
   * Returns {lo, hi, line, label}.
   */
  function estimateRange(g, o, stats) {
    const acts = g.actions.filter((a) => a.seat === o);
    const pre = acts.filter((a) => a.street === 'preflop');
    let lo = 0, hi = 1, label = 'any two cards';
    let raisesBefore = 0;
    let looseness = 1;
    const seat = g.seats[o];
    const prof = seat && seat.profile && PROFILES[seat.profile];
    if (stats && stats.hands >= 12) looseness = Math.max(0.5, Math.min(2.5, (stats.vpip / stats.hands) / 0.25));
    else if (prof) looseness = Math.max(0.5, Math.min(2.5, prof.open / 0.2));

    for (const a of g.actions) {
      if (a.street !== 'preflop') break;
      if (a.seat === o) {
        if (a.type === 'raise') {
          if (raisesBefore === 0) { hi = 0.2 * looseness; label = 'opening range'; }
          else if (raisesBefore === 1) { hi = 0.07 * looseness; label = '3-bet range'; }
          else { hi = 0.035 * Math.sqrt(looseness); label = '4-bet range'; }
          lo = 0;
        } else if (a.type === 'call') {
          if (raisesBefore === 0) { lo = 0.06; hi = 0.5 * looseness; label = 'limping range'; }
          else if (raisesBefore === 1) { lo = 0.025; hi = (o === g.bbSeat ? 0.42 : 0.24) * looseness; label = 'calling range'; }
          else { lo = 0.01; hi = 0.09 * looseness; label = 'calling a 3-bet'; }
        } else if (a.type === 'check' && o === g.bbSeat) { lo = 0.04; hi = 1; label = 'big blind checked'; }
      }
      if (a.type === 'raise') raisesBefore++;
    }
    hi = Math.min(1, hi);
    // postflop: the latest street on which they acted
    let line = 'none';
    const post = acts.filter((a) => a.street !== 'preflop');
    if (post.length) {
      const last = post[post.length - 1];
      if (last.type === 'raise') line = last.facing > 0 ? 'raise' : 'bet';
      else if (last.type === 'call') line = 'call';
      else if (last.type === 'check') line = 'check';
      if (line !== 'none') label += ', then ' + ({ raise: 'raised', bet: 'bet', call: 'called', check: 'checked' })[line];
    }
    if (!pre.length && o === g.bbSeat) label = 'big blind (any two)';
    return { lo, hi, line, label };
  }

  function opponentRanges(g, heroIdx, statsBySeat) {
    const out = [];
    g.seats.forEach((s, i) => {
      if (i === heroIdx || !E.live(s)) return;
      const r = estimateRange(g, i, statsBySeat && statsBySeat[i]);
      r.seat = i;
      out.push(r);
    });
    return out;
  }

  // ---------- helpers ----------
  function playersBehind(g, idx) {
    // players who still act after idx preflop (including blinds)
    let n = 0, i = idx;
    for (;;) {
      i = E.nextSeat(g, i, (s) => E.canAct(s));
      if (i < 0 || i === idx) break;
      const s = g.seats[i];
      if (!s.acted || i === g.sbSeat || i === g.bbSeat) n++;
      if (i === g.bbSeat) break;
    }
    return n;
  }
  function roundTo(g, x) {
    const unit = Math.max(1, g.sb);
    return Math.max(unit, Math.round(x / unit) * unit);
  }
  function raiseAction(g, L, to) {
    let amt = roundTo(g, to);
    amt = Math.max(L.minRaiseTo, Math.min(L.maxRaiseTo, amt));
    if (amt >= L.maxRaiseTo * 0.8) amt = L.maxRaiseTo; // commit instead of leaving a sliver
    return { type: 'raise', amount: amt };
  }
  const passive = (L) => (L.canCheck ? { type: 'check' } : { type: 'fold' });

  // ---------- decisions ----------
  function decide(g, idx, rng, statsBySeat) {
    rng = rng || Math.random;
    const s = g.seats[idx];
    const L = E.legalActions(g, idx);
    if (!L) return null;
    const prof = PROFILES[s.profile] || PROFILES.tag;
    try {
      return g.street === 'preflop' ? preflop(g, idx, s, L, prof, rng) : postflop(g, idx, s, L, prof, rng, statsBySeat);
    } catch (e) {
      return passive(L);
    }
  }

  function preflop(g, idx, s, L, prof, rng) {
    const noise = (rng() - 0.5) * (1 - prof.skill) * 0.2;
    const p = Math.max(0, Q.handPct(s.cards[0], s.cards[1]) + noise);
    const bb = g.bb;
    const stackBB = (s.stack + s.bet) / bb;
    const raises = g.actions.filter((a) => a.street === 'preflop' && a.type === 'raise').length;
    const limpers = g.actions.filter((a) => a.street === 'preflop' && a.type === 'call').length;
    const active = g.seats.filter((x) => x.inHand).length;
    const behind = playersBehind(g, idx);
    let posMult = Math.max(0.55, Math.min(2.2, 2.2 - 0.25 * behind));
    if (active === 2) posMult = 3.5;
    const openPct = Math.min(0.92, prof.open * posMult);
    const toCallBB = L.toCall / bb;
    const isBB = idx === g.bbSeat;

    // Short stack: push or fold
    if (stackBB <= 12) {
      if (raises === 0) {
        const pushPct = Math.min(0.85, (stackBB <= 5 ? 0.5 : stackBB <= 8 ? 0.32 : 0.21) * posMult * (0.7 + prof.aggr * 0.5));
        if (p <= pushPct) return { type: 'raise', amount: L.maxRaiseTo };
        return passive(L);
      }
      const odds = L.toCall / (L.pot + L.toCall);
      const callPct = Math.min(0.6, 0.06 + Math.max(0, 0.42 - odds) * 0.5 + prof.sticky * 0.05);
      if (p <= callPct * 0.6 && L.canRaise) return { type: 'raise', amount: L.maxRaiseTo };
      if (p <= callPct) return L.toCall >= L.stack ? { type: 'call' } : { type: 'raise', amount: L.maxRaiseTo };
      return passive(L);
    }

    if (raises === 0) {
      if (p <= openPct) {
        if (rng() < prof.pfr || p <= 0.05) {
          const size = (active === 2 ? 2.5 : idx === g.sbSeat ? 3 : 2.5) + limpers;
          return raiseAction(g, L, size * bb + (rng() < 0.3 ? bb * 0.5 : 0));
        }
        return L.canCheck ? { type: 'check' } : { type: 'call' };
      }
      if (L.canCheck) return { type: 'check' };
      // complete the small blind / overlimp with a decent price
      if (idx === g.sbSeat && p <= openPct * 1.6 && limpers > 0) return { type: 'call' };
      if (limpers > 0 && p <= openPct * 1.3 && prof.pfr < 0.6) return { type: 'call' };
      return { type: 'fold' };
    }

    // facing a raise
    const priceTight = toCallBB > stackBB * 0.25 ? 0.5 : toCallBB > 6 ? 0.75 : 1;
    if (raises === 1) {
      const lateOpen = g.actions.find((a) => a.type === 'raise' && a.street === 'preflop');
      const wide = lateOpen && behind <= 2 ? 1.4 : 1;
      if (p <= prof.threeBet * wide && L.canRaise) {
        const ip = !isBB && idx !== g.sbSeat;
        return raiseAction(g, L, g.currentBet * (ip ? 3 : 3.6));
      }
      let callPct = prof.call * (isBB ? 2.2 : 1) * priceTight;
      if (isBB && toCallBB <= 2) callPct *= 1.3;
      if (p <= callPct) return { type: 'call' };
      // occasional light 3-bet bluff from aggressive players with suited aces / connectors
      if (L.canRaise && rng() < prof.bluff * 0.12 && p < 0.45) return raiseAction(g, L, g.currentBet * 3.2);
      return passive(L);
    }
    // facing a 3-bet or more
    if (p <= 0.025 * (0.8 + prof.aggr * 0.4) && L.canRaise) {
      if (stackBB < 60 || raises >= 3) return { type: 'raise', amount: L.maxRaiseTo };
      return raiseAction(g, L, g.currentBet * 2.3);
    }
    if (p <= 0.07 * priceTight * (0.7 + prof.sticky * 0.6)) return { type: 'call' };
    return passive(L);
  }

  function postflop(g, idx, s, L, prof, rng, statsBySeat) {
    const opps = prof.skill >= 0.6
      ? opponentRanges(g, idx, statsBySeat)
      : g.seats.filter((x, i) => i !== idx && E.live(x)).map(() => ({ lo: 0, hi: 1, line: 'none' }));
    const eqRes = Q.equity({ hero: s.cards, board: g.board, opponents: opps, iterations: 260, rng });
    let eq = eqRes.equity + (rng() - 0.5) * (1 - prof.skill) * 0.18;
    const info = Q.analyze(s.cards, g.board);
    const pot = L.pot;
    const nOpp = opps.length;
    const inPosition = isLastToAct(g, idx);
    const wet = info.texture.wet;
    const drawy = info.flushDraw || info.oesd;
    const river = g.street === 'river';

    if (L.canCheck) {
      // value bet
      const valueLine = 0.62 - prof.aggr * 0.08 + (nOpp - 1) * 0.06;
      if (eq > valueLine) {
        if (eq > 0.85 && rng() < 0.18 * (1 - prof.aggr) + 0.05 && !river) return { type: 'check' }; // slowplay
        if (rng() < 0.55 + prof.aggr * 0.45) {
          const frac = (wet ? 0.7 : 0.55) + rng() * 0.25;
          return raiseAction(g, L, pot * frac);
        }
        return { type: 'check' };
      }
      // continuation bet / bluff
      const wasAggressor = g.preflopAggressor === idx && g.street === 'flop';
      let bluffP = prof.bluff * (inPosition ? 1.3 : 0.8) / nOpp;
      if (drawy) bluffP = Math.min(0.8, bluffP * 2.2 + 0.1);
      if (wasAggressor && nOpp <= 2) bluffP = Math.max(bluffP, (0.35 + prof.aggr * 0.35) / nOpp);
      if (river && !drawy) bluffP *= 0.7;
      if (rng() < bluffP) {
        const frac = wasAggressor && !wet ? 0.33 + rng() * 0.15 : 0.45 + rng() * 0.25;
        return raiseAction(g, L, pot * frac);
      }
      return { type: 'check' };
    }

    // facing a bet
    const odds = L.toCall / (pot + L.toCall);
    const commit = L.toCall >= L.stack * 0.6;
    let need = odds - prof.sticky * 0.07 + (commit ? 0.04 : 0);
    if (drawy && !river && !commit) need -= 0.05; // implied odds
    if (prof.skill < 0.5 && eq > 0.3) need = Math.min(need, 0.33 * (1 - prof.sticky) + 0.1);
    const raiseLine = 0.72 + (nOpp - 1) * 0.05 - prof.aggr * 0.06;
    if (eq > raiseLine && L.canRaise && rng() < 0.35 + prof.aggr * 0.55) {
      const to = g.currentBet + (pot + L.toCall) * (0.6 + rng() * 0.4);
      return raiseAction(g, L, to);
    }
    if (eq >= need) return { type: 'call' };
    if (L.canRaise && drawy && !river && rng() < prof.bluff * 0.35) {
      return raiseAction(g, L, g.currentBet + (pot + L.toCall) * 0.75);
    }
    return { type: 'fold' };
  }

  function isLastToAct(g, idx) {
    // in position if nobody who can still act sits between us and the button (clockwise)
    const n = g.seats.length;
    for (let k = 1; k < n; k++) {
      const i = (idx + k) % n;
      if (E.canAct(g.seats[i])) {
        // first active player after us: are they "after" us relative to the button?
        const dist = (x) => (x - g.button - 1 + n * 2) % n;
        return dist(i) < dist(idx) ? true : false;
      }
    }
    return true;
  }

  /** Pick a fresh bot identity. */
  function makeBot(difficulty, k, usedNames, rng) {
    rng = rng || Math.random;
    const mix = DIFFICULTY_MIX[difficulty] || DIFFICULTY_MIX.medium;
    const profile = mix[k % mix.length];
    const free = BOT_NAMES.filter((n) => !usedNames.has(n));
    const name = free[Math.floor(rng() * free.length)] || 'Bot ' + k;
    usedNames.add(name);
    return { name, isBot: true, profile, id: 'bot-' + name.toLowerCase() + '-' + Math.floor(rng() * 1e6) };
  }

  /** How long a bot "thinks" (ms) so play feels human. */
  function thinkTime(g, idx, rng) {
    rng = rng || Math.random;
    const L = E.legalActions(g, idx);
    let t = 550 + rng() * 700;
    if (L && L.toCall > g.bb * 6) t += 500 + rng() * 900;
    if (g.street === 'river') t += 300;
    return t;
  }

  return { PROFILES, DIFFICULTY_MIX, BOT_NAMES, estimateRange, opponentRanges, decide, makeBot, thinkTime, isLastToAct, playersBehind };
});
