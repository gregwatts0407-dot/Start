/*
 * table.js — renders a game view onto the felt and animates the transitions
 * between views (dealing, betting, collecting bets, showdowns, awarding pots).
 */
(function (root) {
  'use strict';
  const { $, esc, fmt, cardHTML, chipStacksHTML, avatarHTML } = root.UI;
  const C = root.PokerCards;

  const SPEEDS = { slow: 1.45, normal: 1, fast: 0.6, turbo: 0.3 };
  const speed = () => SPEEDS[(root.Store && root.Store.settings.speed) || 'normal'] || 1;
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  class TableView {
    constructor(opts) {
      this.wrap = $('#tableWrap');
      this.seatsEl = $('#seats');
      this.boardEl = $('#board');
      this.potEl = $('#pot');
      this.bannerEl = $('#banner');
      this.fx = $('#fxLayer');
      this.onSeatClick = opts && opts.onSeatClick;
      this.prev = null;
      this.n = 0;
      this.hero = null;
      this.seatEls = [];
      this.betEls = [];
      this.cardKeys = [];
      this.boardShown = 0;
      this.dealer = null;
      this.portrait = false;
      this.mq = window.matchMedia('(max-aspect-ratio: 1/1)');
      this.mq.addEventListener('change', () => { if (this.n) { this.layout(this.n, this.hero, true); if (this.prev) this.render(this.prev, this.ctx || {}, true); } });
    }

    /** Build seat elements for n seats with `hero` at the bottom. */
    layout(n, hero, force) {
      if (!force && n === this.n && hero === this.hero && this.seatEls.length) return;
      this.n = n; this.hero = hero;
      this.portrait = this.mq.matches;
      this.seatsEl.innerHTML = '';
      this.seatEls = []; this.betEls = []; this.cardKeys = [];
      this.pos = [];
      const anchor = hero == null ? 0 : hero;
      for (let i = 0; i < n; i++) {
        const v = (i - anchor + n) % n;
        const p = this.slot(v, n);
        this.pos[i] = p;
        const el = document.createElement('div');
        el.className = 'seat';
        el.dataset.i = i;
        el.style.setProperty('--x', p.x + '%');
        el.style.setProperty('--y', p.y + '%');
        el.innerHTML = `<div class="seat-cards"></div>
          <div class="seat-plate"><span class="av-wrap" style="position:relative;display:inline-flex"></span>
          <div class="seat-meta"><div class="seat-name"></div><div class="seat-stack num"></div></div></div>
          <div class="seat-badge" hidden></div><div class="seat-action"></div><div class="seat-hand" hidden></div>`;
        el.addEventListener('click', () => this.onSeatClick && this.onSeatClick(i, el));
        this.seatsEl.appendChild(el);
        this.seatEls.push(el);
        const bet = document.createElement('div');
        bet.className = 'bet';
        bet.hidden = true;
        bet.style.setProperty('--x', p.bx + '%');
        bet.style.setProperty('--y', p.by + '%');
        this.seatsEl.appendChild(bet);
        this.betEls.push(bet);
        this.cardKeys.push('');
      }
      this.dealer = document.createElement('div');
      this.dealer.className = 'dealer-btn';
      this.dealer.textContent = 'D';
      this.dealer.hidden = true;
      this.seatsEl.appendChild(this.dealer);
    }

    slot(v, n) {
      const portrait = this.portrait;
      // angles start at the bottom (hero) and go clockwise
      const theta = Math.PI / 2 + (v * 2 * Math.PI) / n;
      const kx = portrait ? 0.96 : 0.97, ky = portrait ? 0.98 : 1.0;
      let x = 50 + 50 * kx * Math.cos(theta);
      let y = 50 + 50 * ky * Math.sin(theta);
      if (portrait) {
        // push side seats outward a little so they don't cover the board
        x = 50 + (x - 50) * 1.04;
      }
      const s = Math.sin(theta);
      const f = portrait ? 0.3 + 0.16 * Math.max(0, s) + 0.06 * Math.max(0, -s) : 0.33 + 0.14 * Math.max(0, s) + 0.02 * Math.max(0, -s);
      const bx = x + (50 - x) * f, by = y + (50 - y) * f * (portrait ? 0.95 : 1.05);
      // dealer button: just inside the seat, nudged clockwise so it doesn't sit on the bet
      const c = Math.cos(theta);
      const df = f * 0.5;
      const nudge = portrait ? 9 : 6.5;
      const dx = x + (50 - x) * df - s * nudge;
      const dy = y + (50 - y) * df + c * nudge * (portrait ? 0.62 : 1.85);
      return { x, y, bx, by, dx, dy, theta };
    }

    clear() {
      this.prev = null;
      this.boardEl.innerHTML = '';
      this.potEl.innerHTML = '';
      this.banner('');
      this.boardShown = 0;
      this.fx.innerHTML = '';
    }

    banner(html, ms) {
      clearTimeout(this.bannerT);
      this.bannerEl.innerHTML = html || '';
      this.bannerEl.classList.toggle('show', !!html);
      if (html && ms) this.bannerT = setTimeout(() => this.banner(''), ms);
    }

    /**
     * Render a view. ctx = {hero, styles, stats, actingSince, turnMs, rec, handStrength, reveal}
     */
    render(view, ctx, silent) {
      ctx = ctx || {};
      this.ctx = ctx;
      const prev = silent ? null : this.prev;
      const n = view.seats.length;
      this.layout(n, ctx.hero);
      const newHand = !prev || prev.handNo !== view.handNo;
      if (newHand && !silent) this.onNewHand(view);

      // ----- seats -----
      view.seats.forEach((s, i) => this.renderSeat(view, s, i, prev, ctx, newHand));

      // ----- dealer button -----
      if (view.button >= 0 && this.pos[view.button]) {
        const p = this.pos[view.button];
        this.dealer.hidden = false;
        this.dealer.style.setProperty('--dx', p.dx + '%');
        this.dealer.style.setProperty('--dy', p.dy + '%');
      } else this.dealer.hidden = true;

      // ----- bets -----
      const collected = prev && !newHand && prev.seats.some((s) => s.bet > 0) && view.seats.every((s) => s.bet === 0);
      if (collected) this.collectBets(prev);
      view.seats.forEach((s, i) => this.renderBet(s, i, prev && !newHand ? prev.seats[i] : null, collected));

      // ----- board -----
      this.renderBoard(view, prev, newHand);

      // ----- pot -----
      this.renderPot(view);

      // ----- showdown -----
      if (view.street === 'complete' && view.result && (!prev || prev.street !== 'complete' || prev.handNo !== view.handNo)) {
        this.onResult(view, ctx);
      }
      this.prev = JSON.parse(JSON.stringify(view));
    }

    onNewHand() {
      this.boardEl.innerHTML = '';
      for (let k = 0; k < 5; k++) this.boardEl.insertAdjacentHTML('beforeend', '<div class="card slot"></div>');
      this.boardShown = 0;
      this.banner('');
      this.fx.innerHTML = '';
      this.seatEls.forEach((el) => el.classList.remove('winner'));
    }

    renderSeat(view, s, i, prev, ctx, newHand) {
      const el = this.seatEls[i];
      const ps = prev && prev.seats[i];
      const isHero = i === ctx.hero;
      const empty = s.out && view.config.mode === 'tournament' && !s.inHand;
      el.classList.toggle('hero', isHero);
      el.classList.toggle('folded', s.inHand && s.folded);
      el.classList.toggle('acting', view.toAct === i);
      el.classList.toggle('out', (!s.inHand && view.street !== 'idle') || s.out);
      el.classList.toggle('busted', !!s.out);
      el.classList.toggle('clickable', !isHero);
      el.classList.toggle('empty', !!s.empty);
      void empty;

      // avatar (+ timer)
      const av = el.querySelector('.av-wrap');
      const avKey = s.name + '|' + (s.hue || '');
      if (av.dataset.k !== avKey) { av.innerHTML = avatarHTML(s.name, s.hue); av.dataset.k = avKey; }
      const oldTimer = av.querySelector('.timer');
      const wantTimer = view.toAct === i && ctx.turnMs && ctx.actingSince;
      if (wantTimer) {
        const key = view.handNo + ':' + view.seq;
        if (!oldTimer || oldTimer.dataset.k !== key) {
          if (oldTimer) oldTimer.remove();
          const elapsed = Math.max(0, Date.now() - ctx.actingSince);
          const len = 2 * Math.PI * 22;
          av.insertAdjacentHTML('beforeend', `<svg class="timer" viewBox="0 0 50 50" data-k="${key}"><circle cx="25" cy="25" r="22" stroke-dasharray="${len}" stroke-dashoffset="0"
            style="animation: timerRun ${ctx.turnMs}ms linear forwards; animation-delay:-${elapsed}ms; --len:${len}"></circle></svg>`);
          const t = av.querySelector('.timer');
          clearTimeout(this['lowT' + i]);
          const lowIn = ctx.turnMs * 0.7 - elapsed;
          this['lowT' + i] = setTimeout(() => t && t.classList.add('low'), Math.max(0, lowIn));
        }
      } else if (oldTimer) oldTimer.remove();

      el.querySelector('.seat-name').textContent = s.name + (s.connected === false ? ' (away)' : '');
      const stackEl = el.querySelector('.seat-stack');
      if (s.inHand && s.allIn && view.street !== 'complete') { stackEl.textContent = 'All-in'; stackEl.classList.add('allin'); }
      else if (s.out) { stackEl.textContent = s.place ? 'Out · #' + s.place : 'Out'; stackEl.classList.remove('allin'); }
      else if (s.stack === 0 && !s.inHand) { stackEl.textContent = 'Busted'; stackEl.classList.remove('allin'); }
      else { this.tweenNumber(stackEl, s.stack); stackEl.classList.remove('allin'); }

      // position / style badge
      const badge = el.querySelector('.seat-badge');
      let badgeText = '';
      badge.hidden = !badgeText;
      badge.textContent = badgeText;

      // last action
      const actEl = el.querySelector('.seat-action');
      const la = s.lastAction;
      const winAmt = view.street === 'complete' && view.result && view.result.winnings && view.result.winnings[i];
      if (winAmt) {
        actEl.className = 'seat-action show t-win';
        actEl.textContent = '+' + fmt(winAmt);
      } else if (la && view.street !== 'complete' && !(la.type === 'fold' && !isHero && false)) {
        const label = { fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise', allin: 'All-in', sb: 'SB', bb: 'BB' }[la.type] || la.type;
        actEl.className = 'seat-action show t-' + la.type;
        actEl.textContent = label;
        if (ps && (!ps.lastAction || ps.lastAction.type !== la.type || ps.lastAction.amount !== la.amount) && !newHand) this.actionSound(la.type);
      } else actEl.className = 'seat-action';

      // hand name at showdown
      const handEl = el.querySelector('.seat-hand');
      const hres = view.street === 'complete' && view.result && view.result.hands && view.result.hands[i];
      if (hres && s.cards[0] >= 0) { handEl.hidden = false; handEl.textContent = hres.name; } else handEl.hidden = true;

      // hero hand-strength helper
      let hs = el.querySelector('.hero-strength');
      if (isHero && ctx.handStrength && s.inHand && !s.folded && s.cards.length === 2 && s.cards[0] >= 0 && view.street !== 'complete') {
        if (!hs) { hs = document.createElement('div'); hs.className = 'hero-strength'; el.appendChild(hs); }
        hs.textContent = strengthLabel(s.cards, view.board);
      } else if (hs) hs.remove();

      // cards
      this.renderSeatCards(view, s, i, prev, ctx, newHand);
    }

    renderSeatCards(view, s, i, prev, ctx, newHand) {
      const el = this.seatEls[i];
      const box = el.querySelector('.seat-cards');
      const key = view.handNo + ':' + (s.cards || []).join(',');
      if (key === this.cardKeys[i]) {
        this.markWinCards(view, i, box);
        return;
      }
      const prevKey = this.cardKeys[i];
      this.cardKeys[i] = key;
      if (!s.cards || !s.cards.length) { box.innerHTML = ''; return; }
      const sameHand = prevKey.split(':')[0] === String(view.handNo) && box.children.length === s.cards.length;
      if (sameHand) {
        // reveal: flip face-down cards to show their faces
        s.cards.forEach((c, k) => {
          const old = box.children[k];
          if (c >= 0 && old.classList.contains('down')) {
            const fresh = root.UI.cardEl(c, { down: true });
            box.replaceChild(fresh, old);
            requestAnimationFrame(() => requestAnimationFrame(() => fresh.classList.remove('down')));
          }
        });
        root.Sound.play('flip');
      } else {
        box.innerHTML = s.cards.map((c) => cardHTML(c)).join('');
        if (newHand && prev) this.animateDeal(view, i, box);
      }
      this.markWinCards(view, i, box);
    }

    animateDeal(view, i, box) {
      if (reduced()) return;
      const cards = Array.from(box.children);
      const wrapRect = this.wrap.getBoundingClientRect();
      const cx = wrapRect.left + wrapRect.width / 2, cy = wrapRect.top + wrapRect.height * 0.47;
      const order = dealOrder(view, i);
      const players = view.seats.filter((x) => x.inHand).length;
      cards.forEach((card, k) => {
        const r = card.getBoundingClientRect();
        const dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height / 2);
        const delay = (k * players + order) * 70 * speed();
        const fin = getComputedStyle(card).transform;
        card.animate([
          { transform: `translate(${dx}px, ${dy}px) rotate(${-30 + k * 20}deg) scale(0.5)`, opacity: 0 },
          { opacity: 1, offset: 0.2 },
          { transform: fin === 'none' ? 'none' : fin, opacity: 1 },
        ], { duration: 380 * speed(), delay, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
        setTimeout(() => root.Sound.play('deal'), delay);
      });
    }

    markWinCards(view, i, box) {
      const res = view.street === 'complete' && view.result;
      const winners = res && !res.uncontested ? new Set(res.pots.flatMap((p) => p.winners)) : null;
      const best = winners && winners.has(i) && res.hands[i] ? new Set(res.hands[i].best) : null;
      Array.from(box.children).forEach((c) => {
        const v = Number(c.dataset.card);
        c.classList.toggle('win', !!best && best.has(v));
        c.classList.toggle('dim', !!res && !res.uncontested && !!res.hands && res.hands[i] && !(best && best.has(v)));
      });
    }

    renderBet(s, i, ps, collected) {
      const el = this.betEls[i];
      if (s.bet > 0) {
        const changed = !ps || ps.bet !== s.bet || el.hidden;
        if (changed) {
          el.innerHTML = chipStacksHTML(s.bet, 3) + `<span>${fmt(s.bet)}</span>`;
          if (el.hidden || !ps || ps.bet === 0) {
            el.hidden = false;
            const p = this.pos[i];
            const W = this.wrap.clientWidth, H = this.wrap.clientHeight;
            el.style.setProperty('--fx', ((p.x - p.bx) / 100 * W) + 'px');
            el.style.setProperty('--fy', ((p.y - p.by) / 100 * H) + 'px');
            el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
          }
        }
      } else if (!collected) {
        el.hidden = true;
      }
    }

    collectBets(prev) {
      const potRect = this.potEl.getBoundingClientRect();
      const wrapRect = this.wrap.getBoundingClientRect();
      const tx = potRect.left + potRect.width / 2 - wrapRect.left;
      const ty = potRect.top + potRect.height / 2 - wrapRect.top;
      prev.seats.forEach((s, i) => {
        const el = this.betEls[i];
        if (!s.bet || el.hidden) return;
        if (reduced()) { el.hidden = true; return; }
        const r = el.getBoundingClientRect();
        const dx = tx - (r.left + r.width / 2 - wrapRect.left), dy = ty - (r.top + r.height / 2 - wrapRect.top);
        const a = el.animate([{ transform: 'translate(-50%, -50%)', opacity: 1 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.7)`, opacity: 0 }],
          { duration: 420 * speed(), easing: 'cubic-bezier(.5,0,.2,1)' });
        a.onfinish = () => { el.hidden = true; };
      });
      root.Sound.play('chips');
    }

    renderBoard(view, prev, newHand) {
      if (!this.boardEl.children.length || newHand) this.onNewHand(view);
      const slots = this.boardEl.children;
      const target = view.board.length;
      if (target < this.boardShown) { this.onNewHand(view); }
      const start = this.boardShown;
      for (let k = start; k < target; k++) {
        const c = view.board[k];
        const fresh = root.UI.cardEl(c, { down: !reduced() && !!prev });
        this.boardEl.replaceChild(fresh, slots[k]);
        if (!reduced() && prev) {
          const delay = (k - start) * 130 * speed();
          fresh.animate([{ transform: 'translateY(-14px) scale(0.92)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260 * speed(), delay, fill: 'backwards', easing: 'cubic-bezier(.2,.8,.2,1)' });
          setTimeout(() => { fresh.classList.remove('down'); root.Sound.play('flip'); }, delay + 160 * speed());
        }
      }
      this.boardShown = target;
      // win highlight on board
      const res = view.street === 'complete' && view.result && !view.result.uncontested ? view.result : null;
      let best = null;
      if (res) {
        best = new Set();
        const w = res.pots[0].winners;
        w.forEach((wi) => res.hands[wi] && res.hands[wi].best.forEach((c) => best.add(c)));
      }
      Array.from(slots).forEach((el) => {
        if (!el.dataset.card) return;
        const v = Number(el.dataset.card);
        el.classList.toggle('win', !!best && best.has(v));
        el.classList.toggle('dim', !!best && !best.has(v));
      });
    }

    renderPot(view) {
      if (view.street === 'complete') { this.potEl.innerHTML = ''; return; }
      const total = view.seats.reduce((a, s) => a + (s.total || 0), 0);
      const streetBets = view.seats.reduce((a, s) => a + (s.bet || 0), 0);
      if (total <= 0) { this.potEl.innerHTML = ''; return; }
      const collected = total - streetBets;
      const pots = root.PokerEngine.buildPots(view.seats.map((s) => Object.assign({}, s, { total: s.total - s.bet })));
      const side = pots.length > 1 ? `<span class="side">${pots.length - 1} side pot${pots.length > 2 ? 's' : ''}</span>` : '';
      const html = `${collected > 0 ? chipStacksHTML(collected, 3) : ''}<small>Pot</small><span class="num">${fmt(total)}</span>${side}`;
      if (this.potEl.innerHTML !== html) this.potEl.innerHTML = html;
    }

    onResult(view, ctx) {
      const res = view.result;
      const potRect = this.potEl.getBoundingClientRect();
      const wrapRect = this.wrap.getBoundingClientRect();
      const fromX = potRect.width ? potRect.left + potRect.width / 2 - wrapRect.left : wrapRect.width / 2;
      const fromY = potRect.height ? potRect.top + potRect.height / 2 - wrapRect.top : wrapRect.height * 0.4;
      this.potEl.innerHTML = '';
      const delay = res.uncontested ? 250 : 900;
      setTimeout(() => {
        res.pots.forEach((pot, k) => {
          pot.winners.forEach((w) => {
            this.seatEls[w].classList.add('winner');
            const p = this.pos[w];
            this.flyChips(fromX, fromY, p.x / 100 * wrapRect.width, p.y / 100 * wrapRect.height, k * 250);
          });
        });
        root.Sound.play('chips');
      }, delay * speed());
      // banner
      const names = (ws) => ws.map((w) => esc(view.seats[w].name)).join(' & ');
      const main = res.pots[0];
      let text;
      if (res.uncontested) text = `<b>${names(main.winners)}</b> wins ${fmt(main.amount)}`;
      else if (res.pots.length === 1) text = `<b>${names(main.winners)}</b> ${main.winners.length > 1 ? 'split' : 'wins'} ${fmt(main.amount)} · ${esc(main.hand)}`;
      else text = res.pots.map((p, k) => `${k === 0 ? 'Main' : 'Side'}: <b>${names(p.winners)}</b> ${fmt(p.amount)}`).join(' · ');
      this.banner(text);
      void ctx;
    }

    flyChips(x0, y0, x1, y1, delay) {
      if (reduced()) return;
      for (let k = 0; k < 6; k++) {
        const chip = document.createElement('i');
        chip.className = 'chip fx-chip c' + [5, 25, 100, 5, 25, 1][k];
        this.fx.appendChild(chip);
        const jitter = () => (Math.random() - 0.5) * 18;
        const a = chip.animate([
          { transform: `translate(${x0 + jitter()}px, ${y0 + jitter()}px) translate(-50%,-50%)`, opacity: 0 },
          { opacity: 1, offset: 0.1 },
          { transform: `translate(${x1 + jitter()}px, ${y1 + jitter()}px) translate(-50%,-50%)`, opacity: 1, offset: 0.85 },
          { transform: `translate(${x1}px, ${y1}px) translate(-50%,-50%) scale(0.6)`, opacity: 0 },
        ], { duration: 700 * speed(), delay: delay + k * 45, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' });
        a.onfinish = () => chip.remove();
      }
    }

    actionSound(type) {
      if (type === 'fold') root.Sound.play('fold');
      else if (type === 'check') root.Sound.play('check');
      else if (type === 'allin') { root.Sound.play('allin'); root.Sound.play('chips'); }
      else if (type === 'call' || type === 'bet' || type === 'raise') root.Sound.play('chip');
    }

    tweenNumber(el, to) {
      const from = Number(el.dataset.v || to);
      el.dataset.v = to;
      if (from === to || reduced()) { el.textContent = fmt(to); return; }
      const start = performance.now(), dur = 500 * speed();
      const step = (t) => {
        const k = Math.min(1, (t - start) / dur);
        const e = 1 - Math.pow(1 - k, 3);
        el.textContent = fmt(from + (to - from) * e);
        if (k < 1 && Number(el.dataset.v) === to) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    seatRect(i) { return this.seatEls[i] && this.seatEls[i].getBoundingClientRect(); }

    emote(i, html, cls) {
      const el = this.seatEls[i];
      if (!el) return;
      const b = document.createElement('div');
      b.className = cls || 'seat-emote';
      b.innerHTML = html;
      el.appendChild(b);
      setTimeout(() => b.remove(), 3500);
    }
  }

  function dealOrder(view, i) {
    const n = view.seats.length;
    let k = 0, j = view.sbSeat;
    for (let step = 0; step < n; step++) {
      if (j === i) return k;
      if (view.seats[j].inHand) k++;
      j = (j + 1) % n;
    }
    return 0;
  }

  function strengthLabel(hole, board) {
    if (board.length < 3) {
      const cls = C.handClass(hole[0], hole[1]);
      const p = root.PokerEquity.classPct(cls);
      return `${cls} · top ${Math.max(1, Math.round(p * 100))}%`;
    }
    const s = C.evaluate(hole.concat(board));
    return C.describe(s);
  }

  root.TableView = TableView;
  root.TableSpeed = speed;
})(window);
