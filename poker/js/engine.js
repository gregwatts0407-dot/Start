/*
 * engine.js — authoritative No-Limit Texas Hold'em rules.
 * Pure state machine shared by the browser and the Node server.
 *
 * Flow: startHand() → act() for whoever is g.toAct … when a betting round is
 * finished needsAdvance() turns true and the controller calls advance() (after
 * a short pause, so streets can be animated). When the hand ends g.street is
 * 'complete' and g.result describes who won what.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cards.js'));
  else root.PokerEngine = factory(root.PokerCards);
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  const STREETS = ['preflop', 'flop', 'turn', 'river'];

  /** Standard sit-and-go schedule, expressed in multiples of the starting big blind. */
  const BLIND_SCHEDULE = [
    [1, 2, 0], [1.5, 3, 0], [2, 4, 0], [3, 6, 0.5], [4, 8, 1], [5, 10, 1], [7.5, 15, 2],
    [10, 20, 2.5], [15, 30, 4], [20, 40, 5], [30, 60, 7.5], [40, 80, 10], [50, 100, 12.5],
    [75, 150, 20], [100, 200, 25], [150, 300, 40], [200, 400, 50],
  ];

  function createGame(opts) {
    const o = Object.assign({
      smallBlind: 5, bigBlind: 10, ante: 0, startingStack: 1000,
      mode: 'cash', handsPerLevel: 8, players: [],
    }, opts || {});
    return {
      config: { mode: o.mode, startingStack: o.startingStack, baseSB: o.smallBlind, baseBB: o.bigBlind, baseAnte: o.ante, handsPerLevel: o.handsPerLevel },
      sb: o.smallBlind, bb: o.bigBlind, ante: o.ante, level: 0,
      seats: o.players.map((p, i) => makeSeat(p, i, o.startingStack)),
      button: -1, sbSeat: -1, bbSeat: -1, handNo: 0,
      street: 'idle', board: [], deck: [], toAct: -1,
      currentBet: 0, minRaise: o.bigBlind, lastAggressor: -1, preflopAggressor: -1,
      result: null, log: [], actions: [], finishOrder: [], over: false, winnerSeat: -1,
      seq: 0,
    };
  }

  function makeSeat(p, i, stack) {
    return {
      index: i, id: p.id || 'p' + i, name: p.name || 'Player ' + (i + 1),
      isBot: !!p.isBot, profile: p.profile || null, avatar: p.avatar || null, human: !p.isBot,
      stack: p.stack != null ? p.stack : stack,
      cards: [], bet: 0, total: 0, folded: false, allIn: false, acted: false,
      inHand: false, out: false, lastAction: null, startStack: 0, shown: false,
    };
  }

  function addPlayer(g, p) {
    const s = makeSeat(p, g.seats.length, g.config.startingStack);
    g.seats.push(s);
    return s;
  }

  // ---------- helpers ----------
  const live = (s) => s.inHand && !s.folded;
  const canAct = (s) => s.inHand && !s.folded && !s.allIn;
  function nextSeat(g, from, pred) {
    const n = g.seats.length;
    for (let k = 1; k <= n; k++) {
      const i = (from + k + n) % n;
      if (pred(g.seats[i])) return i;
    }
    return -1;
  }
  const potTotal = (g) => g.seats.reduce((a, s) => a + s.total, 0);
  const committedThisStreet = (g) => g.seats.reduce((a, s) => a + s.bet, 0);

  function logLine(g, text, kind) {
    g.log.push({ hand: g.handNo, street: g.street, text, kind: kind || 'info' });
    if (g.log.length > 400) g.log.splice(0, g.log.length - 400);
  }

  function put(g, s, amount) {
    const a = Math.max(0, Math.min(amount, s.stack));
    s.stack -= a; s.bet += a; s.total += a;
    if (s.stack === 0 && s.inHand) s.allIn = true;
    return a;
  }

  function eligibleForHand(s) { return !s.out && s.stack > 0 && !s.sittingOut; }

  // ---------- hand lifecycle ----------
  function startHand(g, rng) {
    if (g.over) return false;
    const players = g.seats.filter(eligibleForHand);
    if (players.length < 2) return false;

    g.handNo++;
    if (g.config.mode === 'tournament') {
      const lvl = Math.min(BLIND_SCHEDULE.length - 1, Math.floor((g.handNo - 1) / g.config.handsPerLevel));
      const [sbM, bbM, anteM] = BLIND_SCHEDULE[lvl];
      const unit = g.config.baseBB / 2;
      const levelChanged = lvl !== g.level;
      g.level = lvl;
      g.sb = Math.round(sbM * 2 * unit / 2) || 1;
      g.bb = Math.round(bbM * unit) || 2;
      g.ante = Math.round(anteM * unit);
      if (levelChanged) logLine(g, `Blinds up: ${g.sb}/${g.bb}` + (g.ante ? ` ante ${g.ante}` : ''), 'level');
    }

    for (const s of g.seats) {
      s.cards = []; s.bet = 0; s.total = 0; s.folded = false; s.allIn = false; s.acted = false;
      s.lastAction = null; s.shown = false; s.inHand = eligibleForHand(s); s.startStack = s.stack;
    }
    g.board = []; g.result = null; g.actions = [];
    g.button = nextSeat(g, g.button < 0 ? -1 : g.button, (s) => s.inHand);
    const headsUp = players.length === 2;
    g.sbSeat = headsUp ? g.button : nextSeat(g, g.button, (s) => s.inHand);
    g.bbSeat = nextSeat(g, g.sbSeat, (s) => s.inHand);

    g.deck = C.shuffle(C.newDeck(), rng);
    g.street = 'preflop';
    logLine(g, `— Hand #${g.handNo} — blinds ${g.sb}/${g.bb}` + (g.ante ? ` (ante ${g.ante})` : ''), 'hand');

    if (g.ante > 0) for (const s of g.seats) if (s.inHand) { put(g, s, g.ante); s.bet = 0; }
    const sbPaid = put(g, g.seats[g.sbSeat], g.sb);
    const bbPaid = put(g, g.seats[g.bbSeat], g.bb);
    g.seats[g.sbSeat].lastAction = { type: 'sb', amount: sbPaid };
    g.seats[g.bbSeat].lastAction = { type: 'bb', amount: bbPaid };
    logLine(g, `${g.seats[g.sbSeat].name} posts small blind ${sbPaid}`);
    logLine(g, `${g.seats[g.bbSeat].name} posts big blind ${bbPaid}`);

    // deal, starting left of the button
    for (let round = 0; round < 2; round++) {
      let i = g.sbSeat;
      for (let k = 0; k < players.length; k++) {
        g.seats[i].cards.push(g.deck.pop());
        i = nextSeat(g, i, (s) => s.inHand);
      }
    }
    g.currentBet = Math.max(g.bb, sbPaid);
    g.minRaise = g.bb;
    g.lastAggressor = g.bbSeat;
    g.preflopAggressor = -1;
    g.toAct = nextSeat(g, g.bbSeat, canAct);
    settle(g);
    g.seq++;
    return true;
  }

  /** Decide whether the betting round is over and set toAct accordingly. */
  function settle(g) {
    const liveSeats = g.seats.filter(live);
    if (liveSeats.length === 1) { g.toAct = -1; return finishUncontested(g, liveSeats[0]); }
    const actors = g.seats.filter(canAct);
    const pending = (s) => canAct(s) && (!s.acted || s.bet < g.currentBet);
    const maxOther = (a) => Math.max(0, ...g.seats.filter((o) => live(o) && o !== a).map((o) => o.bet));
    if (actors.length === 0 || (actors.length === 1 && actors[0].bet >= maxOther(actors[0]))) {
      g.toAct = -1; return;
    }
    if (g.toAct >= 0 && pending(g.seats[g.toAct])) return;
    const from = g.toAct >= 0 ? g.toAct : g.button;
    g.toAct = nextSeat(g, from, pending);
  }

  function needsAdvance(g) {
    return STREETS.includes(g.street) && g.toAct === -1;
  }

  /** What the player to act may do. */
  function legalActions(g, idx) {
    const i = idx === undefined ? g.toAct : idx;
    const s = g.seats[i];
    if (!s || i !== g.toAct) return null;
    const toCall = Math.min(g.currentBet - s.bet, s.stack);
    const maxTo = s.bet + s.stack;
    // A player who already acted may only re-raise if a full raise has happened since.
    const reopened = !s.acted;
    const canRaise = reopened && maxTo > g.currentBet && g.seats.some((o) => o !== s && canAct(o));
    const minTo = Math.min(maxTo, g.currentBet + g.minRaise);
    return {
      seat: i, toCall, canCheck: toCall === 0, canCall: toCall > 0,
      canRaise, minRaiseTo: minTo, maxRaiseTo: maxTo,
      isBet: g.currentBet === 0, currentBet: g.currentBet, stack: s.stack, bet: s.bet,
      pot: potTotal(g),
    };
  }

  /**
   * Apply an action. action = {type: 'fold'|'check'|'call'|'raise'|'allin', amount}
   * For 'raise' amount is the total the player's street bet becomes ("raise to").
   */
  function act(g, idx, action) {
    if (idx !== g.toAct) return { ok: false, error: 'Not your turn' };
    const s = g.seats[idx];
    const L = legalActions(g, idx);
    let type = action.type;
    let to = Math.floor(Number(action.amount) || 0);

    if (type === 'allin') {
      if (L.canRaise && L.maxRaiseTo > g.currentBet) { type = 'raise'; to = L.maxRaiseTo; }
      else type = L.toCall > 0 ? 'call' : 'check';
    }
    if (type === 'check' && !L.canCheck) return { ok: false, error: 'Cannot check' };
    if (type === 'call' && !L.canCall) type = 'check';
    if (type === 'raise') {
      if (!L.canRaise) { type = L.canCall ? 'call' : 'check'; }
      else {
        to = Math.max(L.minRaiseTo, Math.min(to, L.maxRaiseTo));
      }
    }

    const before = { bet: g.currentBet };
    let text;
    if (type === 'fold') {
      s.folded = true;
      text = `${s.name} folds`;
      s.lastAction = { type: 'fold' };
    } else if (type === 'check') {
      text = `${s.name} checks`;
      s.lastAction = { type: 'check' };
    } else if (type === 'call') {
      const paid = put(g, s, g.currentBet - s.bet);
      text = `${s.name} calls ${paid}` + (s.allIn ? ' and is all-in' : '');
      s.lastAction = { type: s.allIn ? 'allin' : 'call', amount: s.bet };
    } else {
      const wasBet = g.currentBet === 0;
      put(g, s, to - s.bet);
      const raiseBy = s.bet - g.currentBet;
      if (raiseBy >= g.minRaise) {
        g.minRaise = raiseBy;
        for (const o of g.seats) if (o !== s && canAct(o)) o.acted = false;
      }
      g.currentBet = Math.max(g.currentBet, s.bet);
      g.lastAggressor = idx;
      if (g.street === 'preflop') g.preflopAggressor = idx;
      text = `${s.name} ${wasBet ? 'bets' : 'raises to'} ${s.bet}` + (s.allIn ? ' and is all-in' : '');
      s.lastAction = { type: s.allIn ? 'allin' : wasBet ? 'bet' : 'raise', amount: s.bet };
    }
    s.acted = true;
    g.actions.push({
      seat: idx, street: g.street, type, amount: s.bet, facing: before.bet,
      pot: potTotal(g), allIn: s.allIn,
    });
    logLine(g, text, 'action');
    settle(g);
    g.seq++;
    return { ok: true, type };
  }

  function returnUncalled(g) {
    let hi = -1, hiBet = 0, second = 0;
    g.seats.forEach((s, i) => {
      if (!s.inHand) return;
      if (s.bet > hiBet) { second = hiBet; hiBet = s.bet; hi = i; }
      else if (s.bet > second) second = s.bet;
    });
    if (hi >= 0 && hiBet > second) {
      const back = hiBet - second;
      const s = g.seats[hi];
      s.bet -= back; s.total -= back; s.stack += back;
      if (s.stack > 0) s.allIn = false;
      logLine(g, `Uncalled ${back} returned to ${s.name}`);
    }
  }

  /** Deal the next street, or go to showdown after the river. */
  function advance(g) {
    if (!needsAdvance(g)) return false;
    returnUncalled(g);
    for (const s of g.seats) { s.bet = 0; s.acted = false; if (live(s) && !s.allIn) s.lastAction = null; }
    g.currentBet = 0; g.minRaise = g.bb; g.lastAggressor = -1;
    const idx = STREETS.indexOf(g.street);
    if (idx === 3) { showdown(g); g.seq++; return true; }
    g.deck.pop(); // burn
    const n = idx === 0 ? 3 : 1;
    for (let k = 0; k < n; k++) g.board.push(g.deck.pop());
    g.street = STREETS[idx + 1];
    logLine(g, `${g.street[0].toUpperCase() + g.street.slice(1)}: ${g.board.map(C.cardStr).join(' ')}`, 'street');
    g.toAct = -1;
    const actors = g.seats.filter(canAct);
    if (actors.length >= 2) g.toAct = nextSeat(g, g.button, canAct);
    g.seq++;
    return true;
  }

  /** Split all contributions into main and side pots. */
  function buildPots(seats) {
    const levels = [...new Set(seats.filter((s) => live(s) && s.total > 0).map((s) => s.total))].sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    for (const L of levels) {
      let amount = 0;
      for (const s of seats) amount += Math.max(0, Math.min(s.total, L) - prev);
      const eligible = seats.filter((s) => live(s) && s.total >= L).map((s) => s.index);
      const last = pots[pots.length - 1];
      if (last && last.eligible.join() === eligible.join()) last.amount += amount;
      else pots.push({ amount, eligible });
      prev = L;
    }
    const total = seats.reduce((a, s) => a + s.total, 0);
    const counted = pots.reduce((a, p) => a + p.amount, 0);
    if (pots.length && total > counted) pots[pots.length - 1].amount += total - counted;
    return pots;
  }

  function finishUncontested(g, winner) {
    returnUncalled(g);
    const amount = potTotal(g);
    winner.stack += amount;
    g.result = {
      uncontested: true,
      pots: [{ amount, winners: [winner.index], hand: null }],
      winnings: { [winner.index]: amount },
      hands: {},
    };
    logLine(g, `${winner.name} wins ${amount} uncontested`, 'win');
    endHand(g);
  }

  function showdown(g) {
    g.street = 'showdown';
    const contenders = g.seats.filter(live);
    const hands = {};
    for (const s of contenders) {
      const best = C.bestFive(s.cards.concat(g.board));
      hands[s.index] = { score: best.score, best: best.cards, name: C.describe(best.score) };
      s.shown = true;
    }
    const pots = buildPots(g.seats);
    const winnings = {};
    const potResults = [];
    for (const pot of pots) {
      let best = -1, winners = [];
      for (const i of pot.eligible) {
        const sc = hands[i].score;
        if (sc > best) { best = sc; winners = [i]; } else if (sc === best) winners.push(i);
      }
      // odd chips go to the first winner left of the button
      winners.sort((a, b) => ((a - g.button - 1 + 99 * g.seats.length) % g.seats.length) - ((b - g.button - 1 + 99 * g.seats.length) % g.seats.length));
      const share = Math.floor(pot.amount / winners.length);
      let odd = pot.amount - share * winners.length;
      for (const w of winners) {
        const amt = share + (odd > 0 ? 1 : 0);
        if (odd > 0) odd--;
        winnings[w] = (winnings[w] || 0) + amt;
        g.seats[w].stack += amt;
      }
      potResults.push({ amount: pot.amount, winners, hand: hands[winners[0]].name, eligible: pot.eligible });
    }
    for (const s of contenders) logLine(g, `${s.name} shows ${s.cards.map(C.cardStr).join(' ')} — ${hands[s.index].name}`, 'show');
    potResults.forEach((p, k) => {
      const label = potResults.length > 1 ? (k === 0 ? 'main pot' : `side pot ${k}`) : 'the pot';
      const names = p.winners.map((w) => g.seats[w].name).join(' & ');
      logLine(g, `${names} ${p.winners.length > 1 ? 'split' : 'wins'} ${label} (${p.amount}) with ${p.hand}`, 'win');
    });
    g.result = { uncontested: false, pots: potResults, winnings, hands };
    endHand(g);
  }

  function endHand(g) {
    g.street = 'complete';
    g.toAct = -1;
    for (const s of g.seats) { s.bet = 0; }
    const busted = g.seats.filter((s) => s.inHand && s.stack === 0 && !s.out);
    if (g.config.mode === 'tournament') {
      busted.sort((a, b) => b.startStack - a.startStack);
      const remaining = g.seats.filter((s) => !s.out && s.stack > 0).length;
      busted.forEach((s, k) => {
        s.out = true;
        s.place = remaining + 1 + k;
        g.finishOrder.unshift({ index: s.index, name: s.name, place: s.place });
        logLine(g, `${s.name} finishes in place #${s.place}`, 'bust');
      });
      const alive = g.seats.filter((s) => !s.out && s.stack > 0);
      if (alive.length === 1) {
        g.over = true; g.winnerSeat = alive[0].index; alive[0].place = 1;
        g.finishOrder.unshift({ index: alive[0].index, name: alive[0].name, place: 1 });
        logLine(g, `${alive[0].name} wins the tournament!`, 'win');
      }
    }
    if (g.result) g.result.busted = busted.map((s) => s.index);
  }

  /** Copy of the state that hides private information from one viewer. */
  function viewFor(g, viewerIdx) {
    const v = JSON.parse(JSON.stringify(g));
    delete v.deck;
    v.seats.forEach((s, i) => {
      const reveal = i === viewerIdx || (s.shown && g.street === 'complete') || viewerIdx === 'all';
      if (!reveal && s.cards.length) s.cards = s.cards.map(() => -1);
    });
    v.viewer = viewerIdx;
    return v;
  }

  const positionNames = {
    2: ['BTN', 'BB'], 3: ['BTN', 'SB', 'BB'], 4: ['BTN', 'SB', 'BB', 'CO'], 5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
    6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'], 7: ['BTN', 'SB', 'BB', 'UTG', 'MP', 'HJ', 'CO'],
    8: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'HJ', 'CO'], 9: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO'],
  };
  /** Position label (BTN, SB, BB, UTG, …) for a seat in the current hand. */
  function positionOf(g, idx) {
    const order = [];
    let i = g.button;
    const n = g.seats.filter((s) => s.inHand).length;
    if (n < 2 || i < 0) return '';
    for (let k = 0; k < n; k++) { order.push(i); i = nextSeat(g, i, (s) => s.inHand); }
    const p = order.indexOf(idx);
    if (p < 0) return '';
    if (n === 2) return p === 0 ? 'BTN' : 'BB';
    return positionNames[n][p];
  }

  return {
    STREETS, BLIND_SCHEDULE, createGame, addPlayer, startHand, legalActions, act, needsAdvance,
    advance, buildPots, viewFor, positionOf, potTotal, committedThisStreet, nextSeat, live, canAct,
  };
});
