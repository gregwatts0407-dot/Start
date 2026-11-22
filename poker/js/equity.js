/*
 * equity.js — hand-strength maths shared by bots, the coach and the academy.
 *  - preflop percentiles for the 169 starting hands
 *  - Monte Carlo equity against opponents with estimated ranges
 *  - exact heads-up equity by enumeration (drills)
 *  - draws, outs and board texture
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cards.js'), require('./preflop-data.js'));
  else root.PokerEquity = factory(root.PokerCards, root.PreflopData);
})(typeof self !== 'undefined' ? self : this, function (C, P) {
  'use strict';

  // ---- preflop percentiles ----
  const PCT = {}; // class -> fraction of all combos that are at least this good (0..1)
  {
    let cum = 0;
    for (const cls of P.ORDER) { cum += C.classCombos(cls); PCT[cls] = cum / 1326; }
  }
  const comboPct = new Float32Array(52 * 52);
  for (let a = 0; a < 52; a++) for (let b = 0; b < 52; b++) if (a !== b) comboPct[a * 52 + b] = PCT[C.handClass(a, b)];
  const handPct = (c1, c2) => comboPct[c1 * 52 + c2];
  const classPct = (cls) => PCT[cls];
  const rankIndex = (cls) => P.ORDER.indexOf(cls);
  function topClasses(pct) { return P.ORDER.filter((c) => PCT[c] <= pct + 1e-9); }

  // ---- postflop strength buckets used to narrow ranges ----
  // 3 = strong (two pair+ using hole cards, overpair, top pair good kicker)
  // 2 = medium pair, 1 = draw, 0 = air
  const tmp7 = new Array(7);
  function strengthBucket(h1, h2, board) {
    const n = board.length;
    if (n === 0) return 2;
    tmp7[0] = h1; tmp7[1] = h2;
    for (let i = 0; i < n; i++) tmp7[i + 2] = board[i];
    const s = C.evaluate(tmp7, n + 2);
    const cat = s >> 20;
    const bs = n >= 5 ? C.evaluate(board, n) : boardScoreSmall(board);
    const bcat = bs >> 20;
    if (cat >= 2 && cat > bcat) return 3;
    if (cat >= 4) return 3;
    let topBoard = 0;
    for (let i = 0; i < n; i++) topBoard = Math.max(topBoard, board[i] >> 2);
    const r1 = h1 >> 2, r2 = h2 >> 2;
    if (cat === 1 && bcat === 0) {
      const pr = (s >> 16) & 15;
      if (r1 === r2 && pr > topBoard) return 3; // overpair
      if (pr === topBoard) return Math.max(r1, r2) >= 9 || (r1 === pr ? r2 : r1) >= 9 ? 3 : 2;
      return 2;
    }
    if (n < 5 && hasDraw(h1, h2, board)) return 1;
    return 0;
  }
  function boardScoreSmall(board) {
    // category of 3–4 board cards: pairs/trips only
    const cnt = {};
    let best = 0;
    for (const c of board) { const r = c >> 2; cnt[r] = (cnt[r] || 0) + 1; best = Math.max(best, cnt[r]); }
    const pairs = Object.values(cnt).filter((v) => v >= 2).length;
    if (best >= 3) return 3 << 20;
    if (pairs >= 2) return 2 << 20;
    if (best === 2) return 1 << 20;
    return 0;
  }
  function hasDraw(h1, h2, board) {
    const sc = [0, 0, 0, 0];
    let mask = 0, boardMask = 0;
    for (const c of board) { sc[c & 3]++; mask |= 1 << (c >> 2); boardMask |= 1 << (c >> 2); }
    sc[h1 & 3]++; sc[h2 & 3]++;
    if ((sc[h1 & 3] === 4) || (sc[h2 & 3] === 4)) return true;
    mask |= (1 << (h1 >> 2)) | (1 << (h2 >> 2));
    let ways = 0;
    for (let r = 0; r < 13; r++) {
      if (mask & (1 << r)) continue;
      if (C.straightHigh(mask | (1 << r)) >= 0 && C.straightHigh(boardMask | (1 << r)) < 0) ways++;
    }
    return ways >= 2;
  }

  const ACCEPT = {
    // probability a hand of bucket [air, draw, medium, strong] stays in the range
    raise: [0.12, 0.45, 0.3, 1],
    bet: [0.3, 0.75, 0.65, 1],
    call: [0.3, 1, 1, 0.85],
    check: [1, 1, 1, 0.55],
    none: [1, 1, 1, 1],
  };

  /**
   * Monte Carlo equity.
   * opts: { hero:[c1,c2], board:[], opponents:[{lo, hi, line}] | number, iterations, rng }
   *  lo/hi = preflop percentile window for the opponent's range (0 = best hand)
   *  line  = latest postflop action: 'raise' | 'bet' | 'call' | 'check' | 'none'
   */
  function equity(opts) {
    const rng = opts.rng || Math.random;
    const hero = opts.hero, board = opts.board || [];
    const opps = typeof opts.opponents === 'number'
      ? Array.from({ length: opts.opponents }, () => ({ lo: 0, hi: 1, line: 'none' }))
      : opts.opponents;
    const iters = opts.iterations || 1500;
    const dead = new Set(hero.concat(board));
    const deck = [];
    for (let c = 0; c < 52; c++) if (!dead.has(c)) deck.push(c);
    const need = 5 - board.length;
    const heroCards = new Array(7), oppCards = new Array(7);
    const fullBoard = new Array(5);
    let total = 0, wins = 0, ties = 0;
    const oh = new Array(opps.length * 2);
    const D = deck.length;

    for (let it = 0; it < iters; it++) {
      // sample opponent hands with rejection against their ranges
      let used = 0; // deck[0..used) are taken (swapped to the front)
      for (let o = 0; o < opps.length; o++) {
        const op = opps[o];
        const acc = ACCEPT[op.line || 'none'];
        let a, b, tries = 0;
        for (;;) {
          const i = used + Math.floor(rng() * (D - used));
          let t = deck[used]; deck[used] = deck[i]; deck[i] = t;
          const j = used + 1 + Math.floor(rng() * (D - used - 1));
          t = deck[used + 1]; deck[used + 1] = deck[j]; deck[j] = t;
          a = deck[used]; b = deck[used + 1];
          tries++;
          if (tries > 60) break;
          const p = comboPct[a * 52 + b];
          const lo = op.lo || 0, hi = op.hi == null ? 1 : op.hi;
          // soft edges so ranges are not razor sharp
          if (p > hi + 0.04 || p < lo - 0.02) continue;
          if (p > hi && rng() < (p - hi) / 0.04) continue;
          if (acc !== ACCEPT.none && board.length >= 3) {
            const bucket = strengthBucket(a, b, board);
            if (rng() > acc[bucket]) continue;
          }
          break;
        }
        oh[2 * o] = a; oh[2 * o + 1] = b;
        used += 2;
      }
      for (let k = 0; k < board.length; k++) fullBoard[k] = board[k];
      for (let k = 0; k < need; k++) {
        const i = used + Math.floor(rng() * (D - used));
        const t = deck[used]; deck[used] = deck[i]; deck[i] = t;
        fullBoard[board.length + k] = deck[used];
        used++;
      }
      heroCards[0] = hero[0]; heroCards[1] = hero[1];
      for (let k = 0; k < 5; k++) { heroCards[k + 2] = fullBoard[k]; oppCards[k + 2] = fullBoard[k]; }
      const hs = C.evaluate(heroCards, 7);
      let lost = false, tie = 0;
      for (let o = 0; o < opps.length; o++) {
        oppCards[0] = oh[2 * o]; oppCards[1] = oh[2 * o + 1];
        const s = C.evaluate(oppCards, 7);
        if (s > hs) { lost = true; break; }
        if (s === hs) tie++;
      }
      if (!lost) {
        if (tie) { ties++; total += 1 / (tie + 1); } else { wins++; total += 1; }
      }
    }
    return { equity: total / iters, win: wins / iters, tie: ties / iters, iterations: iters };
  }

  /** Exact heads-up equity by enumerating all runouts (board of 3+ cards), else MC. */
  function headsUpEquity(a, b, board, rng) {
    board = board || [];
    const dead = new Set(a.concat(b, board));
    const deck = [];
    for (let c = 0; c < 52; c++) if (!dead.has(c)) deck.push(c);
    const need = 5 - board.length;
    const ha = new Array(7), hb = new Array(7);
    ha[0] = a[0]; ha[1] = a[1]; hb[0] = b[0]; hb[1] = b[1];
    for (let k = 0; k < board.length; k++) { ha[k + 2] = board[k]; hb[k + 2] = board[k]; }
    let wa = 0, wb = 0, t = 0, n = 0;
    const score = () => {
      const sa = C.evaluate(ha, 7), sb = C.evaluate(hb, 7);
      if (sa > sb) wa++; else if (sb > sa) wb++; else t++;
      n++;
    };
    const bl = board.length + 2;
    if (need === 0) score();
    else if (need === 1) for (const x of deck) { ha[bl] = hb[bl] = x; score(); }
    else if (need === 2) {
      for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) {
        ha[bl] = hb[bl] = deck[i]; ha[bl + 1] = hb[bl + 1] = deck[j]; score();
      }
    } else {
      const r = rng || Math.random;
      for (let it = 0; it < 20000; it++) {
        for (let k = 0; k < need; k++) {
          const i = k + Math.floor(r() * (deck.length - k));
          const tt = deck[k]; deck[k] = deck[i]; deck[i] = tt;
          ha[board.length + 2 + k] = hb[board.length + 2 + k] = deck[k];
        }
        score();
      }
    }
    return { a: (wa + t / 2) / n, b: (wb + t / 2) / n, tie: t / n, winA: wa / n, winB: wb / n };
  }

  // ---- draws & outs ----
  function analyze(hole, board) {
    const out = {
      made: null, madeName: '', relative: '', flushDraw: false, nutFlushDraw: false, oesd: false, gutshot: false,
      backdoorFlush: false, overcards: 0, outs: [], outGroups: {}, texture: texture(board),
    };
    if (!hole || hole.length < 2 || hole[0] < 0) return out;
    const all = hole.concat(board);
    if (all.length >= 5) {
      const s = C.evaluate(all);
      out.made = s; out.madeName = C.describe(s);
    } else {
      out.madeName = hole[0] >> 2 === hole[1] >> 2 ? 'Pocket ' + C.RANK_PLURALS[hole[0] >> 2] : C.RANK_NAMES[Math.max(hole[0] >> 2, hole[1] >> 2)] + ' High';
    }
    if (board.length < 3) return out;
    out.relative = relativeStrength(hole, board);

    const suitCount = [0, 0, 0, 0], boardSuit = [0, 0, 0, 0];
    for (const c of all) suitCount[c & 3]++;
    for (const c of board) boardSuit[c & 3]++;
    for (let su = 0; su < 4; su++) {
      const holeIn = (hole[0] & 3) === su || (hole[1] & 3) === su;
      if (suitCount[su] === 4 && holeIn && board.length < 5) {
        out.flushDraw = true;
        // nut draw if we hold the highest missing card of the suit
        let highest = 12;
        while (highest >= 0 && board.some((c) => c === highest * 4 + su)) highest--;
        out.nutFlushDraw = hole.some((c) => c === highest * 4 + su);
      }
      if (suitCount[su] === 3 && holeIn && board.length === 3 && boardSuit[su] < 3) out.backdoorFlush = true;
    }
    let mask = 0, bmask = 0;
    for (const c of all) mask |= 1 << (c >> 2);
    for (const c of board) bmask |= 1 << (c >> 2);
    const madeStraight = C.straightHigh(mask) >= 0;
    let ways = 0;
    if (!madeStraight && board.length < 5) {
      for (let r = 0; r < 13; r++) {
        if (mask & (1 << r)) continue;
        if (C.straightHigh(mask | (1 << r)) >= 0 && C.straightHigh(bmask | (1 << r)) < 0) ways++;
      }
    }
    if (ways >= 2) out.oesd = true; else if (ways === 1) out.gutshot = true;
    const topBoard = Math.max(...board.map((c) => c >> 2));
    out.overcards = hole.filter((c) => (c >> 2) > topBoard).length;

    if (board.length < 5) {
      const dead = new Set(all);
      const cur = out.made;
      const curCat = cur >> 20;
      for (let c = 0; c < 52; c++) {
        if (dead.has(c)) continue;
        const ns = C.evaluate(all.concat([c]));
        const ncat = ns >> 20;
        const boardOnly = board.length + 1 >= 5 ? C.evaluate(board.concat([c])) : -1;
        if (ncat <= curCat) continue;
        if (boardOnly >= 0 && (boardOnly >> 20) >= ncat) continue; // the board improved, not us
        let label = null;
        if (ncat >= 4) label = C.CATEGORY_NAMES[ncat];
        else if (ncat === 3 || ncat === 2) {
          // must use a hole card: the new card pairs one of our hole cards or the board pair counts with our pair
          const r = c >> 2;
          if ((hole[0] >> 2) === r || (hole[1] >> 2) === r) label = C.CATEGORY_NAMES[ncat];
        } else if (ncat === 1 && curCat === 0) {
          const r = c >> 2;
          if (((hole[0] >> 2) === r || (hole[1] >> 2) === r) && r > topBoard) label = 'Top Pair';
        }
        if (label) {
          out.outs.push(c);
          (out.outGroups[label] = out.outGroups[label] || []).push(c);
        }
      }
    }
    return out;
  }

  /** Describe hand strength relative to the board: "top pair, good kicker", "overpair", "set"… */
  function relativeStrength(hole, board) {
    const all = hole.concat(board);
    const s = C.evaluate(all);
    const cat = s >> 20;
    const ranks = board.map((c) => c >> 2).sort((a, b) => b - a);
    const h = hole.map((c) => c >> 2).sort((a, b) => b - a);
    const bScore = board.length >= 5 ? C.evaluate(board) : boardScoreSmall(board);
    if (board.length >= 5 && s === bScore) return 'playing the board';
    if (cat === 1) {
      const pr = (s >> 16) & 15;
      if (h[0] === h[1]) {
        if (pr > ranks[0]) return 'overpair';
        return pr > ranks[ranks.length - 1] ? 'underpair (middle)' : 'underpair';
      }
      if (!h.includes(pr)) return 'board pair only';
      const kicker = h[0] === pr ? h[1] : h[0];
      if (pr === ranks[0]) return kicker >= 10 ? 'top pair, strong kicker' : kicker >= 7 ? 'top pair, medium kicker' : 'top pair, weak kicker';
      if (pr === ranks[1]) return 'middle pair';
      return 'bottom pair';
    }
    if (cat === 2) {
      if ((bScore >> 20) >= 1) {
        const usesBoth = h.every((r) => ranks.includes(r));
        return usesBoth ? 'two pair' : h[0] === h[1] ? 'two pair (pocket pair + board pair)' : 'two pair (one from the board)';
      }
      return h[0] === h[1] ? 'two pair' : 'two pair';
    }
    if (cat === 3) return h[0] === h[1] ? 'a set' : 'trips';
    if (cat === 0) return 'nothing yet';
    return C.CATEGORY_NAMES[cat].toLowerCase();
  }

  function texture(board) {
    const t = { paired: false, monotone: false, twoTone: false, rainbow: false, connected: false, wet: false, high: 0, label: '' };
    if (!board || board.length < 3) return t;
    const ranks = board.map((c) => c >> 2);
    const suits = [0, 0, 0, 0];
    board.forEach((c) => suits[c & 3]++);
    const maxSuit = Math.max(...suits);
    t.paired = new Set(ranks).size < ranks.length;
    t.monotone = maxSuit >= 3;
    t.twoTone = maxSuit === 2;
    t.rainbow = maxSuit === 1;
    const u = [...new Set(ranks)].sort((a, b) => a - b);
    let span = 0;
    for (let i = 0; i + 2 < u.length; i++) if (u[i + 2] - u[i] <= 4) span++;
    if (u.includes(12) && u.filter((r) => r <= 3).length >= 2) span++;
    t.connected = span > 0;
    t.high = Math.max(...ranks);
    t.wet = t.monotone || (t.connected && t.twoTone) || (t.connected && !t.paired);
    const parts = [];
    if (t.paired) parts.push('paired');
    if (t.monotone) parts.push(maxSuit >= 4 ? 'four-flush' : 'monotone');
    else if (t.twoTone && board.length <= 4) parts.push('two-tone');
    else if (t.rainbow) parts.push('rainbow');
    if (t.connected) parts.push('connected');
    t.label = (t.wet ? 'Wet' : 'Dry') + ' board' + (parts.length ? ' (' + parts.join(', ') + ')' : '');
    return t;
  }

  return { PCT, handPct, classPct, rankIndex, topClasses, equity, headsUpEquity, analyze, texture, relativeStrength, strengthBucket, ORDER: P.ORDER, EQUITY: P.EQUITY };
});
