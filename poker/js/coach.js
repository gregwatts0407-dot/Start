/*
 * coach.js — real-time advice and post-hand review for a human player.
 * advise(g, seat) analyses the spot and recommends an action with reasons.
 * grade(decision) scores what the player actually did against that advice.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cards.js'), require('./engine.js'), require('./equity.js'), require('./ai.js'));
  else root.PokerCoach = factory(root.PokerCards, root.PokerEngine, root.PokerEquity, root.PokerAI);
})(typeof self !== 'undefined' ? self : this, function (C, E, Q, AI) {
  'use strict';

  const pct = (x) => Math.round(x * 100) + '%';

  // Opening ranges (fraction of hands) by position — a solid, slightly tight baseline.
  const OPEN = { UTG: 0.13, 'UTG+1': 0.15, MP: 0.17, LJ: 0.19, HJ: 0.21, CO: 0.28, BTN: 0.45, SB: 0.38, BB: 0 };

  function openRangeFor(pos, nPlayers) {
    if (nPlayers === 2) return 0.82;
    let r = OPEN[pos] != null ? OPEN[pos] : 0.18;
    if (nPlayers <= 4 && (pos === 'CO' || pos === 'UTG')) r = Math.max(r, 0.3);
    if (nPlayers <= 6 && pos === 'UTG') r = 0.16;
    return r;
  }

  function niceAmount(g, x) {
    const unit = Math.max(1, g.sb);
    return Math.max(unit, Math.round(x / unit) * unit);
  }
  function clampRaise(L, to) { return Math.max(L.minRaiseTo, Math.min(L.maxRaiseTo, to)); }

  /**
   * Analyse the current decision for seat `idx`.
   * Returns {street, position, cls, handPct, equity, potOdds, need, toCall, pot, spr,
   *          info, opponents, rec:{type, amount, label}, reasons[], lesson, alt}
   */
  function advise(g, idx, statsBySeat, opts) {
    const s = g.seats[idx];
    if (!s || !s.cards || s.cards.length < 2 || s.cards[0] < 0) return null;
    const L = E.legalActions(g, idx) || pseudoLegal(g, idx);
    const iterations = (opts && opts.iterations) || 1800;
    const pos = E.positionOf(g, idx);
    const n = g.seats.filter((x) => x.inHand).length;
    const pot = E.potTotal(g);
    const toCall = L.toCall;
    const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
    const cls = C.handClass(s.cards[0], s.cards[1]);
    const hp = Q.handPct(s.cards[0], s.cards[1]);
    const opponents = AI.opponentRanges(g, idx, statsBySeat);
    const eff = effectiveStack(g, idx);
    const potAfter = Math.max(1, pot);
    const spr = eff / potAfter;
    const info = Q.analyze(s.cards, g.board);
    const eqRes = Q.equity({ hero: s.cards, board: g.board, opponents, iterations });
    const out = {
      street: g.street, position: pos, players: n, cls, handPct: hp, equity: eqRes.equity, potOdds, need: potOdds,
      toCall, pot, spr, eff, info, opponents, legal: L, reasons: [], rec: null, lesson: null, alt: null,
      bbStack: s.stack / g.bb, bb: g.bb,
    };
    if (g.street === 'preflop') preflopAdvice(g, idx, out, L);
    else postflopAdvice(g, idx, out, L);
    return out;
  }

  function pseudoLegal(g, idx) {
    const s = g.seats[idx];
    return { toCall: Math.max(0, Math.min(g.currentBet - s.bet, s.stack)), canCheck: g.currentBet <= s.bet, canRaise: true,
      minRaiseTo: g.currentBet + g.minRaise, maxRaiseTo: s.bet + s.stack, pot: E.potTotal(g), stack: s.stack, bet: s.bet };
  }

  function effectiveStack(g, idx) {
    const me = g.seats[idx].stack + g.seats[idx].bet;
    const others = g.seats.filter((x, i) => i !== idx && E.live(x)).map((x) => x.stack + x.bet);
    return Math.min(me, others.length ? Math.max(...others) : me);
  }

  function preflopAdvice(g, idx, out, L) {
    const s = g.seats[idx];
    const pre = g.actions.filter((a) => a.street === 'preflop');
    const raises = pre.filter((a) => a.type === 'raise');
    const limpers = pre.filter((a) => a.type === 'call' && raises.length === 0).length;
    const n = out.players;
    const hp = out.handPct;
    const bb = g.bb;
    const effBB = out.eff / bb;
    const top = (x) => 'top ' + Math.round(x * 100) + '%';
    const handDesc = `${out.cls} is in the ${top(hp)} of starting hands`;
    out.lesson = 'starting-hands';

    // Short-stack push/fold
    if (effBB <= 13 && (raises.length === 0 || L.toCall >= L.stack * 0.35)) {
      out.lesson = 'tournament';
      if (raises.length === 0) {
        const range = Math.min(0.75, (effBB <= 6 ? 0.5 : effBB <= 9 ? 0.34 : 0.24) * posPushMult(out.position, n));
        if (hp <= range) {
          rec(out, 'raise', L.maxRaiseTo, 'All-in');
          out.reasons.push(`With only ${effBB.toFixed(1)} big blinds, raising small and folding wastes chips — move all-in or fold.`,
            `${handDesc}; from ${out.position} you can shove roughly the ${top(range)}.`,
            'Shoving gives you fold equity: you win the blinds whenever everyone folds.');
        } else {
          rec(out, L.canCheck ? 'check' : 'fold');
          out.reasons.push(`${handDesc} — too weak to shove ${effBB.toFixed(1)} big blinds from ${out.position} (range ≈ ${top(range)}).`,
            'Wait for a better spot; folding costs nothing here.');
        }
        return;
      }
      const need = out.potOdds;
      const callRange = Math.min(0.55, 0.05 + Math.max(0, 0.45 - need) * 0.45);
      if (hp <= callRange) {
        rec(out, L.toCall >= L.stack ? 'call' : 'raise', L.toCall >= L.stack ? null : L.maxRaiseTo, L.toCall >= L.stack ? 'Call all-in' : 'All-in');
        out.reasons.push(`You are getting ${oddsRatio(need)} and need ${pct(need)} equity.`, `${handDesc}, comfortably inside a calling range of about ${top(callRange)}.`);
      } else {
        rec(out, 'fold');
        out.reasons.push(`Calling an all-in needs a strong hand. ${handDesc}; a reasonable calling range here is about ${top(callRange)}.`);
      }
      return;
    }

    if (raises.length === 0) {
      const range = openRangeFor(out.position, n) * (limpers ? 0.8 : 1);
      if (idx === g.bbSeat && L.canCheck) {
        if (hp <= 0.12 + (limpers ? 0 : 0.05)) {
          const to = niceAmount(g, bb * (3.5 + limpers));
          rec(out, 'raise', clampRaise(L, to));
          out.reasons.push(`${handDesc}. Raise the limpers to build a pot with a strong hand.`, 'Limpers usually hold weak hands, so you have the edge.');
        } else {
          rec(out, 'check');
          out.reasons.push('You are in the big blind and can see the flop for free — take it.', `${handDesc}, not strong enough to raise from out of position.`);
        }
        return;
      }
      if (hp <= range) {
        const to = niceAmount(g, bb * ((n === 2 ? 2.5 : idx === g.sbSeat ? 3 : 2.5) + limpers));
        rec(out, 'raise', clampRaise(L, to));
        out.reasons.push(`${handDesc}. From ${out.position} a solid opening range is about the ${top(range)}.`,
          limpers ? `Raise to isolate the ${limpers === 1 ? 'limper' : limpers + ' limpers'} — add one big blind per limper.` : 'Open with a raise rather than limping: you can win the blinds right away and you take the initiative.');
        if (hp <= 0.05) out.reasons.push('This is a premium hand — you want to build a big pot.');
        out.lesson = 'position';
      } else if (idx === g.sbSeat && limpers > 0 && hp <= 0.55) {
        rec(out, 'call');
        out.reasons.push(`It only costs ${L.toCall} more to complete with ${limpers} limper${limpers > 1 ? 's' : ''} in — a good price for a playable hand.`);
      } else {
        rec(out, 'fold');
        out.reasons.push(`${handDesc}. From ${out.position} you should open roughly the ${top(range)} — this hand is outside it.`,
          positionNote(out.position));
        out.lesson = 'position';
      }
      return;
    }

    const raiseSize = g.currentBet / bb;
    const raiser = g.seats[raises[raises.length - 1].seat];
    const raiserRange = AI.estimateRange(g, raiser.index, null);
    if (raises.length === 1) {
      const lateRaiser = ['CO', 'BTN', 'SB'].includes(E.positionOf(g, raiser.index));
      const valueRange = lateRaiser ? 0.06 : 0.035;
      const isBB = idx === g.bbSeat;
      const ip = AI.isLastToAct(g, idx);
      let callRange = isBB ? 0.4 : ip ? 0.16 : 0.1;
      if (raiseSize > 4) callRange *= 0.7;
      if (raiseSize > 6) callRange *= 0.6;
      if (L.toCall > out.eff * 0.2) callRange *= 0.6;
      if (hp <= valueRange && L.canRaise) {
        const to = niceAmount(g, g.currentBet * (ip ? 3 : 3.8));
        rec(out, 'raise', clampRaise(L, to), '3-bet');
        out.reasons.push(`${handDesc} — strong enough to 3-bet for value against ${raiser.name}'s ${lateRaiser ? 'late-position ' : ''}raise.`,
          `Re-raising builds the pot while you are ahead and denies cheap flops. Size about ${ip ? '3×' : '3.5–4×'} the raise ${ip ? 'in position' : 'out of position'}.`);
        out.lesson = 'aggression';
      } else if (hp <= callRange) {
        rec(out, 'call');
        out.reasons.push(`${handDesc}. Against a single raise, ${isBB ? 'the big blind can defend wide because you already have chips in the pot' : ip ? 'you can call profitably in position' : 'calling out of position needs a tighter range'} (≈ ${top(callRange)}).`,
          `You pay ${L.toCall} to win ${out.pot}: you need ${pct(out.potOdds)} equity, and you have about ${pct(out.equity)} against their likely ${raiserRange.label}.`);
      } else {
        rec(out, 'fold');
        out.reasons.push(`${handDesc}. Facing a ${raiseSize.toFixed(1)}bb raise you want roughly the ${top(callRange)} — fold and wait.`,
          `Against ${raiser.name}'s likely ${raiserRange.label} you'd have about ${pct(out.equity)} equity, and you'd often be out of position.`);
      }
      return;
    }
    // facing 3-bet or more
    out.lesson = 'aggression';
    if (hp <= 0.025 && L.canRaise) {
      const shove = out.eff / bb < 60 || raises.length >= 3;
      rec(out, 'raise', shove ? L.maxRaiseTo : clampRaise(L, niceAmount(g, g.currentBet * 2.3)), shove ? 'All-in' : '4-bet');
      out.reasons.push(`${handDesc} — one of the very best hands. Re-raise for value.`, shove ? 'Stacks are shallow enough that moving all-in is simplest.' : 'A 4-bet of about 2.2–2.5× keeps your range strong and leaves room to get it in.');
    } else if (hp <= 0.07 && L.toCall <= out.eff * 0.35) {
      rec(out, 'call');
      out.reasons.push(`${handDesc}. Strong enough to continue against a re-raise, but not to 4-bet.`, `You need ${pct(out.potOdds)} equity; you have about ${pct(out.equity)} against a typical ${raiserRange.label}.`);
    } else {
      rec(out, 'fold');
      out.reasons.push(`A re-raise represents a strong range (${raiserRange.label}). ${handDesc} — fold unless it is near the top of your range.`,
        `Your equity against that range is only about ${pct(out.equity)}.`);
    }
  }

  function posPushMult(pos, n) {
    if (n === 2) return 1.6;
    return ({ BTN: 1.5, SB: 1.6, CO: 1.2, HJ: 1, LJ: 0.9, MP: 0.85, 'UTG+1': 0.75, UTG: 0.7, BB: 1 })[pos] || 1;
  }
  function positionNote(pos) {
    if (pos === 'BTN') return 'Even on the button, trash hands lose money over time.';
    if (pos === 'SB') return 'The small blind plays out of position after the flop — be selective.';
    if (['UTG', 'UTG+1', 'MP', 'LJ'].includes(pos)) return 'Early position means many players act after you, so you need stronger hands.';
    return 'Position matters: the later you act, the more hands you can play.';
  }
  function oddsRatio(need) {
    if (need <= 0) return 'a free card';
    const r = (1 - need) / need;
    return `${r.toFixed(1)}-to-1 pot odds`;
  }
  function rec(out, type, amount, label) {
    const names = { fold: 'Fold', check: 'Check', call: 'Call', raise: out.legal && out.legal.isBet ? 'Bet' : 'Raise' };
    out.rec = { type, amount: amount == null ? null : amount, label: label || names[type] };
    if (type === 'raise' && amount != null && !label) out.rec.label = names.raise + ' to ' + amount;
    else if (type === 'raise' && amount != null && label && label !== 'All-in') out.rec.label = label + ' to ' + amount;
    if (type === 'call' && !label) out.rec.label = 'Call ' + out.toCall;
  }

  function postflopAdvice(g, idx, out, L) {
    const eq = out.equity;
    const info = out.info;
    const tex = info.texture;
    const nOpp = out.opponents.length;
    const pot = out.pot;
    const river = g.street === 'river';
    const draw = info.flushDraw || info.oesd;
    const outs = info.outs.length;
    const ip = AI.isLastToAct(g, idx);
    const aggressor = g.preflopAggressor === idx;
    const handLine = info.relative ? `You have ${info.relative} (${info.madeName.toLowerCase()})` : `You have ${info.madeName.toLowerCase()}`;
    const oppLine = nOpp === 1 ? `their likely range (${out.opponents[0].label})` : `${nOpp} opponents' likely ranges`;
    out.reasons.push(`${handLine}. Your equity against ${oppLine} is about ${pct(eq)}.`);
    if (draw || info.gutshot) {
      const kinds = [info.flushDraw && (info.nutFlushDraw ? 'nut flush draw' : 'flush draw'), info.oesd && 'open-ended straight draw', info.gutshot && !info.oesd && 'gutshot'].filter(Boolean).join(' + ');
      out.reasons.push(`Drawing: ${kinds} with ${outs} outs — about ${pct(Math.min(1, outs * (g.street === 'flop' ? 0.04 : 0.02)))} to hit by the river (rule of ${g.street === 'flop' ? 4 : 2}).`);
      out.lesson = 'outs';
    }

    if (L.toCall > 0) {
      const need = out.potOdds;
      const implied = draw && !river && out.eff > L.toCall * 6 ? 0.06 : 0;
      out.reasons.push(`Pot odds: call ${L.toCall} to win ${pot} → you need ${pct(need)} equity${implied ? ' (a little less with implied odds)' : ''}.`);
      out.lesson = out.lesson || 'pot-odds';
      if (eq >= Math.max(0.68, need + 0.25) && L.canRaise) {
        const to = niceAmount(g, g.currentBet + (pot + L.toCall) * 0.75);
        const tgt = clampRaise(L, to);
        rec(out, 'raise', tgt >= L.maxRaiseTo * 0.8 ? L.maxRaiseTo : tgt, tgt >= L.maxRaiseTo * 0.8 ? 'All-in' : null);
        out.reasons.push('You are well ahead of their betting range — raise for value and make worse hands pay.');
        if (tex.wet && !river) out.reasons.push(`On a ${tex.label.toLowerCase()} raising also charges their draws.`);
        out.lesson = 'value-betting';
      } else if (eq + implied >= need) {
        rec(out, 'call');
        out.reasons.push(eq >= need ? `${pct(eq)} ≥ ${pct(need)}: calling is profitable in the long run.` : 'Your raw equity is slightly short, but if you hit you can win more later (implied odds).');
      } else if (draw && !river && L.canRaise && ip && nOpp === 1 && eq > need - 0.12 && out.spr > 2) {
        rec(out, 'raise', clampRaise(L, niceAmount(g, g.currentBet * 3)), null);
        out.reasons.push('A semi-bluff raise can work: you may win now, and if called you still have outs.');
        out.alt = 'Folding is also fine — calling is the one option that loses money here.';
        out.lesson = 'aggression';
      } else {
        rec(out, 'fold');
        out.reasons.push(`${pct(eq)} < ${pct(need)}: calling loses money over time. Let it go.`);
      }
      return;
    }

    // no bet to face
    const valueLine = 0.6 + (nOpp - 1) * 0.07;
    if (eq >= valueLine) {
      const frac = tex.wet ? 0.75 : 0.55;
      const to = niceAmount(g, pot * frac);
      rec(out, 'raise', clampRaise(L, to));
      out.reasons.push(`You likely have the best hand — bet about ${Math.round(frac * 100)}% of the pot for value.`,
        tex.wet ? `This ${tex.label.toLowerCase()} gives draws a reason to call, so bet bigger and charge them.` : 'On a dry board, a medium bet still gets calls from worse hands.');
      out.lesson = 'value-betting';
    } else if (draw && !river && (ip || aggressor) && nOpp <= 2) {
      rec(out, 'raise', clampRaise(L, niceAmount(g, pot * 0.55)));
      out.reasons.push('Semi-bluff: bet with your draw. You can win immediately, and you still have outs if called.');
      out.lesson = 'aggression';
    } else if (aggressor && g.street === 'flop' && nOpp === 1 && !tex.wet) {
      rec(out, 'raise', clampRaise(L, niceAmount(g, pot * 0.33)), null);
      out.reasons.push('Continuation bet: you raised before the flop and this dry board favours your range. A small bet (≈⅓ pot) often takes it down.');
      out.lesson = 'aggression';
    } else if (eq >= 0.4) {
      rec(out, 'check');
      out.reasons.push('Medium strength: check to control the pot size. You can call reasonable bets, and checking keeps your weaker hands in the game.');
      out.lesson = 'value-betting';
    } else {
      rec(out, 'check');
      out.reasons.push(river ? 'You have little showdown value. Check — and only bluff if you think they are weak.' : 'Little equity and no strong draw: check, and be ready to fold to a bet.');
      if (river && eq < 0.2 && nOpp === 1) out.alt = 'A bluff can work against an opponent who checked twice, but checking is the safer default.';
    }
  }

  // ---------- grading ----------
  const GRADE_SCORE = { great: 1, good: 0.9, close: 0.7, inaccuracy: 0.45, mistake: 0.15, blunder: 0 };
  const GRADE_LABEL = { great: 'Great', good: 'Good', close: 'Close call', inaccuracy: 'Inaccuracy', mistake: 'Mistake', blunder: 'Blunder' };
  const family = (t) => (t === 'raise' || t === 'bet' || t === 'allin' ? 'aggr' : t === 'fold' ? 'fold' : 'passive');

  /**
   * Grade an action against advice.
   * actual = {type, amount}. Returns {grade, label, score, note, evLoss}
   */
  function grade(adv, actual) {
    if (!adv || !adv.rec) return null;
    const recF = family(adv.rec.type);
    const actF = family(actual.type === 'allin' ? (adv.legal.canRaise ? 'raise' : 'call') : actual.type);
    const eq = adv.equity, need = adv.potOdds, pot = adv.pot, toCall = adv.toCall;
    const evCall = eq * (pot + toCall) - toCall; // chips
    const potRel = (x) => x / Math.max(1, pot);
    let g = 'good', note = '';
    if (recF === actF) {
      g = 'great';
      note = 'Matches the coach\'s line.';
    } else if (adv.street === 'preflop') {
      const hp = adv.handPct;
      if (actF === 'fold') {
        g = hp <= 0.06 ? 'blunder' : hp <= 0.12 ? 'mistake' : 'inaccuracy';
        if (adv.rec.type === 'call' && toCall <= adv.pot * 0.25) g = g === 'inaccuracy' ? 'close' : g;
        note = `Folding ${adv.cls} (top ${Math.round(hp * 100)}%) is too tight here.`;
      } else if (recF === 'fold') {
        const cheap = actF === 'passive' && toCall <= adv.bb * 0.5 + 1e-9; // completing the small blind
        g = hp > 0.6 ? 'mistake' : hp > 0.35 ? 'inaccuracy' : 'close';
        if (actF === 'aggr' && hp > 0.5) g = 'mistake';
        if (cheap) g = hp > 0.75 ? 'inaccuracy' : 'close';
        note = cheap ? `Completing the small blind with ${adv.cls} is cheap, but you'll play the hand out of position with a weak holding.`
          : `${adv.cls} is outside a solid range for this spot — playing too many hands leaks chips.`;
      } else if (recF === 'aggr' && actF === 'passive') {
        g = adv.handPct <= 0.05 ? 'inaccuracy' : 'close';
        note = adv.legal.canCheck ? 'Raising was better than checking.' : 'Limping/calling is weaker than raising here: you lose the initiative.';
      } else {
        g = 'close';
        note = 'Raising here is a bit ambitious, but not a big error.';
      }
    } else if (actF === 'fold' && toCall > 0) {
      const loss = Math.max(0, evCall);
      g = potRel(loss) > 0.35 ? 'blunder' : potRel(loss) > 0.12 ? 'mistake' : loss > 0 ? 'inaccuracy' : 'close';
      note = `You had ${pct(eq)} equity and needed ${pct(need)}. Folding gave up about ${Math.round(loss)} chips in expectation.`;
      return out(g, note, loss);
    } else if (actF === 'passive' && recF === 'fold') {
      const loss = Math.max(0, -evCall);
      g = potRel(loss) > 0.3 ? 'blunder' : potRel(loss) > 0.1 ? 'mistake' : 'inaccuracy';
      if (loss < pot * 0.04) g = 'close';
      note = `Calling needed ${pct(need)} equity but you had about ${pct(eq)} — a long-run loss of ≈${Math.round(loss)} chips.`;
      return out(g, note, loss);
    } else if (actF === 'aggr' && recF === 'fold') {
      g = eq < need * 0.6 ? 'mistake' : 'inaccuracy';
      note = 'Raising as a bluff here is risky: you had too little equity, and this opponent range rarely folds.';
    } else if (actF === 'passive' && recF === 'aggr') {
      g = eq > 0.8 ? 'inaccuracy' : 'close';
      note = toCall > 0 ? 'Just calling misses value — a raise makes worse hands pay.' : 'Checking a strong hand misses value; bet so worse hands can call.';
    } else if (actF === 'aggr' && recF === 'passive') {
      g = eq < 0.25 && !(adv.info.flushDraw || adv.info.oesd) ? 'inaccuracy' : 'close';
      note = eq < 0.25 ? 'Betting with little equity is a pure bluff; it works only if they fold often.' : 'Betting is reasonable, though checking was the safer line.';
    }
    return out(g, note, 0);

    function out(grade_, note_, loss) {
      return { grade: grade_, label: GRADE_LABEL[grade_], score: GRADE_SCORE[grade_], note: note_, evLoss: loss || 0 };
    }
  }

  /** Should the coach warn before this action? (Only for clear, costly errors.) */
  function shouldWarn(adv, actual) {
    const r = grade(adv, actual);
    if (!r || (r.grade !== 'blunder' && r.grade !== 'mistake')) return null;
    // only interrupt when real chips are at stake
    const t = actual.type;
    const cost = t === 'fold' ? Math.max(r.evLoss, adv.street === 'preflop' && adv.handPct <= 0.06 ? adv.bb * 3 : 0)
      : t === 'call' ? adv.toCall : t === 'check' ? r.evLoss : Math.max(0, (actual.amount || 0) - (adv.legal.bet || 0));
    if (cost < adv.bb * 2.5 && r.grade !== 'blunder') return null;
    return r;
  }

  return { advise, grade, shouldWarn, openRangeFor, GRADE_LABEL, GRADE_SCORE, OPEN };
});
