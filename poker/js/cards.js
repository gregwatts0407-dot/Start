/*
 * cards.js — cards, deck, RNG and a fast hand evaluator.
 * Works in the browser (window.PokerCards) and in Node (require).
 *
 * A card is an integer 0..51: rank = c >> 2 (0 = deuce .. 12 = ace), suit = c & 3.
 * evaluate() returns an integer score: higher is better, equal means a tie.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PokerCards = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RANKS = '23456789TJQKA';
  const SUITS = 'shdc';
  const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣'];
  const SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'];
  const RANK_NAMES = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
  const RANK_PLURALS = ['Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces'];
  const CATEGORY_NAMES = ['High Card', 'One Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'];

  const rankOf = (c) => c >> 2;
  const suitOf = (c) => c & 3;
  const cardStr = (c) => RANKS[c >> 2] + SUITS[c & 3];
  function parseCard(s) {
    const r = RANKS.indexOf(s[0].toUpperCase());
    const su = SUITS.indexOf(s[1].toLowerCase());
    if (r < 0 || su < 0) throw new Error('Bad card: ' + s);
    return r * 4 + su;
  }
  const parseCards = (str) => (str.trim() ? str.trim().split(/\s+/).map(parseCard) : []);

  // ---- Seeded RNG (mulberry32) ----
  function makeRng(seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function newDeck() {
    const d = new Array(52);
    for (let i = 0; i < 52; i++) d[i] = i;
    return d;
  }
  function shuffle(arr, rng) {
    const r = rng || Math.random;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // ---- Evaluator ----
  const counts = new Int32Array(13);
  const suitMask = new Int32Array(4);
  const suitCnt = new Int32Array(4);

  function straightHigh(mask) {
    const m = (mask << 1) | ((mask >> 12) & 1); // bit 0 = ace played low
    for (let h = 13; h >= 4; h--) if (((m >> (h - 4)) & 31) === 31) return h - 1;
    return -1;
  }
  function topBits(mask, k) {
    let out = 0, n = 0;
    for (let r = 12; r >= 0 && n < k; r--) {
      if (mask & (1 << r)) { out = (out << 4) | r; n++; }
    }
    while (n < 5) { out <<= 4; n++; }
    return out;
  }

  /** Score the best five-card hand from 5–7 cards. */
  function evaluate(cards, len) {
    const n = len === undefined ? cards.length : len;
    counts.fill(0); suitMask.fill(0); suitCnt.fill(0);
    let rankMask = 0;
    for (let i = 0; i < n; i++) {
      const c = cards[i], r = c >> 2, s = c & 3;
      counts[r]++; rankMask |= 1 << r; suitMask[s] |= 1 << r; suitCnt[s]++;
    }
    let flushSuit = -1;
    for (let s = 0; s < 4; s++) if (suitCnt[s] >= 5) flushSuit = s;
    if (flushSuit >= 0) {
      const sf = straightHigh(suitMask[flushSuit]);
      if (sf >= 0) return (8 << 20) | (sf << 16);
    }
    let quad = -1, t1 = -1, t2 = -1, p1 = -1, p2 = -1;
    for (let r = 12; r >= 0; r--) {
      const c = counts[r];
      if (c === 4) quad = r;
      else if (c === 3) { if (t1 < 0) t1 = r; else if (t2 < 0) t2 = r; }
      else if (c === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; }
    }
    if (quad >= 0) {
      return (7 << 20) | (quad << 16) | (topBits(rankMask & ~(1 << quad), 1) >> 4);
    }
    if (t1 >= 0 && (t2 >= 0 || p1 >= 0)) {
      return (6 << 20) | (t1 << 16) | (Math.max(t2, p1) << 12);
    }
    if (flushSuit >= 0) return (5 << 20) | topBits(suitMask[flushSuit], 5);
    const st = straightHigh(rankMask);
    if (st >= 0) return (4 << 20) | (st << 16);
    if (t1 >= 0) return (3 << 20) | (t1 << 16) | (topBits(rankMask & ~(1 << t1), 2) >> 4);
    if (p1 >= 0 && p2 >= 0) {
      return (2 << 20) | (p1 << 16) | (p2 << 12) | (topBits(rankMask & ~(1 << p1) & ~(1 << p2), 1) >> 8);
    }
    if (p1 >= 0) return (1 << 20) | (p1 << 16) | (topBits(rankMask & ~(1 << p1), 3) >> 4);
    return topBits(rankMask, 5);
  }

  const categoryOf = (score) => score >> 20;
  const kick = (score, i) => (score >> (16 - 4 * i)) & 15;

  /** Human readable description of a score, e.g. "Two Pair, Aces and Sevens". */
  function describe(score) {
    const cat = score >> 20;
    const a = kick(score, 0), b = kick(score, 1);
    switch (cat) {
      case 8: return a === 12 ? 'Royal Flush' : 'Straight Flush, ' + RANK_NAMES[a] + ' high';
      case 7: return 'Four ' + RANK_PLURALS[a];
      case 6: return 'Full House, ' + RANK_PLURALS[a] + ' full of ' + RANK_PLURALS[b];
      case 5: return 'Flush, ' + RANK_NAMES[a] + ' high';
      case 4: return 'Straight, ' + RANK_NAMES[a] + ' high';
      case 3: return 'Three ' + RANK_PLURALS[a];
      case 2: return 'Two Pair, ' + RANK_PLURALS[a] + ' and ' + RANK_PLURALS[b];
      case 1: return 'Pair of ' + RANK_PLURALS[a];
      default: return RANK_NAMES[a] + ' High';
    }
  }
  const categoryName = (score) => CATEGORY_NAMES[score >> 20];

  /** Best five cards (for highlighting) from 5–7 cards. */
  function bestFive(cards) {
    if (cards.length <= 5) return { score: evaluate(cards), cards: cards.slice() };
    let best = -1, bestCards = null;
    const n = cards.length, pick = [0, 0, 0, 0, 0];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++)
      for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++) {
        pick[0] = cards[a]; pick[1] = cards[b]; pick[2] = cards[c]; pick[3] = cards[d]; pick[4] = cards[e];
        const s = evaluate(pick, 5);
        if (s > best) { best = s; bestCards = pick.slice(); }
      }
    return { score: best, cards: bestCards };
  }

  // ---- Starting-hand classes (169) ----
  /** "AKs", "T9o", "77" — high rank first. */
  function handClass(c1, c2) {
    let r1 = c1 >> 2, r2 = c2 >> 2;
    if (r1 < r2) { const t = r1; r1 = r2; r2 = t; }
    if (r1 === r2) return RANKS[r1] + RANKS[r2];
    return RANKS[r1] + RANKS[r2] + ((c1 & 3) === (c2 & 3) ? 's' : 'o');
  }
  /** Grid position for the 13×13 chart: row/col 0 = ace. Suited above the diagonal. */
  function classGrid(cls) {
    const a = 12 - RANKS.indexOf(cls[0]);
    const b = 12 - RANKS.indexOf(cls[1]);
    if (cls.length === 2) return { row: a, col: a };
    return cls[2] === 's' ? { row: a, col: b } : { row: b, col: a };
  }
  function gridClass(row, col) {
    const hi = RANKS[12 - Math.min(row, col)], lo = RANKS[12 - Math.max(row, col)];
    if (row === col) return hi + lo;
    return hi + lo + (col > row ? 's' : 'o');
  }
  function allClasses() {
    const out = [];
    for (let r = 0; r < 13; r++) for (let c = 0; c < 13; c++) out.push(gridClass(r, c));
    return out;
  }
  const classCombos = (cls) => (cls.length === 2 ? 6 : cls[2] === 's' ? 4 : 12);

  /** Every concrete two-card combo of a class, avoiding dead cards. */
  function classToCombos(cls, dead) {
    const hi = RANKS.indexOf(cls[0]), lo = RANKS.indexOf(cls[1]);
    const out = [];
    for (let s1 = 0; s1 < 4; s1++) for (let s2 = 0; s2 < 4; s2++) {
      if (hi === lo && s2 <= s1) continue;
      if (cls.length === 3 && cls[2] === 's' && s1 !== s2) continue;
      if (cls.length === 3 && cls[2] === 'o' && s1 === s2) continue;
      const a = hi * 4 + s1, b = lo * 4 + s2;
      if (dead && (dead.has(a) || dead.has(b))) continue;
      out.push([a, b]);
    }
    return out;
  }

  return {
    RANKS, SUITS, SUIT_SYMBOLS, SUIT_NAMES, RANK_NAMES, RANK_PLURALS, CATEGORY_NAMES,
    rankOf, suitOf, cardStr, parseCard, parseCards, makeRng, newDeck, shuffle,
    evaluate, describe, categoryOf, categoryName, bestFive, straightHigh,
    handClass, classGrid, gridClass, allClasses, classCombos, classToCombos,
  };
});
