/*
 * Blackjack — game flow and interface.
 * Depends on engine.js (window.BJ) and audio.js (window.Sound).
 */
(function () {
  'use strict';

  const BJ = window.BJ;
  const Sound = window.Sound;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  function h(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (id, cls) => `<svg class="${cls || ''}"><use href="#i-${id}"/></svg>`;
  const suitSvg = (s, cls) => `<svg class="${cls || ''}" viewBox="0 0 100 100"><use href="#suit-${s}" width="100" height="100"/></svg>`;
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const r2 = BJ.round2;
  let uidN = 0;
  const uid = p => (p || 'id') + Date.now().toString(36) + (uidN++).toString(36);

  function money(x, opts) {
    const o = opts || {};
    const neg = x < 0;
    const v = Math.abs(r2(x));
    const s = Number.isInteger(v)
      ? v.toLocaleString('en-US')
      : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sign = neg ? '−' : o.plus && v > 0 ? '+' : '';
    return sign + '$' + s;
  }
  const chipLabel = v => (v >= 1000 ? v / 1000 + 'K' : String(v));
  const initials = name => {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  };
  function upName(card) {
    const v = BJ.upValue(card);
    if (v === 11) return 'an Ace';
    if (v === 8) return 'an 8';
    return 'a ' + v;
  }

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  const MAX_SEATS = 5;
  const AVATAR_COLORS = ['#f2b84b', '#62b6f2', '#f07f98', '#86d48e', '#b8a1ff'];
  const CPU_NAMES = ['Ava', 'Marco', 'Kenji', 'Lena', 'Omar', 'Sofia', 'Theo', 'Priya'];
  const CPU_STYLES = ['steady', 'bold', 'cautious'];
  const LIMITS = {
    '5': { min: 5, max: 500, chips: [1, 5, 10, 25, 100, 500], label: '$5 – $500' },
    '10': { min: 10, max: 1000, chips: [5, 10, 25, 100, 500, 1000], label: '$10 – $1,000' },
    '25': { min: 25, max: 2500, chips: [5, 25, 100, 500, 1000], label: '$25 – $2,500' },
    '100': { min: 100, max: 10000, chips: [25, 100, 500, 1000, 5000], label: '$100 – $10,000' },
  };
  const BANKROLLS = [500, 1000, 2500, 10000];
  const DENOMS = [5000, 1000, 500, 100, 25, 10, 5, 1];
  const SPEEDS = { relaxed: 1.4, normal: 1, fast: 0.55, turbo: 0.18 };
  const SETTINGS_KEY = 'bj.settings.v1';
  const SAVE_KEY = 'bj.game.v1';
  const EASE = 'cubic-bezier(.2,.8,.2,1)';

  const DEFAULT_SETTINGS = Object.assign({}, BJ.DEFAULT_RULES, {
    limits: '10',
    bankroll: 1000,
    speed: 'normal',
    sound: true,
    volume: 0.7,
    felt: 'emerald',
    back: 'crimson',
    fourColor: false,
    showTotals: true,
    hintsEnabled: true,
    autoHints: false,
    coach: true,
    showCount: false,
  });

  const PIPS = {
    2: [[50, 0], [50, 100, 1]],
    3: [[50, 0], [50, 50], [50, 100, 1]],
    4: [[0, 0], [100, 0], [0, 100, 1], [100, 100, 1]],
    5: [[0, 0], [100, 0], [50, 50], [0, 100, 1], [100, 100, 1]],
    6: [[0, 0], [100, 0], [0, 50], [100, 50], [0, 100, 1], [100, 100, 1]],
    7: [[0, 0], [100, 0], [50, 25], [0, 50], [100, 50], [0, 100, 1], [100, 100, 1]],
    8: [[0, 0], [100, 0], [50, 25], [0, 50], [100, 50], [50, 75, 1], [0, 100, 1], [100, 100, 1]],
    9: [[0, 0], [100, 0], [0, 33.3], [100, 33.3], [50, 50], [0, 66.7, 1], [100, 66.7, 1], [0, 100, 1], [100, 100, 1]],
    10: [[0, 0], [100, 0], [50, 16.7], [0, 33.3], [100, 33.3], [0, 66.7, 1], [100, 66.7, 1], [50, 83.3, 1], [0, 100, 1], [100, 100, 1]],
  };

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const S = {
    settings: loadSettings(),
    seats: [],
    dealer: { cards: [] },
    shoe: null,
    phase: 'idle',          // idle | betting | dealing | insurance | playing | dealer | settling
    sel: { seat: null, spot: 'main' },
    chip: null,
    round: 0,
    count: 0,
    pending: null,          // waiting for a human decision
    skip: null,
    cw: 92,
    seatW: 220,
  };

  const dom = {
    app: $('#app'),
    table: $('#table'),
    seats: $('#seats'),
    dealerHand: $('#dealerHand'),
    dealerCards: $('#dealerHand .hand-cards'),
    dealerTotal: $('#dealerTotal'),
    shoe: $('#shoe'),
    shoeMouth: $('#shoeMouth'),
    shoeFill: $('#shoeFill'),
    shoeCut: $('#shoeCut'),
    shoeLabel: $('#shoeLabel'),
    discard: $('#discardStack'),
    rack: $('#rack'),
    banner: $('#banner'),
    bannerTitle: $('#bannerTitle'),
    bannerSub: $('#bannerSub'),
    dockPlayer: $('#dockPlayer'),
    dockMeta: $('#dockMeta'),
    chipTray: $('#chipTray'),
    panels: { bet: $('#panelBet'), play: $('#panelPlay'), insurance: $('#panelInsurance'), wait: $('#panelWait') },
    waitMsg: $('#waitMsg'),
    fx: $('#fx'),
    toasts: $('#toasts'),
    lobby: $('#lobby'),
    sheet: $('#sheet'),
  };

  const cardEls = new Map();   // card id -> element
  const handEls = new Map();   // hand id -> element
  const seatDom = new Map();   // seat id -> { root, hands, spots, plate, ... }

  function loadSettings() {
    try {
      const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
      const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      return Object.assign({}, DEFAULT_SETTINGS, reduced ? { speed: 'fast' } : {}, raw || {});
    } catch (e) { return Object.assign({}, DEFAULT_SETTINGS); }
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(S.settings)); } catch (e) { /* storage unavailable */ }
  }
  function saveGame() {
    try {
      const seats = S.seats.map(s => ({
        id: s.id, name: s.name, type: s.type, skill: s.skill, style: s.style, color: s.color,
        bankroll: r2(s.bankroll + s.bets.main + s.bets.pp + s.bets.t3), lastBets: s.lastBets, stats: s.stats,
      }));
      localStorage.setItem(SAVE_KEY, JSON.stringify({ seats, round: S.round, savedAt: Date.now() }));
    } catch (e) { /* storage unavailable */ }
  }
  function loadGame() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; }
  }

  const F = () => SPEEDS[S.settings.speed] || 1;
  const wait = ms => new Promise(r => setTimeout(r, ms * F()));
  const dur = ms => ms * F();
  const rules = () => S.settings;
  const limits = () => LIMITS[S.settings.limits] || LIMITS['10'];
  const sideMax = () => Math.max(limits().min, Math.round(limits().max / 4));
  const humans = () => S.seats.filter(s => s.type === 'human');

  function newStats(bankroll) {
    return {
      hands: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0, busts: 0, surrenders: 0,
      net: 0, wagered: 0, biggestWin: 0, decisions: 0, correct: 0, streak: 0, bestStreak: 0,
      rebuys: 0, sideNet: 0, history: [bankroll],
    };
  }

  function newSeat(cfg) {
    const bankroll = cfg.bankroll != null ? cfg.bankroll : S.settings.bankroll;
    return {
      id: cfg.id || uid('s'),
      name: cfg.name || 'Player',
      type: cfg.type || 'human',
      skill: cfg.skill || 'pro',
      style: cfg.style || pick(CPU_STYLES),
      color: cfg.color || AVATAR_COLORS[0],
      bankroll,
      bets: { main: 0, pp: 0, t3: 0 },
      betLog: [],
      lastBets: cfg.lastBets || null,
      hands: [],
      insurance: 0,
      stats: cfg.stats || newStats(bankroll),
    };
  }

  function newHand(bet) {
    return { id: uid('h'), cards: [], bet, doubled: false, fromSplit: false, splitAces: false, surrendered: false, resolved: false, result: null };
  }

  // Seats are stored in play order: index 0 is "first base", which sits on
  // the far right of the table as the players see it.
  const playOrder = () => S.seats;

  // ---------------------------------------------------------------------------
  // Cards
  // ---------------------------------------------------------------------------
  function frontHTML(card) {
    const red = BJ.isRed(card.suit);
    const rankCls = card.rank === '10' ? 'r ten' : 'r';
    const idx = cls => `<div class="idx ${cls}"><span class="${rankCls}">${card.rank}</span>${suitSvg(card.suit)}</div>`;
    let center;
    if (card.rank === 'A') {
      center = suitSvg(card.suit, 'ace-pip');
    } else if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') {
      const crown = card.rank === 'K'
        ? '<svg class="court-crown" viewBox="0 0 100 46"><path d="M6 42 12 8l20 18L50 3l18 23L88 8l6 34z"/></svg>'
        : card.rank === 'Q'
          ? '<svg class="court-crown" viewBox="0 0 100 46"><path d="M12 42 18 18l16 12L50 10l16 20 16-12 6 24z"/><circle cx="50" cy="8" r="5"/></svg>'
          : '';
      center = `<div class="court">${crown}${suitSvg(card.suit, 'court-suit a')}<span class="court-letter">${card.rank}</span>${suitSvg(card.suit, 'court-suit b')}</div>`;
    } else {
      const pts = PIPS[card.rank] || [];
      center = '<div class="pips">' + pts.map(p =>
        `<svg class="pip${p[2] ? ' flip' : ''}" viewBox="0 0 100 100" style="left:${p[0]}%;top:${p[1]}%"><use href="#suit-${card.suit}" width="100" height="100"/></svg>`
      ).join('') + '</div>';
    }
    return { red, html: idx('tl') + center + idx('br') };
  }

  function createCardEl(card) {
    const e = h('div', 'card face-down');
    e.innerHTML = '<div class="card-inner"><div class="card-face card-front"></div><div class="card-face card-back"></div></div>';
    e.setAttribute('role', 'img');
    e.setAttribute('aria-label', 'Face-down card');
    cardEls.set(card.id, e);
    return e;
  }

  function paintFront(card, e) {
    const f = frontHTML(card);
    e.dataset.rank = card.rank;
    e.dataset.suit = card.suit;
    e.classList.toggle('red', f.red);
    e.querySelector('.card-front').innerHTML = f.html;
    e.setAttribute('aria-label', BJ.cardName(card));
  }

  function revealCard(card, silent) {
    const e = cardEls.get(card.id);
    if (!e || card.faceUp) return;
    card.faceUp = true;
    paintFront(card, e);
    // Force style flush so the flip animates.
    void e.offsetWidth;
    e.classList.remove('face-down');
    if (!silent) Sound.flip();
    S.count += BJ.hiLo(card.rank);
    updateCount();
  }

  function staticCard(rank, suit) {
    const card = { id: uid('demo'), rank, suit };
    const e = h('div', 'card');
    e.innerHTML = '<div class="card-inner"><div class="card-face card-front"></div><div class="card-face card-back"></div></div>';
    paintFront(card, e);
    return e;
  }

  // Position cards inside a hand. Units are multiples of the card width.
  const OX = 0.3, OY = 0.05, DOX = 0.64;
  function layoutHand(hand, isDealer) {
    const el = isDealer ? dom.dealerHand : handEls.get(hand.id);
    if (!el) return;
    const wrap = el.querySelector('.hand-cards');
    const n = hand.cards.length;
    let ox = isDealer ? DOX : OX;
    if (isDealer && n > 1 && S.dcw) ox = Math.min(DOX, Math.max(0.22, (S.dealerMaxW / S.dcw - 1) / (n - 1)));
    const oy = isDealer ? 0 : OY;
    let extra = 0;
    hand.cards.forEach((c, i) => {
      const ce = cardEls.get(c.id);
      if (!ce) return;
      const dbl = ce.classList.contains('doubled');
      const x = i * ox + (dbl ? 0.14 : 0);
      if (dbl) extra = 0.34;
      ce.style.left = `calc(var(--scw) * ${x})`;
      ce.style.bottom = `calc(var(--scw) * ${i * oy})`;
      ce.style.zIndex = String(i + 1);
    });
    wrap.style.width = `calc(var(--scw) * ${n ? 1 + (n - 1) * ox + extra : 1})`;
    wrap.style.height = `calc(var(--scw) * ${1.4 + Math.max(0, n - 1) * oy})`;
  }

  function seatUnits(seat) {
    let units = 0;
    seat.hands.forEach(hd => {
      const n = Math.max(1, hd.cards.length);
      units += 1 + (n - 1) * OX + (hd.doubled ? 0.34 : 0);
    });
    units += Math.max(0, seat.hands.length - 1) * 0.2;
    return Math.max(units, 1);
  }

  function fitSeat(seat) {
    const d = seatDom.get(seat.id);
    if (!d) return;
    const avail = S.seatW - 8;
    const units = seatUnits(seat);
    const scw = units * S.cw > avail ? Math.max(avail / units, S.cw * 0.5) : S.cw;
    d.root.style.setProperty('--scw', scw.toFixed(2) + 'px');
  }

  // FLIP: remember where every card is, change the layout, then animate each
  // card from its old position to the new one.
  function snapshot() {
    const m = new Map();
    cardEls.forEach(e => { if (e.isConnected) m.set(e, e.getBoundingClientRect()); });
    return m;
  }
  function flipFrom(snap, ms, except) {
    snap.forEach((r, e) => {
      if (!e.isConnected || e === except) return;
      const n = e.getBoundingClientRect();
      if (!n.width) return;
      const dx = r.left - n.left;
      const dy = r.top - n.top;
      const sx = r.width / n.width;
      const sy = r.height / n.height;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01) return;
      e.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, transformOrigin: '0 0' },
        { transform: 'none', transformOrigin: '0 0' },
      ], { duration: dur(ms || 320), easing: EASE });
    });
  }

  function center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  // Deal one card from the shoe to a hand (or the dealer).
  async function dealCard(target, hand, opts) {
    const o = Object.assign({ faceUp: true, doubled: false, pace: 300 }, opts);
    const isDealer = target === 'dealer';
    const card = S.shoe.draw();
    if (S.shoe.reshuffledMidRound) {
      S.shoe.reshuffledMidRound = false;
      toast('The shoe ran out, so the discards were reshuffled.', { icon: 'refresh' });
      renderDiscard();
    }
    card.doubled = o.doubled;
    const snap = snapshot();
    hand.cards.push(card);
    const e = createCardEl(card);
    if (o.doubled) e.classList.add('doubled');
    const wrap = isDealer ? dom.dealerCards : handEls.get(hand.id).querySelector('.hand-cards');
    wrap.appendChild(e);
    layoutHand(hand, isDealer);
    if (!isDealer) fitSeat(target);
    flipFrom(snap, 300, e);

    const from = center(dom.shoeMouth.getBoundingClientRect());
    const to = center(e.getBoundingClientRect());
    const dx = from.x - to.x;
    const dy = from.y - to.y;
    Sound.card();
    const anim = e.animate([
      { transform: `translate(${dx}px, ${dy}px) rotate(-28deg) scale(.62)`, opacity: 0 },
      { opacity: 1, offset: 0.12 },
      { transform: 'none', opacity: 1 },
    ], { duration: dur(460), easing: 'cubic-bezier(.18,.78,.24,1)' });
    updateShoe();

    if (o.faceUp) {
      setTimeout(() => {
        revealCard(card, true);
        if (isDealer) updateDealerTotal(); else updateHandMeta(target, hand);
      }, dur(200));
    }
    await wait(o.pace);
    if (o.await !== false) await anim.finished.catch(() => {});
    if (o.faceUp && !card.faceUp) revealCard(card, true);
    if (isDealer) updateDealerTotal(); else updateHandMeta(target, hand);
    return card;
  }

  // ---------------------------------------------------------------------------
  // Chips
  // ---------------------------------------------------------------------------
  function decompose(amount, max) {
    const out = [];
    let left = Math.floor(amount + 1e-9);
    for (const d of DENOMS) {
      while (left >= d && out.length < (max || 12)) { out.push(d); left -= d; }
    }
    if (!out.length && amount > 0) out.push(1);
    return out;
  }

  function chipEl(v) {
    const e = h('div', 'chip', `<span>${chipLabel(v)}</span>`);
    e.dataset.v = v;
    return e;
  }

  function renderStack(stackEl, amount) {
    stackEl.innerHTML = '';
    const spot = stackEl.parentElement;
    spot.classList.toggle('has-chips', amount > 0);
    if (amount <= 0) return;
    // Largest chips at the bottom of the stack, at most 10 drawn.
    const chips = decompose(amount, 40).slice(0, 10);
    chips.forEach((v, i) => {
      const c = chipEl(v);
      c.style.setProperty('--i', i);
      stackEl.appendChild(c);
    });
    const label = h('div', 'stack-amount', money(amount));
    stackEl.appendChild(label);
  }

  function chipSize() { return Math.round(S.cw * 0.44); }

  function flyChip(v, fromRect, toRect, delay, size) {
    const sz = size || chipSize();
    const e = chipEl(v);
    e.style.setProperty('--size', sz + 'px');
    dom.fx.appendChild(e);
    const a = center(fromRect);
    const b = center(toRect);
    const lift = Math.min(80, Math.hypot(b.x - a.x, b.y - a.y) * 0.18);
    const anim = e.animate([
      { transform: `translate(${a.x - sz / 2}px, ${a.y - sz / 2}px) scale(.9)`, opacity: 0 },
      { opacity: 1, offset: 0.08 },
      { transform: `translate(${(a.x + b.x) / 2 - sz / 2}px, ${(a.y + b.y) / 2 - sz / 2 - lift}px) scale(1.06)`, offset: 0.5 },
      { transform: `translate(${b.x - sz / 2}px, ${b.y - sz / 2}px) scale(1)`, opacity: 1 },
    ], { duration: dur(520), delay: dur(delay || 0), easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'both' });
    return anim.finished.then(() => e.remove(), () => e.remove());
  }

  function flyAmount(amount, fromEl, toEl, opts) {
    if (!fromEl || !toEl || amount <= 0) return Promise.resolve();
    const o = opts || {};
    const fr = fromEl.getBoundingClientRect();
    const tr = toEl.getBoundingClientRect();
    const chips = decompose(amount, 6);
    if (!o.silent) setTimeout(() => Sound.chip(chips.length), dur(380));
    return Promise.all(chips.map((v, i) => flyChip(v, fr, tr, i * 55 + (o.delay || 0))));
  }

  // Gold sparkles for big moments.
  function sparkle(el, count) {
    if (!el || F() < 0.3) return;
    const r = center(el.getBoundingClientRect());
    const colors = ['#fff1c4', '#f3c64f', '#ffffff', '#e8a33d', '#ffd97a'];
    for (let i = 0; i < (count || 28); i++) {
      const p = h('i', 'spark');
      p.style.background = pick(colors);
      dom.fx.appendChild(p);
      const ang = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 110;
      const dx = Math.cos(ang) * dist;
      const dy = Math.sin(ang) * dist * 0.75 - 20;
      const done = () => p.remove();
      p.animate([
        { transform: `translate(${r.x}px, ${r.y}px) scale(1.2) rotate(0deg)`, opacity: 1 },
        { transform: `translate(${r.x + dx}px, ${r.y + dy}px) scale(1) rotate(${Math.random() * 540}deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${r.x + dx * 1.1}px, ${r.y + dy + 50}px) scale(.4) rotate(${Math.random() * 720}deg)`, opacity: 0 },
      ], { duration: dur(1000 + Math.random() * 600), easing: 'cubic-bezier(.12,.75,.3,1)' }).finished.then(done, done);
    }
  }

  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const buzz = ms => { if (coarse && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* unsupported */ } } };

  // ---------------------------------------------------------------------------
  // Seats
  // ---------------------------------------------------------------------------
  function buildSeats() {
    dom.seats.innerHTML = '';
    seatDom.clear();
    handEls.clear();
    // Display right-to-left so seat 1 (first to act) sits on the right.
    const display = playOrder().slice().reverse();
    display.forEach(seat => {
      const root = h('div', 'seat ' + seat.type);
      root.dataset.seat = seat.id;
      root.style.setProperty('--avatar', seat.color);
      root.innerHTML = `
        <div class="seat-hands"></div>
        <div class="spots">
          <button class="spot side" data-spot="pp" aria-label="Perfect Pairs side bet"><span class="spot-label">PP</span><div class="chipstack"></div></button>
          <button class="spot main" data-spot="main" aria-label="Main bet"><span class="spot-label">BET</span><div class="chipstack"></div></button>
          <button class="spot side" data-spot="t3" aria-label="21+3 side bet"><span class="spot-label">21+3</span><div class="chipstack"></div></button>
        </div>
        <div class="plate">
          <div class="avatar">${esc(initials(seat.name))}${seat.type === 'cpu' ? `<span class="cpu-dot">${icon('cpu')}</span>` : ''}</div>
          <div class="plate-text"><span class="plate-name">${esc(seat.name)}</span><span class="plate-bank"></span></div>
          <span class="thinking"><i></i><i></i><i></i></span>
          <button class="rebuy-btn" hidden>Rebuy</button>
        </div>`;
      const d = {
        root,
        hands: $('.seat-hands', root),
        spots: { main: $('[data-spot=main]', root), pp: $('[data-spot=pp]', root), t3: $('[data-spot=t3]', root) },
        plate: $('.plate', root),
        bank: $('.plate-bank', root),
        rebuy: $('.rebuy-btn', root),
        ins: null,
      };
      // Insurance marker lives beside the main spot.
      const ins = h('div', 'spot ins', '<span class="spot-label">INS</span><div class="chipstack"></div>');
      ins.hidden = true;
      d.spots.main.appendChild(ins);
      d.ins = ins;

      Object.entries(d.spots).forEach(([spot, b]) => {
        b.addEventListener('click', ev => { ev.stopPropagation(); onSpotClick(seat, spot); });
        b.addEventListener('contextmenu', ev => { ev.preventDefault(); undoChip(seat, spot); });
      });
      root.addEventListener('click', () => onSeatClick(seat));
      d.rebuy.addEventListener('click', ev => { ev.stopPropagation(); rebuy(seat); });
      seatDom.set(seat.id, d);
      dom.seats.appendChild(root);
      d.bank.textContent = money(seat.bankroll);
      d.bank.dataset.v = seat.bankroll;
    });
    renderSeats();
  }

  function renderSeats() {
    S.seats.forEach(renderSeat);
    renderDock();
  }

  function renderSeat(seat) {
    const d = seatDom.get(seat.id);
    if (!d) return;
    const betting = S.phase === 'betting';
    const side = rules().sideBets;
    d.spots.pp.hidden = !side;
    d.spots.t3.hidden = !side;
    renderStack($('.chipstack', d.spots.main), seat.bets.main);
    renderStack($('.chipstack', d.spots.pp), seat.bets.pp);
    renderStack($('.chipstack', d.spots.t3), seat.bets.t3);
    d.ins.hidden = !(seat.insurance > 0);
    if (seat.insurance > 0) renderStack($('.chipstack', d.ins), seat.insurance);
    const selected = betting && S.sel.seat === seat.id;
    Object.entries(d.spots).forEach(([k, b]) => b.classList.toggle('selected', selected && S.sel.spot === k));
    d.root.classList.toggle('selected-bettor', selected);
    const broke = seat.bankroll + seat.bets.main < limits().min;
    d.rebuy.hidden = !(betting && seat.type === 'human' && broke && seat.bets.main === 0);
    setBank(seat);
  }

  function holdBank(seat, on) {
    const d = seatDom.get(seat.id);
    if (d) d.hold = (d.hold || 0) + (on ? 1 : -1);
  }

  function setBank(seat, animate) {
    const d = seatDom.get(seat.id);
    if (!d || (d.hold > 0 && !animate)) return;
    const to = r2(seat.bankroll);
    const from = Number(d.bank.dataset.v || to);
    d.bank.dataset.v = to;
    if (!animate || from === to) { d.bank.textContent = money(to); return; }
    const t0 = performance.now();
    const len = 600;
    const step = now => {
      const p = Math.min(1, (now - t0) / len);
      const e = 1 - Math.pow(1 - p, 3);
      d.bank.textContent = money(Math.round(from + (to - from) * e));
      if (p < 1) requestAnimationFrame(step); else d.bank.textContent = money(to);
    };
    requestAnimationFrame(step);
  }

  function showDelta(seat, amount) {
    const d = seatDom.get(seat.id);
    if (!d || !amount) return;
    const e = h('div', 'plate-delta ' + (amount > 0 ? 'pos' : 'neg'), money(amount, { plus: true }));
    d.plate.appendChild(e);
    setTimeout(() => e.remove(), dur(1700));
  }

  function ensureHandEl(seat, hand, index) {
    let e = handEls.get(hand.id);
    if (!e) {
      e = h('div', 'hand', '<div class="hand-cards"></div><div class="hand-meta"><div class="total-badge" hidden></div></div>');
      handEls.set(hand.id, e);
    }
    const d = seatDom.get(seat.id);
    const kids = d.hands.children;
    if (kids[index] !== e) d.hands.insertBefore(e, kids[index] || null);
    layoutHand(hand, false);
    return e;
  }

  function totalHTML(cards, opts) {
    const o = opts || {};
    const v = BJ.evaluate(cards);
    if (o.natural) return { html: 'Blackjack', cls: 'bj' };
    if (v.bust) return { html: String(v.total), cls: 'bust' };
    if (v.soft && v.total !== 21 && !o.final) return { html: `<span class="soft">${v.total - 10} /</span> ${v.total}`, cls: '' };
    return { html: String(v.total), cls: v.total === 21 ? 'twenty-one' : '' };
  }

  function updateHandMeta(seat, hand) {
    const e = handEls.get(hand.id);
    if (!e) return;
    const badge = $('.total-badge', e);
    const visible = hand.cards.filter(c => c.faceUp);
    if (!visible.length) { badge.hidden = true; return; }
    const natural = BJ.isNatural(hand.cards, hand.fromSplit) && visible.length === 2;
    const t = totalHTML(visible, { natural, final: hand.done });
    let html = t.html;
    if (seat.hands.length > 1 || hand.doubled) html += `<span class="bet-tag">${money(hand.bet)}</span>`;
    badge.innerHTML = html;
    badge.className = 'total-badge ' + t.cls;
    badge.hidden = !rules().showTotals && !natural && t.cls !== 'bust';
  }

  function updateDealerTotal() {
    const visible = S.dealer.cards.filter(c => c.faceUp);
    const b = dom.dealerTotal;
    if (!visible.length) { b.hidden = true; return; }
    const natural = visible.length === 2 && BJ.isNatural(visible);
    const done = S.phase === 'settling' || S.phase === 'dealer';
    const t = totalHTML(visible, { natural, final: done && visible.length === S.dealer.cards.length });
    b.innerHTML = t.html;
    b.className = 'total-badge dealer-total ' + t.cls;
    b.hidden = !rules().showTotals && !natural && t.cls !== 'bust';
  }

  function setActive(seat, hi) {
    S.seats.forEach(s => {
      const d = seatDom.get(s.id);
      if (!d) return;
      const isTurn = seat && s.id === seat.id;
      d.root.classList.toggle('turn', !!isTurn);
      d.root.classList.toggle('dim', !!seat && !isTurn && s.hands.length > 0);
      s.hands.forEach((hd, i) => {
        const e = handEls.get(hd.id);
        if (!e) return;
        e.classList.toggle('active', !!isTurn && i === hi);
        e.classList.toggle('waiting', !!isTurn && s.hands.length > 1 && i !== hi);
      });
    });
    if (seat) {
      const d = seatDom.get(seat.id);
      if (d && dom.seats.classList.contains('scroll')) scrollSeatIntoView(d.root);
    }
  }

  function scrollSeatIntoView(el) {
    const strip = dom.seats;
    const target = el.offsetLeft + el.offsetWidth / 2 - strip.clientWidth / 2;
    strip.scrollTo({ left: target, behavior: 'smooth' });
  }

  function clearActive() {
    S.seats.forEach(s => {
      const d = seatDom.get(s.id);
      if (!d) return;
      d.root.classList.remove('turn', 'dim', 'thinking');
      $$('.hand', d.root).forEach(e => e.classList.remove('active', 'waiting'));
    });
  }

  function resultBadge(handEl, cls, title, amount) {
    if (!handEl) return;
    const old = $('.result-badge:not(.side)', handEl);
    if (old) old.remove();
    const b = h('div', 'result-badge ' + cls, esc(title) + (amount ? `<small>${money(amount, { plus: true })}</small>` : ''));
    handEl.appendChild(b);
  }

  // ---------------------------------------------------------------------------
  // Shoe, discards, count
  // ---------------------------------------------------------------------------
  function newShoe() {
    S.shoe = new BJ.Shoe(rules().decks, rules().penetration);
    S.count = 0;
    updateShoe();
    renderDiscard();
    updateCount();
  }

  function updateShoe() {
    const sh = S.shoe;
    if (!sh) return;
    const pct = (sh.remaining / sh.total) * 100;
    dom.shoeFill.style.width = pct + '%';
    dom.shoeCut.style.left = ((sh.total - sh.cutAt) / sh.total) * 100 + '%';
    dom.shoeLabel.textContent = sh.remaining + ' cards';
    updateCount();
  }

  function renderDiscard() {
    const sh = S.shoe;
    if (!sh) return;
    let pile = $('.pile', dom.discard);
    if (!pile) { pile = h('div', 'pile'); dom.discard.appendChild(pile); }
    const n = sh.discards.length;
    pile.style.setProperty('--thick', (n ? 1 + (n / sh.total) * S.cw * 0.22 : 0).toFixed(1) + 'px');
    pile.style.opacity = n ? 1 : 0;
  }

  function updateCount() {
    const pill = $('#countPill');
    pill.hidden = !rules().showCount;
    if (!S.shoe) return;
    const rc = S.count;
    const tc = rc / S.shoe.decksRemaining;
    const rcEl = $('#rc');
    const tcEl = $('#tc');
    rcEl.textContent = (rc > 0 ? '+' : '') + rc;
    tcEl.textContent = (tc > 0 ? '+' : '') + tc.toFixed(1);
    rcEl.className = rc > 0 ? 'pos' : rc < 0 ? 'neg' : '';
    tcEl.className = tc >= 1 ? 'pos' : tc <= -1 ? 'neg' : '';
    $('#decksLeft').textContent = S.shoe.decksRemaining.toFixed(1);
  }

  function buildRack() {
    dom.rack.innerHTML = '';
    [1000, 500, 100, 25, 10, 5, 1, 25, 100, 500].slice(0, 8).forEach(v => {
      const c = h('div', 'rack-col');
      c.style.setProperty('--c', getChipColor(v));
      dom.rack.appendChild(c);
    });
  }
  function getChipColor(v) {
    return { 1: '#e9e4d8', 5: '#c8323a', 10: '#2559b8', 25: '#1d8a4f', 100: '#2a2a30', 500: '#6a3ea6', 1000: '#e0b33f', 5000: '#c4661f' }[v] || '#888';
  }

  async function shuffleShoe(initial) {
    banner('Shuffling', initial ? 'A fresh ' + rules().decks + '-deck shoe' : 'The cut card came out');
    dom.shoe.classList.add('shuffling');
    Sound.shuffle();
    // Discards fly back into the shoe.
    if (S.shoe && S.shoe.discards.length) {
      const fr = dom.discard.getBoundingClientRect();
      const tr = dom.shoeMouth.getBoundingClientRect();
      for (let i = 0; i < 5; i++) {
        const e = h('div', 'card face-down', '<div class="card-inner"><div class="card-face card-front"></div><div class="card-face card-back"></div></div>');
        e.style.setProperty('--scw', S.cw * 0.7 + 'px');
        e.style.cssText += ';position:fixed;left:0;top:0;bottom:auto';
        dom.fx.appendChild(e);
        const a = center(fr);
        const b = center(tr);
        const w = S.cw * 0.7;
        e.animate([
          { transform: `translate(${a.x - w / 2}px, ${a.y - w * 0.7}px) rotate(-8deg)`, opacity: 0 },
          { opacity: 1, offset: 0.15 },
          { transform: `translate(${b.x - w / 2}px, ${b.y - w * 0.7}px) rotate(4deg)`, opacity: 0.2 },
        ], { duration: dur(520), delay: dur(i * 90), easing: EASE, fill: 'both' }).finished.then(() => e.remove());
      }
    }
    await wait(1250);
    newShoe();
    dom.shoe.classList.remove('shuffling');
    // Burn one card face down.
    const burn = S.shoe.draw();
    S.shoe.discards.push(burn);
    renderDiscard();
    updateShoe();
    await wait(250);
  }

  // ---------------------------------------------------------------------------
  // Banner, toasts, dock
  // ---------------------------------------------------------------------------
  let bannerTimer = null;
  function banner(title, sub, tone) {
    clearTimeout(bannerTimer);
    dom.bannerTitle.textContent = title;
    dom.bannerSub.textContent = sub || '';
    dom.banner.className = 'banner show' + (tone ? ' ' + tone : '');
  }
  function hideBanner(delay) {
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => dom.banner.classList.remove('show'), delay || 0);
  }

  function toast(msg, opts) {
    const o = Object.assign({ icon: 'bulb', type: '', ms: 3200 }, opts);
    const t = h('div', 'toast ' + o.type, icon(o.icon) + `<span>${msg}</span>`);
    dom.toasts.appendChild(t);
    while (dom.toasts.children.length > 3) dom.toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, o.ms);
  }

  function showPanel(name, msg) {
    Object.entries(dom.panels).forEach(([k, p]) => { p.hidden = k !== name; });
    if (name === 'wait') dom.waitMsg.innerHTML = msg || '';
  }

  function dockSeat() {
    if (S.pending) return S.pending.seat;
    if (S.phase === 'betting' && S.sel.seat) return S.seats.find(s => s.id === S.sel.seat);
    if (S.insuranceSeat) return S.insuranceSeat;
    return humans()[0] || S.seats[0];
  }

  function renderDock() {
    const seat = dockSeat();
    if (!seat) { dom.dockPlayer.innerHTML = ''; return; }
    const onTable = r2(seat.bets.main + seat.bets.pp + seat.bets.t3 + seat.insurance);
    dom.dockPlayer.innerHTML = `
      <div class="avatar" style="--avatar:${seat.color}">${esc(initials(seat.name))}</div>
      <div class="dp-text">
        <span class="dp-name"><b>${esc(seat.name)}</b>${humans().length > 1 && S.phase === 'betting' ? ' · betting' : ''}</span>
        <span class="dp-bank">${money(seat.bankroll)}${onTable ? `<small>${money(onTable)} on table</small>` : ''}</span>
      </div>`;
    renderMeta();
  }

  function renderMeta() {
    const L = limits();
    let html = '';
    if (S.phase === 'betting') {
      const seat = dockSeat();
      html = `<span class="meta-big">${money(seat ? seat.bets.main : 0)}</span><span>Main bet · table ${money(L.min)}–${money(L.max)}</span>`;
      if (rules().sideBets && seat && (seat.bets.pp || seat.bets.t3)) html += `<span>Side bets <b>${money(seat.bets.pp + seat.bets.t3)}</b></span>`;
    } else if (S.pending) {
      const { hand } = S.pending;
      const up = S.dealer.cards[0];
      html = `<span class="meta-big">${money(hand.bet)}</span><span>${esc(BJ.describeHand(hand.cards))} vs ${up ? esc(upName(up)) : '—'}</span>`;
    } else {
      html = `<span>Hand <b>#${S.round || 1}</b></span><span>${S.shoe ? S.shoe.remaining : 0} cards in shoe</span>`;
    }
    dom.dockMeta.innerHTML = html;
  }

  // ---------------------------------------------------------------------------
  // Betting
  // ---------------------------------------------------------------------------
  function buildChipTray() {
    dom.chipTray.innerHTML = '';
    const chips = limits().chips;
    if (!chips.includes(S.chip)) S.chip = chips[Math.min(2, chips.length - 1)];
    chips.forEach((v, i) => {
      const b = h('button', 'chip', `<span>${chipLabel(v)}</span><kbd>${i + 1}</kbd>`);
      b.dataset.v = v;
      b.setAttribute('aria-label', `Bet ${money(v)} chip`);
      b.addEventListener('click', () => {
        S.chip = v;
        const seat = currentBettor();
        if (seat) addChip(seat, S.sel.spot, v, b);
        updateChipTray();
      });
      dom.chipTray.appendChild(b);
    });
    updateChipTray();
  }

  function currentBettor() {
    return S.seats.find(s => s.id === S.sel.seat && s.type === 'human') || null;
  }

  function updateChipTray() {
    const seat = currentBettor();
    $$('.chip', dom.chipTray).forEach(b => {
      const v = Number(b.dataset.v);
      b.disabled = !seat || seat.bankroll < v;
      b.classList.toggle('active', v === S.chip);
    });
    const anyBets = S.seats.some(s => s.type === 'human' && (s.bets.main || s.bets.pp || s.bets.t3));
    const canRebet = humans().some(s => s.lastBets && s.lastBets.main && !s.bets.main);
    $('#btnUndo').disabled = !seat || !seat.betLog.length;
    $('#btnClear').disabled = !seat || !(seat.bets.main || seat.bets.pp || seat.bets.t3);
    $('#btnRebet').disabled = !canRebet;
    $('#btnRebet2').disabled = !canRebet;
    const deal = $('#btnDeal');
    const label = $('span', deal);
    const valid = S.seats.some(s => s.bets.main >= limits().min);
    if (!anyBets && canRebet) { label.textContent = 'Rebet & Deal'; deal.disabled = false; }
    else { label.textContent = 'Deal'; deal.disabled = !valid; }
    renderDock();
  }

  function selectBettor(seat, spot) {
    if (!seat || seat.type !== 'human') return;
    S.sel.seat = seat.id;
    if (spot) S.sel.spot = (spot !== 'main' && !rules().sideBets) ? 'main' : spot;
    renderSeats();
    const d = seatDom.get(seat.id);
    if (d && dom.seats.classList.contains('scroll')) scrollSeatIntoView(d.root);
    updateChipTray();
  }

  function onSeatClick(seat) {
    if (S.phase === 'betting' && seat.type === 'human' && S.sel.seat !== seat.id) {
      Sound.click();
      selectBettor(seat, 'main');
    }
    if (S.phase === 'settling' && S.skip) S.skip();
  }

  function onSpotClick(seat, spot) {
    if (S.phase !== 'betting' || seat.type !== 'human') { onSeatClick(seat); return; }
    if (S.sel.seat === seat.id && S.sel.spot === spot) {
      addChip(seat, spot, S.chip, null);
    } else {
      Sound.click();
      selectBettor(seat, spot);
    }
  }

  function addChip(seat, spot, v, fromEl, quiet) {
    if (S.phase !== 'betting') return false;
    const L = limits();
    const d = seatDom.get(seat.id);
    if (spot !== 'main' && !rules().sideBets) spot = 'main';
    if (seat.bankroll < v) {
      if (!quiet) { toast(`${esc(seat.name)} ${verb(seat.name, 'doesn\u2019t', 'don\u2019t')} have enough for a ${money(v)} chip.`, { type: 'warn', icon: 'x' }); shake(d && d.plate); }
      return false;
    }
    const cap = spot === 'main' ? L.max : sideMax();
    if (seat.bets[spot] + v > cap) {
      if (!quiet) { toast(`The ${spot === 'main' ? 'table' : 'side bet'} maximum is ${money(cap)}.`, { type: 'warn', icon: 'x' }); shake(d && d.spots[spot]); }
      return false;
    }
    seat.bankroll = r2(seat.bankroll - v);
    seat.bets[spot] += v;
    seat.betLog.push({ spot, v });
    renderSeat(seat);
    // Animate the newly placed chip from its source.
    const src = fromEl || (d && d.plate);
    const stack = d && $('.chipstack', d.spots[spot]);
    const top = stack && $$('.chip', stack).pop();
    if (top && src) {
      const fr = center(src.getBoundingClientRect());
      const tr = center(top.getBoundingClientRect());
      top.animate([
        { transform: `translate(calc(-50% + ${fr.x - tr.x}px), calc(-50% + ${fr.y - tr.y}px)) scale(1.25)`, opacity: 0.4 },
        { transform: getComputedStyle(top).transform === 'none' ? 'translate(-50%,-50%)' : getComputedStyle(top).transform, opacity: 1 },
      ], { duration: dur(320), easing: EASE });
    }
    Sound.chip(1);
    buzz(6);
    if (seat.type === 'human') updateChipTray();
    return true;
  }

  function undoChip(seat, spot) {
    if (S.phase !== 'betting' || seat.type !== 'human') return;
    let i = seat.betLog.length - 1;
    if (spot) while (i >= 0 && seat.betLog[i].spot !== spot) i--;
    if (i < 0) return;
    const [entry] = seat.betLog.splice(i, 1);
    seat.bets[entry.spot] -= entry.v;
    seat.bankroll = r2(seat.bankroll + entry.v);
    Sound.chip(1);
    renderSeat(seat);
    updateChipTray();
  }

  function clearBets(seat, silent) {
    const total = seat.bets.main + seat.bets.pp + seat.bets.t3;
    if (!total) return;
    seat.bankroll = r2(seat.bankroll + total);
    seat.bets = { main: 0, pp: 0, t3: 0 };
    seat.betLog = [];
    if (!silent) Sound.chip(3);
    renderSeat(seat);
    updateChipTray();
  }

  function placeBets(seat, bets, factor) {
    const want = { main: bets.main * factor, pp: (bets.pp || 0) * factor, t3: (bets.t3 || 0) * factor };
    if (!rules().sideBets) { want.pp = 0; want.t3 = 0; }
    want.main = Math.min(want.main, limits().max);
    want.pp = Math.min(want.pp, sideMax());
    want.t3 = Math.min(want.t3, sideMax());
    const total = want.main + want.pp + want.t3;
    if (total > seat.bankroll) {
      if (seat.type === 'human') toast(`${esc(seat.name)} can't cover a ${money(total)} rebet.`, { type: 'warn', icon: 'x' });
      return false;
    }
    ['main', 'pp', 't3'].forEach(spot => {
      if (!want[spot]) return;
      seat.bankroll = r2(seat.bankroll - want[spot]);
      seat.bets[spot] += want[spot];
      seat.betLog.push({ spot, v: want[spot] });
    });
    const d = seatDom.get(seat.id);
    if (d) flyAmount(want.main, d.plate, d.spots.main, { silent: true });
    renderSeat(seat);
    return true;
  }

  function rebet(factor) {
    if (S.phase !== 'betting') return false;
    let any = false;
    humans().forEach(s => {
      if (s.lastBets && s.lastBets.main && !s.bets.main && !s.bets.pp && !s.bets.t3) any = placeBets(s, s.lastBets, factor) || any;
    });
    if (any) Sound.chip(3);
    updateChipTray();
    return any;
  }

  function rebuy(seat) {
    seat.bankroll = r2(seat.bankroll + S.settings.bankroll);
    seat.stats.rebuys += 1;
    seat.stats.rebuyTotal = (seat.stats.rebuyTotal || 0) + S.settings.bankroll;
    Sound.chip(4);
    toast(`${esc(seat.name)} bought in for another ${money(S.settings.bankroll)}.`, { icon: 'plus', type: 'good' });
    renderSeat(seat);
    setBank(seat, false);
    updateChipTray();
    saveGame();
  }

  function cpuBets(seat) {
    const L = limits();
    if (seat.bankroll < L.min) rebuy(seat);
    const units = seat.style === 'cautious' ? pick([1, 1, 2]) : seat.style === 'bold' ? pick([2, 3, 4, 5, 8, 10]) : pick([1, 2, 2, 3]);
    const unit = L.chips[0];
    let amt = Math.min(L.max, L.min * units, seat.bankroll);
    amt = Math.floor(amt / unit) * unit;
    if (amt < L.min) return;
    const before = seat.bankroll;
    seat.bankroll = r2(seat.bankroll - amt);
    seat.bets.main = amt;
    if (rules().sideBets && seat.style === 'bold' && Math.random() < 0.4 && seat.bankroll >= L.chips[0]) {
      const sb = L.chips[0];
      const k = Math.random() < 0.5 ? 'pp' : 't3';
      seat.bankroll = r2(seat.bankroll - sb);
      seat.bets[k] = sb;
    }
    const d = seatDom.get(seat.id);
    if (d) flyAmount(before - seat.bankroll, d.plate, d.spots.main);
    renderSeat(seat);
  }

  function shake(el) {
    if (!el) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  async function startBetting() {
    S.phase = 'betting';
    S.pending = null;
    S.insuranceSeat = null;
    dom.table.classList.add('betting');
    clearActive();
    S.seats.forEach(s => { s.hands = []; s.insurance = 0; s.betLog = []; });
    const hs = humans();
    const cur = hs.find(s => s.id === S.sel.seat);
    if (!cur) S.sel.seat = hs.length ? hs[0].id : null;
    S.sel.spot = 'main';
    buildChipTray();
    renderSeats();
    if (S.sel.seat && dom.seats.classList.contains('scroll')) scrollSeatIntoView(seatDom.get(S.sel.seat).root);
    showPanel(hs.length ? 'bet' : 'wait', hs.length ? '' : 'Computer players only — dealing automatically');
    if (hs.length) {
      const sub = hs.length > 1 ? 'Tap a seat to bet for that player, then Deal' : 'Choose chips, then press Deal';
      banner('Place your bets', sub);
    } else banner('Place your bets');
    const round = S.round;
    for (const s of S.seats) {
      if (s.type !== 'cpu') continue;
      await wait(260);
      if (S.phase !== 'betting' || S.round !== round) return;
      cpuBets(s);
    }
    updateChipTray();
    if (!hs.length) {
      await wait(900);
      if (S.phase === 'betting' && S.round === round) deal();
    }
  }

  // ---------------------------------------------------------------------------
  // Round flow
  // ---------------------------------------------------------------------------
  async function deal() {
    if (S.phase !== 'betting') return;
    const L = limits();
    // Dealing with no chips down repeats each player's previous bets.
    if (humans().length && !humans().some(s => s.bets.main || s.bets.pp || s.bets.t3)) rebet(1);
    if (!S.seats.some(s => s.bets.main >= L.min)) { toast('Place a bet to start the hand.', { type: 'warn', icon: 'x' }); return; }
    for (const s of S.seats) {
      const any = s.bets.main || s.bets.pp || s.bets.t3;
      if (!any) continue;
      if (s.bets.main < L.min) {
        toast(`${esc(s.name)} ${verb(s.name, 'needs', 'need')} a main bet of at least ${money(L.min)}${s.bets.main ? '' : ' to play side bets'}.`, { type: 'warn', icon: 'x' });
        selectBettor(s, 'main');
        shake(seatDom.get(s.id).spots.main);
        return;
      }
    }
    const players = playOrder().filter(s => s.bets.main >= L.min);
    if (!players.length) return;

    S.phase = 'dealing';
    S.round += 1;
    dom.table.classList.remove('betting');
    hideBanner();
    showPanel('wait', '<span class="thinking"><i></i><i></i><i></i></span> Dealing');
    Sound.unlock();
    players.forEach(s => {
      s.lastBets = Object.assign({}, s.bets);
      s.betLog = [];
      s.hands = [newHand(s.bets.main)];
      s.insurance = 0;
      s.roundNet = 0;
      ensureHandEl(s, s.hands[0], 0);
      fitSeat(s);
    });
    S.seats.forEach(renderSeat);
    renderDock();
    S.dealer.cards = [];
    layoutHand(S.dealer, true);

    try {
      await playRound(players);
    } catch (err) {
      console.error(err);
      toast('Something went wrong with that hand, so it was voided and bets were returned.', { type: 'warn', icon: 'x', ms: 5000 });
      players.forEach(s => {
        s.bankroll = r2(s.bankroll + s.bets.main + s.bets.pp + s.bets.t3 + s.insurance);
        s.bets = { main: 0, pp: 0, t3: 0 };
        s.insurance = 0;
      });
      await collectCards();
      startBetting();
    }
  }

  async function playRound(players) {
    const pace = 230;
    for (let r = 0; r < 2; r++) {
      for (const s of players) await dealCard(s, s.hands[0], { pace, await: false });
      await dealCard('dealer', S.dealer, { faceUp: r === 0, pace, await: false });
    }
    await wait(350);
    players.forEach(s => updateHandMeta(s, s.hands[0]));
    updateDealerTotal();

    // Side bets settle straight after the deal.
    if (rules().sideBets && players.some(s => s.bets.pp || s.bets.t3)) await resolveSideBets(players);

    const up = S.dealer.cards[0];
    const upV = BJ.upValue(up);

    if (up.rank === 'A' && rules().insurance) await insurancePhase(players);

    if (upV === 10 || upV === 11) {
      S.phase = 'dealing';
      showPanel('wait', '<span class="thinking"><i></i><i></i><i></i></span> Dealer is checking');
      banner('Checking for Blackjack', 'Dealer peeks at the hole card');
      await peek();
      if (BJ.isNatural(S.dealer.cards)) {
        revealCard(S.dealer.cards[1]);
        S.phase = 'settling';
        updateDealerTotal();
        banner('Dealer has Blackjack', null, 'bad');
        Sound.lose();
        await wait(700);
        await settleInsurance(players, true);
        await settleAll(players);
        return endRound(players);
      }
      if (players.some(s => s.insurance > 0)) await settleInsurance(players, false);
      banner('No Blackjack', 'Play continues');
      await wait(500);
    }

    // Naturals are paid straight away.
    let anyNatural = false;
    for (const s of players) {
      const hd = s.hands[0];
      if (!hd.resolved && BJ.isNatural(hd.cards)) {
        anyNatural = true;
        hd.done = true;
        await payout(s, hd, BJ.settle(hd, S.dealer.cards, rules()));
      }
    }
    if (anyNatural) { Sound.blackjack(); await wait(500); }

    S.phase = 'playing';
    for (const s of players) {
      for (let i = 0; i < s.hands.length; i++) {
        await playHand(s, i);
      }
    }
    clearActive();
    await dealerTurn(players);
    await settleAll(players);
    await endRound(players);
  }

  async function peek() {
    const e = cardEls.get(S.dealer.cards[1].id);
    if (!e) return;
    await e.animate([
      { transform: 'none' },
      { transform: 'translateY(-10%) rotate(-4deg)', offset: 0.35 },
      { transform: 'translateY(-10%) rotate(-4deg)', offset: 0.65 },
      { transform: 'none' },
    ], { duration: dur(900), easing: 'ease-in-out' }).finished.catch(() => {});
  }

  async function resolveSideBets(players) {
    const up = S.dealer.cards[0];
    const jobs = [];
    let anyWin = false;
    for (const s of players) {
      const d = seatDom.get(s.id);
      const [c1, c2] = s.hands[0].cards;
      const check = (spot, res, label) => {
        const amt = s.bets[spot];
        if (!amt) return;
        const spotEl = d.spots[spot];
        const badge = h('div', 'result-badge side' + (res ? '' : ' lost'), res ? `${esc(res.name)} ${res.pays}:1` : label + ' — no win');
        spotEl.appendChild(badge);
        setTimeout(() => badge.remove(), dur(2600));
        if (res) {
          const win = amt * res.pays;
          anyWin = true;
          s.stats.sideNet += win;
          s.roundNet = r2((s.roundNet || 0) + win);
          jobs.push((async () => {
            await flyAmount(win, dom.rack, spotEl);
            s.bankroll = r2(s.bankroll + win + amt);
            s.bets[spot] = 0;
            holdBank(s, true);
            renderSeat(s);
            await flyAmount(win + amt, spotEl, d.plate, { delay: 100 });
            holdBank(s, false);
            setBank(s, true);
            showDelta(s, win);
          })());
          if (res.pays >= 12) sparkle(spotEl, 22);
          toast(`${esc(s.name)} ${verb(s.name, 'hits', 'hit')} ${esc(res.name)} — ${res.pays} to 1!`, { icon: 'check', type: 'good' });
        } else {
          s.stats.sideNet -= amt;
          s.roundNet = r2((s.roundNet || 0) - amt);
          jobs.push((async () => {
            await wait(500);
            const fly = flyAmount(amt, spotEl, dom.rack);
            s.bets[spot] = 0;
            renderSeat(s);
            await fly;
          })());
        }
      };
      check('pp', BJ.perfectPairs(c1, c2), 'Perfect Pairs');
      check('t3', BJ.twentyOnePlusThree(c1, c2, up), '21+3');
    }
    if (jobs.length) {
      await Promise.all(jobs);
      if (anyWin) Sound.win();
      renderDock();
      await wait(300);
    }
  }

  async function insurancePhase(players) {
    S.phase = 'insurance';
    banner('Insurance?', 'The dealer shows an Ace');
    for (const s of players) {
      const hd = s.hands[0];
      const cost = r2(hd.bet / 2);
      const natural = BJ.isNatural(hd.cards);
      if (!natural && s.bankroll < cost) continue;
      let take;
      if (s.type === 'human') {
        take = await askInsurance(s, cost, natural);
      } else {
        const d = seatDom.get(s.id);
        d.root.classList.add('thinking');
        await wait(500);
        d.root.classList.remove('thinking');
        take = s.skill === 'casual' ? Math.random() < 0.3 : S.count / S.shoe.decksRemaining >= 3;
      }
      const d = seatDom.get(s.id);
      if (take && natural) {
        // Even money: paid 1 to 1 now, whatever the dealer has.
        hd.resolved = true;
        hd.done = true;
        await payout(s, hd, { result: 'even', returned: hd.bet * 2 });
      } else if (take) {
        s.bankroll = r2(s.bankroll - cost);
        s.insurance = cost;
        s.stats.wagered += cost;
        renderSeat(s);
        flyAmount(cost, d.plate, d.ins);
        setBank(s, true);
      }
    }
    S.insuranceSeat = null;
    showPanel('wait', '');
  }

  function askInsurance(seat, cost, natural) {
    return new Promise(resolve => {
      S.insuranceSeat = seat;
      setActive(seat, 0);
      $('#insTitle').textContent = natural ? `${seat.name}: take even money?` : `${seat.name}: insurance?`;
      $('#insSub').textContent = natural
        ? `Get paid 1 to 1 now (${money(seat.hands[0].bet, { plus: true })}) instead of risking a push`
        : `Costs ${money(cost)} · pays 2 to 1 if the dealer has Blackjack`;
      $('#insYesLabel').textContent = natural ? 'Even money' : 'Insure';
      showPanel('insurance');
      renderDock();
      if (rules().autoHints || rules().coach) {
        // Basic strategy never takes insurance.
        $('#btnInsNo').classList.toggle('suggest', !!rules().autoHints);
      }
      S.insurancePending = v => {
        S.insurancePending = null;
        $('#btnInsNo').classList.remove('suggest');
        clearActive();
        if (seat.type === 'human') {
          seat.stats.decisions += 1;
          if (!v) seat.stats.correct += 1;
          else if (rules().coach) toast('Basic strategy never takes insurance — it only pays when the count is high.', { type: 'coach' });
        }
        resolve(v);
      };
    });
  }

  async function settleInsurance(players, dealerBJ) {
    const jobs = [];
    for (const s of players) {
      if (!s.insurance) continue;
      const d = seatDom.get(s.id);
      const amt = s.insurance;
      if (dealerBJ) {
        const win = amt * 2;
        s.roundNet = r2((s.roundNet || 0) + win);
        jobs.push((async () => {
          await flyAmount(win, dom.rack, d.ins);
          const fly = flyAmount(amt + win, d.ins, d.plate);
          s.bankroll = r2(s.bankroll + amt + win);
          s.insurance = 0;
          s.stats.net += win;
          holdBank(s, true);
          renderSeat(s);
          await fly;
          holdBank(s, false);
          setBank(s, true);
          showDelta(s, win);
        })());
        toast(`${esc(possessive(s.name))} insurance pays ${money(win)}.`, { icon: 'shield', type: 'good' });
      } else {
        s.roundNet = r2((s.roundNet || 0) - amt);
        jobs.push((async () => {
          const fly = flyAmount(amt, d.ins, dom.rack);
          s.insurance = 0;
          s.stats.net -= amt;
          renderSeat(s);
          await fly;
        })());
      }
    }
    await Promise.all(jobs);
  }

  function availableActions(seat, hand) {
    const r = rules();
    const acts = new Set(['S']);
    const two = hand.cards.length === 2;
    const noHit = hand.splitAces && !r.hitSplitAces;
    if (!noHit) acts.add('H');
    const v = BJ.evaluate(hand.cards);
    const doubleOk = r.doubleOn === 'any' ||
      (r.doubleOn === '9-11' && !v.soft && v.total >= 9 && v.total <= 11) ||
      (r.doubleOn === '10-11' && !v.soft && v.total >= 10 && v.total <= 11);
    if (two && !noHit && doubleOk && seat.bankroll >= hand.bet && (!hand.fromSplit || r.das)) acts.add('D');
    if (two && BJ.isPair(hand.cards) && seat.hands.length < r.maxHands && seat.bankroll >= hand.bet &&
        (!hand.splitAces || r.resplitAces)) acts.add('P');
    if (two && r.surrender && !hand.fromSplit && seat.hands.length === 1) acts.add('R');
    return acts;
  }

  function bestAction(seat, hand, acts) {
    let a = BJ.basicStrategy(hand.cards, S.dealer.cards[0], rules(), {
      canDouble: acts.has('D'), canSplit: acts.has('P'), canSurrender: acts.has('R'),
    });
    if (!acts.has(a)) a = acts.has('H') && a !== 'S' ? 'H' : 'S';
    return a;
  }

  async function playHand(seat, hi) {
    const hand = seat.hands[hi];
    if (hand.resolved || hand.done) return;
    setActive(seat, hi);
    if (hand.cards.length === 1) {
      await wait(150);
      await dealCard(seat, hand);
    }
    for (;;) {
      const v = BJ.evaluate(hand.cards);
      if (v.total >= 21) break;
      const acts = availableActions(seat, hand);
      if (!acts.has('H') && !acts.has('P')) break; // split aces get one card
      const best = bestAction(seat, hand, acts);
      const action = seat.type === 'human'
        ? await askAction(seat, hand, acts, best)
        : await cpuAction(seat, hand, acts, best);
      if (seat.type === 'human') recordDecision(seat, hand, action, best);

      if (action === 'S') break;
      if (action === 'H') { await dealCard(seat, hand); continue; }
      if (action === 'D') {
        const d = seatDom.get(seat.id);
        seat.bankroll = r2(seat.bankroll - hand.bet);
        seat.bets.main += hand.bet;
        flyAmount(hand.bet, d.plate, d.spots.main);
        hand.bet *= 2;
        hand.doubled = true;
        renderSeat(seat);
        renderDock();
        await wait(250);
        await dealCard(seat, hand, { doubled: true });
        break;
      }
      if (action === 'R') {
        hand.surrendered = true;
        break;
      }
      if (action === 'P') { await split(seat, hi); setActive(seat, hi); continue; }
    }
    hand.done = true;
    updateHandMeta(seat, hand);
    const v = BJ.evaluate(hand.cards);
    if (v.bust) {
      Sound.bust();
      await payout(seat, hand, { result: 'bust', returned: 0 });
      await wait(250);
    } else if (hand.surrendered) {
      await payout(seat, hand, { result: 'surrender', returned: r2(hand.bet / 2) });
    } else {
      await wait(180);
    }
  }

  async function split(seat, hi) {
    const hand = seat.hands[hi];
    const d = seatDom.get(seat.id);
    seat.bankroll = r2(seat.bankroll - hand.bet);
    seat.bets.main += hand.bet;
    flyAmount(hand.bet, d.plate, d.spots.main);
    const snap = snapshot();
    const moved = hand.cards.pop();
    const nh = newHand(hand.bet);
    nh.cards = [moved];
    nh.fromSplit = true;
    hand.fromSplit = true;
    if (moved.rank === 'A') { hand.splitAces = true; nh.splitAces = true; }
    seat.hands.splice(hi + 1, 0, nh);
    seat.hands.forEach((hd, i) => ensureHandEl(seat, hd, i));
    const ne = handEls.get(nh.id);
    $('.hand-cards', ne).appendChild(cardEls.get(moved.id));
    layoutHand(hand, false);
    layoutHand(nh, false);
    fitSeat(seat);
    flipFrom(snap, 380);
    seat.hands.forEach(hd => updateHandMeta(seat, hd));
    renderSeat(seat);
    renderDock();
    Sound.card();
    await wait(420);
    await dealCard(seat, hand);
  }

  function askAction(seat, hand, acts, best) {
    return new Promise(resolve => {
      S.pending = { seat, hand, acts, best, resolve };
      $$('#panelPlay [data-action]').forEach(b => {
        b.disabled = !acts.has(b.dataset.action);
        b.classList.remove('suggest', 'pressed');
      });
      $('#btnHint').hidden = !rules().hintsEnabled;
      showPanel('play');
      if (rules().autoHints) showHint(true);
      const up = S.dealer.cards[0];
      const multi = S.seats.filter(s => s.hands.length).length > 1 || seat.hands.length > 1;
      const handNo = `hand ${seat.hands.indexOf(hand) + 1} of ${seat.hands.length}`;
      const who = seat.hands.length > 1 ? (seat.name === 'You' ? 'Your ' + handNo : `${seat.name} · ${handNo}`) : `${possessive(seat.name)} turn`;
      banner(multi || humans().length > 1 ? who : 'Your move', `${cap(BJ.describeHand(hand.cards))} against ${upName(up)}`);
      renderDock();
    });
  }
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const verb = (name, third, base) => (name === 'You' ? base : third);
  const possessive = name => (name === 'You' ? 'Your' : name + (/s$/i.test(name) ? '\u2019' : '\u2019s'));

  function act(a) {
    const p = S.pending;
    if (!p || !p.acts.has(a)) return;
    S.pending = null;
    const b = $(`#panelPlay [data-action="${a}"]`);
    if (b) { b.classList.add('pressed'); setTimeout(() => b.classList.remove('pressed'), 140); }
    Sound.click();
    buzz(10);
    $$('#panelPlay [data-action]').forEach(x => { x.disabled = true; x.classList.remove('suggest'); });
    showPanel('wait', '');
    p.resolve(a);
  }

  function showHint(silent) {
    const p = S.pending;
    if (!p) return;
    $$('#panelPlay [data-action]').forEach(b => b.classList.toggle('suggest', b.dataset.action === p.best));
    if (!silent) {
      const up = S.dealer.cards[0];
      toast(`Basic strategy: <b>${BJ.ACTION_NAMES[p.best]}</b> with ${esc(BJ.describeHand(p.hand.cards))} against ${upName(up)}.`, { icon: 'bulb' });
    }
  }

  function recordDecision(seat, hand, action, best) {
    seat.stats.decisions += 1;
    if (action === best) { seat.stats.correct += 1; return; }
    if (rules().coach) {
      const up = S.dealer.cards[0];
      toast(`Basic strategy would <b>${BJ.ACTION_NAMES[best]}</b> here (${esc(BJ.describeHand(hand.cards))} vs ${upName(up)}).`, { type: 'coach', icon: 'bulb', ms: 4200 });
    }
  }

  async function cpuAction(seat, hand, acts, best) {
    const d = seatDom.get(seat.id);
    d.root.classList.add('thinking');
    showPanel('wait', `<span class="thinking"><i></i><i></i><i></i></span> ${esc(seat.name)} is thinking`);
    banner(`${possessive(seat.name)} turn`, `${cap(BJ.describeHand(hand.cards))} against ${upName(S.dealer.cards[0])}`);
    await wait(420 + Math.random() * 450);
    d.root.classList.remove('thinking');
    let a = best;
    if (seat.skill === 'casual' && Math.random() < 0.3) {
      const v = BJ.evaluate(hand.cards);
      if (a === 'D') a = 'H';
      else if (a === 'P' && hand.cards[0].rank !== 'A' && hand.cards[0].rank !== '8') a = v.total >= 12 ? 'S' : 'H';
      else if (a === 'R') a = 'H';
      else if (a === 'H' && !v.soft && v.total >= 12) a = 'S';
      else if (a === 'S' && v.total <= 16 && !v.soft) a = 'H';
      if (!acts.has(a)) a = best;
    }
    return a;
  }

  async function dealerTurn(players) {
    S.phase = 'dealer';
    showPanel('wait', '<span class="thinking"><i></i><i></i><i></i></span> Dealer’s turn');
    banner('Dealer’s turn');
    const hole = S.dealer.cards[1];
    revealCard(hole);
    updateDealerTotal();
    await wait(650);
    const live = players.some(s => s.hands.some(hd => !hd.resolved));
    if (live) {
      while (BJ.dealerShouldHit(S.dealer.cards, rules())) {
        await dealCard('dealer', S.dealer, { pace: 200 });
        updateDealerTotal();
        await wait(380);
      }
    }
    S.phase = 'settling';
    updateDealerTotal();
    const v = BJ.evaluate(S.dealer.cards);
    if (!live) banner('Dealer reveals ' + v.total);
    else if (v.bust) { banner('Dealer busts', `with ${v.total}`, 'good'); }
    else banner(`Dealer stands on ${v.total}`);
    await wait(500);
  }

  async function settleAll(players) {
    S.phase = 'settling';
    const jobs = [];
    let i = 0;
    for (const s of players) {
      for (const hd of s.hands) {
        if (hd.resolved) continue;
        const res = BJ.settle(hd, S.dealer.cards, rules());
        jobs.push((async (delay) => { await wait(delay); await payout(s, hd, res); })(i * 160));
        i++;
      }
    }
    await Promise.all(jobs);
  }

  const RESULT_TEXT = { win: 'Win', blackjack: 'Blackjack', push: 'Push', lose: 'Lose', bust: 'Bust', surrender: 'Surrender', even: 'Even money' };

  async function payout(seat, hand, res) {
    hand.resolved = true;
    hand.result = res.result;
    const d = seatDom.get(seat.id);
    const e = handEls.get(hand.id);
    const net = r2(res.returned - hand.bet);
    const st = seat.stats;
    st.hands += 1;
    st.wagered += hand.bet;
    st.net = r2(st.net + net);
    seat.roundNet = r2((seat.roundNet || 0) + net);
    if (net > 0) { st.wins += 1; st.streak = Math.max(1, st.streak + 1); st.bestStreak = Math.max(st.bestStreak, st.streak); st.biggestWin = Math.max(st.biggestWin, net); }
    else if (net < 0) { st.losses += 1; st.streak = 0; }
    else st.pushes += 1;
    if (res.result === 'blackjack') st.blackjacks += 1;
    if (res.result === 'bust') st.busts += 1;
    if (res.result === 'surrender') st.surrenders += 1;

    const cls = res.result === 'even' ? 'win' : res.result;
    resultBadge(e, cls, RESULT_TEXT[res.result], net);
    if (res.result === 'blackjack') { sparkle(e && $('.hand-cards', e)); if (seat.type === 'human') buzz([20, 40, 20]); }
    if (seat.type === 'human' || humans().length === 0) {
      if (res.result === 'win' || res.result === 'even') Sound.win();
      else if (res.result === 'push') Sound.push();
      else if (res.result === 'lose') Sound.lose();
    }

    const winnings = r2(res.returned - hand.bet);
    if (winnings > 0) await flyAmount(winnings, dom.rack, d.spots.main);
    const lostPart = r2(hand.bet - Math.min(res.returned, hand.bet));
    if (lostPart > 0) flyAmount(lostPart, d.spots.main, dom.rack);
    seat.bets.main = r2(seat.bets.main - hand.bet);
    if (seat.bets.main < 0.005) seat.bets.main = 0;
    seat.bankroll = r2(seat.bankroll + res.returned);
    const stackEl = $('.chipstack', d.spots.main);
    const fly = res.returned > 0 ? flyAmount(res.returned, stackEl, d.plate, { delay: winnings > 0 ? 60 : 0 }) : wait(300);
    holdBank(seat, true);
    renderSeat(seat);
    await fly;
    holdBank(seat, false);
    setBank(seat, true);
    if (net) showDelta(seat, net);
    renderDock();
  }

  async function endRound(players) {
    S.phase = 'settling';
    clearActive();
    // Summary banner.
    const hs = players.filter(s => s.type === 'human');
    players.forEach(s => {
      s.stats.history.push(r2(s.bankroll));
      if (s.stats.history.length > 400) s.stats.history.splice(1, 1);
    });
    const roundNet = s => s.roundNet || 0;
    if (hs.length === 1) {
      const n = roundNet(hs[0]);
      const who = hs[0].name === 'You' ? 'You' : hs[0].name;
      if (n > 0) banner(`${who} ${who === 'You' ? 'win' : 'wins'} ${money(n)}`, null, 'good');
      else if (n < 0) banner(`${who} ${who === 'You' ? 'lose' : 'loses'} ${money(-n)}`, null, 'bad');
      else banner('Push', 'Your bet comes back');
    } else if (hs.length > 1 || players.length > 1) {
      const parts = players.map(s => `${s.name} ${money(roundNet(s), { plus: true })}`);
      banner('Hand complete', parts.join(' · '));
    }
    saveGame();
    showPanel('wait', `<button class="ctl lit" id="btnNext" style="flex-direction:row;gap:8px;height:44px;padding:0 18px">${icon('play')}<span>Next hand</span></button>`);
    const next = $('#btnNext');
    await new Promise(resolve => {
      const t = setTimeout(done, dur(humans().length ? 2600 : 1600));
      function done() { clearTimeout(t); S.skip = null; resolve(); }
      S.skip = done;
      if (next) next.addEventListener('click', done);
    });
    showPanel('wait', '');
    await collectCards();
    if (S.shoe.needsShuffle) await shuffleShoe(false);
    S.seats.forEach(renderSeat);
    startBetting();
  }

  async function collectCards() {
    hideBanner();
    const target = center(dom.discard.getBoundingClientRect());
    const all = [];
    S.seats.forEach(s => s.hands.forEach(hd => all.push(...hd.cards)));
    all.push(...S.dealer.cards);
    $$('.result-badge', dom.table).forEach(b => b.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur(200), fill: 'forwards' }));
    const anims = [];
    all.forEach((c, i) => {
      const e = cardEls.get(c.id);
      if (!e || !e.isConnected) return;
      const r = center(e.getBoundingClientRect());
      e.classList.add('face-down');
      anims.push(e.animate([
        { transform: 'none', opacity: 1 },
        { transform: `translate(${target.x - r.x}px, ${target.y - r.y}px) rotate(${-10 + Math.random() * 20}deg) scale(.55)`, opacity: 0.0 },
      ], { duration: dur(480), delay: dur(i * 22), easing: 'cubic-bezier(.5,0,.4,1)', fill: 'forwards' }).finished.catch(() => {}));
    });
    if (all.length) Sound.card();
    await Promise.all(anims);
    S.shoe.discards.push(...all);
    all.forEach(c => { const e = cardEls.get(c.id); if (e) e.remove(); cardEls.delete(c.id); });
    S.seats.forEach(s => {
      s.hands = [];
      const d = seatDom.get(s.id);
      if (d) { d.hands.innerHTML = ''; d.root.style.setProperty('--scw', S.cw + 'px'); }
    });
    handEls.clear();
    S.dealer.cards = [];
    dom.dealerCards.innerHTML = '';
    layoutHand(S.dealer, true);
    dom.dealerTotal.hidden = true;
    renderDiscard();
    updateShoe();
  }

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------
  function layout() {
    const t = dom.table.getBoundingClientRect();
    const n = Math.max(1, S.seats.length);
    const narrow = window.innerWidth < 720;
    const W = t.width - (narrow ? 20 : 32);
    const H = t.height;
    // Short screens (phones held sideways) drop the rack and float the banner.
    const compact = H < 440 && !narrow;
    document.body.classList.toggle('compact', compact);
    const gap = narrow ? 10 : 18;
    const fixed = compact ? 100 : narrow ? 205 : 235;
    const byH = (H - fixed) / 3.95;
    let seatW = (W - (n - 1) * gap) / n;
    const byW = seatW / (narrow ? 2.05 : 2.3);
    let cw = Math.min(compact ? (H - fixed) / 3.4 : byH, byW, 116);
    const minCw = compact ? 44 : narrow ? 50 : 60;
    let scroll = false;
    if (cw < minCw) {
      if (byH > minCw && byW < minCw) {
        scroll = true;
        cw = Math.min(byH, narrow ? 80 : 84);
        seatW = cw * (narrow ? 2.15 : 2.4);
      } else cw = Math.max(cw, 38);
    }
    if (!scroll) seatW = Math.min(seatW, cw * 3.4);
    cw = Math.floor(cw);
    // The dealer's cards can be larger than the players' when there is room.
    const dcw = Math.floor(clamp((H - fixed - (compact ? 2.1 : 2.35) * cw) / (compact ? 1.4 : 1.6), cw, Math.min(116, W / 3.3)));
    S.cw = cw;
    S.dcw = dcw;
    S.dealerMaxW = W - 2 * (Math.max(dcw * 0.7, 60) + 12);
    S.seatW = seatW;
    document.documentElement.style.setProperty('--cw', cw + 'px');
    document.documentElement.style.setProperty('--dcw', dcw + 'px');
    layoutHand(S.dealer, true);
    dom.seats.style.setProperty('--seat-w', seatW + 'px');
    dom.seats.style.setProperty('--seat-gap', gap + 'px');
    dom.seats.classList.toggle('scroll', scroll);
    const kids = Array.from(dom.seats.children);
    const arcH = scroll || compact || n < 3 ? 0 : Math.min(54, H * 0.07);
    kids.forEach((k, i) => {
      const tt = n > 1 ? (i / (n - 1)) * 2 - 1 : 0;
      k.style.setProperty('--arc', (-tt * tt * arcH).toFixed(1) + 'px');
    });
    S.seats.forEach(fitSeat);
    positionPrint();
  }

  // Fit the printed felt arc into the band between the banner and the
  // players' cards so it never sits underneath them.
  function positionPrint() {
    const fp = $('.felt-print');
    const tr = dom.table.getBoundingClientRect();
    const banner = $('.banner-wrap').getBoundingClientRect();
    let cardsTop = -Infinity;
    Array.from(dom.seats.children).forEach(se => {
      const hr = $('.seat-hands', se).getBoundingClientRect();
      const scw = parseFloat(se.style.getPropertyValue('--scw')) || S.cw;
      cardsTop = Math.max(cardsTop, hr.bottom - 31 - scw * 1.4);
    });
    if (!isFinite(cardsTop)) cardsTop = tr.bottom - S.cw * 3;
    const bottom = cardsTop - tr.top + S.cw * 0.45;
    const room = bottom - (banner.bottom - tr.top + 4);
    // The tops of the centre letters sit about 45% of the way down the print.
    const ratio = 0.184;
    const w = Math.min(980, tr.width * 0.9, room / (0.56 * ratio));
    fp.hidden = w < (window.innerWidth < 720 ? 300 : 420) || document.body.classList.contains('compact');
    fp.style.width = w + 'px';
    fp.style.top = (bottom - w * ratio) + 'px';
  }

  let layoutRaf = 0;
  function scheduleLayout() {
    cancelAnimationFrame(layoutRaf);
    layoutRaf = requestAnimationFrame(layout);
  }

  // ---------------------------------------------------------------------------
  // Table dressing
  // ---------------------------------------------------------------------------
  function applyAppearance() {
    const st = S.settings;
    document.body.dataset.felt = st.felt;
    document.body.dataset.back = st.back;
    document.body.classList.toggle('four-color', !!st.fourColor);
    document.documentElement.style.setProperty('--speed', String(F()));
    Sound.enabled = st.sound;
    Sound.volume = st.volume;
    const btn = $('#btnSound');
    btn.innerHTML = `<svg><use href="#i-${st.sound ? 'sound' : 'mute'}"/></svg>`;
    btn.classList.toggle('off', !st.sound);
    $('#fpPayout').textContent = 'BLACKJACK PAYS ' + (st.bjPayout === 1.2 ? '6 TO 5' : '3 TO 2');
    $('#fpInsurance').textContent = st.insurance ? 'INSURANCE PAYS 2 TO 1' : 'NO INSURANCE';
    $('#fpDealer').textContent = st.h17 ? 'Dealer must hit soft 17' : 'Dealer must stand on all 17s';
    const L = limits();
    $('#tableInfo').textContent = `${L.label} · ${st.decks} deck${st.decks > 1 ? 's' : ''} · ${st.h17 ? 'H17' : 'S17'} · ${st.bjPayout === 1.2 ? '6:5' : '3:2'}`;
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.content = getComputedStyle(document.body).getPropertyValue('--felt-3').trim() || '#0b2a1d';
    updateCount();
  }

  // ---------------------------------------------------------------------------
  // Lobby
  // ---------------------------------------------------------------------------
  let draft = null;

  function openLobby(first) {
    if (!first && S.phase !== 'betting' && S.phase !== 'idle') {
      toast('Finish the current hand before changing seats.', { type: 'warn', icon: 'x' });
      return;
    }
    const saved = first ? loadGame() : null;
    const source = S.seats.length ? S.seats : saved && saved.seats && saved.seats.length ? saved.seats : null;
    draft = {
      seats: source ? source.map(s => ({ id: s.id, name: s.name, type: s.type, skill: s.skill, style: s.style, color: s.color, bankroll: s.bankroll, existing: true }))
        : [{ id: uid('s'), name: 'You', type: 'human', skill: 'pro', color: AVATAR_COLORS[0] }],
      bankroll: S.settings.bankroll,
      limits: S.settings.limits,
      resume: !!source,
      saved,
    };
    renderLobby();
    dom.lobby.hidden = false;
    setTimeout(() => { const i = $('#seatList input'); if (i && !source) i.select(); }, 60);
  }

  function nextColor() {
    const used = new Set(draft.seats.map(s => s.color));
    return AVATAR_COLORS.find(c => !used.has(c)) || pick(AVATAR_COLORS);
  }

  function renderLobby() {
    const hero = $('#lobbyHero');
    if (!hero.childElementCount) {
      [['A', 'S', -14, -46], ['K', 'H', 12, 14]].forEach(([r, s, rot, x]) => {
        const c = staticCard(r, s);
        c.style.transform = `translateX(calc(-50% + ${x}px)) rotate(${rot}deg)`;
        hero.appendChild(c);
      });
    }
    const list = $('#seatList');
    list.innerHTML = '';
    draft.seats.forEach((s, i) => {
      const li = h('li', 'seat-row' + (s.fresh ? ' fresh' : ''));
      s.fresh = false;
      const kind = s.type === 'human' ? 'human' : s.skill === 'casual' ? 'casual' : 'pro';
      li.innerHTML = `
        <div class="avatar" style="--avatar:${s.color}">${esc(initials(s.name))}</div>
        <input type="text" maxlength="14" value="${esc(s.name)}" aria-label="Seat ${i + 1} name" spellcheck="false">
        <div class="seg small" role="radiogroup" aria-label="Seat ${i + 1} player type">
          <button data-k="human" class="${kind === 'human' ? 'on' : ''}">${icon('person')}Human</button>
          <button data-k="pro" class="${kind === 'pro' ? 'on' : ''}" title="Plays perfect basic strategy">${icon('cpu')}Pro bot</button>
          <button data-k="casual" class="${kind === 'casual' ? 'on' : ''}" title="Makes the odd mistake">${icon('cpu')}Casual bot</button>
        </div>
        <button class="remove-btn" aria-label="Remove seat ${i + 1}" ${draft.seats.length < 2 ? 'disabled' : ''}>${icon('x')}</button>`;
      const input = $('input', li);
      input.addEventListener('input', () => {
        s.name = input.value.slice(0, 14);
        $('.avatar', li).textContent = initials(s.name || '?');
      });
      $$('.seg button', li).forEach(b => b.addEventListener('click', () => {
        const k = b.dataset.k;
        const wasHuman = s.type === 'human';
        s.type = k === 'human' ? 'human' : 'cpu';
        s.skill = k === 'casual' ? 'casual' : 'pro';
        if (wasHuman && s.type === 'cpu' && /^(You|Player \d)$/.test(s.name)) s.name = nextCpuName();
        if (!wasHuman && s.type === 'human' && CPU_NAMES.includes(s.name)) s.name = 'Player ' + (i + 1);
        renderLobby();
      }));
      $('.remove-btn', li).addEventListener('click', () => { draft.seats.splice(i, 1); renderLobby(); });
      list.appendChild(li);
    });
    $('#seatCount').textContent = `${draft.seats.length} of ${MAX_SEATS} seats · first seat is dealt first, on the right`;
    $('#addHuman').disabled = draft.seats.length >= MAX_SEATS;
    $('#addCpu').disabled = draft.seats.length >= MAX_SEATS;

    const seg = (el, items, cur, onPick) => {
      el.innerHTML = '';
      items.forEach(([v, label]) => {
        const b = h('button', String(v) === String(cur) ? 'on' : '', label);
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(v) === String(cur));
        b.addEventListener('click', () => { onPick(v); renderLobby(); });
        el.appendChild(b);
      });
    };
    seg($('#segBankroll'), BANKROLLS.map(b => [b, money(b)]), draft.bankroll, v => { draft.bankroll = v; });
    seg($('#segLimits'), Object.entries(LIMITS).map(([k, L]) => [k, `${money(L.min)}–${L.max >= 1000 ? L.max / 1000 + 'K' : L.max}`]), draft.limits, v => { draft.limits = v; });

    const resuming = draft.resume;
    $('#lobbyNew').hidden = !resuming;
    $('#lobbyStartLabel').textContent = resuming ? (S.seats.length ? 'Back to the table' : 'Continue game') : 'Take a seat';
    const note = $('#lobbyNote');
    if (resuming) note.textContent = 'Returning players keep their chips. New seats start with ' + money(draft.bankroll) + '.';
    else note.textContent = 'Everyone starts with ' + money(draft.bankroll) + '. Your progress is saved on this device.';
  }

  function nextCpuName() {
    const used = new Set(draft.seats.map(s => s.name));
    return CPU_NAMES.find(n => !used.has(n)) || 'Bot';
  }

  function addDraftSeat(type) {
    if (draft.seats.length >= MAX_SEATS) return;
    const n = draft.seats.length + 1;
    draft.seats.push({
      fresh: true,
      id: uid('s'),
      name: type === 'human' ? 'Player ' + n : nextCpuName(),
      type, skill: 'pro', style: CPU_STYLES[n % 3], color: nextColor(),
    });
    renderLobby();
    if (type === 'human') setTimeout(() => { const ins = $$('#seatList input'); ins[ins.length - 1].select(); }, 30);
  }

  function startFromLobby(fresh) {
    const limitsChanged = S.settings.limits !== draft.limits;
    S.settings.limits = draft.limits;
    S.settings.bankroll = draft.bankroll;
    saveSettings();
    const live = new Map(S.seats.map(s => [s.id, s]));
    const saved = new Map(((draft.saved && draft.saved.seats) || []).map(s => [s.id, s]));
    S.seats.forEach(s => clearBets(s, true));
    S.seats = draft.seats.map((d, i) => {
      const name = (d.name || '').trim() || (d.type === 'human' ? 'Player ' + (i + 1) : nextCpuName());
      const ex = !fresh && (live.get(d.id) || (saved.get(d.id) && newSeat(saved.get(d.id))));
      if (ex) {
        Object.assign(ex, { name, type: d.type, skill: d.skill, color: d.color });
        return ex;
      }
      return newSeat({ id: d.id, name, type: d.type, skill: d.skill, style: d.style, color: d.color, bankroll: draft.bankroll });
    });
    if (fresh) S.round = 0;
    else if (draft.saved && !S.round) S.round = draft.saved.round || 0;
    dom.lobby.hidden = true;
    Sound.unlock();
    applyAppearance();
    buildSeats();
    layout();
    const needShoe = !S.shoe || fresh;
    saveGame();
    if (needShoe) {
      S.phase = 'idle';
      showPanel('wait', '');
      shuffleShoe(true).then(startBetting);
    } else {
      if (limitsChanged) toast('New table limits: ' + limits().label, { icon: 'check' });
      startBetting();
    }
  }

  // ---------------------------------------------------------------------------
  // Sheets: settings, stats, help
  // ---------------------------------------------------------------------------
  let sheetState = null;

  function openSheet(kind, tab) {
    const defs = {
      settings: { title: 'Settings', tabs: [['rules', 'Table rules'], ['play', 'Gameplay'], ['look', 'Appearance']] },
      stats: { title: 'Statistics', tabs: [] },
      help: { title: 'Guide', tabs: [['how', 'How to play'], ['chart', 'Strategy chart'], ['pay', 'Payouts'], ['keys', 'Shortcuts']] },
    };
    const def = defs[kind];
    sheetState = { kind, tab: tab || (def.tabs[0] && def.tabs[0][0]) };
    $('#sheetTitle').textContent = def.title;
    const tabs = $('#sheetTabs');
    tabs.innerHTML = '';
    def.tabs.forEach(([k, label]) => {
      const b = h('button', k === sheetState.tab ? 'on' : '', label);
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => { sheetState.tab = k; $$('button', tabs).forEach(x => x.classList.toggle('on', x === b)); renderSheet(); });
      tabs.appendChild(b);
    });
    renderSheet();
    dom.sheet.hidden = false;
  }

  function closeSheet() { dom.sheet.hidden = true; sheetState = null; }

  function renderSheet() {
    const body = $('#sheetBody');
    body.scrollTop = 0;
    const { kind, tab } = sheetState;
    if (kind === 'settings') renderSettings(body, tab);
    else if (kind === 'stats') renderStats(body);
    else renderHelp(body, tab);
  }

  const RULE_FIELDS = [
    { key: 'decks', label: 'Decks in the shoe', desc: 'More decks make counting harder and slightly favour the house.', type: 'seg', options: [[1, '1'], [2, '2'], [4, '4'], [6, '6'], [8, '8']] },
    { key: 'h17', label: 'Dealer soft 17', desc: 'Whether the dealer draws on a soft 17 such as Ace–6.', type: 'seg', options: [[false, 'Stands'], [true, 'Hits']] },
    { key: 'bjPayout', label: 'Blackjack pays', desc: '3 to 2 is the classic payout. 6 to 5 costs the player about 1.4%.', type: 'seg', options: [[1.5, '3 to 2'], [1.2, '6 to 5']] },
    { key: 'doubleOn', label: 'Double down on', type: 'seg', options: [['any', 'Any two cards'], ['9-11', 'Hard 9–11'], ['10-11', 'Hard 10–11']] },
    { key: 'das', label: 'Double after split', desc: 'Allow doubling on hands created by splitting.', type: 'switch' },
    { key: 'maxHands', label: 'Split up to', type: 'seg', options: [[2, '2 hands'], [3, '3 hands'], [4, '4 hands']] },
    { key: 'resplitAces', label: 'Re-split aces', type: 'switch' },
    { key: 'hitSplitAces', label: 'Hit split aces', desc: 'Usually split aces receive one card each.', type: 'switch' },
    { key: 'surrender', label: 'Late surrender', desc: 'Give up half your bet after the dealer checks for Blackjack.', type: 'switch' },
    { key: 'insurance', label: 'Insurance & even money', type: 'switch' },
    { key: 'sideBets', label: 'Side bets', desc: 'Perfect Pairs and 21+3 spots beside each main bet.', type: 'switch' },
    { key: 'penetration', label: 'Cut card', desc: 'How far into the shoe the cut card sits.', type: 'seg', options: [[0.6, '60%'], [0.75, '75%'], [0.85, '85%']] },
  ];
  const PLAY_FIELDS = [
    { key: 'speed', label: 'Dealing speed', type: 'seg', options: [['relaxed', 'Relaxed'], ['normal', 'Normal'], ['fast', 'Fast'], ['turbo', 'Turbo']] },
    { key: 'hintsEnabled', label: 'Hint button', desc: 'Show a button that reveals the basic-strategy play.', type: 'switch' },
    { key: 'autoHints', label: 'Always highlight the best play', type: 'switch' },
    { key: 'coach', label: 'Strategy coach', desc: 'Tell me when a decision differs from basic strategy.', type: 'switch' },
    { key: 'showCount', label: 'Card counting trainer', desc: 'Show the Hi-Lo running count and true count.', type: 'switch' },
    { key: 'showTotals', label: 'Show hand totals', type: 'switch' },
    { key: 'sound', label: 'Sound effects', type: 'switch' },
    { key: 'volume', label: 'Volume', type: 'range' },
  ];

  function fieldRow(f, locked) {
    const st = S.settings;
    const row = h('div', 'row' + (locked ? ' locked' : ''));
    row.innerHTML = `<div class="row-label"><strong>${f.label}</strong>${f.desc ? `<span>${f.desc}</span>` : ''}</div>`;
    let ctl;
    if (f.type === 'seg') {
      ctl = h('div', 'seg small');
      f.options.forEach(([v, label]) => {
        const b = h('button', st[f.key] === v ? 'on' : '', label);
        b.addEventListener('click', () => { setSetting(f.key, v); $$('button', ctl).forEach(x => x.classList.toggle('on', x === b)); });
        ctl.appendChild(b);
      });
    } else if (f.type === 'switch') {
      ctl = h('label', 'switch', `<input type="checkbox" ${st[f.key] ? 'checked' : ''} aria-label="${esc(f.label)}"><span></span>`);
      $('input', ctl).addEventListener('change', ev => setSetting(f.key, ev.target.checked));
    } else if (f.type === 'range') {
      ctl = h('input');
      ctl.type = 'range'; ctl.min = 0; ctl.max = 1; ctl.step = 0.05; ctl.value = st[f.key];
      ctl.setAttribute('aria-label', f.label);
      ctl.addEventListener('input', () => setSetting(f.key, Number(ctl.value)));
      ctl.addEventListener('change', () => Sound.chip(2));
    }
    row.appendChild(ctl);
    return row;
  }

  function renderSettings(body, tab) {
    body.innerHTML = '';
    if (tab === 'rules') {
      const locked = S.phase !== 'betting' && S.phase !== 'idle';
      if (locked) body.appendChild(h('p', 'lock-note', 'Table rules can be changed between hands.'));
      RULE_FIELDS.forEach(f => body.appendChild(fieldRow(f, locked)));
      const reset = h('div', 'row', '<div class="row-label"><strong>Restore default rules</strong><span>6 decks, dealer stands on soft 17, 3 to 2, double after split, late surrender.</span></div>');
      const b = h('button', 'ghost', 'Reset rules');
      b.disabled = locked;
      b.addEventListener('click', () => {
        Object.keys(BJ.DEFAULT_RULES).forEach(k => setSetting(k, BJ.DEFAULT_RULES[k], true));
        rulesChanged(true);
        renderSheet();
      });
      reset.appendChild(b);
      body.appendChild(reset);
    } else if (tab === 'play') {
      PLAY_FIELDS.forEach(f => body.appendChild(fieldRow(f, false)));
    } else {
      const felts = [['emerald', '#16794c'], ['sapphire', '#1d5d96'], ['crimson', '#8f2232'], ['violet', '#5b3591'], ['graphite', '#3b4049']];
      const backs = [['crimson', '#a01d31'], ['navy', '#23468a'], ['forest', '#17704a'], ['onyx', '#24242a']];
      const swatchRow = (label, desc, key, items, cls) => {
        const row = h('div', 'row', `<div class="row-label"><strong>${label}</strong><span>${desc}</span></div>`);
        const wrap = h('div', 'swatches');
        items.forEach(([k, c]) => {
          const b = h('button', 'swatch ' + cls + (S.settings[key] === k ? ' on' : ''));
          b.style.background = cls === 'back'
            ? `repeating-linear-gradient(45deg, rgba(255,255,255,.18) 0 1.5px, transparent 1.5px 5px), ${c}`
            : `radial-gradient(circle at 40% 35%, ${c}, color-mix(in srgb, ${c} 60%, black))`;
          if (cls === 'back') b.style.boxShadow = `inset 0 0 0 3px ${k === 'onyx' ? '#e3c37a' : '#fff'}, 0 3px 8px rgba(0,0,0,.35)`;
          b.setAttribute('aria-label', k);
          b.title = k[0].toUpperCase() + k.slice(1);
          b.addEventListener('click', () => { setSetting(key, k); $$('.swatch', wrap).forEach(x => x.classList.toggle('on', x === b)); });
          wrap.appendChild(b);
        });
        row.appendChild(wrap);
        return row;
      };
      body.appendChild(swatchRow('Table felt', 'The colour of the playing surface.', 'felt', felts, 'felt'));
      body.appendChild(swatchRow('Card backs', 'The design on the back of every card.', 'back', backs, 'back'));
      body.appendChild(fieldRow({ key: 'fourColor', label: 'Four-colour deck', desc: 'Blue diamonds and green clubs, easier to tell apart at a glance.', type: 'switch' }));
      const preview = h('div', 'row', '<div class="row-label"><strong>Preview</strong></div>');
      const pv = h('div', '');
      pv.style.cssText = 'position:relative;height:84px;width:220px;--cw:58px;--scw:58px';
      [['A', 'S'], ['K', 'H'], ['7', 'D'], ['10', 'C']].forEach(([r, s], i) => {
        const c = staticCard(r, s);
        c.style.left = i * 40 + 'px';
        pv.appendChild(c);
      });
      const back = h('div', 'card face-down', '<div class="card-inner"><div class="card-face card-front"></div><div class="card-face card-back"></div></div>');
      back.style.left = '162px';
      pv.appendChild(back);
      preview.appendChild(pv);
      body.appendChild(preview);
    }
  }

  function setSetting(key, value, quiet) {
    const before = S.settings[key];
    S.settings[key] = value;
    saveSettings();
    if (key === 'sound' && value) Sound.enabled = true;
    applyAppearance();
    if (key in BJ.DEFAULT_RULES && !quiet && before !== value) rulesChanged(key === 'decks' || key === 'penetration');
    if (key === 'showTotals') {
      S.seats.forEach(s => s.hands.forEach(hd => updateHandMeta(s, hd)));
      updateDealerTotal();
    }
    if (key === 'hintsEnabled') $('#btnHint').hidden = !value;
    if (key === 'autoHints' && S.pending) { if (value) showHint(true); else $$('#panelPlay [data-action]').forEach(b => b.classList.remove('suggest')); }
    if (key === 'sideBets' && !value) {
      S.seats.forEach(s => {
        const back = s.bets.pp + s.bets.t3;
        if (back && S.phase === 'betting') {
          s.bankroll = r2(s.bankroll + back);
          s.bets.pp = 0; s.bets.t3 = 0;
          s.betLog = s.betLog.filter(x => x.spot === 'main');
        }
      });
      if (S.sel.spot !== 'main') S.sel.spot = 'main';
    }
    if (key === 'sideBets') { S.seats.forEach(renderSeat); scheduleLayout(); }
    if (key === 'speed') document.documentElement.style.setProperty('--speed', String(F()));
  }

  function rulesChanged(newShoe) {
    if (newShoe && (S.phase === 'betting' || S.phase === 'idle') && S.seats.length) {
      newShoe = false;
      shuffleShoe(true).then(() => { if (S.phase === 'betting') banner('Place your bets', 'New shoe in play'); });
    }
  }

  function renderStats(body) {
    const seats = S.seats.length ? S.seats : [];
    if (!seats.length) { body.innerHTML = '<p class="prose">No players yet.</p>'; return; }
    if (!sheetState.focus || !seats.find(s => s.id === sheetState.focus)) sheetState.focus = (humans()[0] || seats[0]).id;
    const s = seats.find(x => x.id === sheetState.focus);
    const st = s.stats;
    const winRate = st.hands ? Math.round((st.wins / st.hands) * 100) : 0;
    const acc = st.decisions ? Math.round((st.correct / st.decisions) * 100) + '%' : '—';
    const net = r2(s.bankroll + s.bets.main + s.bets.pp + s.bets.t3 - (st.history[0] || 0) - (st.rebuyTotal || 0));
    body.innerHTML = '';
    if (seats.length > 1) {
      const seg = h('div', 'seg small');
      seg.style.marginTop = '14px';
      seats.forEach(x => {
        const b = h('button', x.id === s.id ? 'on' : '', esc(x.name));
        b.addEventListener('click', () => { sheetState.focus = x.id; renderStats(body); });
        seg.appendChild(b);
      });
      body.appendChild(seg);
    }
    const cards = [
      ['Net result', money(net, { plus: true }), net > 0 ? 'pos' : net < 0 ? 'neg' : ''],
      ['Hands played', st.hands.toLocaleString(), ''],
      ['Win rate', st.hands ? winRate + '%' : '—', ''],
      ['Strategy accuracy', s.type === 'human' ? acc : 'Bot', ''],
      ['Blackjacks', st.blackjacks, ''],
      ['Biggest win', money(st.biggestWin), ''],
      ['Best win streak', st.bestStreak, ''],
      ['Wins · losses · pushes', `${st.wins} · ${st.losses} · ${st.pushes}`, ''],
    ];
    const grid = h('div', 'stat-cards', cards.map(([k, v, c]) => `<div class="stat-card"><span>${k}</span><b class="${c}">${v}</b></div>`).join(''));
    body.appendChild(grid);

    // Bankroll chart for every seat.
    const box = h('div', 'chart-box');
    box.innerHTML = '<h3 style="margin:0 0 8px">Bankroll over time</h3>';
    const legend = h('div', 'chart-legend', seats.map(x => `<span><i style="background:${x.color}"></i>${esc(x.name)}</span>`).join(''));
    box.appendChild(legend);
    body.appendChild(box);
    box.appendChild(bankrollChart(seats, s.id, Math.max(300, box.clientWidth - 30)));

    const rows = seats.map(x => {
      const t = x.stats;
      const n = r2(x.bankroll + x.bets.main + x.bets.pp + x.bets.t3 - (t.history[0] || 0) - (t.rebuyTotal || 0));
      return `<tr><td><span class="who"><i style="background:${x.color}"></i>${esc(x.name)}${x.type === 'cpu' ? ' <small style="color:var(--faint);font-weight:500">bot</small>' : ''}</span></td>
        <td>${t.hands}</td><td>${t.hands ? Math.round(t.wins / t.hands * 100) + '%' : '—'}</td><td>${t.blackjacks}</td><td>${t.busts}</td>
        <td>${x.type === 'human' && t.decisions ? Math.round(t.correct / t.decisions * 100) + '%' : '—'}</td>
        <td>${money(x.bankroll)}</td><td class="${n > 0 ? 'pos' : n < 0 ? 'neg' : ''}">${money(n, { plus: true })}</td></tr>`;
    }).join('');
    const tbl = h('div', 'table-scroll', `<table class="stats-table"><thead><tr><th>Player</th><th>Hands</th><th>Win %</th><th>BJs</th><th>Busts</th><th>Accuracy</th><th>Bankroll</th><th>Net</th></tr></thead><tbody>${rows}</tbody></table>`);
    body.appendChild(tbl);

    const reset = h('div', 'row', '<div class="row-label"><strong>Reset statistics</strong><span>Clears history for every player. Bankrolls are kept.</span></div>');
    const rb = h('button', 'ghost', `${icon('refresh')}Reset`);
    rb.addEventListener('click', () => {
      if (!confirm('Reset statistics for every player?')) return;
      S.seats.forEach(x => { x.stats = newStats(r2(x.bankroll + x.bets.main + x.bets.pp + x.bets.t3)); });
      saveGame();
      renderStats(body);
    });
    reset.appendChild(rb);
    reset.style.marginTop = '12px';
    body.appendChild(reset);
  }

  function bankrollChart(seats, focusId, width) {
    const W = Math.round(width || 800), H = 190, P = { l: 62, r: 12, t: 10, b: 24 };
    const all = seats.flatMap(s => s.stats.history);
    let lo = Math.min(...all), hi = Math.max(...all);
    if (hi - lo < 10) { hi += 10; lo -= 10; }
    const pad = (hi - lo) * 0.08;
    lo = Math.max(0, lo - pad); hi += pad;
    const maxLen = Math.max(2, ...seats.map(s => s.stats.history.length));
    const x = i => P.l + (i / (maxLen - 1)) * (W - P.l - P.r);
    const y = v => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
    const ticks = 4;
    let g = '';
    for (let i = 0; i <= ticks; i++) {
      const v = lo + ((hi - lo) * i) / ticks;
      g += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(255,255,255,.07)"/>`;
      g += `<text x="${P.l - 8}" y="${y(v) + 4}" text-anchor="end" fill="rgba(246,241,228,.45)" font-size="11">${money(Math.round(v))}</text>`;
    }
    g += `<text x="${W - P.r}" y="${H - 4}" text-anchor="end" fill="rgba(246,241,228,.45)" font-size="11">${maxLen - 1} hands</text>`;
    const lines = seats.slice().sort((a, b) => (a.id === focusId) - (b.id === focusId)).map(s => {
      const hst = s.stats.history;
      const pts = hst.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
      const focus = s.id === focusId;
      const last = hst[hst.length - 1];
      return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="${focus ? 2.5 : 1.5}" stroke-opacity="${focus ? 1 : 0.45}" stroke-linejoin="round" stroke-linecap="round"/>` +
        (focus ? `<circle cx="${x(hst.length - 1)}" cy="${y(last)}" r="4" fill="${s.color}" stroke="#0b1712" stroke-width="2"/>` : '');
    }).join('');
    const svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Bankroll history">${g}${lines}</svg>`;
    return h('div', '', svg);
  }

  function renderHelp(body, tab) {
    const st = S.settings;
    if (tab === 'how') {
      body.innerHTML = `<div class="prose">
        <p><strong>Goal:</strong> finish closer to 21 than the dealer without going over. Number cards count their face value, J, Q and K count 10, and an Ace counts 1 or 11 — whichever helps more. A hand with an Ace counted as 11 is <em>soft</em>.</p>
        <p><strong>Betting:</strong> pick a chip and it lands on the selected spot. Tap a betting circle to choose it (main bet, or the Perfect Pairs and 21+3 side bets when enabled); tap it again to add the highlighted chip. Right-click a spot to take back its last chip. With several people at the table, tap a seat to bet for that player — seats without a bet sit the hand out.</p>
        <p><strong>Blackjack:</strong> an Ace with a 10-value card as your first two cards pays ${st.bjPayout === 1.2 ? '6 to 5' : '3 to 2'}. If the dealer shows an Ace or 10 they check for Blackjack before anyone plays.</p>
        <ul>
          <li><strong>Hit</strong> — take another card.</li>
          <li><strong>Stand</strong> — keep your total.</li>
          <li><strong>Double</strong> — double your bet and take exactly one more card${st.doubleOn === 'any' ? '' : ` (allowed on hard ${st.doubleOn.replace('-', '–')})`}.</li>
          <li><strong>Split</strong> — turn a pair into two hands, each with its own bet. Up to ${st.maxHands} hands${st.das ? ', and you may double after splitting' : ''}.${st.hitSplitAces ? '' : ' Split Aces receive one card each.'}</li>
          ${st.surrender ? '<li><strong>Surrender</strong> — give up the hand and get half your bet back. Only on your first two cards.</li>' : ''}
          ${st.insurance ? '<li><strong>Insurance</strong> — when the dealer shows an Ace, bet half your stake that they have Blackjack (pays 2 to 1). With a Blackjack of your own this becomes <em>even money</em>.</li>' : ''}
        </ul>
        <p><strong>The dealer</strong> ${st.h17 ? 'hits soft 17 and stands on hard 17 or more' : 'stands on every 17'}. When the cut card appears the round finishes and the shoe is reshuffled.</p>
        <p><strong>Learning tools:</strong> the Hint button (or <kbd class="k">G</kbd>) shows the basic-strategy play, the coach flags decisions that differ from it, and the counting trainer shows the Hi-Lo count. Turn these on or off in Settings → Gameplay.</p>
      </div>`;
    } else if (tab === 'chart') {
      const ups = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];
      const head = '<tr><th></th>' + ups.map(u => `<th>${u}</th>`).join('') + '</tr>';
      const row = (label, kind, v) => `<tr><th class="rowh">${label}</th>` + ups.map(u => {
        const c = BJ.chartCell(kind, v, u, st);
        const txt = { H: 'H', S: 'S', Dh: 'D', Ds: 'Ds', P: 'P', Rh: 'R', Rs: 'Rs', Rp: 'Rp', D: 'D' }[c] || c;
        return `<td class="${c}">${txt}</td>`;
      }).join('') + '</tr>';
      let hard = '', soft = '', pairs = '';
      for (let v = 17; v >= 8; v--) hard += row(v === 17 ? '17+' : v === 8 ? '5–8' : String(v), 'hard', v);
      for (let v = 20; v >= 13; v--) soft += row('A,' + (v - 11), 'soft', v);
      [1, 10, 9, 8, 7, 6, 5, 4, 3, 2].forEach(v => { pairs += row(v === 1 ? 'A,A' : v === 10 ? '10,10' : v + ',' + v, 'pair', v); });
      body.innerHTML = `
        <p class="prose" style="margin-top:14px">Basic strategy for the current rules (${st.decks} deck${st.decks > 1 ? 's' : ''}, ${st.h17 ? 'dealer hits soft 17' : 'dealer stands on soft 17'}${st.das ? ', double after split' : ''}${st.surrender ? ', late surrender' : ''}). Columns are the dealer's up card.</p>
        <div class="strat-key">
          <span><i style="background:#f2f0ea">H</i>Hit</span><span><i style="background:#f0c541">S</i>Stand</span>
          <span><i style="background:#61c38f">D</i>Double, else hit</span><span><i style="background:#61c38f">Ds</i>Double, else stand</span>
          <span><i style="background:#74a7f0">P</i>Split</span><span><i style="background:#e07b7b">R</i>Surrender, else hit</span>
        </div>
        <div class="strat-tables">
          <div><h3>Hard totals</h3><div class="chart-wrap"><table class="strat">${head}${hard}</table></div></div>
          <div><h3>Soft totals</h3><div class="chart-wrap"><table class="strat">${head}${soft}</table></div>
               <h3>Pairs</h3><div class="chart-wrap"><table class="strat">${head}${pairs}</table></div></div>
        </div>`;
    } else if (tab === 'pay') {
      body.innerHTML = `<div class="pay-grid">
        <div><h3>Main game</h3><table class="paytable">
          <tr><td>Blackjack</td><td>${st.bjPayout === 1.2 ? '6 to 5' : '3 to 2'}</td></tr>
          <tr><td>Win</td><td>1 to 1</td></tr>
          <tr><td>Insurance</td><td>2 to 1</td></tr>
          <tr><td>Even money</td><td>1 to 1</td></tr>
          <tr><td>Surrender</td><td>Half back</td></tr>
          <tr><td>Push</td><td>Bet returned</td></tr></table></div>
        <div><h3>Perfect Pairs</h3><table class="paytable">
          <tr><td>Perfect pair (same suit)</td><td>25 to 1</td></tr>
          <tr><td>Coloured pair (same colour)</td><td>12 to 1</td></tr>
          <tr><td>Mixed pair</td><td>6 to 1</td></tr></table>
          <p class="hint-text">Uses your first two cards.</p></div>
        <div><h3>21+3</h3><table class="paytable">
          <tr><td>Suited trips</td><td>100 to 1</td></tr>
          <tr><td>Straight flush</td><td>40 to 1</td></tr>
          <tr><td>Three of a kind</td><td>30 to 1</td></tr>
          <tr><td>Straight</td><td>10 to 1</td></tr>
          <tr><td>Flush</td><td>5 to 1</td></tr></table>
          <p class="hint-text">Your first two cards plus the dealer's up card, read as a poker hand.</p></div>
      </div>`;
    } else {
      const k = (key, label) => `<div><kbd class="k">${key}</kbd>${label}</div>`;
      body.innerHTML = `
        <h3>Betting</h3><div class="kbd-grid">
          ${k('1–6', 'Add a chip')}${k('Space', 'Deal (or rebet & deal)')}${k('⌫', 'Undo last chip')}${k('C', 'Clear bets')}${k('R', 'Rebet')}${k('X', 'Rebet doubled')}${k('Tab', 'Next player')}</div>
        <h3>Playing</h3><div class="kbd-grid">
          ${k('H', 'Hit')}${k('S', 'Stand')}${k('D', 'Double down')}${k('P', 'Split')}${k('R', 'Surrender')}${k('G', 'Hint')}${k('Y / N', 'Insurance')}</div>
        <h3>General</h3><div class="kbd-grid">
          ${k('Space', 'Skip to next hand')}${k('M', 'Mute')}${k('Esc', 'Close window')}</div>`;
    }
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  function bindUI() {
    $$('#panelPlay [data-action]').forEach(b => b.addEventListener('click', () => act(b.dataset.action)));
    $('#btnHint').addEventListener('click', () => showHint(false));
    $('#btnDeal').addEventListener('click', deal);
    $('#btnUndo').addEventListener('click', () => { const s = currentBettor(); if (s) undoChip(s); });
    $('#btnClear').addEventListener('click', () => { const s = currentBettor(); if (s) clearBets(s); });
    $('#btnRebet').addEventListener('click', () => rebet(1));
    $('#btnRebet2').addEventListener('click', () => rebet(2));
    $('#btnInsYes').addEventListener('click', () => S.insurancePending && S.insurancePending(true));
    $('#btnInsNo').addEventListener('click', () => S.insurancePending && S.insurancePending(false));
    $('#btnLobby').addEventListener('click', () => openLobby(false));
    $('#btnStats').addEventListener('click', () => openSheet('stats'));
    $('#btnHelp').addEventListener('click', () => openSheet('help'));
    $('#btnSettings').addEventListener('click', () => openSheet('settings'));
    $('#btnSound').addEventListener('click', () => { setSetting('sound', !S.settings.sound); if (S.settings.sound) Sound.chip(2); });
    $('#countPill').addEventListener('click', () => openSheet('settings', 'play'));
    $('#sheetClose').addEventListener('click', closeSheet);
    dom.sheet.addEventListener('click', e => { if (e.target === dom.sheet) closeSheet(); });
    $('#addHuman').addEventListener('click', () => addDraftSeat('human'));
    $('#addCpu').addEventListener('click', () => addDraftSeat('cpu'));
    $('#lobbyStart').addEventListener('click', () => startFromLobby(false));
    $('#lobbyNew').addEventListener('click', () => {
      if (S.seats.length && !confirm('Start a new game? Every bankroll and statistic is reset.')) return;
      draft.seats.forEach(s => { s.existing = false; });
      startFromLobby(true);
    });
    dom.table.addEventListener('click', () => { if (S.skip) S.skip(); });
    window.addEventListener('resize', scheduleLayout);
    document.addEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      if (e.key === 'Enter' && !dom.lobby.hidden) { e.preventDefault(); startFromLobby(false); }
      return;
    }
    if (!dom.sheet.hidden) { if (e.key === 'Escape') closeSheet(); return; }
    if (!dom.lobby.hidden) {
      if (e.key === 'Escape' && S.seats.length) dom.lobby.hidden = true;
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 'm') { $('#btnSound').click(); return; }
    if (S.pending) {
      const map = { h: 'H', s: 'S', d: 'D', p: 'P', r: 'R' };
      if (map[k]) { e.preventDefault(); act(map[k]); return; }
      if (k === 'g' && rules().hintsEnabled) { showHint(false); return; }
      return;
    }
    if (S.insurancePending) {
      if (k === 'y') S.insurancePending(true);
      else if (k === 'n') S.insurancePending(false);
      return;
    }
    if (S.skip && (k === ' ' || k === 'enter')) {
      e.preventDefault();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      S.skip();
      return;
    }
    if (S.phase === 'betting') {
      const seat = currentBettor();
      const n = Number(e.key);
      if (n >= 1 && n <= limits().chips.length) {
        const v = limits().chips[n - 1];
        S.chip = v;
        if (seat) addChip(seat, S.sel.spot, v, $(`.chip[data-v="${v}"]`, dom.chipTray));
        updateChipTray();
        return;
      }
      if (k === ' ' || k === 'enter') {
        e.preventDefault();
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        deal();
        return;
      }
      if (k === 'backspace') { e.preventDefault(); if (seat) undoChip(seat); return; }
      if (k === 'c' && seat) { clearBets(seat); return; }
      if (k === 'r') { rebet(1); return; }
      if (k === 'x') { rebet(2); return; }
      if (k === 'tab' && humans().length > 1) {
        e.preventDefault();
        const hs = humans();
        const i = hs.findIndex(s => s.id === S.sel.seat);
        selectBettor(hs[(i + (e.shiftKey ? hs.length - 1 : 1)) % hs.length], 'main');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  function boot() {
    applyAppearance();
    buildRack();
    bindUI();
    newShoe();
    layout();
    showPanel('wait', '');
    renderDock();
    openLobby(true);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleLayout);
  }

  // Expose a tiny debug/test surface.
  window.__bj = { S, deal, act, rebet, startFromLobby: f => startFromLobby(f), layout, setSetting };

  boot();
})();
