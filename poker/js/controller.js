/*
 * controller.js
 *  TableScreen — everything around the felt: action dock, coach, hand
 *                review, HUD stats, hand history, keyboard shortcuts.
 *  LocalGame   — runs the engine in the browser for single-player and
 *                pass-and-play games (bots, timing, rebuys, tournaments).
 * Online games (net.js) implement the same "source" interface as LocalGame:
 *   getView(), heroSeat(), act(action), onUpdate, plus optional hooks.
 */
(function (root) {
  'use strict';
  const E = root.PokerEngine, AI = root.PokerAI, Coach = root.PokerCoach, C = root.PokerCards, Q = root.PokerEquity;
  const { $, esc, fmt, avatarHTML, toast, modal, confirmBox, confetti, announce, prettyCards, pct } = root.UI;
  const S = () => root.Store.settings;
  const speed = () => root.TableSpeed();

  const ACTION_LABEL = { fold: 'Fold', check: 'Check', call: 'Call', raise: 'Raise', bet: 'Bet', allin: 'All-in' };

  // =====================================================================
  class TableScreen {
    constructor(app) {
      this.app = app;
      this.tv = new root.TableView({ onSeatClick: (i) => this.seatInfo(i) });
      this.dock = $('#actionDock');
      this.coachEl = $('#coachPanel');
      this.infoEl = $('#tableInfo');
      this.logBody = $('#logBody');
      this.privacyEl = $('#privacy');
      this.source = null;
      this.coachVisible = window.innerWidth > 1180;
      this.tipIndex = Math.floor(Math.random() * 50);
      this.bindEvents();
    }

    attach(source) {
      if (this.source && this.source !== source && this.source.destroy) this.source.destroy();
      this.source = source;
      source.onUpdate = () => this.update();
      source.screen = this;
      this.session = { decisions: 0, score: 0, mistakes: 0, hands: 0 };
      this.hud = {};
      this.adv = null; this.advKey = null; this.revealed = false;
      this.decisions = []; this.review = null; this.preAction = null;
      this.curHand = -1; this.doneHand = -1; this.dockKey = ''; this.raiseTo = null;
      this.lastAnchor = null;
      this.tv.clear();
      this.setCoachVisible(this.coachVisible);
      this.app.show('table');
      $('#chatBox').hidden = !source.online;
      if (source.online) this.renderChat();
      this.update();
    }

    detach() {
      if (this.source && this.source.destroy) this.source.destroy();
      this.source = null;
      this.privacyEl.hidden = true;
      clearTimeout(this.advTimer);
    }

    // ---------------------------------------------------------------
    update() {
      const src = this.source;
      if (!src) return;
      const v = src.getView();
      if (!v) return;
      const hero = src.heroSeat();
      if (hero != null) this.lastAnchor = hero;
      this.v = v; this.hero = hero;

      if (v.handNo !== this.curHand) {
        this.curHand = v.handNo;
        this.decisions = [];
        this.preAction = null;
        this.tipIndex++;
      }
      const myTurn = hero != null && v.toAct === hero && v.street !== 'complete';
      this.myTurn = myTurn;

      this.tv.render(v, {
        hero, anchor: this.lastAnchor, styles: S().showStyles, handStrength: S().handStrength,
        turnMs: src.turnMs, actingSince: src.actingSince,
      });
      this.renderInfo(v);
      this.renderPrivacy();

      if (myTurn) this.onMyTurn(v, hero);
      else if (this.advKey && !myTurn) { this.adv = null; this.advKey = null; }

      if (v.street === 'complete' && this.doneHand !== v.handNo) {
        this.doneHand = v.handNo;
        this.onHandComplete(v, hero);
      }
      this.renderDock(v, hero);
      this.renderCoach();
      if ($('#logDrawer').classList.contains('open')) this.renderLog();
      this.updateCoachBadge();
    }

    onMyTurn(v, hero) {
      const key = v.handNo + ':' + v.seq;
      if (this.advKey !== key) {
        this.advKey = key;
        this.adv = null;
        this.revealed = S().coachMode === 'always';
        this.raiseOpen = false;
        if (this.lastTurnSound !== key) { this.lastTurnSound = key; root.Sound.play('turn'); announce('Your turn'); }
        // pre-actions
        if (this.preAction) {
          const L = E.legalActions(v, hero);
          const pa = this.preAction;
          let a = null;
          if (pa === 'checkfold') a = L.canCheck ? { type: 'check' } : { type: 'fold' };
          else if (pa === 'check' && L.canCheck) a = { type: 'check' };
          else if (pa === 'callany') a = L.canCheck ? { type: 'check' } : { type: 'call' };
          this.preAction = null;
          if (a) { setTimeout(() => this.act(a, true), 250); return; }
        }
        if (S().coachMode !== 'off') {
          clearTimeout(this.advTimer);
          this.advTimer = setTimeout(() => {
            if (this.advKey !== key || !this.source) return;
            this.adv = this.computeAdvice(v, hero);
            this.renderCoach();
            this.dockKey = '';
            this.renderDock(this.v, this.hero);
            this.updateCoachBadge();
          }, 60);
        }
      }
    }

    computeAdvice(v, hero, iterations) {
      try { return Coach.advise(v, hero, this.hudBySeat(v), { iterations: iterations || 2000 }); } catch (e) { console.error(e); return null; }
    }

    hudBySeat(v) {
      const out = {};
      (v || this.v).seats.forEach((s, i) => { if (this.hud[s.name]) out[i] = this.hud[s.name]; });
      return out;
    }

    // ---------------------------------------------------------------
    async act(action, auto) {
      const v = this.v, hero = this.hero;
      if (!this.myTurn || hero == null || !this.source) return;
      const L = E.legalActions(v, hero);
      if (!L) return;
      if (action.type === 'raise' && !L.canRaise) action = { type: L.canCheck ? 'check' : 'call' };
      let adv = this.adv;
      if (!adv && S().coachMode !== 'off') adv = this.adv = this.computeAdvice(v, hero, 900);
      if (!auto && adv && S().coachWarn && S().coachMode !== 'off') {
        const w = Coach.shouldWarn(adv, action);
        if (w) {
          const choice = await this.warn(adv, action, w);
          if (choice === 'cancel') return;
          if (choice === 'coach') action = { type: adv.rec.type, amount: adv.rec.amount };
          if (this.v !== v) return; // state moved on while the dialog was open
        }
      }
      if (adv) this.recordDecision(v, adv, action, L);
      this.myTurn = false;
      this.dockKey = '';
      root.Sound.unlock();
      this.source.act(action);
    }

    warn(adv, action, w) {
      return new Promise((resolve) => {
        const actual = describeAction(action, adv.legal);
        const m = modal(`<div class="warn-box"><span class="owl lg"></span><div>
          <h2>Coach: are you sure?</h2>
          <p class="sub">You chose <b>${esc(actual)}</b>. ${esc(w.note)}</p>
          <p style="margin:0;color:var(--ink-2)">The coach suggests <b style="color:var(--coach)">${esc(adv.rec.label)}</b>.</p>
          <ul style="color:var(--ink-2);font-size:14px;margin:10px 0 0;padding-left:18px">${adv.reasons.slice(0, 2).map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div></div>
          <div class="modal-actions"><button class="btn" data-w="anyway">${esc(actual)} anyway</button><button class="btn btn-coach" data-w="coach">${esc(adv.rec.label)}</button></div>
          <p style="margin:12px 0 0;font-size:12px;color:var(--muted);text-align:right">Turn these warnings off in Settings.</p>`,
        { onClose: (val) => resolve(val || 'cancel') });
        m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-w]'); if (b) m.close(b.dataset.w); });
      });
    }

    recordDecision(v, adv, action, L) {
      const g = Coach.grade(adv, action);
      if (!g) return;
      this.decisions.push({
        street: v.street, actual: describeAction(action, L), rec: adv.rec.label, grade: g, lesson: adv.lesson,
      });
      this.session.decisions++;
      this.session.score += g.score;
      if (g.grade === 'mistake' || g.grade === 'blunder') this.session.mistakes++;
      const st = root.Store.stats;
      st.coachDecisions++;
      st.coachScore += g.score;
      st.grades[g.grade] = (st.grades[g.grade] || 0) + 1;
      root.Store.save();
    }

    // ---------------------------------------------------------------
    onHandComplete(v, hero) {
      this.updateHud(v);
      this.session.hands++;
      const res = v.result;
      if (hero != null || this.source.localHero != null) {
        const h = hero != null ? hero : this.source.localHero;
        const s = v.seats[h];
        if (s && s.inHand) this.updateLifetime(v, h);
        const won = res && res.winnings && res.winnings[h];
        if (s && s.inHand) {
          if (won) { root.Sound.play('win'); if (won > v.bb * 40) confetti(1800); }
          else if (res && !res.uncontested && !s.folded) root.Sound.play('lose');
        }
      }
      if (this.decisions.length) {
        const items = this.decisions;
        const score = items.reduce((a, d) => a + d.grade.score, 0) / items.length;
        const worst = items.slice().sort((a, b) => a.grade.score - b.grade.score)[0];
        let summary;
        if (score >= 0.95) summary = 'Textbook. Every decision matched the coach.';
        else if (score >= 0.75) summary = 'Solid hand with a small leak or two.';
        else if (worst.grade.evLoss > 0) summary = `One decision cost about <b>${fmt(worst.grade.evLoss)}</b> chips in expectation. See the ${esc(worst.street)}.`;
        else summary = `Biggest lesson this hand: the ${esc(worst.street)} decision.`;
        const hs = v.seats[hero != null ? hero : this.source.localHero];
        this.review = {
          handNo: v.handNo, items, score, summary, lesson: worst.grade.score < 0.9 ? worst.lesson : null,
          cards: hs && hs.cards[0] >= 0 ? hs.cards.slice() : null, board: v.board.slice(), net: hs ? hs.stack - hs.startStack : 0,
        };
        if ((worst.grade.grade === 'blunder' || worst.grade.evLoss >= v.bb * 6) && S().coachMode !== 'off') toast(`<span class="owl"></span> Coach: review hand #${v.handNo}: ${esc(worst.grade.label.toLowerCase())} on the ${esc(worst.street)}`, 'coach', 3200);
      }
    }

    updateHud(v) {
      v.seats.forEach((s, i) => {
        if (!s.inHand) return;
        const h = this.hud[s.name] || (this.hud[s.name] = { hands: 0, vpip: 0, pfr: 0, aggr: 0, calls: 0, sd: 0 });
        h.hands++;
        const acts = v.actions.filter((a) => a.seat === i);
        if (acts.some((a) => a.street === 'preflop' && (a.type === 'call' || a.type === 'raise'))) h.vpip++;
        if (acts.some((a) => a.street === 'preflop' && a.type === 'raise')) h.pfr++;
        acts.forEach((a) => { if (a.street !== 'preflop') { if (a.type === 'raise') h.aggr++; if (a.type === 'call') h.calls++; } });
        if (v.result && !v.result.uncontested && !s.folded) h.sd++;
      });
    }

    updateLifetime(v, h) {
      const st = root.Store.stats;
      const s = v.seats[h];
      const acts = v.actions.filter((a) => a.seat === h);
      st.hands++;
      if (acts.some((a) => a.street === 'preflop' && (a.type === 'call' || a.type === 'raise'))) st.vpip++;
      if (acts.some((a) => a.street === 'preflop' && a.type === 'raise')) st.pfr++;
      const foldedPre = acts.some((a) => a.street === 'preflop' && a.type === 'fold');
      if (!foldedPre && v.board.length >= 3) st.sawFlop++;
      const res = v.result;
      const won = (res && res.winnings && res.winnings[h]) || 0;
      if (res && !res.uncontested && !s.folded) {
        st.showdowns++;
        if (won) st.showdownsWon++;
        const hand = res.hands[h];
        if (hand && hand.score > st.bestHand) { st.bestHand = hand.score; st.bestHandName = hand.name; }
      }
      if (won) {
        st.won++;
        const pot = res.pots.filter((p) => p.winners.includes(h)).reduce((a, p) => a + p.amount, 0);
        if (pot / v.bb > st.biggestPotBB) { st.biggestPotBB = pot / v.bb; st.biggestPot = pot; }
      }
      const net = (s.stack - s.startStack) / v.bb;
      st.netBB += net;
      st.history.push(Math.round(st.netBB * 10) / 10);
      if (st.history.length > 400) st.history.splice(0, st.history.length - 400);
      st.lastPlayed = Date.now();
      root.Store.save();
    }

    // ---------------------------------------------------------------
    renderInfo(v) {
      const src = this.source;
      const pills = [];
      pills.push(`<span class="info-pill gold">${esc(src.label || 'Table')}</span>`);
      if (v.handNo) pills.push(`<span class="info-pill hide-sm">Hand <b>#${v.handNo}</b></span>`);
      pills.push(`<span class="info-pill">Blinds <b>${fmt(v.sb)}/${fmt(v.bb)}</b>${v.ante ? ` <span>ante ${fmt(v.ante)}</span>` : ''}</span>`);
      if (v.config.mode === 'tournament') {
        const hpl = v.config.handsPerLevel;
        const into = ((v.handNo - 1) % hpl) + 1;
        const left = v.seats.filter((s) => !s.out).length;
        pills.push(`<span class="info-pill hide-sm">Level <b>${v.level + 1}</b> <span class="lvl-bar" title="${hpl - into} hands to next level"><i style="width:${(into / hpl) * 100}%"></i></span></span>`);
        pills.push(`<span class="info-pill">Players <b>${left}/${v.seats.length}</b></span>`);
      }
      const html = pills.join('');
      if (this.infoEl.innerHTML !== html) this.infoEl.innerHTML = html;
    }

    renderPrivacy() {
      const src = this.source;
      const idx = src.needsPrivacy ? src.needsPrivacy() : null;
      if (idx == null) { this.privacyEl.hidden = true; return; }
      const name = this.v.seats[idx].name;
      const key = 'pv' + idx + ':' + this.v.handNo + ':' + this.v.seq;
      if (this.privacyEl.dataset.k === key && !this.privacyEl.hidden) return;
      this.privacyEl.dataset.k = key;
      this.privacyEl.hidden = false;
      this.privacyEl.innerHTML = `<div class="pv-card">${avatarHTML(name, this.v.seats[idx].hue, '')}
        <h2>${esc(name)}, your turn</h2><p>Pass the device to ${esc(name)}. Everyone else, look away!</p>
        <button class="btn btn-gold btn-lg" data-reveal="${idx}" autofocus>Show my cards</button></div>`;
      setTimeout(() => { const b = this.privacyEl.querySelector('button'); if (b) b.focus(); }, 50);
    }

    // ---------------------------------------------------------------
    renderDock(v, hero) {
      const src = this.source;
      const L = this.myTurn ? E.legalActions(v, hero) : null;
      const hs = hero != null ? v.seats[hero] : null;
      const key = [v.handNo, v.seq, v.toAct, this.myTurn, !!this.adv, this.revealed, this.preAction, v.street, src.waitingDeal, src.rebuyOffer, src.statusText || '', hero].join('|');
      if (key === this.dockKey) return;
      this.dockKey = key;

      let html = '';
      if (L) {
        html = this.dockActions(v, hero, L);
      } else if (src.rebuyOffer) {
        html = `<div class="dock-msg">You're out of chips. <button class="btn btn-gold" data-dock="rebuy">Rebuy ${fmt(src.rebuyOffer)}</button><button class="btn" data-action="leave-table">Leave table</button></div>`;
      } else if (v.street === 'complete' || v.street === 'idle') {
        if (src.waitingDeal) html = `<div class="dock-msg"><button class="btn btn-gold btn-lg" data-dock="deal">Deal next hand <span style="opacity:.6;font-weight:600">(Space)</span></button></div>`;
        else html = `<div class="dock-msg">${src.statusText ? esc(src.statusText) : 'Next hand coming up…'}</div>`;
      } else if (hs && hs.inHand && !hs.folded && !hs.allIn) {
        const actor = v.toAct >= 0 ? v.seats[v.toAct] : null;
        const facingBet = v.currentBet > hs.bet;
        const toggle = (k, label) => `<label class="pre-toggle ${this.preAction === k ? 'on' : ''}"><input type="checkbox" data-pre="${k}" ${this.preAction === k ? 'checked' : ''}>${label}</label>`;
        html = `<div class="dock-inner"><div class="dock-msg">${actor ? `<b>${esc(actor.name)}</b> is thinking <span class="thinking"><i></i><i></i><i></i></span>` : '&nbsp;'}</div>
          <div class="pre-actions">${toggle('checkfold', facingBet ? 'Fold' : 'Check / Fold')}${facingBet ? '' : toggle('check', 'Check')}${toggle('callany', facingBet ? 'Call ' + fmt(Math.min(v.currentBet - hs.bet, hs.stack)) : 'Call any')}</div></div>`;
      } else {
        const actor = v.toAct >= 0 ? v.seats[v.toAct] : null;
        const why = hs && hs.folded ? 'You folded.' : hs && hs.allIn ? 'You\'re all-in.' : hs && hs.out ? 'You\'re out of the tournament.' : hero == null && src.needsPrivacy ? '' : 'Watching.';
        html = `<div class="dock-msg">${why} ${actor ? `<b>${esc(actor.name)}</b> to act <span class="thinking"><i></i><i></i><i></i></span>` : ''}
          ${src.canFastForward && src.canFastForward() ? '<button class="btn btn-sm" data-dock="ff">Fast-forward ⏩</button>' : ''}</div>`;
      }
      this.dock.innerHTML = html;
      if (L) this.wireRaise(v, L);
    }

    dockActions(v, hero, L) {
      const adv = this.adv && this.revealed ? this.adv : null;
      const rec = adv ? adv.rec.type : null;
      const recCls = (t) => (rec === t ? ' recommended' : '');
      const btns = [];
      if (L.toCall > 0) btns.push(`<button class="act-btn act-fold${recCls('fold')}" data-act="fold"><span class="kbd">F</span>Fold</button>`);
      if (L.canCheck) btns.push(`<button class="act-btn act-check${recCls('check')}" data-act="check"><span class="kbd">C</span>Check</button>`);
      else {
        const allInCall = L.toCall >= L.stack;
        btns.push(`<button class="act-btn ${allInCall ? 'act-allin' : 'act-call'}${recCls('call')}" data-act="call"><span class="kbd">C</span>${allInCall ? 'Call all-in' : 'Call'}<small class="num">${fmt(L.toCall)}</small></button>`);
      }
      let raiseRow = '';
      if (L.canRaise) {
        const verb = L.isBet ? 'Bet' : 'Raise to';
        const def = this.defaultRaise(v, L, adv);
        this.raiseTo = def;
        btns.push(`<button class="act-btn act-raise${recCls('raise')}" data-act="raise"><span class="kbd">R</span><span data-raise-label>${def >= L.maxRaiseTo ? 'All-in' : verb}</span><small class="num" data-raise-amt>${fmt(def)}</small></button>`);
        if (L.maxRaiseTo > L.minRaiseTo) {
          const presets = this.presets(v, L, adv);
          raiseRow = `<div class="raise-row">
            <div class="presets">${presets.map((p) => `<button class="preset${p.coach ? ' coach' : ''}" data-preset="${p.to}">${esc(p.label)}</button>`).join('')}</div>
            <div class="slider-wrap"><input type="range" min="${L.minRaiseTo}" max="${L.maxRaiseTo}" step="${Math.max(1, v.sb)}" value="${def}" aria-label="Raise amount">
            <input class="amount-input num" type="number" min="${L.minRaiseTo}" max="${L.maxRaiseTo}" value="${def}" aria-label="Raise amount"></div></div>`;
        }
      }
      const collapsed = raiseRow && (window.innerWidth <= 760 || window.innerHeight <= 500) && !this.raiseOpen;
      return `<div class="dock-inner${collapsed ? ' raise-collapsed' : ''}">${raiseRow}<div class="dock-row">${btns.join('')}</div></div>`;
    }

    potRaise(v, L, frac) {
      const pot = E.potTotal(v);
      const to = v.currentBet + frac * (pot + L.toCall);
      return this.clampTo(v, L, to);
    }
    clampTo(v, L, x) {
      const unit = Math.max(1, v.sb);
      let to = Math.round(x / unit) * unit;
      return Math.max(L.minRaiseTo, Math.min(L.maxRaiseTo, to));
    }
    presets(v, L, adv) {
      const out = [];
      const pre = v.street === 'preflop';
      const opened = v.currentBet > v.bb;
      if (pre && !opened) {
        out.push({ label: '2.5×', to: this.clampTo(v, L, v.bb * 2.5) }, { label: '3×', to: this.clampTo(v, L, v.bb * 3) }, { label: '4×', to: this.clampTo(v, L, v.bb * 4) });
      } else if (pre) {
        out.push({ label: '3×', to: this.clampTo(v, L, v.currentBet * 3) }, { label: '4×', to: this.clampTo(v, L, v.currentBet * 4) });
      } else {
        out.push({ label: '⅓', to: this.potRaise(v, L, 1 / 3) }, { label: '½', to: this.potRaise(v, L, 0.5) }, { label: '¾', to: this.potRaise(v, L, 0.75) });
      }
      out.push({ label: 'Pot', to: this.potRaise(v, L, 1) }, { label: 'All-in', to: L.maxRaiseTo });
      if (adv && adv.rec.type === 'raise' && adv.rec.amount) out.unshift({ label: 'Coach ' + fmt(adv.rec.amount), to: adv.rec.amount, coach: true });
      return out;
    }
    defaultRaise(v, L, adv) {
      if (adv && adv.rec.type === 'raise' && adv.rec.amount) return adv.rec.amount;
      if (v.street === 'preflop') return this.clampTo(v, L, v.currentBet > v.bb ? v.currentBet * 3 : v.bb * 2.5 + v.actions.filter((a) => a.street === 'preflop' && a.type === 'call').length * v.bb);
      return this.potRaise(v, L, L.isBet ? 0.6 : 0.75);
    }
    wireRaise(v, L) {
      const range = this.dock.querySelector('input[type=range]');
      const num = this.dock.querySelector('.amount-input');
      const label = this.dock.querySelector('[data-raise-label]');
      const amt = this.dock.querySelector('[data-raise-amt]');
      const set = (x, from) => {
        x = Math.max(L.minRaiseTo, Math.min(L.maxRaiseTo, Math.round(Number(x) || L.minRaiseTo)));
        this.raiseTo = x;
        if (range && from !== 'range') range.value = x;
        if (num && from !== 'num') num.value = x;
        if (range) range.style.setProperty('--p', ((x - L.minRaiseTo) / Math.max(1, L.maxRaiseTo - L.minRaiseTo)) * 100 + '%');
        if (amt) amt.textContent = fmt(x);
        if (label) label.textContent = x >= L.maxRaiseTo ? 'All-in' : L.isBet ? 'Bet' : 'Raise to';
      };
      this.setRaise = set;
      if (range) range.addEventListener('input', () => set(range.value, 'range'));
      if (num) num.addEventListener('change', () => set(num.value, 'num'));
      set(this.raiseTo);
    }

    // ---------------------------------------------------------------
    renderCoach() {
      if (!this.coachVisible && window.innerWidth <= 1180) { this.coachDirty = true; return; }
      this.coachDirty = false;
      const v = this.v;
      root.CoachPanel.render(this.coachEl, {
        mode: S().coachMode, myTurn: this.myTurn, adv: this.myTurn ? this.adv : null, revealed: this.revealed,
        view: v, hero: this.hero, hud: this.hud, showStyles: S().showStyles, review: this.review,
        session: this.session, tipIndex: this.tipIndex,
      });
    }
    setCoachVisible(on) {
      this.coachVisible = on;
      this.coachEl.classList.toggle('hidden', !on);
      $('#btnCoach').classList.toggle('on', on);
      if (on && this.coachDirty !== false) this.renderCoach();
    }
    updateCoachBadge() {
      const btn = $('#btnCoach');
      const label = btn.querySelector('.coach-toggle-label');
      if (this.myTurn && this.adv && this.revealed && S().coachMode !== 'off') {
        label.textContent = this.adv.rec.label.replace(/ to .*/, '');
        btn.classList.add('has-rec');
      } else {
        label.textContent = 'Coach';
        btn.classList.remove('has-rec');
      }
    }

    renderLog() {
      const v = this.v;
      if (!v) return;
      const byHand = new Map();
      for (const l of v.log) {
        if (!byHand.has(l.hand)) byHand.set(l.hand, []);
        byHand.get(l.hand).push(l);
      }
      const hands = Array.from(byHand.entries()).slice(-15).reverse();
      this.logBody.innerHTML = hands.map(([hn, lines]) => `<div class="log-hand"><h5>Hand #${hn}</h5>${lines.filter((l) => l.kind !== 'hand')
        .map((l) => `<div class="log-line ${l.kind}">${prettyCards(l.text)}</div>`).join('')}</div>`).join('') || '<div class="empty-state">No hands yet.</div>';
    }

    renderChat() {
      const box = $('#chatBox');
      box.innerHTML = `<div class="chat-log" id="chatLog"></div>
        <div class="emotes">${['👍', '😂', '😮', '😤', '🔥', 'GG', 'NH'].map((e) => `<button data-emote="${e}">${e}</button>`).join('')}</div>
        <form class="chat-form" id="chatForm"><input maxlength="140" placeholder="Say something…" aria-label="Chat message"><button class="btn btn-sm">Send</button></form>`;
    }
    addChat(name, text, seat) {
      const log = $('#chatLog');
      if (!log) return;
      log.insertAdjacentHTML('beforeend', `<div class="chat-msg"><b>${esc(name)}</b>${esc(text)}</div>`);
      log.scrollTop = log.scrollHeight;
      if (seat != null) {
        const isEmote = /^(\p{Extended_Pictographic}|GG|NH)$/u.test(text);
        this.tv.emote(seat, esc(text), isEmote ? 'seat-emote' : 'seat-say');
      }
    }

    seatInfo(i) {
      const v = this.v;
      if (!v || i === this.hero) return;
      const s = v.seats[i];
      const st = this.hud[s.name];
      const prof = s.isBot && s.profile && AI.PROFILES[s.profile];
      const showStyle = S().showStyles && prof;
      const stat = (label, val, sub) => `<div class="metric"><span>${label}</span><b class="num">${val}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
      const p = (x) => (st && st.hands ? Math.round((100 * x) / st.hands) + '%' : '—');
      const af = st && st.calls ? (st.aggr / st.calls).toFixed(1) : st && st.aggr ? '∞' : '—';
      const derived = st && st.hands >= 8 ? root.CoachPanel.styleFromStats(st) : null;
      modal(`<div style="display:flex;gap:14px;align-items:center;margin-bottom:16px">${avatarHTML(s.name, s.hue)}<div><h2 style="margin:0">${esc(s.name)}</h2>
        <div class="sub" style="margin:0">${showStyle ? esc(prof.label) : s.isBot ? 'Computer player' : 'Human player'} · ${fmt(s.stack)} chips</div></div></div>
        <div class="cp-metrics" style="grid-template-columns:repeat(4,1fr)">${stat('Hands', st ? st.hands : 0)}${stat('VPIP', p(st ? st.vpip : 0))}${stat('PFR', p(st ? st.pfr : 0))}${stat('AF', af)}</div>
        <div class="cp-card" style="margin-top:14px"><h4><span class="owl" style="width:16px;height:16px;vertical-align:-3px"></span> Coach's read</h4>
        <div class="cp-tip">${showStyle ? esc(prof.blurb) : derived ? esc(derived) + '. ' + exploitTip(st) : 'Not enough hands yet for a reliable read. Watch how often they enter pots (VPIP) and raise (PFR).'}</div></div>
        <p style="font-size:12.5px;color:var(--muted);margin:12px 0 0"><b>VPIP</b>: how often they put money in preflop. <b>PFR</b>: how often they raise preflop. <b>AF</b>: bets and raises ÷ calls after the flop.</p>`);
    }

    // ---------------------------------------------------------------
    bindEvents() {
      this.dock.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (b) {
          const t = b.dataset.act;
          const inner = b.closest('.dock-inner');
          if (t === 'raise' && inner && inner.classList.contains('raise-collapsed')) {
            // phones: first tap opens the sizing controls, second tap confirms
            this.raiseOpen = true;
            inner.classList.remove('raise-collapsed');
            const lbl = b.querySelector('[data-raise-label]');
            if (lbl) lbl.textContent = 'Confirm';
            return;
          }
          if (t === 'raise') this.act({ type: 'raise', amount: this.raiseTo });
          else this.act({ type: t });
          return;
        }
        const p = e.target.closest('[data-preset]');
        if (p && this.setRaise) { this.setRaise(Number(p.dataset.preset)); return; }
        const d = e.target.closest('[data-dock]');
        if (d && this.source) {
          const k = d.dataset.dock;
          if (k === 'deal' && this.source.deal) this.source.deal();
          if (k === 'rebuy' && this.source.rebuy) this.source.rebuy();
          if (k === 'ff' && this.source.fastForward) this.source.fastForward();
        }
      });
      this.dock.addEventListener('change', (e) => {
        const c = e.target.closest('[data-pre]');
        if (c) { this.preAction = c.checked ? c.dataset.pre : null; this.dockKey = ''; this.renderDock(this.v, this.hero); }
      });
      this.coachEl.addEventListener('click', (e) => {
        const m = e.target.closest('[data-coach-mode]');
        if (m) {
          root.Store.setSetting('coachMode', m.dataset.coachMode);
          this.revealed = m.dataset.coachMode === 'always';
          if (m.dataset.coachMode !== 'off' && this.myTurn && !this.adv) { this.advKey = null; this.onMyTurn(this.v, this.hero); }
          this.dockKey = ''; this.update(); return;
        }
        if (e.target.closest('[data-coach-reveal]')) { this.reveal(); return; }
        const l = e.target.closest('[data-lesson]');
        if (l) this.app.openLesson(l.dataset.lesson, true);
      });
      this.privacyEl.addEventListener('click', (e) => {
        const b = e.target.closest('[data-reveal]');
        if (b && this.source && this.source.reveal) { this.privacyEl.hidden = true; this.source.reveal(Number(b.dataset.reveal)); }
      });
      $('#chatBox').addEventListener('submit', (e) => {
        e.preventDefault();
        const inp = e.target.querySelector('input');
        if (inp.value.trim() && this.source && this.source.chat) this.source.chat(inp.value.trim());
        inp.value = '';
      });
      $('#chatBox').addEventListener('click', (e) => {
        const b = e.target.closest('[data-emote]');
        if (b && this.source && this.source.chat) this.source.chat(b.dataset.emote);
      });
      document.addEventListener('keydown', (e) => this.onKey(e));
      window.addEventListener('resize', () => { if (this.coachDirty && (this.coachVisible || window.innerWidth > 1180)) this.renderCoach(); });
    }

    reveal() {
      this.revealed = true;
      root.Sound.play('coach');
      this.dockKey = '';
      this.renderCoach(); this.renderDock(this.v, this.hero); this.updateCoachBadge();
    }

    onKey(e) {
      if (!this.source || !$('#screen-table').classList.contains('active')) return;
      if (!S().keyboard) return;
      if ($('#modalRoot').children.length) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' && e.target.type !== 'range' && e.target.type !== 'checkbox') { if (e.key === 'Enter' && e.target.classList.contains('amount-input')) { e.target.blur(); this.act({ type: 'raise', amount: this.raiseTo }); } return; }
      if (tag === 'textarea') return;
      const k = e.key.toLowerCase();
      if (!this.privacyEl.hidden && (k === 'enter' || k === ' ')) { const b = this.privacyEl.querySelector('button'); if (b) { e.preventDefault(); b.click(); } return; }
      if (k === 'h') { if (this.myTurn && !this.revealed && this.adv) this.reveal(); else this.setCoachVisible(!this.coachVisible); return; }
      if (k === 'l') { this.app.toggleLog(); return; }
      if (k === ' ' && this.source.waitingDeal) { e.preventDefault(); this.source.deal(); return; }
      if (!this.myTurn) return;
      const L = E.legalActions(this.v, this.hero);
      if (!L) return;
      if (k === 'f' && L.toCall > 0) this.act({ type: 'fold' });
      else if (k === 'c' || k === 'k') this.act({ type: L.canCheck ? 'check' : 'call' });
      else if ((k === 'r' || k === 'b' || k === 'enter') && L.canRaise) this.act({ type: 'raise', amount: this.raiseTo });
      else if (k === 'a' && L.canRaise && this.setRaise) this.setRaise(L.maxRaiseTo);
      else if ((k === 'arrowup' || k === 'arrowright') && this.setRaise && document.activeElement.type !== 'range') { e.preventDefault(); this.setRaise(this.raiseTo + Math.max(this.v.bb, 1)); }
      else if ((k === 'arrowdown' || k === 'arrowleft') && this.setRaise && document.activeElement.type !== 'range') { e.preventDefault(); this.setRaise(this.raiseTo - Math.max(this.v.bb, 1)); }
    }
  }

  function exploitTip(st) {
    const v = st.vpip / st.hands, p = st.pfr / st.hands;
    if (v > 0.45 && p < 0.15) return 'They call too often: value-bet your good hands bigger and avoid bluffing them.';
    if (v > 0.45) return 'They raise a lot of weak hands: tighten up, then call down or re-raise with strong hands.';
    if (v < 0.16) return 'They only play strong hands: steal their blinds often, but fold to their big bets.';
    return 'A reasonable style. Focus on position and solid fundamentals.';
  }

  function describeAction(a, L) {
    if (a.type === 'raise') {
      if (L && a.amount >= L.maxRaiseTo) return 'All-in';
      return (L && L.isBet ? 'Bet ' : 'Raise to ') + fmt(a.amount);
    }
    if (a.type === 'call') return 'Call' + (L ? ' ' + fmt(L.toCall) : '');
    return ACTION_LABEL[a.type] || a.type;
  }

  // =====================================================================
  class LocalGame {
    /**
     * cfg = {mode:'cash'|'tournament', hotseat:bool, players:[{name,isBot,profile,hue}],
     *        stack, sb, bb, ante, handsPerLevel, difficulty, label}
     */
    constructor(cfg) {
      this.cfg = cfg;
      this.label = cfg.label;
      this.rng = Math.random;
      this.g = E.createGame({
        mode: cfg.mode, smallBlind: cfg.sb, bigBlind: cfg.bb, ante: cfg.ante || 0, startingStack: cfg.stack,
        handsPerLevel: cfg.handsPerLevel || 8, players: cfg.players,
      });
      this.g.seats.forEach((s, i) => { s.hue = cfg.players[i].hue; });
      this.humans = this.g.seats.filter((s) => !s.isBot).map((s) => s.index);
      this.hotseat = this.humans.length > 1;
      this.localHero = this.hotseat ? null : this.humans[0];
      this.revealedFor = null;
      this.usedNames = new Set(this.g.seats.map((s) => s.name));
      this.timer = null;
      this.ff = false;
      this.dead = false;
      this.waitingDeal = false;
      this.rebuyOffer = 0;
      this.statusText = '';
      setTimeout(() => this.startNext(), 500);
    }

    destroy() { this.dead = true; clearTimeout(this.timer); }

    getView() {
      let viewer = this.hotseat ? (this.revealedFor != null ? this.revealedFor : -9) : this.localHero;
      const v = E.viewFor(this.g, viewer);
      v.seats.forEach((s, i) => { s.hue = this.g.seats[i].hue; });
      return v;
    }
    heroSeat() { return this.hotseat ? this.revealedFor : this.localHero; }
    needsPrivacy() {
      if (!this.hotseat) return null;
      const g = this.g;
      if (g.toAct >= 0 && !g.seats[g.toAct].isBot && this.revealedFor !== g.toAct && g.street !== 'complete') return g.toAct;
      return null;
    }
    reveal(i) { this.revealedFor = i; this.emit(); }
    canFastForward() { return !this.hotseat && !this.ff && this.g.street !== 'complete'; }
    fastForward() { this.ff = true; this.schedule(); this.emit(); }

    emit() { if (this.onUpdate) this.onUpdate(); }

    act(action) {
      const g = this.g;
      const idx = g.toAct;
      if (idx < 0 || g.seats[idx].isBot) return;
      if (this.hotseat && this.revealedFor !== idx) return;
      const r = E.act(g, idx, action);
      if (!r.ok) { toast(esc(r.error)); return; }
      if (this.hotseat) this.revealedFor = null;
      this.emit();
      this.schedule();
    }

    pace(ms) {
      const heroOut = this.localHero != null && (!this.g.seats[this.localHero].inHand || this.g.seats[this.localHero].folded || this.g.seats[this.localHero].out);
      return ms * speed() * (this.ff ? 0.15 : heroOut ? 0.55 : 1);
    }

    schedule() {
      clearTimeout(this.timer);
      if (this.dead) return;
      const g = this.g;
      if (g.street === 'complete') {
        this.afterHand();
        return;
      }
      if (E.needsAdvance(g)) {
        const allInRunout = g.seats.filter(E.canAct).length < 2;
        this.timer = setTimeout(() => { E.advance(g); this.emit(); this.schedule(); }, this.pace(allInRunout ? 1300 : 750));
        return;
      }
      const s = g.seats[g.toAct];
      if (s && s.isBot) {
        const t = AI.thinkTime(g, g.toAct, this.rng);
        this.timer = setTimeout(() => {
          if (this.dead) return;
          const a = AI.decide(g, g.toAct, this.rng, this.screen ? this.screen.hudBySeat(this.getView()) : null);
          E.act(g, g.toAct, a);
          this.emit();
          this.schedule();
        }, this.pace(t));
      }
      // humans: wait for input
    }

    banter() {
      const g = this.g, res = g.result;
      if (!res || !this.screen || Math.random() > 0.45) return;
      const LINES = {
        win: { maniac: ['Ship it!', 'Too easy.', 'Who wants some more?'], lag: ['Thanks for the chips.', 'Pressure works.'], tag: ['Nice hand.', 'Good game.'],
          station: ['I knew you had nothing!', 'Had to look.'], rock: ['Patience pays.', 'Waited all night for that.'], shark: ['Standard.', 'Ran good.'], novice: ['Wait, I won?!', 'Beginner\'s luck!'] },
        lose: { maniac: ['Lucky river!', 'Next one is mine.'], lag: ['Well played.', 'Nice call.'], tag: ['Nice hand.', 'Good call.'],
          station: ['How?!', 'I had to call…'], rock: ['Hmm.', 'Unlucky.'], shark: ['Nice hand.', 'gg'], novice: ['Ouch.', 'Oops.'] },
      };
      const big = res.pots.reduce((a, p) => a + p.amount, 0) >= g.bb * 30;
      if (!big || res.uncontested) return;
      const winner = g.seats[res.pots[0].winners[0]];
      const losers = g.seats.filter((s) => s.inHand && !s.folded && s.isBot && !res.winnings[s.index]);
      const speaker = winner.isBot && Math.random() < 0.6 ? winner : losers[0];
      if (!speaker || !speaker.isBot) return;
      const pool = (speaker === winner ? LINES.win : LINES.lose)[speaker.profile] || ['Nice hand.'];
      const line = pool[Math.floor(Math.random() * pool.length)];
      setTimeout(() => this.screen && this.screen.tv.emote(speaker.index, esc(line), 'seat-say'), 1200 * speed());
    }

    afterHand() {
      const g = this.g;
      this.ff = false;
      const res = g.result;
      this.banter();
      const pause = res && res.uncontested ? 1900 : 4200;
      // tournament over?
      if (g.config.mode === 'tournament') {
        const heroSeat = this.localHero != null ? g.seats[this.localHero] : null;
        if (heroSeat && heroSeat.out && !this.heroBustShown) {
          this.heroBustShown = true;
          this.timer = setTimeout(() => this.showBust(heroSeat), 2200);
          return;
        }
        if (g.over) { this.timer = setTimeout(() => this.showTournamentEnd(), 2400); return; }
      }
      // cash: replace busted bots, offer rebuy to humans
      if (g.config.mode === 'cash') {
        for (const s of g.seats) {
          if (s.stack > 0 || s.inHand === undefined) continue;
          if (s.isBot) {
            const old = s.name;
            const nb = AI.makeBot(this.cfg.difficulty, Math.floor(this.rng() * 10), this.usedNames, this.rng);
            this.timer = null;
            setTimeout(() => {
              if (this.dead) return;
              s.name = nb.name; s.profile = nb.profile; s.id = nb.id; s.stack = g.config.startingStack; s.hue = Math.floor(this.rng() * 360);
              toast(`${esc(old)} leaves · <b>${esc(nb.name)}</b> sits down`, '', 2400);
              this.emit();
            }, this.pace(pause * 0.6));
          } else if (this.hotseat) {
            setTimeout(() => { s.stack = g.config.startingStack; toast(`${esc(s.name)} rebuys for ${fmt(s.stack)}`); this.emit(); }, 400);
          }
        }
        if (this.localHero != null && g.seats[this.localHero].stack === 0) {
          this.rebuyOffer = g.config.startingStack;
          this.emit();
          return;
        }
      }
      if (!root.Store.settings.autoDeal && !this.hotseat) {
        this.waitingDeal = true;
        this.emit();
        return;
      }
      this.timer = setTimeout(() => this.startNext(), this.pace(pause) / (this.localHero != null && g.seats[this.localHero].out ? 2 : 1));
    }

    deal() { if (this.waitingDeal) { this.waitingDeal = false; this.startNext(); } }
    rebuy() {
      const s = this.g.seats[this.localHero];
      s.stack = this.g.config.startingStack;
      this.rebuyOffer = 0;
      root.Store.stats.netBB -= 0; // rebuys are tracked through stack changes per hand
      toast(`Rebought for ${fmt(s.stack)}`, 'gold');
      this.startNext();
    }

    startNext() {
      if (this.dead) return;
      this.waitingDeal = false;
      const ok = E.startHand(this.g, this.rng);
      if (!ok) {
        this.statusText = 'Not enough players to continue.';
        this.emit();
        return;
      }
      this.statusText = '';
      this.emit();
      this.schedule();
    }

    showBust(seat) {
      const g = this.g;
      const n = g.seats.length;
      const place = seat.place;
      recordTournament(place, n);
      const m = modal(`<div class="result-hero"><p class="eyebrow">Tournament over for you</p><div class="place">#${place}</div>
        <p class="sub">You finished ${ordinal(place)} of ${n}. ${place <= Math.max(1, Math.floor(n / 3)) ? 'That\'s in the money — well played!' : 'Every bust is a lesson. Check your hand reviews in the coach panel.'}</p></div>
        <div class="modal-actions" style="justify-content:center"><button class="btn" data-x="watch">Watch to the end</button><button class="btn btn-gold" data-x="again">Play again</button><button class="btn" data-x="lobby">Lobby</button></div>`,
      { onClose: (v) => { if (v === 'again') this.screen.app.startLocal(this.cfg); else if (v === 'lobby') this.screen.app.leaveTable(true); else { this.ff = false; this.startNext(); } } });
      m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-x]'); if (b) m.close(b.dataset.x); });
    }

    showTournamentEnd() {
      const g = this.g;
      const n = g.seats.length;
      const heroWon = this.localHero != null && g.winnerSeat === this.localHero;
      if (heroWon) { recordTournament(1, n); confetti(4200); root.Sound.play('win'); }
      const rows = g.seats.slice().sort((a, b) => (a.place || 99) - (b.place || 99))
        .map((s) => `<tr><td>#${s.place}</td><td>${esc(s.name)}${s.index === this.localHero ? ' <span class="tag host">you</span>' : ''}</td></tr>`).join('');
      const winner = g.seats[g.winnerSeat];
      const m = modal(`<div class="result-hero"><p class="eyebrow">${heroWon ? 'Champion' : 'Tournament complete'}</p>
        <div class="place">${heroWon ? '🏆' : '#1'}</div><h2>${heroWon ? 'You won the tournament!' : esc(winner.name) + ' wins'}</h2></div>
        <table class="result-table">${rows}</table>
        <div class="modal-actions" style="justify-content:center"><button class="btn btn-gold" data-x="again">Play again</button><button class="btn" data-x="lobby">Lobby</button></div>`,
      { closable: false, onClose: (v) => { if (v === 'again') this.screen.app.startLocal(this.cfg); else this.screen.app.leaveTable(true); } });
      m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-x]'); if (b) m.close(b.dataset.x); });
    }
  }

  function recordTournament(place, n) {
    const st = root.Store.stats;
    st.tournaments++;
    if (place === 1) st.tournamentWins++;
    if (place <= Math.max(1, Math.floor(n / 3))) st.itm++;
    st.places.push(place);
    root.Store.save();
  }
  function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

  root.TableScreen = TableScreen;
  root.LocalGame = LocalGame;
  root.describeAction = describeAction;
  void Q; void C; void pct;
})(window);
