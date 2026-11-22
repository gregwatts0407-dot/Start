/* app.js — screens, menus, setup dialogs, settings and stats. */
(function (root) {
  'use strict';
  const { $, $$, esc, fmt, avatarHTML, modal, toast, cardHTML, confirmBox } = root.UI;
  const Store = root.Store;
  const AI = root.PokerAI;
  const C = root.PokerCards;

  const App = {
    screen: 'home',
    init() {
      this.table = new root.TableScreen(this);
      this.applySettings();
      this.renderHome();
      document.addEventListener('click', (e) => this.onClick(e));
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (root.UI.closeTopModal()) return;
          if ($('#logDrawer').classList.contains('open')) this.toggleLog();
        }
      });
      document.addEventListener('pointerdown', () => root.Sound.unlock(), { once: true });
      // fanned cards on the home screen
      $$('.fan-card').forEach((el) => { el.innerHTML = cardHTML(C.parseCard(el.dataset.card));  });
      const params = new URLSearchParams(location.search);
      if (params.get('room')) { this.show('online'); root.Net && root.Net.renderLobby(params.get('room')); }
      window.addEventListener('beforeunload', (e) => {
        if (this.screen === 'table' && this.table.source && this.table.source.online) { e.preventDefault(); e.returnValue = ''; }
      });
    },

    show(name) {
      this.screen = name;
      $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
      if (name === 'home') this.renderHome();
    },

    onClick(e) {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const a = el.dataset.action;
      const map = {
        'quick-play': () => this.quickPlay(),
        'setup-cash': () => this.setupGame('cash'),
        'setup-tournament': () => this.setupGame('tournament'),
        'setup-hotseat': () => this.setupHotseat(),
        'open-online': () => { this.show('online'); root.Net.renderLobby(); },
        'open-academy': () => { this.show('academy'); root.Academy.renderHome(); },
        'open-stats': () => { this.show('stats'); this.renderStats(); },
        'open-settings': () => this.openSettings(),
        'open-help': () => this.openHelp(),
        'go-home': () => this.show('home'),
        'leave-table': () => this.leaveTable(),
        'toggle-log': () => this.toggleLog(),
        'toggle-sound': () => { Store.setSetting('sound', !Store.settings.sound); this.applySettings(); },
        'toggle-coach': () => this.table.setCoachVisible(!this.table.coachVisible),
        'reset-stats': () => confirmBox('Reset stats?', 'This clears your lifetime results and coach scores. Academy progress is kept.', 'Reset', 'Cancel', { danger: true }).then((ok) => { if (ok) { Store.resetStats(); this.renderStats(); } }),
      };
      if (map[a]) { e.preventDefault(); map[a](); }
    },

    applySettings() {
      const s = Store.settings;
      document.body.dataset.felt = s.felt;
      document.body.dataset.back = s.back;
      document.body.classList.toggle('four-color', !!s.fourColor);
      document.body.classList.toggle('muted', !s.sound);
      root.Sound.setEnabled(s.sound);
      root.Sound.setVolume(s.volume);
      const b = $('#btnSound');
      if (b) b.classList.toggle('active', !!s.sound);
    },

    // ---------------- home ----------------
    renderHome() {
      const p = Store.profile;
      $('#profileName').textContent = p.name;
      $('#profileAvatar').outerHTML = avatarHTML(p.name, p.hue, 'sm').replace('class="avatar sm"', 'class="avatar sm" id="profileAvatar"');
      $('#profileRank').textContent = Store.rank().name;
      const cont = $('#homeContinue');
      const next = root.Academy && root.Academy.nextLesson();
      if (next) {
        const done = Object.keys(Store.academy.done).length;
        cont.innerHTML = `<span class="owl lg"></span><span class="hc-text"><b>${done ? 'Continue learning' : 'New to poker? Start here'}</b>
          <small>Lesson ${next.num}: ${esc(next.title)} · ${next.minutes} min</small></span><span class="btn btn-sm btn-coach">Start</span>`;
        cont.onclick = () => { this.show('academy'); root.Academy.openLesson(next.id); };
      } else cont.innerHTML = '';
      $('#profileChip').onclick = () => this.openProfile();
    },

    // ---------------- games ----------------
    makePlayers(n, difficulty, heroName) {
      const used = new Set([heroName]);
      const players = [{ name: heroName, isBot: false, hue: Store.profile.hue, id: 'hero' }];
      // shuffle the personality mix so tables differ
      const mix = AI.DIFFICULTY_MIX[difficulty].slice().sort(() => Math.random() - 0.5);
      for (let k = 0; k < n; k++) {
        const b = AI.makeBot(difficulty, 0, used);
        b.profile = mix[k % mix.length];
        b.hue = Math.floor(Math.random() * 360);
        players.push(b);
      }
      return players;
    },

    quickPlay() {
      this.startLocal({ mode: 'cash', players: this.makePlayers(5, 'medium', Store.profile.name), stack: 1000, sb: 5, bb: 10, difficulty: 'medium', label: 'Cash · 5/10' });
    },

    startLocal(cfg) {
      // fresh bots each time "play again" is used
      if (cfg._again) cfg.players = this.makePlayers(cfg.players.length - 1, cfg.difficulty, Store.profile.name);
      cfg._again = true;
      root.UI.closeTopModal();
      const game = new root.LocalGame(cfg);
      this.table.attach(game);
      if (!Store.academy.seenTableTip) {
        Store.academy.seenTableTip = true; Store.save();
        setTimeout(() => toast('<span class="owl"></span> Tip: tap a player for their stats and the coach\'s read.', 'coach', 4200), 1500);
      }
    },

    async leaveTable(force) {
      const src = this.table.source;
      if (!force && src && src.getView && src.getView().street !== 'complete' && src.getView().handNo > 0) {
        const ok = await confirmBox('Leave the table?', src.online ? 'You will leave this online room.' : 'Your current game will end.', 'Leave', 'Stay');
        if (!ok) return;
      }
      if (src && src.leave) src.leave();
      this.table.detach();
      $('#logDrawer').classList.remove('open');
      this.show('home');
    },

    toggleLog() {
      const d = $('#logDrawer');
      d.classList.toggle('open');
      $('#btnLog').classList.toggle('active', d.classList.contains('open'));
      if (d.classList.contains('open')) this.table.renderLog();
    },

    setupGame(mode) {
      const isT = mode === 'tournament';
      let opp = isT ? 5 : 5, diff = 'medium', preset = 0;
      const presets = isT
        ? [{ label: 'Standard', sub: '1,500 chips · levels every 8 hands', stack: 1500, sb: 10, bb: 20, hpl: 8 },
          { label: 'Turbo', sub: '1,000 chips · every 5 hands', stack: 1000, sb: 10, bb: 20, hpl: 5 },
          { label: 'Deep', sub: '3,000 chips · every 10 hands', stack: 3000, sb: 10, bb: 20, hpl: 10 }]
        : [{ label: '100 BB', sub: '1,000 chips · 5/10', stack: 1000, sb: 5, bb: 10 },
          { label: 'Deep', sub: '2,000 chips · 5/10', stack: 2000, sb: 5, bb: 10 },
          { label: 'Short', sub: '400 chips · 5/10', stack: 400, sb: 5, bb: 10 }];
      const m = modal(`<h2>${isT ? 'Sit &amp; Go Tournament' : 'Cash Game'}</h2>
        <p class="sub">${isT ? 'Everyone starts equal. Blinds rise until one player has every chip.' : 'Play as long as you like. Rebuy whenever you run out.'}</p>
        <div class="field"><span class="field-label">Opponents</span><div class="seg" data-g="opp">${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<button data-v="${n}" class="${n === opp ? 'on' : ''}">${n}</button>`).join('')}</div></div>
        <div class="field"><span class="field-label">Difficulty</span><div class="seg" data-g="diff">
          <button data-v="easy">Easy<small>Loose, makes mistakes</small></button><button data-v="medium" class="on">Medium<small>A mixed table</small></button><button data-v="hard">Hard<small>Sharks and regulars</small></button></div></div>
        <div class="field"><span class="field-label">${isT ? 'Structure' : 'Stakes'}</span><div class="seg" data-g="preset">${presets.map((p, i) => `<button data-v="${i}" class="${i === 0 ? 'on' : ''}">${p.label}<small>${p.sub}</small></button>`).join('')}</div></div>
        <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-gold" data-start>Take a seat</button></div>`);
      m.el.addEventListener('click', (e) => {
        const b = e.target.closest('.seg button');
        if (b) {
          const g = b.parentElement.dataset.g;
          $$('button', b.parentElement).forEach((x) => x.classList.toggle('on', x === b));
          if (g === 'opp') opp = Number(b.dataset.v);
          if (g === 'diff') diff = b.dataset.v;
          if (g === 'preset') preset = Number(b.dataset.v);
        }
        if (e.target.closest('[data-start]')) {
          const p = presets[preset];
          m.close();
          this.startLocal({
            mode, players: this.makePlayers(opp, diff, Store.profile.name), stack: p.stack, sb: p.sb, bb: p.bb, handsPerLevel: p.hpl,
            difficulty: diff, label: isT ? 'Sit & Go · ' + p.label : 'Cash · ' + p.sb + '/' + p.bb,
          });
        }
      });
    },

    setupHotseat() {
      const names = [Store.profile.name, 'Player 2'];
      let bots = 1, mode = 'cash', diff = 'medium';
      const m = modal(`<h2>Pass &amp; Play</h2><p class="sub">Share one device. Each player's cards stay hidden until they tap to reveal them.</p>
        <div class="field"><span class="field-label">Players</span><div class="hotseat-list" id="hsList"></div>
          <button class="btn btn-sm btn-ghost" id="hsAdd" style="align-self:flex-start;margin-top:4px">+ Add player</button></div>
        <div class="field-row">
          <div class="field"><span class="field-label">Bots</span><div class="seg" data-g="bots">${[0, 1, 2, 3, 4].map((n) => `<button data-v="${n}" class="${n === bots ? 'on' : ''}">${n}</button>`).join('')}</div></div>
          <div class="field"><span class="field-label">Format</span><div class="seg" data-g="mode"><button data-v="cash" class="on">Cash</button><button data-v="tournament">Sit &amp; Go</button></div></div>
        </div>
        <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-gold" data-start>Deal me in</button></div>`, { wide: false });
      const list = $('#hsList', m.el);
      const draw = () => {
        list.innerHTML = names.map((n, i) => `<div class="hs-row">${avatarHTML(n || '?', null, 'sm')}<input class="text-input" data-i="${i}" value="${esc(n)}" maxlength="14" aria-label="Player ${i + 1} name">
          ${names.length > 2 ? `<button class="icon-btn" data-rm="${i}" aria-label="Remove"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : ''}</div>`).join('');
        $('#hsAdd', m.el).hidden = names.length + bots >= 9;
      };
      draw();
      list.addEventListener('input', (e) => { if (e.target.dataset.i) names[e.target.dataset.i] = e.target.value; });
      m.el.addEventListener('click', (e) => {
        if (e.target.closest('#hsAdd')) { names.push('Player ' + (names.length + 1)); draw(); }
        const rm = e.target.closest('[data-rm]');
        if (rm) { names.splice(Number(rm.dataset.rm), 1); draw(); }
        const b = e.target.closest('.seg button');
        if (b) {
          $$('button', b.parentElement).forEach((x) => x.classList.toggle('on', x === b));
          if (b.parentElement.dataset.g === 'bots') bots = Number(b.dataset.v);
          if (b.parentElement.dataset.g === 'mode') mode = b.dataset.v;
          draw();
        }
        if (e.target.closest('[data-start]')) {
          const clean = names.map((n, i) => (n.trim() || 'Player ' + (i + 1)).slice(0, 14));
          if (new Set(clean).size !== clean.length) { toast('Each player needs a different name'); return; }
          if (clean.length + bots > 9) { toast('Maximum 9 players'); return; }
          const used = new Set(clean);
          const players = clean.map((n, i) => ({ name: n, isBot: false, hue: (i * 67 + 20) % 360, id: 'h' + i }));
          for (let k = 0; k < bots; k++) { const b2 = AI.makeBot(diff, k, used); b2.hue = Math.floor(Math.random() * 360); players.push(b2); }
          // interleave bots between humans for a nicer table
          m.close();
          this.startLocal({ mode, players, stack: mode === 'tournament' ? 1500 : 1000, sb: mode === 'tournament' ? 10 : 5, bb: mode === 'tournament' ? 20 : 10, handsPerLevel: 8, difficulty: diff, label: 'Pass & Play' });
        }
      });
    },

    // ---------------- lessons from the table ----------------
    openLesson(id, overlay) {
      if (overlay) {
        const m = modal(`<div class="lesson" style="padding:0">${root.Academy.lessonHTML(id, true)}</div>`, { wide: true });
        root.Academy.wireLesson(m.el, id);
        return;
      }
      this.show('academy');
      root.Academy.openLesson(id);
    },

    // ---------------- settings & profile ----------------
    openSettings() {
      const s = Store.settings;
      const sw = (k, label, sub) => `<div class="toggle-row"><div><b>${label}</b><small>${sub}</small></div><label class="switch"><input type="checkbox" data-set="${k}" ${s[k] ? 'checked' : ''}><span></span></label></div>`;
      const seg = (k, opts) => `<div class="seg" data-seg="${k}">${opts.map(([v, l]) => `<button data-v="${v}" class="${s[k] === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
      const felts = [['green', '#1f8a5a'], ['blue', '#1f6fa8'], ['red', '#a3343d'], ['purple', '#6a3fa8'], ['charcoal', '#3a4652']];
      const backs = [['red', '#8a1d2e'], ['blue', '#1f4590'], ['black', '#1a1d23']];
      const m = modal(`<h2>Settings</h2><p class="sub">Saved on this device.</p>
        <div class="field"><span class="field-label">Coach</span>${seg('coachMode', [['always', 'Always on'], ['ask', 'On request'], ['off', 'Off']])}</div>
        ${sw('coachWarn', 'Warn before big mistakes', 'The coach asks before you make a costly fold or call.')}
        ${sw('handStrength', 'Show my hand strength', 'A label under your cards: "Pair of Kings", "AKs · top 4%".')}
        ${sw('showStyles', 'Reveal bot personalities', 'Shows each computer player\'s style in their profile and the coach panel.')}
        <div class="field" style="margin-top:14px"><span class="field-label">Game speed</span>${seg('speed', [['slow', 'Relaxed'], ['normal', 'Normal'], ['fast', 'Fast'], ['turbo', 'Turbo']])}</div>
        ${sw('autoDeal', 'Deal automatically', 'Start the next hand without pressing a button.')}
        ${sw('sound', 'Sound effects', 'Cards, chips and alerts.')}
        ${sw('keyboard', 'Keyboard shortcuts', 'F fold · C check/call · R raise · A all-in · H coach · L history.')}
        ${sw('fourColor', 'Four-colour deck', 'Diamonds blue and clubs green, so suits are easier to tell apart.')}
        <div class="field" style="margin-top:14px"><span class="field-label">Table felt</span><div class="swatches">${felts.map(([k, c]) => `<button class="swatch ${s.felt === k ? 'on' : ''}" data-felt="${k}" style="background:${c}" aria-label="${k} felt"></button>`).join('')}</div></div>
        <div class="field"><span class="field-label">Card back</span><div class="swatches">${backs.map(([k, c]) => `<button class="swatch ${s.back === k ? 'on' : ''}" data-back="${k}" style="background:${c}" aria-label="${k} card back"></button>`).join('')}</div></div>
        <div class="modal-actions"><button class="btn btn-gold" data-close>Done</button></div>`);
      m.el.addEventListener('change', (e) => {
        const k = e.target.dataset.set;
        if (k) { Store.setSetting(k, e.target.checked); this.applySettings(); this.refreshTable(); }
      });
      m.el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-seg] button');
        if (b) {
          const k = b.parentElement.dataset.seg;
          $$('button', b.parentElement).forEach((x) => x.classList.toggle('on', x === b));
          Store.setSetting(k, b.dataset.v);
          this.refreshTable();
        }
        const f = e.target.closest('[data-felt]');
        if (f) { Store.setSetting('felt', f.dataset.felt); $$('[data-felt]', m.el).forEach((x) => x.classList.toggle('on', x === f)); this.applySettings(); }
        const bk = e.target.closest('[data-back]');
        if (bk) { Store.setSetting('back', bk.dataset.back); $$('[data-back]', m.el).forEach((x) => x.classList.toggle('on', x === bk)); this.applySettings(); }
      });
    },
    refreshTable() {
      if (this.table.source) { this.table.dockKey = ''; this.table.revealed = Store.settings.coachMode === 'always' || this.table.revealed; this.table.advKey = null; this.table.update(); }
    },

    openProfile() {
      const p = Store.profile;
      let hue = p.hue;
      const m = modal(`<h2>Your profile</h2><p class="sub">Shown at the table and in online rooms.</p>
        <div style="display:flex;justify-content:center;margin-bottom:16px" id="pfAv">${avatarHTML(p.name, hue)}</div>
        <div class="field"><label for="pfName">Name</label><input type="text" id="pfName" value="${esc(p.name)}" maxlength="14"></div>
        <div class="field"><span class="field-label">Colour</span><div class="swatches">${[42, 0, 200, 140, 270, 320, 20, 170].map((h) => `<button class="swatch ${h === hue ? 'on' : ''}" data-hue="${h}" style="background:hsl(${h} 60% 50%)" aria-label="Colour"></button>`).join('')}</div></div>
        <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-gold" data-save>Save</button></div>`);
      const redraw = () => { $('#pfAv', m.el).innerHTML = avatarHTML($('#pfName', m.el).value || '?', hue).replace('class="avatar "', 'class="avatar" style="width:72px;height:72px;font-size:24px;--hue:' + hue + '"'); };
      redraw();
      m.el.addEventListener('input', redraw);
      m.el.addEventListener('click', (e) => {
        const s = e.target.closest('[data-hue]');
        if (s) { hue = Number(s.dataset.hue); $$('[data-hue]', m.el).forEach((x) => x.classList.toggle('on', x === s)); redraw(); }
        if (e.target.closest('[data-save]')) {
          p.name = ($('#pfName', m.el).value.trim() || 'You').slice(0, 14);
          p.hue = hue;
          Store.save();
          m.close();
          this.renderHome();
        }
      });
    },

    openHelp() {
      modal(`<h2>How to play</h2><p class="sub">No-Limit Texas Hold'em in one minute.</p>
        <div class="prose" style="font-size:15px">
          <ol>
            <li>Everyone gets <strong>two private cards</strong>. Two players post forced bets: the <strong>blinds</strong>.</li>
            <li>Betting goes clockwise: <strong>fold</strong>, <strong>call</strong> (match the bet), or <strong>raise</strong>. With no bet to face you can <strong>check</strong>.</li>
            <li>Three shared cards are dealt (the <strong>flop</strong>), then one more (the <strong>turn</strong>) and a final one (the <strong>river</strong>), with a betting round after each.</li>
            <li>The best five-card hand from your two cards plus the five shared cards wins — or win by making everyone else fold.</li>
          </ol>
          <h3>Keyboard</h3>
          <table><tr><td><b>F</b></td><td>Fold</td><td><b>C</b></td><td>Check / Call</td></tr>
          <tr><td><b>R</b> / Enter</td><td>Bet / Raise</td><td><b>A</b></td><td>Set raise to all-in</td></tr>
          <tr><td><b>↑ ↓</b></td><td>Change raise size</td><td><b>H</b></td><td>Ask the coach / toggle panel</td></tr>
          <tr><td><b>L</b></td><td>Hand history</td><td><b>Space</b></td><td>Deal next hand</td></tr></table>
        </div>
        <div class="modal-actions"><button class="btn" data-close>Close</button><button class="btn btn-coach" data-action="open-academy" data-close>Open the Academy</button></div>`);
    },

    // ---------------- stats ----------------
    renderStats() {
      const st = Store.stats;
      const el = $('#statsPage');
      if (!st.hands && !st.coachDecisions) {
        el.innerHTML = `<div class="stats-wrap"><div class="empty-state"><span class="owl lg"></span><h3>No hands played yet</h3><p>Play a few hands and your results, tendencies and coach scores will appear here.</p>
          <button class="btn btn-gold" data-action="quick-play">Quick Play</button></div></div>`;
        return;
      }
      const p = (a, b) => (b ? Math.round((100 * a) / b) + '%' : '—');
      const coach = st.coachDecisions ? Math.round((100 * st.coachScore) / st.coachDecisions) : null;
      const tile = (label, val, sub, cls) => `<div class="stat-tile"><span>${label}</span><b class="${cls || ''}">${val}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
      const vpip = st.hands ? st.vpip / st.hands : 0, pfr = st.hands ? st.pfr / st.hands : 0;
      let style = '—';
      if (st.hands >= 20) style = vpip > 0.4 ? (pfr > 0.2 ? 'Loose-aggressive' : 'Loose-passive') : vpip < 0.16 ? 'Very tight' : pfr / Math.max(vpip, 0.01) > 0.6 ? 'Tight-aggressive' : 'Tight-passive';
      const grades = ['great', 'good', 'close', 'inaccuracy', 'mistake', 'blunder'];
      const gTotal = grades.reduce((a, g) => a + (st.grades[g] || 0), 0);
      const gColor = { great: 'var(--good)', good: 'var(--good)', close: 'var(--info)', inaccuracy: 'var(--warn)', mistake: 'var(--bad)', blunder: 'var(--bad)' };
      el.innerHTML = `<div class="stats-wrap">
        <div class="stat-grid">
          ${tile('Hands played', fmt(st.hands))}
          ${tile('Net result', (st.netBB >= 0 ? '+' : '') + fmt(st.netBB) + ' bb', 'big blinds won or lost', st.netBB >= 0 ? 'pos' : 'neg')}
          ${tile('Win rate', st.hands ? ((st.netBB / st.hands) * 100).toFixed(1) : '—', 'bb per 100 hands')}
          ${tile('Coach score', coach == null ? '—' : coach, coach == null ? 'turn the coach on' : `${fmt(st.coachDecisions)} decisions graded`)}
          ${tile('VPIP', p(st.vpip, st.hands), 'voluntarily put chips in')}
          ${tile('PFR', p(st.pfr, st.hands), 'raised before the flop')}
          ${tile('Showdowns won', p(st.showdownsWon, st.showdowns), fmt(st.showdowns) + ' showdowns')}
          ${tile('Your style', style, st.hands < 20 ? 'needs 20+ hands' : '')}
          ${tile('Biggest pot', st.biggestPot ? fmt(st.biggestPot) : '—', st.biggestPotBB ? Math.round(st.biggestPotBB) + ' big blinds' : '')}
          ${tile('Best hand', st.bestHandName ? esc(st.bestHandName) : '—')}
          ${tile('Tournaments', fmt(st.tournaments), st.tournaments ? `${st.tournamentWins} won · ${st.itm} in the money` : '')}
          ${tile('Hands won', p(st.won, st.hands))}
        </div>
        <div class="two-col">
          <div class="panel-box"><h3>Results over time (big blinds)</h3><div class="chart">${chart(st.history)}</div></div>
          <div class="panel-box"><h3>Coach grades</h3>${gTotal ? `<div class="bars">${grades.map((g) => {
            const n = st.grades[g] || 0;
            return `<div class="bar-row"><span>${root.PokerCoach.GRADE_LABEL[g]}</span><span class="bar"><i style="width:${(100 * n) / gTotal}%;background:${gColor[g]}"></i></span><span class="num" style="text-align:right">${n}</span></div>`;
          }).join('')}</div>` : '<div class="empty-state">Turn the coach on to get your decisions graded.</div>'}
          <p style="color:var(--muted);font-size:13px;margin:14px 0 0">${styleAdvice(vpip, pfr, st.hands)}</p></div>
        </div></div>`;
    },
  };

  function styleAdvice(vpip, pfr, hands) {
    if (hands < 20) return 'Play at least 20 hands for the coach to read your style.';
    if (vpip > 0.35) return 'Coach: you play a lot of hands. Tightening up, especially from early position, will likely improve your results.';
    if (vpip < 0.15) return 'Coach: you are very tight. Try opening more hands from the cutoff and button.';
    if (pfr < vpip * 0.5) return 'Coach: you call much more than you raise. Raising first in builds pots you control and wins the blinds more often.';
    return 'Coach: your preflop numbers look healthy. Keep focusing on pot odds and position.';
  }

  function chart(hist) {
    if (!hist || hist.length < 2) return '<div class="empty-state">Play a few more hands to see a chart.</div>';
    const W = 600, H = 200, pad = 24;
    const min = Math.min(0, ...hist), max = Math.max(0, ...hist);
    const span = max - min || 1;
    const x = (i) => pad + (i / (hist.length - 1)) * (W - pad * 2);
    const y = (v) => H - pad - ((v - min) / span) * (H - pad * 2);
    const d = hist.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
    const last = hist[hist.length - 1];
    const color = last >= 0 ? '#34d399' : '#ff6b6b';
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Net result chart">
      <defs><linearGradient id="cg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      <line x1="${pad}" x2="${W - pad}" y1="${y(0)}" y2="${y(0)}" stroke="rgba(255,255,255,.15)" stroke-dasharray="4 4"/>
      <path d="${d} L${x(hist.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z" fill="url(#cg)"/>
      <path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
      <text x="${W - pad}" y="${Math.max(14, y(last) - 8)}" fill="${color}" font-size="13" text-anchor="end" font-weight="700">${last >= 0 ? '+' : ''}${last} bb</text></svg>`;
  }

  root.App = App;
  document.addEventListener('DOMContentLoaded', () => App.init());
})(window);
