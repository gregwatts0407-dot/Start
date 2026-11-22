/*
 * Teaching helpers shared by the in-play coach and the Academy:
 * plain-language explanations of basic strategy, dealer statistics,
 * situation keys for tracking mistakes, and saved learning progress.
 */
(function (root) {
  'use strict';
  const BJ = root.BJ;

  // Approximate chance (%) that the dealer busts, by up card (6 decks, S17,
  // after checking for Blackjack). Index 11 is the Ace.
  const BUST = { 2: 35, 3: 37, 4: 40, 5: 42, 6: 42, 7: 26, 8: 24, 9: 23, 10: 23, 11: 17 };

  function upWord(card) {
    const v = BJ.upValue(card);
    return v === 11 ? 'Ace' : String(v);
  }
  function upLabel(card) {
    const v = BJ.upValue(card);
    if (v === 11) return 'an Ace';
    if (v === 8) return 'an 8';
    return 'a ' + v;
  }

  function category(cards) {
    if (cards.length === 2 && BJ.isPair(cards)) return 'pair';
    return BJ.evaluate(cards).soft ? 'soft' : 'hard';
  }

  // A compact key for a decision, e.g. "H12v3", "S18v9", "P8v11".
  function situationKey(cards, up) {
    const v = BJ.evaluate(cards);
    const u = BJ.upValue(up);
    const cat = category(cards);
    if (cat === 'pair') return 'P' + BJ.rankValue(cards[0].rank) + 'v' + u;
    return (cat === 'soft' ? 'S' : 'H') + v.total + 'v' + u;
  }

  function parseKey(key) {
    const m = /^([HSP])(\d+)v(\d+)$/.exec(key);
    if (!m) return null;
    return { kind: m[1], value: Number(m[2]), up: Number(m[3]) };
  }

  function keyLabel(key) {
    const k = parseKey(key);
    if (!k) return key;
    const up = k.up === 11 ? 'Ace' : String(k.up);
    if (k.kind === 'P') {
      const r = k.value === 1 ? 'Aces' : k.value === 10 ? '10s' : k.value + 's';
      return `Pair of ${r} vs ${up}`;
    }
    return `${k.kind === 'S' ? 'Soft' : 'Hard'} ${k.value} vs ${up}`;
  }

  const TEN = ['10', 'J', 'Q', 'K'];
  const SUITS = ['S', 'H', 'D', 'C'];
  const rs = () => SUITS[Math.floor(Math.random() * 4)];
  const rankFor = v => (v === 1 || v === 11 ? 'A' : v === 10 ? TEN[Math.floor(Math.random() * 4)] : String(v));
  const card = r => ({ rank: r, suit: rs() });

  // Build a concrete hand for a situation key.
  function handForKey(key) {
    const k = parseKey(key);
    if (!k) return null;
    const up = card(rankFor(k.up));
    let cards;
    if (k.kind === 'P') cards = [card(rankFor(k.value)), card(rankFor(k.value))];
    else if (k.kind === 'S') cards = [card('A'), card(rankFor(k.value - 11))];
    else cards = hardHand(k.value);
    return { cards, up };
  }

  function hardHand(total) {
    // Two different cards adding up to `total` (5–20), avoiding pairs and Aces.
    const opts = [];
    for (let a = 2; a <= 10; a++) {
      const b = total - a;
      if (b >= 2 && b <= 10 && a !== b && a <= b) opts.push([a, b]);
    }
    if (!opts.length) return [card('10'), card('6'), card(String(total - 16))];
    const [a, b] = opts[Math.floor(Math.random() * opts.length)];
    return [card(rankFor(a)), card(rankFor(b))];
  }

  const ACTION = { H: 'Hit', S: 'Stand', D: 'Double', P: 'Split', R: 'Surrender' };

  // Plain-language reason for the basic-strategy play.
  // Returns { headline, why, detail }.
  function explain(cards, up, rules, best) {
    const v = BJ.evaluate(cards);
    const u = BJ.upValue(up);
    const weak = u >= 2 && u <= 6;
    const bust = BUST[u];
    const U = upLabel(up);
    const total = v.total;
    const pair = cards.length === 2 && BJ.isPair(cards);
    const pv = pair ? BJ.rankValue(cards[0].rank) : 0;
    const name = BJ.describeHand(cards);
    const dealerNote = weak
      ? `The dealer's ${upWord(up)} is a "bust card": they bust about ${bust}% of the time from here.`
      : `With ${U} showing, the dealer reaches 17 or more most of the time and busts only about ${bust}%.`;
    let why = '';

    if (best === 'P') {
      if (pv === 1) why = 'Each Ace starts a fresh hand worth 11, and almost a third of the deck is worth 10. Two hands at 11 are far stronger than one soft 12.';
      else if (pv === 8) why = 'A pair of 8s makes 16, the worst total in blackjack. Two hands that start at 8 lose much less.';
      else if (pv === 9) why = u === 8 || u === 9 ? 'Your 18 only ties or loses against a likely 18 or 19. Two hands starting at 9 do better.' : 'Your 18 is good, but against a weak dealer two hands starting at 9 win even more money.';
      else if (pv === 7) why = '14 is a weak total, and each 7 can grow into a solid hand while the dealer is vulnerable.';
      else if (pv === 6) why = '12 is a poor total. Splitting puts more money out while the dealer is likely to bust.';
      else if (pv === 4) why = 'You can double after splitting, so each 4 has a good chance to become a hand worth doubling against a 5 or 6.';
      else why = 'Small pairs make a weak total. Splitting starts two hands while the dealer is weak or middling.';
    } else if (best === 'R') {
      if (pv === 8) why = 'When the dealer hits soft 17, an Ace is strong enough that giving up half your bet beats splitting 8s.';
      else why = `${cap(name)} against ${U} loses roughly three times in four. Giving up half your bet now costs less than playing it out.`;
    } else if (best === 'D') {
      if (v.soft) why = `A soft ${total} can't bust with one card, and ${U} is a weak dealer card. Put more money out while you're the favourite.`;
      else if (total === 11) why = u === 11 ? 'With the dealer hitting soft 17, doubling 11 against an Ace just comes out ahead.' : 'Any 10-value card, almost a third of the deck, turns 11 into 21. It is the best total to double on.';
      else if (total === 10) why = `A 10-value card makes 20, and your 10 is stronger than the dealer's ${upWord(up)}. Double to win more.`;
      else why = 'Against a bust card you are the favourite with 9, so it pays to double.';
    } else if (best === 'H') {
      if (!v.soft && total <= 8) why = "You can't bust with any card, so always take one.";
      else if (!v.soft && total <= 11) why = total === 11 && u === 11 ? 'Against an Ace, doubling 11 loses money when the dealer stands on soft 17. Take a card instead.' : `You can't bust, but ${U} is too strong to risk doubling. Take a card.`;
      else if (!v.soft && total === 12 && u <= 3) why = `12 only busts on a 10-value card, and ${U} isn't weak enough to stand.`;
      else if (!v.soft && total <= 16) why = `Expect the dealer to finish with 17 or more. Standing on ${total} loses most of the time, so take the risk of a card.`;
      else if (v.soft && total === 18) why = `Soft 18 is an underdog against ${U}, and no single card can bust it.`;
      else if (v.soft) why = 'A soft hand cannot bust with one card, so it is a free chance to improve.';
      else why = 'Take a card.';
    } else if (best === 'S') {
      if (pair && pv === 10) why = 'Twenty wins most of the time. Never break it up.';
      else if (pair && pv === 9) why = u === 7 ? "The dealer's most likely total is 17, which your 18 already beats." : `18 isn't great against ${U}, but splitting 9s here does even worse.`;
      else if (v.soft && total >= 19) why = `Soft ${total} is a strong hand. Keep it.`;
      else if (v.soft && total === 18) why = cards.length > 2 && u >= 3 && u <= 6 ? 'With two cards you would double here; with more cards, 18 is good enough.' : `Soft 18 holds up against ${U}: the dealer's most likely totals are 17 and 18.`;
      else if (total >= 17) why = `With ${total}, most cards would bust you. Stand.`;
      else if (weak) why = "Don't risk busting. Let the dealer take that risk.";
      else why = 'Stand.';
    }
    return {
      headline: `${best === 'P' || best === 'R' ? ACTION[best] : ACTION[best] + ' on'} ${name} against ${U}`,
      why,
      detail: dealerNote,
    };
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  const BET_TIPS = [
    'A common rule of thumb is to bet 1–5% of your bankroll on each hand. That lets you ride out losing streaks.',
    'Side bets pay big but carry a house edge of 3–10%, against about 0.5% for the main game played well.',
    'Each hand is independent. A run of losses does not make a win "due", so do not raise your bet to chase it.',
    'Press R to repeat your last bet and Space to deal. Repeating a flat bet is a good habit while you learn.',
    'Tables that pay 6 to 5 for Blackjack cost you about 1.4% more than 3 to 2 tables. Look for 3 to 2.',
    'Decide when you will stop before you sit down: a loss limit and a win goal keep sessions under control.',
    'Insurance looks like protection, but it is a separate bet that loses money in the long run. Basic strategy always declines it.',
    'The dealer has no choices: they hit up to 16 and stand on 17. Your decisions are where the skill lies.',
  ];

  // ---------------------------------------------------------------------------
  // Saved progress
  // ---------------------------------------------------------------------------
  const KEY = 'bj.academy.v1';
  const RANKS = [
    { name: 'Rookie', xp: 0 },
    { name: 'Regular', xp: 300 },
    { name: 'Sharp', xp: 900 },
    { name: 'Pro', xp: 1800 },
    { name: 'Card Shark', xp: 3200 },
  ];

  function blank() {
    return { xp: 0, lessons: {}, drills: {}, leaks: {}, coach: { hands: 0, decisions: 0, correct: 0, byCat: {} }, seenIntro: false };
  }

  const Progress = {
    data: blank(),
    load() {
      try {
        const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
        this.data = Object.assign(blank(), raw || {});
      } catch (e) { this.data = blank(); }
      return this.data;
    },
    save() {
      try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* storage unavailable */ }
    },
    addXP(n) { this.data.xp = Math.max(0, (this.data.xp || 0) + n); this.save(); },
    rank() {
      const xp = this.data.xp || 0;
      let i = 0;
      while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++;
      const next = RANKS[i + 1];
      return {
        name: RANKS[i].name, index: i, xp,
        next: next ? next.name : null,
        toNext: next ? next.xp - xp : 0,
        pct: next ? (xp - RANKS[i].xp) / (next.xp - RANKS[i].xp) : 1,
      };
    },
    recordDecision(key, correct, action, best, source) {
      const L = this.data.leaks;
      const e = L[key] || (L[key] = { seen: 0, wrong: 0, last: null, best });
      e.seen += 1;
      e.best = best;
      if (!correct) { e.wrong += 1; e.last = action; e.at = Date.now(); }
      else if (e.wrong > 0 && source === 'drill') e.wrong = Math.max(0, e.wrong - 0.5);
      if (source === 'game') {
        const c = this.data.coach;
        c.decisions += 1;
        if (correct) c.correct += 1;
        const cat = key[0] === 'P' ? 'pair' : key[0] === 'S' ? 'soft' : 'hard';
        const b = c.byCat[cat] || (c.byCat[cat] = { n: 0, ok: 0 });
        b.n += 1;
        if (correct) b.ok += 1;
      }
      this.save();
    },
    recordInsurance(correct) {
      const c = this.data.coach;
      const b = c.byCat.insurance || (c.byCat.insurance = { n: 0, ok: 0 });
      b.n += 1;
      if (correct) b.ok += 1;
      this.save();
    },
    // Situations the player gets wrong, worst first.
    leaks(limit) {
      return Object.entries(this.data.leaks)
        .filter(([, e]) => e.wrong >= 1)
        .sort((a, b) => b[1].wrong - a[1].wrong || (b[1].at || 0) - (a[1].at || 0))
        .slice(0, limit || 10)
        .map(([key, e]) => Object.assign({ key, label: keyLabel(key) }, e));
    },
    lessonDone(id) { return !!(this.data.lessons[id] && this.data.lessons[id].done); },
  };
  Progress.load();

  root.Teach = {
    BUST, ACTION, BET_TIPS, RANKS, Progress,
    upLabel, upWord, category, situationKey, parseKey, keyLabel, handForKey, hardHand, explain,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
