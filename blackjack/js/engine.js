/*
 * Blackjack rules engine: cards, shoe, hand evaluation, basic strategy,
 * side bets and settlement. It has no DOM dependencies so it can be
 * tested in Node (see tests/engine.test.js).
 */
(function (root) {
  'use strict';

  const SUITS = ['S', 'H', 'D', 'C'];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const SUIT_NAMES = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
  const RANK_NAMES = { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King' };
  const TEN_RANKS = new Set(['10', 'J', 'Q', 'K']);

  const DEFAULT_RULES = {
    decks: 6,
    h17: false,          // dealer hits soft 17
    bjPayout: 1.5,       // 3:2 (1.2 = 6:5)
    das: true,           // double after split
    surrender: true,     // late surrender
    maxHands: 4,         // split up to this many hands
    resplitAces: false,
    hitSplitAces: false,
    doubleOn: 'any',     // 'any' | '9-11' | '10-11'
    insurance: true,
    sideBets: true,
    penetration: 0.75,
  };

  let cardSerial = 0;

  function makeCard(rank, suit) {
    cardSerial += 1;
    return { id: 'c' + cardSerial, rank, suit, faceUp: false };
  }

  function isRed(suit) { return suit === 'H' || suit === 'D'; }

  function rankValue(rank) {
    if (rank === 'A') return 1;
    if (TEN_RANKS.has(rank)) return 10;
    return Number(rank);
  }

  function rankIndex(rank) { return RANKS.indexOf(rank) + 1; } // A=1 … K=13

  function cardName(card) {
    return (RANK_NAMES[card.rank] || card.rank) + ' of ' + SUIT_NAMES[card.suit];
  }

  function evaluate(cards) {
    let total = 0;
    let aces = 0;
    for (const c of cards) {
      total += rankValue(c.rank);
      if (c.rank === 'A') aces += 1;
    }
    let soft = false;
    if (aces > 0 && total + 10 <= 21) {
      total += 10;
      soft = true;
    }
    return { total, soft, bust: total > 21 };
  }

  function isNatural(cards, fromSplit) {
    return !fromSplit && cards.length === 2 && evaluate(cards).total === 21;
  }

  function isPair(cards) {
    return cards.length === 2 && rankValue(cards[0].rank) === rankValue(cards[1].rank);
  }

  function dealerShouldHit(cards, rules) {
    const v = evaluate(cards);
    if (v.total < 17) return true;
    return v.total === 17 && v.soft && !!rules.h17;
  }

  function hiLo(rank) {
    const v = rankValue(rank);
    if (v >= 2 && v <= 6) return 1;
    if (v >= 7 && v <= 9) return 0;
    return -1;
  }

  // --- Random numbers -------------------------------------------------------
  function randomInt(n) {
    const c = root.crypto;
    if (c && c.getRandomValues) {
      const buf = new Uint32Array(1);
      const limit = Math.floor(0x100000000 / n) * n;
      let x;
      do { c.getRandomValues(buf); x = buf[0]; } while (x >= limit);
      return x % n;
    }
    return Math.floor(Math.random() * n);
  }

  function shuffleInPlace(arr, rand) {
    const r = rand || randomInt;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = r(i + 1);
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // --- Shoe -----------------------------------------------------------------
  class Shoe {
    constructor(decks, penetration, rand) {
      this.decks = decks;
      this.penetration = penetration;
      this.rand = rand;
      this.discards = [];
      this.shuffle();
    }

    shuffle() {
      const cards = [];
      for (let d = 0; d < this.decks; d++) {
        for (const s of SUITS) for (const r of RANKS) cards.push(makeCard(r, s));
      }
      shuffleInPlace(cards, this.rand);
      this.cards = cards;
      this.total = cards.length;
      this.discards = [];
      // Cut card position, counted in cards dealt. Never leave fewer than
      // 12 cards behind it so a full table can finish the round.
      this.cutAt = Math.min(Math.floor(this.total * this.penetration), this.total - 12);
      this.dealt = 0;
      this.needsShuffle = false;
      this.reshuffledMidRound = false;
    }

    draw() {
      if (this.cards.length === 0) {
        // Out of cards mid-round: reshuffle the discards into a new stack.
        if (this.discards.length === 0) this.shuffle();
        else {
          this.cards = shuffleInPlace(this.discards.splice(0), this.rand);
          this.reshuffledMidRound = true;
        }
      }
      const card = this.cards.pop();
      card.faceUp = false;
      this.dealt += 1;
      if (this.dealt >= this.cutAt) this.needsShuffle = true;
      return card;
    }

    get remaining() { return this.cards.length; }
    get decksRemaining() { return Math.max(this.cards.length / 52, 0.25); }
  }

  // --- Basic strategy -------------------------------------------------------
  // Multi-deck basic strategy that adapts to H17/S17, DAS and surrender.
  // Returns 'H' (hit), 'S' (stand), 'D' (double), 'P' (split) or 'R' (surrender).
  function upValue(card) {
    const v = rankValue(card.rank);
    return v === 1 ? 11 : v;
  }

  function basicStrategy(cards, dealerUp, rules, opts) {
    const o = Object.assign({ canDouble: true, canSplit: true, canSurrender: true }, opts);
    const up = upValue(dealerUp);
    const { total, soft } = evaluate(cards);
    const pair = isPair(cards);
    const pairValue = pair ? rankValue(cards[0].rank) : 0;

    // Late surrender comes first (except 8,8 which is split unless H17 vs A).
    if (o.canSurrender && cards.length === 2) {
      if (pair && pairValue === 8) {
        if (rules.h17 && up === 11) return 'R';
      } else if (!soft) {
        if (total === 16 && up >= 9) return 'R';
        if (total === 15 && up === 10) return 'R';
        if (rules.h17 && total === 15 && up === 11) return 'R';
        if (rules.h17 && total === 17 && up === 11) return 'R';
      }
    }

    if (o.canSplit && pair) {
      const das = !!rules.das;
      let split = false;
      switch (pairValue) {
        case 1: split = true; break;
        case 10: split = false; break;
        case 9: split = [2, 3, 4, 5, 6, 8, 9].includes(up); break;
        case 8: split = true; break;
        case 7: split = up <= 7; break;
        case 6: split = das ? up <= 6 : up >= 3 && up <= 6; break;
        case 5: split = false; break;
        case 4: split = das && (up === 5 || up === 6); break;
        case 3:
        case 2: split = das ? up <= 7 : up >= 4 && up <= 7; break;
        default: split = false;
      }
      if (split) return 'P';
    }

    let a;
    if (soft) {
      if (total >= 20) a = 'S';
      else if (total === 19) a = rules.h17 && up === 6 ? 'Ds' : 'S';
      else if (total === 18) {
        if (up >= 9) a = 'H';
        else if (up === 7 || up === 8) a = 'S';
        else if (up === 2) a = rules.h17 ? 'Ds' : 'S';
        else a = 'Ds';
      } else if (total === 17) a = up >= 3 && up <= 6 ? 'Dh' : 'H';
      else if (total === 16 || total === 15) a = up >= 4 && up <= 6 ? 'Dh' : 'H';
      else if (total === 14 || total === 13) a = up === 5 || up === 6 ? 'Dh' : 'H';
      else a = 'H';
    } else if (total >= 17) a = 'S';
    else if (total >= 13) a = up <= 6 ? 'S' : 'H';
    else if (total === 12) a = up >= 4 && up <= 6 ? 'S' : 'H';
    else if (total === 11) a = up === 11 && !rules.h17 ? 'H' : 'Dh';
    else if (total === 10) a = up <= 9 ? 'Dh' : 'H';
    else if (total === 9) a = up >= 3 && up <= 6 ? 'Dh' : 'H';
    else a = 'H';

    if (a === 'Dh') return o.canDouble ? 'D' : 'H';
    if (a === 'Ds') return o.canDouble ? 'D' : 'S';
    return a;
  }

  // Chart cell for the strategy table in the help screen.
  // kind: 'hard' | 'soft' | 'pair'; value: hard total, soft total, or pair card value.
  function chartCell(kind, value, upRank, rules) {
    const up = { rank: upRank, suit: 'S' };
    let cards;
    if (kind === 'pair') {
      const r = value === 1 ? 'A' : String(value);
      cards = [{ rank: r, suit: 'S' }, { rank: r, suit: 'H' }];
    } else if (kind === 'soft') {
      cards = [{ rank: 'A', suit: 'S' }, { rank: String(value - 11), suit: 'H' }];
    } else {
      // Build a non-pair two-card hard total where possible.
      let a = Math.min(10, value - 2);
      let b = value - a;
      if (a === b) { a -= 1; b += 1; }
      if (b > 10) { b = 10; a = value - 10; }
      cards = [{ rank: String(a), suit: 'S' }, { rank: String(b), suit: 'H' }];
    }
    const withDouble = basicStrategy(cards, up, rules, { canDouble: true, canSplit: kind === 'pair', canSurrender: !!rules.surrender });
    if (withDouble === 'D') {
      const noDouble = basicStrategy(cards, up, rules, { canDouble: false, canSplit: kind === 'pair', canSurrender: !!rules.surrender });
      return noDouble === 'S' ? 'Ds' : 'Dh';
    }
    if (withDouble === 'R') {
      const noSur = basicStrategy(cards, up, rules, { canDouble: true, canSplit: kind === 'pair', canSurrender: false });
      return 'R' + (noSur === 'D' ? 'h' : noSur.toLowerCase());
    }
    if (kind === 'pair' && withDouble === 'P' && !rules.das) return 'P';
    return withDouble;
  }

  // --- Side bets ------------------------------------------------------------
  function perfectPairs(a, b) {
    if (!a || !b || a.rank !== b.rank) return null;
    if (a.suit === b.suit) return { name: 'Perfect Pair', pays: 25 };
    if (isRed(a.suit) === isRed(b.suit)) return { name: 'Coloured Pair', pays: 12 };
    return { name: 'Mixed Pair', pays: 6 };
  }

  function twentyOnePlusThree(a, b, c) {
    const cards = [a, b, c];
    const flush = cards.every(x => x.suit === a.suit);
    const trips = cards.every(x => x.rank === a.rank);
    const idx = cards.map(x => rankIndex(x.rank)).sort((x, y) => x - y);
    const run = idx[1] === idx[0] + 1 && idx[2] === idx[1] + 1;
    const highAce = idx[0] === 1 && idx[1] === 12 && idx[2] === 13;
    const straight = run || highAce;
    if (trips && flush) return { name: 'Suited Trips', pays: 100 };
    if (straight && flush) return { name: 'Straight Flush', pays: 40 };
    if (trips) return { name: 'Three of a Kind', pays: 30 };
    if (straight) return { name: 'Straight', pays: 10 };
    if (flush) return { name: 'Flush', pays: 5 };
    return null;
  }

  // --- Settlement -----------------------------------------------------------
  function round2(x) { return Math.round(x * 100) / 100; }

  // Returns { result, returned } where `returned` is what goes back to the
  // player (stake included). hand: { cards, bet, fromSplit, surrendered }.
  function settle(hand, dealerCards, rules) {
    const p = evaluate(hand.cards);
    const d = evaluate(dealerCards);
    const playerBJ = isNatural(hand.cards, hand.fromSplit);
    const dealerBJ = isNatural(dealerCards, false);
    if (hand.surrendered) return { result: 'surrender', returned: round2(hand.bet / 2) };
    if (p.bust) return { result: 'bust', returned: 0 };
    if (playerBJ && dealerBJ) return { result: 'push', returned: hand.bet };
    if (playerBJ) return { result: 'blackjack', returned: round2(hand.bet + hand.bet * rules.bjPayout) };
    if (dealerBJ) return { result: 'lose', returned: 0 };
    if (d.bust) return { result: 'win', returned: round2(hand.bet * 2) };
    if (p.total > d.total) return { result: 'win', returned: round2(hand.bet * 2) };
    if (p.total < d.total) return { result: 'lose', returned: 0 };
    return { result: 'push', returned: hand.bet };
  }

  const ACTION_NAMES = { H: 'Hit', S: 'Stand', D: 'Double', P: 'Split', R: 'Surrender' };

  function describeHand(cards) {
    const v = evaluate(cards);
    if (isPair(cards)) {
      const r = cards[0].rank;
      const label = r === 'A' ? 'Aces' : TEN_RANKS.has(r) ? 'Tens' : r + 's';
      return 'a pair of ' + label;
    }
    return (v.soft ? 'soft ' : 'hard ') + v.total;
  }

  const api = {
    SUITS, RANKS, SUIT_NAMES, RANK_NAMES, DEFAULT_RULES, ACTION_NAMES,
    makeCard, isRed, rankValue, cardName, evaluate, isNatural, isPair,
    dealerShouldHit, hiLo, Shoe, shuffleInPlace, basicStrategy, chartCell,
    perfectPairs, twentyOnePlusThree, settle, round2, describeHand, upValue,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BJ = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
