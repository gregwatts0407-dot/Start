/*
 * Blackjack Academy: lessons, quizzes and practice drills.
 * Depends on engine.js (BJ), teach.js (Teach), audio.js (Sound) and the
 * card-drawing bridge app.js exposes as window.BJUI.
 */
(function () {
  'use strict';

  const BJ = window.BJ;
  const T = window.Teach;
  const UI = window.BJUI;
  const Sound = window.Sound;
  const P = T.Progress;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  function h(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = id => `<svg><use href="#i-${id}"/></svg>`;
  const rnd = n => Math.floor(Math.random() * n);
  const pick = a => a[rnd(a.length)];
  const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = rnd(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const money = v => UI.money(v);

  // Lessons always use the classic table so the advice matches the text.
  const LR = Object.assign({}, BJ.DEFAULT_RULES);
  const SUITS = ['S', 'H', 'D', 'C'];
  const RANKS = BJ.RANKS;
  const parse = code => ({ rank: code.slice(0, -1), suit: code.slice(-1) });
  const randCard = () => ({ rank: pick(RANKS), suit: pick(SUITS) });
  const code = c => c.rank + c.suit;

  // ---------------------------------------------------------------------------
  // Visuals
  // ---------------------------------------------------------------------------
  function handEl(cards, opts) {
    const o = opts || {};
    const list = cards.map(c => (typeof c === 'string' ? parse(c) : c));
    const cw = o.cw || 'var(--ac-cw)';
    const wrap = h('div', 'ac-hand');
    wrap.style.setProperty('--scw', cw);
    const ox = o.spread || 0.42;
    wrap.style.width = `calc(${cw} * ${1 + (list.length - 1) * ox})`;
    wrap.style.height = `calc(${cw} * 1.4)`;
    list.forEach((c, i) => {
      let e;
      if (o.hidden === i) {
        e = h('div', 'card face-down', '<div class="card-inner"><div class="card-face card-front"></div><div class="card-face card-back"></div></div>');
      } else {
        e = UI.staticCard(c.rank, c.suit);
      }
      e.style.left = `calc(${cw} * ${i * ox})`;
      e.style.zIndex = i + 1;
      wrap.appendChild(e);
    });
    return wrap;
  }

  function handsVisual(rows) {
    const box = h('div', 'ac-visual ac-hands');
    rows.forEach(r => {
      const g = h('div', 'ac-handgroup' + (r.tone ? ' ' + r.tone : ''));
      if (r.label) g.appendChild(h('span', 'ac-hand-label', esc(r.label)));
      g.appendChild(handEl(r.cards, { hidden: r.hidden, spread: r.spread }));
      if (r.note) g.appendChild(h('span', 'ac-hand-note', r.note));
      box.appendChild(g);
    });
    return box;
  }

  function mountVisual(v) {
    if (!v) return null;
    if (v.type === 'hands') return handsVisual(v.rows);
    if (v.type === 'bust') {
      const box = h('div', 'ac-visual ac-bust');
      const ups = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      box.innerHTML = `<div class="ac-bust-title">Chance the dealer busts, by up card</div><div class="ac-bars">${ups.map(u => {
        const pct = T.BUST[u];
        return `<div class="ac-bar ${u <= 6 ? 'weak' : 'strong'}"><span class="ac-bar-val">${pct}%</span><i style="height:${pct * 2.1}%"></i><span class="ac-bar-lab">${u === 11 ? 'A' : u}</span></div>`;
      }).join('')}</div><div class="ac-legend"><span class="weak">Weak for the dealer</span><span class="strong">Strong for the dealer</span></div>`;
      return box;
    }
    if (v.type === 'table') {
      const box = h('div', 'ac-visual');
      box.innerHTML = `<table class="ac-table">${v.head ? `<thead><tr>${v.head.map(x => `<th>${x}</th>`).join('')}</tr></thead>` : ''}<tbody>${v.rows.map(r => `<tr>${r.map(x => `<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      return box;
    }
    if (v.type === 'chart') {
      const box = h('div', 'ac-visual ac-chart');
      box.innerHTML = UI.chart(LR, v.only);
      return box;
    }
    if (v.type === 'flow') {
      const box = h('div', 'ac-visual ac-flow');
      box.innerHTML = v.steps.map((s, i) => `<div class="ac-flow-step"><b>${i + 1}</b><strong>${s[0]}</strong><span>${s[1]}</span></div>`).join('');
      return box;
    }
    if (v.type === 'hilo') {
      const box = h('div', 'ac-visual ac-hilo');
      [['+1', 'Low cards', ['2H', '3S', '4D', '5C', '6H'], 'plus'], ['0', 'Neutral', ['7S', '8D', '9C'], 'zero'], ['−1', 'High cards', ['10H', 'JS', 'QD', 'KC', 'AH'], 'minus']].forEach(([val, label, cards, cls]) => {
        const g = h('div', 'ac-hilo-group ' + cls);
        g.appendChild(h('span', 'ac-hilo-val', val));
        g.appendChild(handEl(cards, { spread: 0.34 }));
        g.appendChild(h('span', 'ac-hand-note', label));
        box.appendChild(g);
      });
      return box;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Question generators
  // ---------------------------------------------------------------------------
  function optionsAround(answer, spread, count) {
    const set = new Set([answer]);
    let guard = 0;
    while (set.size < (count || 4) && guard++ < 50) {
      const d = (rnd(spread * 2 + 1) - spread) || 1;
      if (answer + d > 0) set.add(answer + d);
    }
    return shuffle([...set]);
  }

  function mc(prompt, options, answer, explain, visual) {
    // `answer` is the correct option text; options are shuffled.
    const opts = shuffle(options);
    return { prompt, options: opts, answer: opts.indexOf(answer), explain, visual };
  }

  const G = {
    total() {
      let cards, v;
      do {
        cards = Array.from({ length: Math.random() < 0.6 ? 2 : 3 }, randCard);
        v = BJ.evaluate(cards);
      } while (v.total > 21 || BJ.isNatural(cards));
      const hasAce = cards.some(c => c.rank === 'A');
      const list = [v.total];
      if (v.soft) list.push(v.total - 10);
      for (const n of optionsAround(v.total, 3, 6)) if (list.length < 4 && !list.includes(n) && n > 1) list.push(n);
      const opts = shuffle(list);
      const vals = cards.map(c => (c.rank === 'A' ? 'A' : BJ.rankValue(c.rank))).join(' + ');
      return {
        prompt: 'What is this hand worth?',
        visual: { type: 'hands', rows: [{ cards: cards.map(code) }] },
        options: opts.map(String),
        answer: opts.indexOf(v.total),
        explain: v.soft
          ? `The Ace counts as 11 here, so this is soft ${v.total}. (It could also count as 1 for ${v.total - 10}, but you use the higher total when it doesn't bust.)`
          : hasAce ? `${vals}: the Ace has to count as 1, otherwise the hand would bust. Total ${v.total}.` : `${vals} = ${v.total}.`,
      };
    },
    softHard() {
      let cards, v;
      do {
        cards = Array.from({ length: 2 + rnd(2) }, randCard);
        if (Math.random() < 0.55 && !cards.some(c => c.rank === 'A')) cards[0] = { rank: 'A', suit: pick(SUITS) };
        v = BJ.evaluate(cards);
      } while (v.total > 21 || BJ.isNatural(cards));
      const ans = v.soft ? `Soft ${v.total}` : `Hard ${v.total}`;
      const other = v.soft ? `Hard ${v.total}` : `Soft ${v.total}`;
      return mc('Is this hand soft or hard?', [ans, other], ans,
        v.soft ? 'An Ace is counting as 11, and no single card can bust it, so it is soft.'
          : cards.some(c => c.rank === 'A') ? 'The Ace has to count as 1 to stay under 22, so the hand is hard.' : 'There is no Ace, so the hand is hard.',
        { type: 'hands', rows: [{ cards: cards.map(code) }] });
    },
    strategy(kind) {
      let key;
      const up = 2 + rnd(10);
      if (kind === 'surrender') {
        key = pick(['H16v9', 'H16v10', 'H16v11', 'H15v10', 'H16v10', 'H15v9', 'H16v7', 'H14v10', 'H17v11', 'H15v11', 'P8v10', 'H13v10']);
      } else {
        const k = kind === 'any' ? pick(['hard', 'hard', 'soft', 'pair']) : kind;
        if (k === 'hard') key = 'H' + (8 + rnd(10)) + 'v' + up;
        else if (k === 'soft') key = 'S' + (13 + rnd(8)) + 'v' + up;
        else key = 'P' + (1 + rnd(10)) + 'v' + up;
      }
      return strategyQuestion(key, LR);
    },
    payout() {
      const bet = pick([10, 20, 25, 40, 50, 100]);
      const kind = pick(['bj', 'bj', 'win', 'bj65', 'ins', 'sur', 'double']);
      let prompt, ans, explain;
      if (kind === 'bj') { ans = bet * 1.5; prompt = `You bet ${money(bet)} and get Blackjack at a 3 to 2 table. How much do you win?`; explain = `3 to 2 means $3 for every $2 bet: ${money(bet)} × 1.5 = ${money(ans)}, plus your bet back.`; }
      else if (kind === 'bj65') { ans = bet * 1.2; prompt = `You bet ${money(bet)} and get Blackjack at a 6 to 5 table. How much do you win?`; explain = `6 to 5 means $6 for every $5: ${money(bet)} × 1.2 = ${money(ans)}. At 3 to 2 you'd have won ${money(bet * 1.5)}.`; }
      else if (kind === 'win') { ans = bet; prompt = `You bet ${money(bet)} and beat the dealer with 20. How much do you win?`; explain = 'A normal win pays 1 to 1: you win the same amount you bet.'; }
      else if (kind === 'double') { ans = bet * 2; prompt = `You bet ${money(bet)}, double down, and win. How much do you win?`; explain = `Doubling makes your stake ${money(bet * 2)}, and a win pays 1 to 1 on all of it.`; }
      else if (kind === 'ins') { ans = bet; prompt = `You bet ${money(bet)} and take insurance for ${money(bet / 2)}. The dealer has Blackjack. How much does the insurance win?`; explain = `Insurance pays 2 to 1: ${money(bet / 2)} × 2 = ${money(bet)}. That covers the main bet you just lost.`; }
      else { ans = bet / 2; prompt = `You bet ${money(bet)} and surrender. How much do you get back?`; explain = 'Surrender returns half your bet.'; }
      const opts = new Set([ans]);
      [bet, bet * 1.5, bet * 1.2, bet * 2, bet / 2, bet * 3].forEach(x => { if (opts.size < 4) opts.add(x); });
      return mc(prompt, [...opts].map(money), money(ans), explain);
    },
    sideBet() {
      const type = Math.random() < 0.5 ? 'pp' : 't3';
      if (type === 'pp') {
        const r = pick(RANKS);
        const variant = pick(['perfect', 'coloured', 'mixed', 'none']);
        const s1 = pick(SUITS);
        const sameColour = { S: 'C', C: 'S', H: 'D', D: 'H' };
        const otherColour = { S: 'H', C: 'D', H: 'S', D: 'C' };
        const c1 = { rank: r, suit: s1 };
        const c2 = variant === 'perfect' ? { rank: r, suit: s1 } : variant === 'coloured' ? { rank: r, suit: sameColour[s1] } : variant === 'mixed' ? { rank: r, suit: otherColour[s1] } : { rank: pick(RANKS.filter(x => x !== r)), suit: pick(SUITS) };
        const res = BJ.perfectPairs(c1, c2);
        const ans = res ? `${res.name} · ${res.pays} to 1` : 'No win';
        return mc('What does the Perfect Pairs bet pay with these two cards?', ['Perfect Pair · 25 to 1', 'Coloured Pair · 12 to 1', 'Mixed Pair · 6 to 1', 'No win'], ans,
          res ? `Same rank${res.pays === 25 ? ' and same suit' : res.pays === 12 ? ', same colour, different suit' : ', different colours'}: ${res.name}.` : 'The ranks are different, so Perfect Pairs loses.',
          { type: 'hands', rows: [{ label: 'Your cards', cards: [code(c1), code(c2)] }] });
      }
      const cases = [
        () => { const s = pick(SUITS); const r = pick(RANKS); return [{ rank: r, suit: s }, { rank: r, suit: s }, { rank: r, suit: s }]; },
        () => { const s = pick(SUITS); const i = rnd(11); return [0, 1, 2].map(k => ({ rank: RANKS[i + k], suit: s })); },
        () => { const r = pick(RANKS); return shuffle(SUITS).slice(0, 3).map(s => ({ rank: r, suit: s })); },
        () => { const i = rnd(11); const ss = shuffle(SUITS); return [0, 1, 2].map(k => ({ rank: RANKS[i + k], suit: ss[k] })); },
        () => { const s = pick(SUITS); const rs = shuffle(['2', '5', '9', 'J', 'K', '7']).slice(0, 3); return rs.map(r => ({ rank: r, suit: s })); },
        () => [randCard(), randCard(), randCard()],
      ];
      const cards = pick(cases)();
      const res = BJ.twentyOnePlusThree(cards[0], cards[1], cards[2]);
      const ans = res ? `${res.name} · ${res.pays} to 1` : 'No win';
      const opts = new Set([ans, 'No win']);
      ['Flush · 5 to 1', 'Straight · 10 to 1', 'Three of a Kind · 30 to 1', 'Straight Flush · 40 to 1', 'Suited Trips · 100 to 1'].forEach(o => { if (opts.size < 4 && Math.random() < 0.7) opts.add(o); });
      ['Flush · 5 to 1', 'Straight · 10 to 1', 'Three of a Kind · 30 to 1'].forEach(o => { if (opts.size < 4) opts.add(o); });
      return mc('21+3 uses your two cards and the dealer’s up card. What does it pay?', [...opts], ans,
        res ? `The three cards make a ${res.name.toLowerCase()}, which pays ${res.pays} to 1.` : 'No flush, straight or three of a kind, so the bet loses.',
        { type: 'hands', rows: [{ label: 'Your cards', cards: [code(cards[0]), code(cards[1])] }, { label: 'Dealer up card', cards: [code(cards[2])] }] });
    },
    hilo() {
      const c = randCard();
      const v = BJ.hiLo(c.rank);
      const ans = v > 0 ? '+1' : v < 0 ? '−1' : '0';
      return mc('What is this card worth in the Hi-Lo count?', ['+1', '0', '−1'], ans,
        v > 0 ? '2 through 6 are low cards: +1.' : v < 0 ? '10s, face cards and Aces are high cards: −1.' : '7, 8 and 9 are neutral: 0.',
        { type: 'hands', rows: [{ cards: [code(c)] }] });
    },
    running() {
      const cards = Array.from({ length: 6 }, randCard);
      const rc = cards.reduce((a, c) => a + BJ.hiLo(c.rank), 0);
      const fmt = n => (n > 0 ? '+' + n : n < 0 ? '−' + -n : '0');
      const opts = optionsAround(rc + 10, 2).map(n => n - 10);
      return {
        prompt: 'Starting from zero, what is the running count after these cards?',
        visual: { type: 'hands', rows: [{ cards: cards.map(code), spread: 0.62 }] },
        options: opts.map(fmt),
        answer: opts.indexOf(rc),
        explain: cards.map(c => fmt(BJ.hiLo(c.rank))).join(', ') + ` gives ${fmt(rc)}.`,
      };
    },
    trueCount() {
      const decks = pick([1, 1.5, 2, 3, 4, 5]);
      const tc = pick([1, 2, 3, 4, -1, -2]);
      const rc = Math.round(tc * decks);
      const real = rc / decks;
      const ans = Math.round(real);
      const fmt = n => (n > 0 ? '+' + n : n < 0 ? '−' + -n : '0');
      const opts = [...new Set([ans, ans + 1, ans - 1, rc])].slice(0, 4);
      while (opts.length < 3) opts.push(ans + opts.length + 1);
      return mc(`The running count is ${fmt(rc)} with about ${decks} deck${decks === 1 ? '' : 's'} left to deal. What is the true count?`, opts.map(fmt), fmt(ans),
        `Divide the running count by the decks remaining: ${fmt(rc)} ÷ ${decks} ≈ ${fmt(Math.round(real * 10) / 10)}.`);
    },
  };

  function strategyQuestion(key, rules) {
    const hd = T.handForKey(key);
    const pair = key[0] === 'P';
    const acts = ['H', 'S', 'D'].concat(pair ? ['P'] : []).concat(rules.surrender ? ['R'] : []);
    const best = BJ.basicStrategy(hd.cards, hd.up, rules, { canDouble: true, canSplit: pair, canSurrender: !!rules.surrender });
    const ex = T.explain(hd.cards, hd.up, rules, best);
    return {
      prompt: `${cap(BJ.describeHand(hd.cards))} against ${T.upLabel(hd.up)}. What does basic strategy say?`,
      visual: { type: 'hands', rows: [{ label: 'Dealer', cards: [code(hd.up), 'AS'], hidden: 1 }, { label: 'You', cards: hd.cards.map(code) }] },
      options: acts.map(a => T.ACTION[a]),
      answer: acts.indexOf(best),
      explain: ex.why,
      key, best, actions: acts, hand: hd,
    };
  }
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  // ---------------------------------------------------------------------------
  // Curriculum
  // ---------------------------------------------------------------------------
  const MODULES = [
    {
      id: 'basics', title: 'First steps', icon: 'book', blurb: 'The goal, the order of play and what every card is worth.',
      lessons: [
        {
          id: 'goal', title: 'How a round works', mins: 3,
          steps: [
            {
              title: 'Beat the dealer',
              html: '<p>Blackjack is you against the dealer, not against the other players at the table. You win by finishing with a higher total than the dealer <b>without going over 21</b>.</p><p>Going over 21 is called <b>busting</b>. A bust loses straight away, even if the dealer busts later. If you and the dealer finish level, it is a <b>push</b> and you get your bet back.</p>',
              visual: { type: 'hands', rows: [{ label: 'Dealer', cards: ['10S', '7D'], note: '17' }, { label: 'You', cards: ['10H', '9C'], note: '19 wins', tone: 'good' }] },
            },
            {
              title: 'The order of play',
              html: '<p>Every round follows the same steps. Your two cards are dealt face up. The dealer gets one card face up, called the <b>up card</b>, and one face down, called the <b>hole card</b>.</p><p>Players act one at a time, starting from the dealer’s left (the right-hand seat as you look at the table). The dealer always plays last.</p>',
              visual: { type: 'flow', steps: [['Bet', 'Place chips in your circle'], ['Deal', 'Two cards each; one dealer card hidden'], ['Your turn', 'Hit, stand, double, split…'], ['Dealer’s turn', 'Fixed rules, no choices'], ['Payout', 'Win, lose or push']] },
            },
            {
              title: 'Where the house gets its edge',
              html: '<p>You act first. If you bust, your bet is gone before the dealer even turns over the hole card, and that is the casino’s advantage.</p><p>You get tools the dealer doesn’t: you can stand on any total, double your bet, split pairs, and a Blackjack pays you 3 to 2. Used well, these bring the game close to even.</p>',
            },
          ],
          quiz: [
            () => mc('You bust with 22, then the dealer busts with 24. What happens to your bet?', ['You lose', 'You win', 'Push'], 'You lose', 'You acted first and busted, so your bet was lost before the dealer played.'),
            () => mc('You have 19 and the dealer finishes with 19.', ['Push: you get your bet back', 'You win', 'The dealer wins'], 'Push: you get your bet back', 'Equal totals are a push.'),
            () => mc('Who are you trying to beat?', ['The dealer', 'The other players', 'Everyone at the table'], 'The dealer', 'Each player only plays against the dealer.'),
            () => mc('Before you act, how many of the dealer’s cards can you see?', ['One', 'Both', 'None'], 'One', 'You see the up card. The hole card stays hidden until the dealer’s turn.'),
            () => mc('You stand on 18 and the dealer finishes with 20.', ['You lose', 'Push', 'You win'], 'You lose', 'The higher total wins, and 20 beats 18.'),
          ],
        },
        {
          id: 'values', title: 'Card values', mins: 4,
          steps: [
            {
              title: 'What each card is worth',
              html: '<p>Number cards are worth their number. Jacks, Queens and Kings are worth 10. An <b>Ace</b> is worth 1 or 11, whichever helps you more. Suits don’t matter in the main game.</p>',
              visual: { type: 'hands', rows: [{ label: 'Face value', cards: ['2C', '5H', '9S'], note: '2, 5, 9' }, { label: 'Worth 10', cards: ['10D', 'JS', 'QH', 'KC'], note: '10 each' }, { label: 'Ace', cards: ['AD'], note: '1 or 11' }] },
            },
            {
              title: 'Soft and hard hands',
              html: '<p>A hand where an Ace is counting as 11 is <b>soft</b>. You can’t bust a soft hand with one more card, because the Ace can drop back to 1.</p><p>A hand with no Ace, or where the Ace has to count as 1, is <b>hard</b>.</p>',
              visual: { type: 'hands', rows: [{ label: 'Soft 17', cards: ['AS', '6H'], note: 'Ace counts 11' }, { label: 'Hard 17', cards: ['AS', '6H', 'KD'], note: 'Ace counts 1' }, { label: 'Hard 17', cards: ['10C', '7D'], note: 'No Ace' }] },
            },
            {
              title: 'Blackjack',
              html: '<p>An Ace with any 10-value card as your <b>first two cards</b> is a <b>Blackjack</b>, also called a natural. It beats every other hand, including other 21s, and usually pays 3 to 2.</p><p>21 made with three or more cards, or after splitting, is a good hand but not a Blackjack.</p>',
              visual: { type: 'hands', rows: [{ label: 'Blackjack', cards: ['AH', 'KS'], note: 'Pays 3 to 2', tone: 'good' }, { label: 'Just 21', cards: ['7D', '4C', 'KH'], note: 'Pays 1 to 1' }] },
            },
          ],
          quiz: [G.total, G.total, G.softHard, G.total, G.softHard,
            () => mc('Which of these is a Blackjack?', ['Ace and King as your first two cards', '7, 7 and 7', 'Ace, 5 and 5'], 'Ace and King as your first two cards', 'Only an Ace plus a 10-value card as the first two cards counts.')],
        },
      ],
    },
    {
      id: 'options', title: 'Your options', icon: 'layers', blurb: 'Hit, stand, double, split, surrender and insurance.',
      lessons: [
        {
          id: 'hitstand', title: 'Hit or stand', mins: 3,
          steps: [
            {
              title: 'Hit and stand',
              html: '<p><b>Hit</b> to take another card. You can keep hitting as long as you are under 21. <b>Stand</b> to keep your total and end your turn.</p><p>If you reach exactly 21 your turn ends automatically.</p>',
              visual: { type: 'hands', rows: [{ label: 'You have 14', cards: ['10S', '4D'] }, { label: 'Hit: a 5 makes 19', cards: ['10S', '4D', '5H'], tone: 'good' }] },
            },
            {
              title: 'The dealer has no choices',
              html: '<p>The dealer follows fixed rules: <b>hit until reaching 17 or more</b>, then stand. Some tables also make the dealer hit a <b>soft 17</b>; the rule is printed on the felt.</p><p>This is why the dealer’s up card matters so much: you can predict how often they will end up busting.</p>',
              visual: { type: 'hands', rows: [{ label: 'Dealer 16 must hit', cards: ['6H', '10C'] }, { label: 'Draws to 21', cards: ['6H', '10C', '5S'] }] },
            },
          ],
          quiz: [
            () => mc('The dealer has 16. What must they do?', ['Hit', 'Stand', 'Whatever they like'], 'Hit', 'Dealers must hit every total below 17.'),
            () => mc('The dealer has hard 17.', ['Stand', 'Hit'], 'Stand', 'Dealers stand on hard 17 and above.'),
            () => mc('The felt says "Dealer must hit soft 17". The dealer has Ace–6.', ['Hit', 'Stand'], 'Hit', 'Ace–6 is soft 17, so at this table the dealer hits.'),
            () => mc('Can one card bust a soft 15?', ['No', 'Yes'], 'No', 'The Ace can drop from 11 to 1, so no single card can take a soft hand over 21.'),
            () => mc('You hit 12 and draw a King. What happens?', ['You bust with 22', 'You have 12', 'You have 21'], 'You bust with 22', '12 + 10 = 22, which is over 21.'),
          ],
        },
        {
          id: 'doublesplit', title: 'Doubling and splitting', mins: 4,
          steps: [
            {
              title: 'Double down',
              html: '<p><b>Doubling</b> doubles your bet, and in return you get <b>exactly one more card</b>. It is usually allowed only on your first two cards.</p><p>Double when you’re likely to win the hand, for example 10 or 11 against a weak dealer card.</p>',
              visual: { type: 'hands', rows: [{ label: 'Dealer', cards: ['6D', 'AS'], hidden: 1 }, { label: 'You: 11, double!', cards: ['6C', '5H'], tone: 'good' }] },
            },
            {
              title: 'Splitting pairs',
              html: '<p>If your first two cards have the same value you can <b>split</b> them into two hands. The second hand needs a bet equal to the first. Each hand gets a second card and you play them one after another.</p>',
              visual: { type: 'hands', rows: [{ label: 'A pair of 8s', cards: ['8S', '8H'] }, { label: 'Hand 1', cards: ['8S', '3D'] }, { label: 'Hand 2', cards: ['8H', 'KC'] }] },
            },
            {
              title: 'Split rules to know',
              html: '<ul><li>Split Aces get <b>one card each</b> at most tables.</li><li>21 after a split is not a Blackjack; it pays 1 to 1.</li><li>Most tables let you re-split up to four hands and <b>double after splitting</b>.</li><li>You may split any two 10-value cards (like King–Queen), but you almost never should.</li></ul>',
            },
          ],
          quiz: [
            () => mc('You double on 11 and draw a 3. What now?', ['Your hand is finished at 14', 'You may hit again', 'You may double again'], 'Your hand is finished at 14', 'Doubling gives exactly one card.'),
            () => mc('Which of these hands can be split?', ['8 and 8', '8 and 9', 'Ace and King'], '8 and 8', 'Only two cards of the same value can be split.'),
            () => mc('You split Aces and draw a King on one of them. That hand is…', ['21, paid 1 to 1', 'A Blackjack, paid 3 to 2'], '21, paid 1 to 1', 'Hands made after a split cannot be Blackjacks.'),
            () => mc('How much extra does doubling cost?', ['The same as your original bet', 'Half your bet', 'Nothing'], 'The same as your original bet', 'Your stake doubles.'),
            () => mc('When can you usually double?', ['On your first two cards', 'At any point', 'Only after splitting'], 'On your first two cards', 'Once you have hit, doubling is no longer available.'),
          ],
        },
        {
          id: 'surrenderins', title: 'Surrender and insurance', mins: 4,
          steps: [
            {
              title: 'Surrender',
              html: '<p><b>Surrender</b> gives up your hand and returns <b>half your bet</b>. You can only do it on your first two cards, after the dealer has checked for Blackjack.</p><p>It sounds defeatist, but for a few hands that lose about three times in four, losing half is better: hard 16 against a 9, 10 or Ace, and hard 15 against a 10.</p>',
              visual: { type: 'hands', rows: [{ label: 'Dealer', cards: ['KD', 'AS'], hidden: 1 }, { label: 'You: 16, surrender', cards: ['10S', '6C'] }] },
            },
            {
              title: 'Insurance',
              html: '<p>When the dealer shows an <b>Ace</b>, you’re offered <b>insurance</b>: a side bet of half your stake that the hole card is a 10. It pays 2 to 1.</p><p>The hole card is a 10 about 4 times in 13 (31%). To break even at 2 to 1 it would need to be 1 in 3 (33%), so insurance loses money over time. With a Blackjack, insurance is offered as <b>even money</b>, which is the same bet.</p>',
              visual: { type: 'hands', rows: [{ label: 'Dealer shows an Ace', cards: ['AH', 'AS'], hidden: 1 }] },
            },
          ],
          quiz: [
            () => mc('Surrender returns…', ['Half your bet', 'All of your bet', 'Nothing'], 'Half your bet', 'You give up half and keep half.'),
            () => mc('When is insurance offered?', ['When the dealer shows an Ace', 'At any time', 'When you have 16'], 'When the dealer shows an Ace', 'Insurance is a bet on the dealer having Blackjack.'),
            () => mc('Insurance pays…', ['2 to 1', '3 to 2', '1 to 1'], '2 to 1', 'Win half your stake twice over.'),
            () => mc('Why does basic strategy decline insurance?', ['The hole card is a 10 only about 4 times in 13, too rarely for a 2 to 1 payout', 'It is not allowed for players', 'The dealer always has Blackjack'], 'The hole card is a 10 only about 4 times in 13, too rarely for a 2 to 1 payout', 'It needs to win 1 time in 3 to break even and wins less often than that.'),
            () => mc('You have Blackjack and the dealer shows an Ace. Even money pays…', ['1 to 1 straight away', '3 to 2', '2 to 1'], '1 to 1 straight away', 'You take a guaranteed 1 to 1 instead of risking a push for 3 to 2.'),
          ],
        },
      ],
    },
    {
      id: 'money', title: 'Money on the table', icon: 'stats', blurb: 'What each bet pays, and what side bets really cost.',
      lessons: [
        {
          id: 'payouts', title: 'Payouts', mins: 3,
          steps: [
            {
              title: 'What wins pay',
              html: '<p>Payouts are written as odds: 3 to 2 means you win $3 for every $2 you bet, and you keep your original bet.</p>',
              visual: { type: 'table', head: ['Result', 'Pays', 'On a $20 bet'], rows: [['Win', '1 to 1', '+$20'], ['Blackjack', '3 to 2', '+$30'], ['Insurance (dealer Blackjack)', '2 to 1', '+$20 on a $10 insurance bet'], ['Push', 'Bet returned', '$0'], ['Surrender', 'Half returned', '−$10'], ['Lose or bust', 'Bet lost', '−$20']] },
            },
            {
              title: '3 to 2 versus 6 to 5',
              html: '<p>Some tables pay only <b>6 to 5</b> for Blackjack. On a $10 bet that’s $12 instead of $15. It looks small, but it adds about <b>1.4%</b> to the house edge, roughly tripling what a good player loses. Look for 3 to 2 tables.</p>',
            },
          ],
          quiz: [G.payout, G.payout, G.payout, G.payout, G.payout,
            () => mc('Which Blackjack payout is better for you?', ['3 to 2', '6 to 5'], '3 to 2', '3 to 2 pays 1.5× your bet; 6 to 5 pays only 1.2×.')],
        },
        {
          id: 'sidebets', title: 'Side bets', mins: 4,
          steps: [
            {
              title: 'Perfect Pairs',
              html: '<p>Perfect Pairs pays if your first two cards are a pair.</p>',
              visual: { type: 'hands', rows: [{ label: 'Perfect · 25 to 1', cards: ['QH', 'QH'] }, { label: 'Coloured · 12 to 1', cards: ['7S', '7C'] }, { label: 'Mixed · 6 to 1', cards: ['4D', '4S'] }] },
            },
            {
              title: '21+3',
              html: '<p>21+3 treats your two cards plus the dealer’s up card as a three-card poker hand.</p>',
              visual: { type: 'table', head: ['Hand', 'Example', 'Pays'], rows: [['Suited trips', '9♥ 9♥ 9♥', '100 to 1'], ['Straight flush', '5♠ 6♠ 7♠', '40 to 1'], ['Three of a kind', 'K♣ K♦ K♠', '30 to 1'], ['Straight', '9♦ 10♣ J♥', '10 to 1'], ['Flush', '2♣ 8♣ Q♣', '5 to 1']] },
            },
            {
              title: 'The catch',
              html: '<p>Side bets pay big because they rarely win. Their house edge is typically <b>3% to 7%</b>, many times the roughly 0.5% you face in the main game with good play. Treat them as entertainment, not a way to win.</p>',
            },
          ],
          quiz: [G.sideBet, G.sideBet, G.sideBet, G.sideBet,
            () => mc('Compared with the main game played well, side bets usually have…', ['A much higher house edge', 'A lower house edge', 'No house edge'], 'A much higher house edge', 'Typically 3–7% against about 0.5%.')],
        },
      ],
    },
    {
      id: 'strategy', title: 'Basic strategy', icon: 'target', blurb: 'The mathematically best play for every hand.',
      lessons: [
        {
          id: 'dealer', title: 'Think like the dealer', mins: 4,
          steps: [
            {
              title: 'Bust cards',
              html: '<p>The dealer must hit until 17. When their up card is a <b>2 to 6</b>, they often end up hitting a total like 12–16 and busting. These are called <b>bust cards</b>. A <b>7 to Ace</b> usually means the dealer will make a strong hand.</p>',
              visual: { type: 'bust' },
            },
            {
              title: 'Assume a 10 underneath',
              html: '<p>16 of the 52 cards are worth 10, so a 10 is the single most likely hole card. A quick way to think: a dealer 6 is probably 16 and must hit; a dealer 10 is probably already 20.</p><p>This is the logic behind most strategy decisions: against a bust card, avoid busting yourself; against a strong card, you have to improve.</p>',
            },
            {
              title: 'What basic strategy is',
              html: '<p>Basic strategy is the play that wins the most money, on average, for every combination of your hand and the dealer’s up card, worked out by computer over millions of hands. Followed exactly, it cuts the house edge to around <b>0.5%</b>.</p><p>The next lessons teach it in chunks, with a rule of thumb for each.</p>',
              visual: { type: 'chart' },
            },
          ],
          quiz: [
            () => mc('Which up card gives the dealer the best chance of busting?', ['6', '10', 'Ace'], '6', 'A 5 or 6 busts about 42% of the time.'),
            () => mc('Which up card is strongest for the dealer?', ['Ace', '4', '7'], 'Ace', 'With an Ace showing the dealer busts only about 17% of the time.'),
            () => mc('Roughly what share of the cards are worth 10?', ['About a third (16 of 52)', 'About a tenth', 'Half'], 'About a third (16 of 52)', '10, J, Q and K in four suits make 16 cards.'),
            () => mc('The dealer shows a 5. What is the most likely picture?', ['A stiff total that has to be hit', 'Already standing on 20'], 'A stiff total that has to be hit', 'With a 10 underneath the dealer has 15 and must hit.'),
            () => mc('Perfect basic strategy brings the house edge down to about…', ['0.5%', '5%', '0%'], '0.5%', 'That’s with good rules like 3 to 2 Blackjack.'),
          ],
        },
        {
          id: 'hard', title: 'Hard totals', mins: 5,
          steps: [
            {
              title: 'Stiff hands: 12 to 16',
              html: '<p>A stiff hand can bust with one card. The rule: <b>stand against 2–6, hit against 7–Ace</b>.</p><p>One exception: with <b>12</b>, hit against a 2 or 3 as well, because only a 10 can bust you.</p>',
              visual: { type: 'hands', rows: [{ label: 'Dealer 5', cards: ['5D', 'AS'], hidden: 1 }, { label: '15: stand', cards: ['9C', '6H'], tone: 'good' }, { label: 'Dealer 9', cards: ['9S', 'AS'], hidden: 1 }, { label: '15: hit', cards: ['9D', '6S'] }] },
            },
            {
              title: 'Doubling hands: 9, 10 and 11',
              html: '<ul><li><b>11</b>: double against everything except an Ace (when the dealer stands on soft 17).</li><li><b>10</b>: double against 2–9.</li><li><b>9</b>: double against 3–6.</li></ul><p>Otherwise just hit.</p>',
            },
            {
              title: 'The easy ones',
              html: '<p><b>17 or more: always stand.</b> <b>8 or less: always hit</b>, since you can’t bust.</p>',
              visual: { type: 'chart', only: 'hard' },
            },
          ],
          quiz: Array(8).fill(() => G.strategy('hard')),
        },
        {
          id: 'soft', title: 'Soft totals', mins: 5,
          steps: [
            {
              title: 'Free hits',
              html: '<p>A soft hand can’t bust with one card, so <b>never stand on soft 17 or less</b>. Either hit or double.</p>',
            },
            {
              title: 'Soft doubles',
              html: '<p>Against a weak dealer card, soft hands are great to double because you can’t bust:</p><ul><li><b>Soft 13–14</b> (A,2 and A,3): double against 5–6.</li><li><b>Soft 15–16</b> (A,4 and A,5): double against 4–6.</li><li><b>Soft 17</b> (A,6): double against 3–6.</li><li><b>Soft 18</b> (A,7): double against 3–6.</li></ul>',
            },
            {
              title: 'Soft 18 and up',
              html: '<p><b>Soft 18</b> is the tricky one: double against 3–6, stand against 2, 7 and 8, and <b>hit</b> against 9, 10 or Ace. <b>Soft 19 and 20</b>: stand.</p>',
              visual: { type: 'chart', only: 'soft' },
            },
          ],
          quiz: Array(8).fill(() => G.strategy('soft')),
        },
        {
          id: 'pairs', title: 'Pairs', mins: 5,
          steps: [
            {
              title: 'Always and never',
              html: '<p><b>Always split Aces and 8s.</b> Two Aces make a clumsy soft 12; two 8s make 16, the worst total in the game.</p><p><b>Never split 10s or 5s.</b> 20 is a winning hand, and a pair of 5s is a hard 10 you’d rather double.</p>',
              visual: { type: 'hands', rows: [{ label: 'Always split', cards: ['AS', 'AD'] }, { label: 'Always split', cards: ['8C', '8H'] }, { label: 'Never split', cards: ['KD', 'QS'] }, { label: 'Never split', cards: ['5H', '5C'] }] },
            },
            {
              title: 'The rest',
              html: '<ul><li><b>9s</b>: split against 2–9, except stand against a 7.</li><li><b>7s</b>: split against 2–7.</li><li><b>6s</b>: split against 2–6.</li><li><b>4s</b>: split only against 5–6 (when doubling after splitting is allowed).</li><li><b>2s and 3s</b>: split against 2–7.</li></ul>',
              visual: { type: 'chart', only: 'pair' },
            },
          ],
          quiz: Array(8).fill(() => G.strategy('pair')),
        },
        {
          id: 'surrender', title: 'When to surrender', mins: 3,
          steps: [
            {
              title: 'Three hands to give up',
              html: '<p>Where late surrender is allowed, surrender:</p><ul><li><b>Hard 16</b> against a 9, 10 or Ace (but split 8,8).</li><li><b>Hard 15</b> against a 10.</li></ul><p>If the dealer hits soft 17, also surrender 15 and 17 against an Ace. Anything else, play it out.</p>',
              visual: { type: 'hands', rows: [{ label: 'Dealer 10', cards: ['KS', 'AS'], hidden: 1 }, { label: '16: surrender', cards: ['9H', '7D'] }] },
            },
          ],
          quiz: Array(6).fill(() => G.strategy('surrender')),
        },
      ],
    },
    {
      id: 'smart', title: 'Playing smart', icon: 'shield', blurb: 'The house edge, bankroll and the myths that cost money.',
      lessons: [
        {
          id: 'edge', title: 'The house edge', mins: 4,
          steps: [
            {
              title: 'What the edge means',
              html: '<p>The house edge is the share of each bet you lose on average over the long run. At 0.5%, betting $10 a hand for 100 hands means $1,000 wagered and an expected loss of about <b>$5</b>, though any single session can swing far more than that.</p>',
            },
            {
              title: 'Rules change the edge',
              html: '<p>Small rule changes move the edge. Seek out the good ones:</p>',
              visual: { type: 'table', head: ['Rule', 'Effect on you'], rows: [['Blackjack pays 6 to 5', '−1.4%'], ['Dealer hits soft 17', '−0.2%'], ['No double after split', '−0.14%'], ['No surrender', '−0.08%'], ['Single deck instead of six', '+0.5%'], ['Playing by hunch instead of basic strategy', 'often −2% or worse']] },
            },
          ],
          quiz: [
            () => mc('With a 0.5% edge, about how much do you expect to lose over $1,000 of bets?', ['$5', '$50', '$0.50'], '$5', '0.5% of $1,000 is $5.'),
            () => mc('Which rule costs players the most?', ['Blackjack pays 6 to 5', 'Dealer hits soft 17', 'No surrender'], 'Blackjack pays 6 to 5', 'About 1.4%, far more than the others.'),
            () => mc('Does basic strategy guarantee a win tonight?', ['No, it only lowers the long-run loss', 'Yes'], 'No, it only lowers the long-run loss', 'Results swing a lot in the short run.'),
            () => mc('Fewer decks in the shoe are generally…', ['Better for the player', 'Worse for the player'], 'Better for the player', 'Blackjacks and good doubles come up a little more often.'),
            () => mc('Who sets the dealer’s decisions?', ['The table rules', 'The dealer’s judgement'], 'The table rules', 'The dealer follows fixed rules every hand.'),
          ],
        },
        {
          id: 'bankroll', title: 'Bankroll and discipline', mins: 4,
          steps: [
            {
              title: 'Size your bets',
              html: '<p>Even with perfect play you win only about 42% of hands, lose about 49% and push the rest. Doubles, splits and 3 to 2 Blackjacks make up the difference. Streaks of five or six losses are normal.</p><p>Keep each bet to <b>1–5% of your bankroll</b> so a cold run doesn’t end your session.</p>',
            },
            {
              title: 'Myths that cost money',
              html: '<ul><li><b>"I’m due a win."</b> Each hand is independent; losses don’t make wins more likely.</li><li><b>Doubling your bet after every loss</b> (the Martingale) wins small amounts often and loses huge amounts eventually.</li><li><b>"The player at third base took the dealer’s bust card."</b> Other players’ choices are just as likely to help you as hurt you.</li><li><b>Never bust, always stand on 12+.</b> This costs far more than basic strategy.</li></ul>',
            },
          ],
          quiz: [
            () => mc('A common guideline for bet size is…', ['1–5% of your bankroll', '25% of your bankroll', 'Whatever you lost last hand'], '1–5% of your bankroll', 'Small bets let you ride out normal losing streaks.'),
            () => mc('After four losses in a row, the next hand is…', ['Just as likely to win as any other', 'More likely to win', 'More likely to lose'], 'Just as likely to win as any other', 'Cards have no memory of past results.'),
            () => mc('The Martingale (doubling after every loss)…', ['Eventually hits a losing streak too big to cover', 'Guarantees a profit', 'Removes the house edge'], 'Eventually hits a losing streak too big to cover', 'Table limits and bankrolls run out long before the odds change.'),
            () => mc('With perfect play, roughly how often do you win a hand?', ['About 42%', 'About 60%', 'About 25%'], 'About 42%', 'Higher payouts on doubles, splits and Blackjacks make up the difference.'),
            () => mc('Another player hits when they "shouldn’t" and takes a card you wanted. Over time this…', ['Helps you as often as it hurts', 'Always hurts you'], 'Helps you as often as it hurts', 'You never know which card was coming next.'),
          ],
        },
      ],
    },
    {
      id: 'counting', title: 'Card counting', icon: 'eye', blurb: 'Track the cards with Hi-Lo and know when the deck favours you.',
      lessons: [
        {
          id: 'hilo', title: 'The Hi-Lo count', mins: 4,
          steps: [
            {
              title: 'Why counting works',
              html: '<p>A deck rich in <b>10s and Aces</b> helps you: more Blackjacks, better doubles, and more dealer busts. A deck rich in small cards helps the dealer. Counting tracks which kind of cards are left.</p>',
            },
            {
              title: 'Card values',
              html: '<p>As each card appears, add its value to a running total. Low cards leaving the shoe are good for you, so they count +1.</p>',
              visual: { type: 'hilo' },
            },
            {
              title: 'It balances',
              html: '<p>A full deck has five +1 ranks, three 0 ranks and five −1 ranks, so counting through a whole deck always ends at <b>zero</b>. A good way to practise is to count down a deck and check that you finish on 0.</p>',
            },
          ],
          quiz: [G.hilo, G.hilo, G.hilo, G.running, G.hilo, G.running],
        },
        {
          id: 'truecount', title: 'Running and true count', mins: 4,
          steps: [
            {
              title: 'Running count',
              html: '<p>The <b>running count</b> is your total since the shuffle. A running count of +6 means six more low cards than high cards have gone, so the rest of the shoe is rich in high cards.</p>',
            },
            {
              title: 'True count',
              html: '<p>+6 means a lot more with one deck left than with five. Divide by the <b>decks remaining</b> to get the <b>true count</b>. Estimate decks remaining by looking at the discard tray.</p>',
              visual: { type: 'table', head: ['Running count', 'Decks left', 'True count'], rows: [['+6', '6', '+1'], ['+6', '3', '+2'], ['+6', '1.5', '+4'], ['−4', '2', '−2']] },
            },
          ],
          quiz: [G.trueCount, G.trueCount, G.running, G.trueCount, G.trueCount, G.running],
        },
        {
          id: 'usecount', title: 'Using the count', mins: 4,
          steps: [
            {
              title: 'Bet with the count',
              html: '<p>At a true count of +1 or less, bet your minimum. As the true count rises, raise your bet; a simple plan is one extra unit per point of true count. That is where a counter’s edge comes from.</p>',
            },
            {
              title: 'A few strategy changes',
              html: '<p>Counters also adjust a few plays when the count is high:</p>',
              visual: { type: 'table', head: ['Hand', 'Normally', 'Change when the true count is'], rows: [['Insurance', 'Decline', 'Take at +3 or more'], ['16 vs 10', 'Hit', 'Stand at 0 or more'], ['15 vs 10', 'Hit', 'Stand at +4 or more'], ['12 vs 3', 'Hit', 'Stand at +2 or more'], ['12 vs 2', 'Hit', 'Stand at +3 or more'], ['10 vs 10', 'Hit', 'Double at +4 or more'], ['11 vs Ace', 'Hit', 'Double at +1 or more']] },
            },
            {
              title: 'Practise at this table',
              html: '<p>Counting is legal, but casinos can refuse your action, and real shoes deal fast. Turn on the <b>counting trainer</b> in Settings to check your count against the true one while you play, and use the count drill in the Practice section.</p>',
            },
          ],
          quiz: [
            () => mc('At a true count of +1 or less, a counter bets…', ['The minimum', 'The maximum', 'Half the bankroll'], 'The minimum', 'There is no edge yet.'),
            () => mc('At what true count does insurance become a good bet?', ['+3 or more', '0', 'Never'], '+3 or more', 'By then more than a third of the remaining cards are 10s.'),
            () => mc('With 16 against a 10, a counter stands when the true count is…', ['0 or higher', '−5 or lower', 'Never'], '0 or higher', 'A positive count means more 10s that would bust you.'),
            () => mc('Why raise your bet when the count is high?', ['High cards favour the player', 'The dealer gets tired', 'It looks confident'], 'High cards favour the player', 'More Blackjacks paying 3 to 2 and more dealer busts.'),
            () => mc('Is card counting legal?', ['Yes, but casinos may refuse your bets', 'No'], 'Yes, but casinos may refuse your bets', 'Using your memory is not cheating, but casinos are private businesses.'),
          ],
        },
      ],
    },
  ];

  const ALL_LESSONS = [];
  MODULES.forEach((m, mi) => m.lessons.forEach((l, li) => ALL_LESSONS.push(Object.assign(l, { module: m, mi, li, uid: m.id + '.' + l.id }))));

  const DRILLS = [
    { id: 'strategy', title: 'Strategy trainer', icon: 'target', blurb: 'Flash cards for every hand against every dealer card, using your table’s rules.' },
    { id: 'mistakes', title: 'Your weak spots', icon: 'whistle', blurb: 'Hands the coach has seen you get wrong, until you get them right.' },
    { id: 'totals', title: 'Hand totals sprint', icon: 'timer', blurb: 'Add up as many hands as you can in 45 seconds.' },
    { id: 'count', title: 'Count drill', icon: 'eye', blurb: 'Keep the Hi-Lo running count as cards flash past.' },
  ];

  // ---------------------------------------------------------------------------
  // Shell
  // ---------------------------------------------------------------------------
  let root = null;
  let view = null;
  let cleanup = null;

  function build() {
    root = h('div', 'modal academy');
    root.id = 'academy';
    root.hidden = true;
    root.innerHTML = `
      <div class="ac-shell" role="dialog" aria-modal="true" aria-labelledby="acTitle">
        <header class="ac-head">
          <button class="icon-btn ac-back" id="acBack" aria-label="Back" hidden>${icon('arrow-left')}</button>
          <div class="ac-titles"><span class="ac-eyebrow" id="acEyebrow">Blackjack Academy</span><h2 id="acTitle">Academy</h2></div>
          <div class="ac-rank" id="acRank"></div>
          <button class="icon-btn" id="acClose" aria-label="Close the Academy">${icon('x')}</button>
        </header>
        <div class="ac-body" id="acBody"></div>
      </div>`;
    document.body.appendChild(root);
    $('#acClose', root).addEventListener('click', close);
    $('#acBack', root).addEventListener('click', () => { if (view && view.back) view.back(); else showHome(); });
    root.addEventListener('click', e => { if (e.target === root) close(); });
    document.addEventListener('keydown', onKey);
  }

  function setHead(title, eyebrow, back) {
    $('#acTitle', root).textContent = title;
    $('#acEyebrow', root).textContent = eyebrow || 'Blackjack Academy';
    $('#acBack', root).hidden = !back;
    renderRank();
  }

  function renderRank() {
    const r = P.rank();
    $('#acRank', root).innerHTML = `<div class="ac-rank-name"><span>${esc(r.name)}</span><small>${r.xp} XP</small></div><div class="ac-rank-bar" title="${r.next ? r.toNext + ' XP to ' + r.next : 'Top rank'}"><i style="width:${Math.round(r.pct * 100)}%"></i></div>`;
  }

  function body() { return $('#acBody', root); }

  function setView(v) {
    if (cleanup) { cleanup(); cleanup = null; }
    view = v;
    const b = body();
    b.scrollTop = 0;
    b.innerHTML = '';
  }

  function gainXP(n, why) {
    if (!n) return;
    const before = P.rank().name;
    P.addXP(n);
    renderRank();
    const after = P.rank().name;
    if (after !== before) {
      UI.toast(`New rank: <b>${esc(after)}</b>!`, { icon: 'cap', type: 'good', ms: 4500 });
      Sound.blackjack();
    } else if (why) UI.toast(`+${n} XP · ${esc(why)}`, { icon: 'cap', type: 'good', ms: 2200 });
  }

  // ---------------------------------------------------------------------------
  // Home
  // ---------------------------------------------------------------------------
  function nextLesson() { return ALL_LESSONS.find(l => !P.lessonDone(l.uid)); }

  function showHome() {
    setView({ name: 'home' });
    setHead('Academy', 'Blackjack Academy', false);
    const b = body();
    const done = ALL_LESSONS.filter(l => P.lessonDone(l.uid)).length;
    const nxt = nextLesson();
    const leaks = P.leaks(50).length;
    const hero = h('section', 'ac-hero');
    hero.innerHTML = `
      <div class="ac-hero-text">
        <h3>Learn blackjack, from your first hand to counting cards.</h3>
        <p>${ALL_LESSONS.length} short lessons in ${MODULES.length} modules. Each ends with a quick quiz; pass it to earn XP and move up the ranks.</p>
        <div class="ac-progress"><div class="ac-progress-bar"><i style="width:${(done / ALL_LESSONS.length) * 100}%"></i></div><span>${done} of ${ALL_LESSONS.length} lessons complete</span></div>
      </div>
      <div class="ac-next">
        ${nxt
          ? `<span class="ac-eyebrow">${done ? 'Up next' : 'Start here'}</span><strong>${esc(nxt.title)}</strong><span class="ac-next-meta">Module ${nxt.mi + 1} · ${esc(nxt.module.title)} · ${nxt.mins} min</span><button class="primary" id="acStartNext">${done ? 'Continue' : 'Start learning'} ${icon('arrow-right')}</button>`
          : `<span class="ac-eyebrow">Curriculum complete</span><strong>Every lesson passed</strong><span class="ac-next-meta">Keep sharp with the drills below.</span><button class="primary" id="acStartNext">Strategy trainer ${icon('arrow-right')}</button>`}
      </div>`;
    b.appendChild(hero);
    $('#acStartNext', hero).addEventListener('click', () => (nxt ? openLesson(nxt) : openDrill('strategy')));

    b.appendChild(h('h3', 'ac-section-title', 'Modules'));
    const grid = h('div', 'ac-modules');
    MODULES.forEach((m, mi) => {
      const ldone = m.lessons.filter(l => P.lessonDone(l.uid)).length;
      const card = h('article', 'ac-module' + (ldone === m.lessons.length ? ' complete' : ''));
      card.innerHTML = `
        <header><span class="ac-module-icon">${icon(m.icon)}</span><div><span class="ac-eyebrow">Module ${mi + 1}</span><h4>${esc(m.title)}</h4></div>${ldone === m.lessons.length ? `<span class="ac-done-badge">${icon('check')}</span>` : ''}</header>
        <p>${esc(m.blurb)}</p>
        <div class="ac-progress-bar thin"><i style="width:${(ldone / m.lessons.length) * 100}%"></i></div>
        <ol class="ac-lessons">${m.lessons.map(l => {
          const rec = P.data.lessons[l.uid];
          const isDone = rec && rec.done;
          return `<li><button data-lesson="${l.uid}" class="${isDone ? 'done' : ''}${nxt === l ? ' next' : ''}"><span class="ac-check">${isDone ? icon('check') : ''}</span><span class="ac-lesson-title">${esc(l.title)}</span><span class="ac-lesson-meta">${isDone && rec.best != null ? Math.round(rec.best * 100) + '%' : l.mins + ' min'}</span></button></li>`;
        }).join('')}</ol>`;
      grid.appendChild(card);
    });
    b.appendChild(grid);
    $$('[data-lesson]', grid).forEach(btn => btn.addEventListener('click', () => openLesson(ALL_LESSONS.find(l => l.uid === btn.dataset.lesson))));

    b.appendChild(h('h3', 'ac-section-title', 'Practice'));
    const drills = h('div', 'ac-drills');
    DRILLS.forEach(d => {
      const rec = P.data.drills[d.id] || {};
      let meta = '';
      if (d.id === 'strategy') meta = rec.best ? `Best streak ${rec.best}` : 'Not tried yet';
      if (d.id === 'mistakes') meta = leaks ? `${leaks} situation${leaks > 1 ? 's' : ''} to fix` : 'Nothing to fix yet';
      if (d.id === 'totals') meta = rec.best ? `Best ${rec.best} hands` : 'Not tried yet';
      if (d.id === 'count') meta = rec.best ? `Best: ${rec.best} cards at ${rec.bestSpeed || 'medium'} speed` : 'Not tried yet';
      const disabled = d.id === 'mistakes' && !leaks;
      const btn = h('button', 'ac-drill' + (disabled ? ' disabled' : ''), `<span class="ac-drill-icon">${icon(d.icon)}</span><strong>${esc(d.title)}</strong><span>${esc(d.blurb)}</span><small>${esc(meta)}</small>`);
      btn.disabled = disabled;
      btn.addEventListener('click', () => openDrill(d.id));
      drills.appendChild(btn);
    });
    b.appendChild(drills);

    const foot = h('p', 'ac-foot', 'At the table, the coach (Settings → Gameplay) can guide you through every decision or review your choices, and it feeds your mistakes into "Your weak spots".');
    b.appendChild(foot);
  }

  // ---------------------------------------------------------------------------
  // Lessons and quizzes
  // ---------------------------------------------------------------------------
  function openLesson(lesson, startAt) {
    let step = startAt || 0;
    const total = lesson.steps.length;
    setView({ name: 'lesson', back: showHome });
    setHead(lesson.title, `Module ${lesson.mi + 1} · ${lesson.module.title}`, true);
    const b = body();
    const wrap = h('div', 'ac-lesson');
    b.appendChild(wrap);

    const render = () => {
      const s = lesson.steps[step];
      wrap.innerHTML = '';
      const dots = h('div', 'ac-steps', lesson.steps.map((_, i) => `<span class="${i < step ? 'past' : i === step ? 'now' : ''}"></span>`).join('') + '<span class="quiz">Quiz</span>');
      wrap.appendChild(dots);
      const content = h('article', 'ac-step');
      content.innerHTML = `<h3>${esc(s.title)}</h3><div class="ac-prose">${s.html}</div>`;
      const vis = mountVisual(s.visual);
      if (vis) content.appendChild(vis);
      wrap.appendChild(content);
      const nav = h('div', 'ac-nav');
      nav.innerHTML = `<button class="ghost" id="acPrev" ${step === 0 ? 'disabled' : ''}>${icon('arrow-left')}Back</button><span class="ac-nav-count">${step + 1} / ${total}</span><button class="primary" id="acNext">${step + 1 === total ? 'Take the quiz' : 'Next'} ${icon('arrow-right')}</button>`;
      wrap.appendChild(nav);
      $('#acPrev', nav).addEventListener('click', () => { if (step > 0) { step--; render(); body().scrollTop = 0; } });
      $('#acNext', nav).addEventListener('click', () => {
        Sound.click();
        if (step + 1 < total) { step++; render(); body().scrollTop = 0; } else startQuiz(lesson);
      });
    };
    view.enter = () => $('#acNext', wrap) && $('#acNext', wrap).click();
    render();
  }

  function startQuiz(lesson) {
    const questions = lesson.quiz.map(q => (typeof q === 'function' ? q() : q));
    let i = 0;
    let score = 0;
    let answered = false;
    setView({ name: 'quiz', back: () => openLesson(lesson, lesson.steps.length - 1) });
    setHead(lesson.title + ' · Quiz', `Module ${lesson.mi + 1} · ${lesson.module.title}`, true);
    const wrap = h('div', 'ac-quiz');
    body().appendChild(wrap);

    const render = () => {
      const q = questions[i];
      answered = false;
      wrap.innerHTML = `
        <div class="ac-quiz-top"><span>Question ${i + 1} of ${questions.length}</span><div class="ac-progress-bar thin"><i style="width:${(i / questions.length) * 100}%"></i></div><span>${score} correct</span></div>
        <h3 class="ac-question">${esc(q.prompt)}</h3>`;
      const vis = mountVisual(q.visual);
      if (vis) wrap.appendChild(vis);
      const opts = h('div', 'ac-options' + (q.options.length > 3 || q.options.some(o => o.length > 28) ? ' list' : ''));
      q.options.forEach((o, k) => {
        const btn = h('button', 'ac-option', `<kbd>${k + 1}</kbd><span>${esc(o)}</span>`);
        btn.addEventListener('click', () => answer(k));
        opts.appendChild(btn);
      });
      wrap.appendChild(opts);
      wrap.appendChild(h('div', 'ac-feedback', ''));
    };

    const answer = k => {
      if (answered) return;
      answered = true;
      const q = questions[i];
      const ok = k === q.answer;
      if (ok) score++;
      Sound[ok ? 'chip' : 'lose'](ok ? 2 : undefined);
      $$('.ac-option', wrap).forEach((b, n) => {
        b.disabled = true;
        if (n === q.answer) b.classList.add('right');
        else if (n === k) b.classList.add('wrong');
      });
      if (q.key) P.recordDecision(q.key, ok, (q.actions || [])[k], q.best, 'drill');
      const fb = $('.ac-feedback', wrap);
      fb.className = 'ac-feedback show ' + (ok ? 'good' : 'bad');
      fb.innerHTML = `<strong>${ok ? 'Correct!' : 'Not quite.'}</strong> <span>${esc(q.explain || '')}</span><button class="primary" id="acQNext">${i + 1 < questions.length ? 'Next question' : 'See results'} ${icon('arrow-right')}</button>`;
      $('#acQNext', fb).addEventListener('click', next);
      $('#acQNext', fb).focus({ preventScroll: true });
      fb.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };

    const next = () => {
      if (i + 1 < questions.length) { i++; render(); body().scrollTop = 0; } else results();
    };

    const results = () => {
      const pct = score / questions.length;
      const pass = pct >= 0.8;
      const rec = P.data.lessons[lesson.uid] || {};
      let xp = 0;
      if (pass && !rec.done) xp += 100;
      if (pct === 1 && !(rec.best === 1)) xp += 50;
      if (pass) rec.done = true;
      rec.best = Math.max(rec.best || 0, pct);
      P.data.lessons[lesson.uid] = rec;
      P.save();
      const nextL = ALL_LESSONS[ALL_LESSONS.indexOf(lesson) + 1];
      wrap.innerHTML = `
        <div class="ac-result ${pass ? 'pass' : 'fail'}">
          <div class="ac-score-ring" style="--p:${pct}"><span>${score}/${questions.length}</span></div>
          <h3>${pass ? (pct === 1 ? 'Perfect score!' : 'Lesson complete') : 'Almost there'}</h3>
          <p>${pass ? `You passed <b>${esc(lesson.title)}</b>.${xp ? ` +${xp} XP.` : ''}` : 'You need 80% to pass. Review the lesson or try the quiz again with new questions.'}</p>
          <div class="ac-result-actions">
            ${pass && nextL ? `<button class="primary" id="acRNext">Next: ${esc(nextL.title)} ${icon('arrow-right')}</button>` : ''}
            ${!pass ? '<button class="primary" id="acRRetry">Try again</button>' : ''}
            ${!pass ? '<button class="ghost" id="acRReview">Review the lesson</button>' : ''}
            ${pass && lesson.module.id === 'strategy' ? '<button class="ghost" id="acRDrill">Practise in the trainer</button>' : ''}
            <button class="ghost" id="acRHome">Back to the Academy</button>
          </div>
        </div>`;
      if (pass) { Sound.win(); if (pct === 1) sparkleIn($('.ac-score-ring', wrap)); }
      gainXP(xp);
      const on = (id, fn) => { const e = $(id, wrap); if (e) e.addEventListener('click', fn); };
      on('#acRNext', () => openLesson(nextL));
      on('#acRRetry', () => startQuiz(lesson));
      on('#acRReview', () => openLesson(lesson));
      on('#acRDrill', () => openDrill('strategy', lesson.id === 'hard' ? 'hard' : lesson.id === 'soft' ? 'soft' : lesson.id === 'pairs' ? 'pair' : 'any'));
      on('#acRHome', showHome);
      view.enter = () => { const n = $('#acRNext', wrap) || $('#acRRetry', wrap) || $('#acRHome', wrap); if (n) n.click(); };
    };

    view.enter = () => { const n = $('#acQNext', wrap); if (n) n.click(); };
    view.option = k => { if (!answered && questions[i] && k < questions[i].options.length) answer(k); };
    render();
  }

  function sparkleIn(el) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    for (let i = 0; i < 24; i++) {
      const s = h('i', 'spark');
      s.style.position = 'fixed';
      s.style.zIndex = 120;
      s.style.background = pick(['#fff1c4', '#f3c64f', '#ffffff', '#e8a33d']);
      document.body.appendChild(s);
      const a = Math.random() * Math.PI * 2;
      const d = 50 + Math.random() * 90;
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const done = () => s.remove();
      s.animate([
        { transform: `translate(${x}px, ${y}px)`, opacity: 1 },
        { transform: `translate(${x + Math.cos(a) * d}px, ${y + Math.sin(a) * d + 40}px) rotate(${rnd(600)}deg)`, opacity: 0 },
      ], { duration: 1100 + rnd(500), easing: 'cubic-bezier(.12,.75,.3,1)' }).finished.then(done, done);
    }
  }

  // ---------------------------------------------------------------------------
  // Drills
  // ---------------------------------------------------------------------------
  function openDrill(id, arg) {
    if (id === 'strategy' || id === 'mistakes') return strategyDrill(id === 'mistakes' ? 'mistakes' : (arg || 'any'), id === 'mistakes' ? arg : null);
    if (id === 'totals') return totalsDrill();
    if (id === 'count') return countDrill();
    return showHome();
  }

  function strategyDrill(mode, focusKey) {
    const rules = Object.assign({}, UI.rules());
    const rec = P.data.drills.strategy || (P.data.drills.strategy = { best: 0, n: 0, ok: 0 });
    const sess = { n: 0, ok: 0, streak: 0 };
    let q = null;
    let answered = false;
    let queue = focusKey ? [focusKey] : [];
    setView({ name: 'drill', back: showHome });
    setHead(mode === 'mistakes' ? 'Your weak spots' : 'Strategy trainer', 'Practice', true);
    const wrap = h('div', 'ac-trainer');
    body().appendChild(wrap);
    const modes = [['any', 'All hands'], ['hard', 'Hard'], ['soft', 'Soft'], ['pair', 'Pairs'], ['mistakes', 'Weak spots']];
    wrap.innerHTML = `
      <div class="ac-trainer-top">
        <div class="seg small" id="acModes">${modes.map(([k, l]) => `<button data-m="${k}" class="${k === mode ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="ac-stats"><span><small>Streak</small><b id="acStreak">0</b></span><span><small>Best</small><b id="acBest">${rec.best || 0}</b></span><span><small>Accuracy</small><b id="acAcc">—</b></span></div>
      </div>
      <p class="hint-text ac-rules-note">Using your table rules: ${rules.decks} deck${rules.decks > 1 ? 's' : ''}, dealer ${rules.h17 ? 'hits' : 'stands on'} soft 17${rules.das ? ', double after split' : ''}${rules.surrender ? ', surrender allowed' : ''}.</p>
      <div class="ac-felt" id="acFelt"></div>
      <div class="ac-acts" id="acActs"></div>
      <div class="ac-feedback" id="acFb"></div>`;
    $$('#acModes button', wrap).forEach(b => b.addEventListener('click', () => {
      if (b.dataset.m === 'mistakes' && !P.leaks(1).length) { UI.toast('No weak spots recorded yet. Play with the coach on, or keep training.', { icon: 'whistle' }); return; }
      strategyDrill(b.dataset.m);
    }));

    const nextKey = () => {
      if (queue.length) return queue.shift();
      if (mode === 'mistakes') {
        const leaks = P.leaks(12);
        if (!leaks.length) return null;
        const weights = leaks.map(l => l.wrong);
        let r = Math.random() * weights.reduce((a, b) => a + b, 0);
        for (const l of leaks) { r -= l.wrong; if (r <= 0) return l.key; }
        return leaks[0].key;
      }
      const up = 2 + rnd(10);
      const kind = mode === 'any' ? pick(['hard', 'hard', 'hard', 'soft', 'soft', 'pair']) : mode;
      if (kind === 'hard') return 'H' + (8 + rnd(10)) + 'v' + up;
      if (kind === 'soft') return 'S' + (13 + rnd(8)) + 'v' + up;
      return 'P' + (1 + rnd(10)) + 'v' + up;
    };

    const render = () => {
      const key = nextKey();
      if (!key) {
        $('#acFelt', wrap).innerHTML = '<div class="ac-empty">You have fixed every weak spot the coach recorded. Nice work!</div>';
        $('#acActs', wrap).innerHTML = '';
        return;
      }
      q = strategyQuestion(key, rules);
      answered = false;
      const felt = $('#acFelt', wrap);
      felt.innerHTML = '';
      felt.appendChild(handsVisual([{ label: 'Dealer', cards: [code(q.hand.up), 'AS'], hidden: 1 }, { label: 'You', cards: q.hand.cards.map(code) }]));
      felt.appendChild(h('div', 'ac-felt-label', `${esc(cap(BJ.describeHand(q.hand.cards)))} vs ${esc(T.upLabel(q.hand.up))}`));
      const acts = $('#acActs', wrap);
      const cls = { H: 'act-hit', S: 'act-stand', D: 'act-double', P: 'act-split', R: 'act-surrender' };
      const keys = { H: 'H', S: 'S', D: 'D', P: 'P', R: 'R' };
      acts.innerHTML = q.actions.map(a => `<button class="act ${cls[a]}" data-a="${a}"><span>${T.ACTION[a]}</span><kbd>${keys[a]}</kbd></button>`).join('');
      $$('button', acts).forEach(b => b.addEventListener('click', () => choose(b.dataset.a)));
      const fb = $('#acFb', wrap);
      fb.className = 'ac-feedback';
      fb.innerHTML = '';
    };

    const choose = a => {
      if (answered || !q || !q.actions.includes(a)) return;
      answered = true;
      const ok = a === q.best;
      sess.n++; rec.n++;
      if (ok) { sess.ok++; rec.ok++; sess.streak++; } else sess.streak = 0;
      if (sess.streak > (rec.best || 0)) rec.best = sess.streak;
      P.recordDecision(q.key, ok, a, q.best, 'drill');
      P.save();
      if (ok) gainXP(1);
      $('#acStreak', wrap).textContent = sess.streak;
      $('#acBest', wrap).textContent = rec.best;
      $('#acAcc', wrap).textContent = Math.round((sess.ok / sess.n) * 100) + '%';
      $$('#acActs button', wrap).forEach(b => {
        b.disabled = true;
        if (b.dataset.a === q.best) b.classList.add('suggest');
      });
      const ex = T.explain(q.hand.cards, q.hand.up, rules, q.best);
      const fb = $('#acFb', wrap);
      fb.className = 'ac-feedback show ' + (ok ? 'good' : 'bad');
      fb.innerHTML = `<strong>${ok ? 'Correct!' : `${T.ACTION[a]} is wrong here: ${T.ACTION[q.best].toLowerCase()}.`}</strong> <span>${esc(ex.why)} ${esc(ex.detail)}</span><button class="primary" id="acDNext">Next hand ${icon('arrow-right')}</button>`;
      $('#acDNext', fb).addEventListener('click', render);
      if (ok) { Sound.chip(1); if ([10, 25, 50].includes(sess.streak)) UI.toast(`${sess.streak} in a row!`, { icon: 'check', type: 'good' }); }
      else { Sound.lose(); queue.push(q.key); }
      if (ok && !focusKey) { const t = setTimeout(() => { if (view && view.name === 'drill' && answered) render(); }, 1400); cleanup = () => clearTimeout(t); }
    };

    view.key = k => { const m = { h: 'H', s: 'S', d: 'D', p: 'P', r: 'R' }[k]; if (m) choose(m); };
    view.enter = () => { if (answered) render(); };
    render();
  }

  function totalsDrill() {
    const rec = P.data.drills.totals || (P.data.drills.totals = { best: 0 });
    setView({ name: 'drill', back: showHome });
    setHead('Hand totals sprint', 'Practice', true);
    const wrap = h('div', 'ac-sprint');
    body().appendChild(wrap);
    let score = 0, misses = 0, t0 = 0, timer = 0, q = null, live = false;
    const LEN = 45;
    const intro = () => {
      live = false;
      wrap.innerHTML = `<div class="ac-center"><span class="ac-big-icon">${icon('timer')}</span><h3>How many hands can you add up in ${LEN} seconds?</h3><p>Pick the total for each hand. Soft hands count the Ace as 11 when it doesn't bust.</p>${rec.best ? `<p class="hint-text">Your best: ${rec.best} hands</p>` : ''}<button class="primary big" id="acGo">Start ${icon('play')}</button></div>`;
      $('#acGo', wrap).addEventListener('click', start);
      view.enter = start;
    };
    const start = () => {
      score = 0; misses = 0; live = true; t0 = performance.now();
      wrap.innerHTML = `<div class="ac-sprint-top"><span>Score <b id="acSc">0</b></span><div class="ac-timer"><i id="acTime"></i></div><span id="acLeft">${LEN}s</span></div><div class="ac-felt" id="acFelt"></div><div class="ac-options grid4" id="acOpts"></div>`;
      const tick = () => {
        const left = Math.max(0, LEN - (performance.now() - t0) / 1000);
        const bar = $('#acTime', wrap);
        if (!bar) return;
        bar.style.width = (left / LEN) * 100 + '%';
        $('#acLeft', wrap).textContent = Math.ceil(left) + 's';
        if (left <= 0) finish(); else timer = requestAnimationFrame(tick);
      };
      timer = requestAnimationFrame(tick);
      cleanup = () => cancelAnimationFrame(timer);
      nextQ();
    };
    const nextQ = () => {
      q = G.total();
      const felt = $('#acFelt', wrap);
      felt.innerHTML = '';
      felt.appendChild(mountVisual(q.visual));
      const opts = $('#acOpts', wrap);
      opts.innerHTML = q.options.map((o, k) => `<button class="ac-option" data-k="${k}"><kbd>${k + 1}</kbd><span>${o}</span></button>`).join('');
      $$('button', opts).forEach(b => b.addEventListener('click', () => answer(Number(b.dataset.k))));
    };
    const answer = k => {
      if (!live) return;
      const ok = k === q.answer;
      if (ok) { score++; Sound.chip(1); } else { misses++; Sound.click(); $('#acFelt', wrap).classList.remove('shake'); void wrap.offsetWidth; $('#acFelt', wrap).classList.add('shake'); }
      $('#acSc', wrap).textContent = score;
      nextQ();
    };
    const finish = () => {
      live = false;
      cancelAnimationFrame(timer);
      const best = score > (rec.best || 0);
      if (best) rec.best = score;
      P.save();
      wrap.innerHTML = `<div class="ac-center"><div class="ac-score-ring" style="--p:${Math.min(1, score / 30)}"><span>${score}</span></div><h3>${best ? 'New best!' : 'Time!'}</h3><p>${score} correct, ${misses} missed.</p><div class="ac-result-actions"><button class="primary" id="acAgain">Go again</button><button class="ghost" id="acHome">Back to the Academy</button></div></div>`;
      if (best && score > 4) sparkleIn($('.ac-score-ring', wrap));
      gainXP(Math.round(score / 2), 'hand totals');
      $('#acAgain', wrap).addEventListener('click', start);
      $('#acHome', wrap).addEventListener('click', showHome);
      view.enter = start;
    };
    view.option = k => { if (live && q && k < q.options.length) answer(k); };
    intro();
  }

  function countDrill() {
    const rec = P.data.drills.count || (P.data.drills.count = { best: 0 });
    let speed = rec.speed || 'medium';
    let len = rec.len || 15;
    const SPEED = { slow: 1300, medium: 850, fast: 500 };
    setView({ name: 'drill', back: showHome });
    setHead('Count drill', 'Practice', true);
    const wrap = h('div', 'ac-countdrill');
    body().appendChild(wrap);
    let cards = [];
    let guess = 0;
    let timer = 0;
    const fmt = n => (n > 0 ? '+' + n : n < 0 ? '−' + -n : '0');
    const setup = () => {
      wrap.innerHTML = `<div class="ac-center">
        <span class="ac-big-icon">${icon('eye')}</span>
        <h3>Keep the running count</h3>
        <p>Cards appear one at a time. Add +1 for 2–6, 0 for 7–9, and −1 for 10s and Aces. Then enter your count.</p>
        <div class="ac-count-opts">
          <label>Speed <div class="seg small" id="acSpeed">${['slow', 'medium', 'fast'].map(s => `<button data-v="${s}" class="${s === speed ? 'on' : ''}">${cap(s)}</button>`).join('')}</div></label>
          <label>Cards <div class="seg small" id="acLen">${[10, 15, 25].map(n => `<button data-v="${n}" class="${n === len ? 'on' : ''}">${n}</button>`).join('')}</div></label>
        </div>
        <button class="primary big" id="acGo">Deal ${icon('play')}</button></div>`;
      $$('#acSpeed button', wrap).forEach(b => b.addEventListener('click', () => { speed = b.dataset.v; $$('#acSpeed button', wrap).forEach(x => x.classList.toggle('on', x === b)); }));
      $$('#acLen button', wrap).forEach(b => b.addEventListener('click', () => { len = Number(b.dataset.v); $$('#acLen button', wrap).forEach(x => x.classList.toggle('on', x === b)); }));
      $('#acGo', wrap).addEventListener('click', run);
      view.enter = run;
    };
    const run = () => {
      rec.speed = speed; rec.len = len; P.save();
      cards = Array.from({ length: len }, randCard);
      let i = 0;
      wrap.innerHTML = `<div class="ac-center"><span class="hint-text" id="acCnt">Card 1 of ${len}</span><div class="ac-flash" id="acFlash"></div></div>`;
      const show = () => {
        const fl = $('#acFlash', wrap);
        if (!fl) return;
        if (i >= cards.length) { ask(); return; }
        fl.innerHTML = '';
        const c = handEl([code(cards[i])], { cw: 'var(--ac-flash)' });
        fl.appendChild(c);
        c.animate([{ transform: 'translateY(-14px) scale(.96)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 160, easing: 'ease-out' });
        Sound.card();
        $('#acCnt', wrap).textContent = `Card ${i + 1} of ${len}`;
        i++;
        timer = setTimeout(show, SPEED[speed]);
      };
      cleanup = () => clearTimeout(timer);
      view.enter = null;
      show();
    };
    const ask = () => {
      guess = 0;
      wrap.innerHTML = `<div class="ac-center"><h3>What’s the running count?</h3>
        <div class="ac-stepper"><button class="ghost" id="acMinus" aria-label="Minus one">−</button><output id="acGuess">0</output><button class="ghost" id="acPlus" aria-label="Plus one">+</button></div>
        <p class="hint-text">Use the arrow keys or type a number, then press Enter.</p>
        <button class="primary big" id="acCheck">Check ${icon('check')}</button></div>`;
      const upd = () => { $('#acGuess', wrap).textContent = fmt(guess); };
      $('#acMinus', wrap).addEventListener('click', () => { guess--; upd(); });
      $('#acPlus', wrap).addEventListener('click', () => { guess++; upd(); });
      $('#acCheck', wrap).addEventListener('click', check);
      view.enter = check;
      view.arrow = d => { guess += d; upd(); };
    };
    const check = () => {
      view.arrow = null;
      const rc = cards.reduce((a, c) => a + BJ.hiLo(c.rank), 0);
      const ok = guess === rc;
      if (ok && (len > (rec.best || 0) || (len === rec.best && SPEED[speed] < SPEED[rec.bestSpeed || 'slow']))) { rec.best = len; rec.bestSpeed = speed; }
      P.save();
      wrap.innerHTML = `<div class="ac-center"><div class="ac-score-ring ${ok ? '' : 'miss'}" style="--p:${ok ? 1 : 0.15}"><span>${fmt(rc)}</span></div>
        <h3>${ok ? 'Spot on!' : `The count was ${fmt(rc)}, you said ${fmt(guess)}`}</h3>
        <div class="ac-count-trail">${cards.map(c => `<span class="${BJ.hiLo(c.rank) > 0 ? 'plus' : BJ.hiLo(c.rank) < 0 ? 'minus' : 'zero'}"><b>${c.rank}</b>${fmt(BJ.hiLo(c.rank))}</span>`).join('')}</div>
        <div class="ac-result-actions"><button class="primary" id="acAgain">Again</button><button class="ghost" id="acSet">Change settings</button><button class="ghost" id="acHome">Back to the Academy</button></div></div>`;
      if (ok) { Sound.win(); gainXP(10 + len, 'count drill'); } else Sound.lose();
      $('#acAgain', wrap).addEventListener('click', run);
      $('#acSet', wrap).addEventListener('click', setup);
      $('#acHome', wrap).addEventListener('click', showHome);
      view.enter = run;
    };
    view.typed = n => { if (view.arrow) { guess = n; $('#acGuess', wrap).textContent = fmt(guess); } };
    setup();
  }

  // ---------------------------------------------------------------------------
  // Open / close / keys
  // ---------------------------------------------------------------------------
  function open(where, arg) {
    if (!root) build();
    root.hidden = false;
    Sound.unlock();
    if (where === 'mistakes') openDrill('mistakes', arg);
    else if (where === 'strategy') openDrill('strategy', arg);
    else if (where && where !== 'home' && DRILLS.some(d => d.id === where)) openDrill(where);
    else showHome();
  }

  function close() {
    if (cleanup) { cleanup(); cleanup = null; }
    root.hidden = true;
    view = null;
    if (UI.onClose) UI.onClose();
  }

  function onKey(e) {
    if (!root || root.hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { e.preventDefault(); if (view && view.name !== 'home' && view.back) view.back(); else close(); return; }
    if (!view) return;
    if ((k === 'enter' || k === ' ') && view.enter) {
      if (document.activeElement && document.activeElement.tagName === 'BUTTON' && k === 'enter' && !view.arrow) return;
      e.preventDefault();
      view.enter();
      return;
    }
    if (view.arrow && (k === 'arrowup' || k === 'arrowright' || k === '+' || k === '=')) { e.preventDefault(); view.arrow(1); return; }
    if (view.arrow && (k === 'arrowdown' || k === 'arrowleft' || k === '-')) { e.preventDefault(); view.arrow(-1); return; }
    if (view.typed && /^[0-9]$/.test(k)) { view.typed(Number(k) * (e.shiftKey ? -1 : 1)); return; }
    if (view.option && /^[1-6]$/.test(k)) { view.option(Number(k) - 1); return; }
    if (view.key) view.key(k);
  }

  window.Academy = { open, close, isOpen: () => !!root && !root.hidden, MODULES, lessons: ALL_LESSONS };
})();
