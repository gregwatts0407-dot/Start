/* ui.js — DOM helpers shared by every screen. */
(function (root) {
  'use strict';
  const C = root.PokerCards;

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (n) => (n == null ? '' : Math.round(n).toLocaleString('en-US'));
  function fmtShort(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return fmt(n);
  }
  function h(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  // ---- cards ----
  const COURT = { 9: 'J', 10: 'Q', 11: 'K' };
  function cardHTML(c, opts) {
    opts = opts || {};
    const cls = ['card'];
    if (c == null || c < 0) {
      cls.push('down');
      if (opts.extra) cls.push(opts.extra);
      return `<div class="${cls.join(' ')}" aria-label="face-down card"><div class="card-inner"><div class="card-face"></div><div class="card-back"></div></div></div>`;
    }
    const r = c >> 2, s = c & 3;
    const rank = C.RANKS[r] === 'T' ? '10' : C.RANKS[r];
    const sym = C.SUIT_SYMBOLS[s];
    cls.push('s-' + C.SUITS[s]);
    if (s === 1 || s === 2) cls.push('red');
    if (opts.down) cls.push('down');
    if (opts.extra) cls.push(opts.extra);
    const court = COURT[r];
    return `<div class="${cls.join(' ')}" data-card="${c}" aria-label="${C.RANK_NAMES[r]} of ${C.SUIT_NAMES[s]}" role="img">` +
      `<div class="card-inner"><div class="card-face${court ? ' court' : ''}${r === 8 ? ' ten' : ''}">` +
      `<div class="card-idx"><b>${rank}</b><i>${sym}</i></div>` +
      `<div class="card-big">${sym}</div>` +
      `</div><div class="card-back"></div></div></div>`;
  }
  const cardEl = (c, opts) => h(cardHTML(c, opts));
  function cardsInline(cards) {
    const arr = typeof cards === 'string' ? C.parseCards(cards) : cards;
    return `<span class="cards-inline">${arr.map((c) => cardHTML(c)).join('')}</span>`;
  }
  /** Text form with coloured suit symbols: "A♠ K♥" */
  function cardText(c) {
    if (c < 0) return '??';
    const r = C.RANKS[c >> 2] === 'T' ? '10' : C.RANKS[c >> 2];
    const s = c & 3;
    return `${r}<span class="suit${s === 1 || s === 2 ? ' r' : ''}">${C.SUIT_SYMBOLS[s]}</span>`;
  }
  /** Fix third-person verbs when the player is literally called "You". */
  const YOU_VERBS = { posts: 'post', calls: 'call', checks: 'check', bets: 'bet', raises: 'raise', folds: 'fold', shows: 'show', wins: 'win', splits: 'split', finishes: 'finish', rebuys: 'rebuy', leaves: 'leave' };
  function youify(text) {
    if (!/\bYou\b/.test(text)) return text;
    return text
      .replace(/\bYou (posts|calls|checks|bets|raises|folds|shows|wins|splits|finishes|rebuys|leaves)\b/g, (m, v) => 'You ' + YOU_VERBS[v])
      .replace(/^(You .*)\band is all-in/, '$1and are all-in')
      .replace(/returned to You\b/, 'returned to you');
  }
  /** Replace "As Kd" tokens in log text with coloured glyphs. */
  function prettyCards(text) {
    return esc(youify(text)).replace(/\b([2-9TJQKA])([shdc])\b/g, (m, r, s) => cardText(C.parseCard(r + s)));
  }

  // ---- chips ----
  const DENOMS = [1000, 500, 100, 25, 5, 1];
  function chipStacksHTML(amount, maxStacks) {
    if (!amount) return '';
    maxStacks = maxStacks || 3;
    const stacks = [];
    let rest = amount;
    for (const d of DENOMS) {
      const n = Math.floor(rest / d);
      if (n > 0) { stacks.push({ d, n: Math.min(n, 5) }); rest -= n * d; }
      if (stacks.length >= maxStacks) break;
    }
    if (!stacks.length) stacks.push({ d: 1, n: 1 });
    return `<span class="chip-stacks">${stacks.map((st) => `<span class="chip-stack">${('<i class="chip c' + st.d + '"></i>').repeat(st.n)}</span>`).join('')}</span>`;
  }

  // ---- avatars ----
  function hueFor(name) {
    let x = 0;
    for (const ch of String(name)) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
    return x % 360;
  }
  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/);
    return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
  }
  function avatarHTML(name, hue, extra) {
    const hh = hue != null ? hue : hueFor(name);
    return `<span class="avatar ${extra || ''}" style="--hue:${hh}">${esc(initials(name))}</span>`;
  }

  // ---- toasts / announcer ----
  function toast(html, kind, ms) {
    const box = $('#toasts');
    const el = h(`<div class="toast ${kind || ''}">${html}</div>`);
    box.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, ms || 2600);
  }
  function announce(text) {
    const a = $('#announcer');
    if (a) { a.textContent = ''; setTimeout(() => { a.textContent = text; }, 30); }
  }

  // ---- modals ----
  let modalStack = [];
  function modal(html, opts) {
    opts = opts || {};
    const root = $('#modalRoot');
    const back = h(`<div class="modal-backdrop"><div class="modal ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true">${opts.closable === false ? '' : '<button class="icon-btn modal-close" data-close aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>'}${html}</div></div>`);
    const m = back.firstElementChild;
    const close = (val) => {
      if (!back.isConnected) return;
      back.remove();
      modalStack = modalStack.filter((x) => x !== api);
      if (opts.onClose) opts.onClose(val);
    };
    const api = { el: m, close };
    back.addEventListener('click', (e) => {
      if (e.target === back && opts.closable !== false && opts.backdropClose !== false) close();
      if (e.target.closest('[data-close]')) close();
    });
    root.appendChild(back);
    modalStack.push(api);
    const first = m.querySelector('[autofocus]') || m.querySelector('button.btn-gold, input, button:not(.modal-close)');
    if (first) setTimeout(() => first.focus({ preventScroll: true }), 40);
    return api;
  }
  function closeTopModal() {
    const top = modalStack[modalStack.length - 1];
    if (top) { top.close(); return true; }
    return false;
  }
  function confirmBox(title, body, okLabel, cancelLabel, opts) {
    return new Promise((resolve) => {
      const m = modal(`<div class="warn-box">${opts && opts.owl ? '<span class="owl lg"></span>' : ''}<div><h2>${title}</h2><div class="sub">${body}</div></div></div>
        <div class="modal-actions"><button class="btn" data-v="0">${cancelLabel || 'Cancel'}</button><button class="btn ${opts && opts.danger ? 'btn-danger' : 'btn-gold'}" data-v="1">${okLabel || 'OK'}</button></div>`,
      { onClose: (v) => resolve(v === true) });
      m.el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-v]');
        if (b) m.close(b.dataset.v === '1');
      });
    });
  }

  // ---- confetti ----
  function confetti(ms) {
    const cv = $('#confetti');
    if (!cv || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const colors = ['#e9c46a', '#f6dc98', '#a594ff', '#34d399', '#ff6b78', '#5cc8ff', '#ffffff'];
    const parts = Array.from({ length: 180 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 200, y: innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4, r: Math.random() * 6 + 4,
      c: colors[(Math.random() * colors.length) | 0], a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.3,
    }));
    const end = performance.now() + (ms || 3200);
    (function frame(t) {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of parts) {
        p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c;
        ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore();
      }
      if (t < end) requestAnimationFrame(frame); else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })(performance.now());
  }

  const pct = (x) => Math.round(x * 100) + '%';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  root.UI = { $, $$, esc, fmt, fmtShort, h, cardHTML, cardEl, cardsInline, cardText, prettyCards, youify, chipStacksHTML, hueFor, initials, avatarHTML, toast, announce, modal, closeTopModal, confirmBox, confetti, pct, sleep };
})(window);
