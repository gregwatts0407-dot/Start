/* net.js — online lobby and the network game source used by TableScreen. */
(function (root) {
  'use strict';
  const { $, $$, esc, fmt, avatarHTML, toast } = root.UI;
  const Store = root.Store;
  const SESSION_KEY = 'felt-online-session';

  const page = () => $('#onlinePage');
  let conn = null; // active NetGame

  async function api(path, body) {
    const res = await fetch('api/' + path, {
      method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }
  async function serverAvailable() {
    if (!/^https?:$/.test(location.protocol)) return false;
    try { const r = await api('health'); return !!r.ok; } catch (e) { return false; }
  }
  function saveSession(s) { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }
  function loadSession() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; } }
  function clearSession() { try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } }

  async function renderLobby(prefill) {
    if (conn && conn.status !== 'closed' && conn.lastState && conn.lastState.type === 'lobby') { conn.renderWaiting(); return; }
    page().innerHTML = `<div class="online-wrap"><div class="empty-state">Connecting <span class="thinking"><i></i><i></i><i></i></span></div></div>`;
    const ok = await serverAvailable();
    if (!ok) {
      page().innerHTML = `<div class="online-wrap"><div class="panel-box" style="padding:28px">
        <h3 style="font-size:20px;margin-bottom:6px">Online play needs the game server</h3>
        <p style="color:var(--ink-2);margin:0 0 14px">Rooms are hosted by a small server that comes with the game. It needs only Node.js, with no installs:</p>
        <div class="formula">cd poker<br>node server.js</div>
        <p style="color:var(--ink-2)">Then open <b>http://localhost:8080</b>. Friends on the same network can join at your computer's address (for example <b>http://192.168.1.20:8080</b>), or deploy the folder to any Node host.</p>
        <p style="color:var(--muted);margin-bottom:0">Meanwhile, <b>Pass &amp; Play</b> lets several people play on this device.</p>
        <div class="modal-actions" style="justify-content:flex-start"><button class="btn btn-gold" data-action="setup-hotseat">Pass &amp; Play</button><button class="btn" data-net="retry">Try again</button></div></div></div>`;
      return;
    }
    const sess = loadSession();
    if (sess && !prefill) {
      // rejoin a room after a refresh
      try { await api(`rooms/${sess.code}/join`, { token: sess.token, name: Store.profile.name, hue: Store.profile.hue }); connect(sess.code, sess.token); return; } catch (e) { clearSession(); }
    }
    const code = (prefill || '').toUpperCase();
    page().innerHTML = `<div class="online-wrap">
      <p style="color:var(--ink-2);margin:0 0 18px">Create a private room and share the code, or join a friend's room. Empty seats can be filled with bots.</p>
      <div class="online-cards">
        <div class="panel-box"><h3>Create a room</h3>
          <div class="field"><span class="field-label">Format</span><div class="seg" data-g="mode"><button data-v="cash" class="on">Cash game</button><button data-v="tournament">Sit &amp; Go</button></div></div>
          <div class="field"><span class="field-label">Blinds &amp; stack</span><div class="seg" data-g="stakes">
            <button data-v="5:1000" class="on">5/10<small>1,000 chips</small></button><button data-v="10:2000">10/20<small>2,000 chips</small></button><button data-v="25:5000">25/50<small>5,000 chips</small></button></div></div>
          <div class="field"><span class="field-label">Turn timer</span><div class="seg" data-g="timer"><button data-v="20">20s</button><button data-v="30" class="on">30s</button><button data-v="60">60s</button></div></div>
          <button class="btn btn-gold" data-net="create" style="width:100%">Create room</button></div>
        <div class="panel-box"><h3>Join a room</h3>
          <div class="field"><label for="joinCode">Room code</label><input id="joinCode" class="text-input code-input" maxlength="5" placeholder="ABCDE" value="${esc(code)}" autocomplete="off" autocapitalize="characters"></div>
          <button class="btn btn-gold" data-net="join" style="width:100%">Join</button>
          <p style="color:var(--muted);font-size:13px;margin:14px 0 0">You'll play as <b>${esc(Store.profile.name)}</b>. <button class="link" style="padding:0;text-decoration:underline" id="netProfile">Change name</button></p></div>
      </div></div>`;
    const opts = { mode: 'cash', stakes: '5:1000', timer: '30' };
    page().onclick = async (e) => {
      const b = e.target.closest('.seg button');
      if (b) { $$('button', b.parentElement).forEach((x) => x.classList.toggle('on', x === b)); opts[b.parentElement.dataset.g] = b.dataset.v; return; }
      if (e.target.closest('#netProfile')) { root.App.openProfile(); return; }
      const a = e.target.closest('[data-net]');
      if (!a) return;
      if (a.dataset.net === 'retry') return renderLobby();
      a.disabled = true;
      try {
        if (a.dataset.net === 'create') {
          const [sb, stack] = opts.stakes.split(':').map(Number);
          const r = await api('rooms', { name: Store.profile.name, hue: Store.profile.hue, config: { mode: opts.mode, sb, stack, turnSeconds: Number(opts.timer) } });
          connect(r.code, r.token);
        } else {
          const c = $('#joinCode').value.trim().toUpperCase();
          if (c.length < 5) throw new Error('Enter the 5-character room code');
          const r = await api(`rooms/${c}/join`, { name: Store.profile.name, hue: Store.profile.hue });
          connect(r.code, r.token);
        }
      } catch (err) { toast(esc(err.message)); a.disabled = false; }
    };
    const ji = $('#joinCode');
    if (ji) ji.addEventListener('keydown', (e) => { if (e.key === 'Enter') page().querySelector('[data-net=join]').click(); });
    void fmt;
  }

  function connect(code, tok) {
    if (conn) conn.close();
    saveSession({ code, token: tok });
    conn = new NetGame(code, tok);
    if (history.replaceState) history.replaceState(null, '', location.pathname + '?room=' + code);
  }

  // =====================================================================
  class NetGame {
    constructor(code, tok) {
      this.code = code; this.token = tok; this.online = true;
      this.label = 'Online · ' + code;
      this.lastState = null; this.view = null; this.status = 'connecting';
      this.es = new EventSource(`api/rooms/${code}/stream?token=${encodeURIComponent(tok)}`);
      this.es.addEventListener('state', (e) => this.onState(JSON.parse(e.data)));
      this.es.addEventListener('chat', (e) => this.onChat(JSON.parse(e.data)));
      this.es.onerror = () => { if (this.status !== 'closed') this.status = 'reconnecting'; };
      this.attached = false;
    }
    onState(st) {
      this.status = 'open';
      this.lastState = st;
      if (st.type === 'lobby') {
        if ($('#screen-online').classList.contains('active') || !this.attached) {
          if (!$('#screen-online').classList.contains('active')) root.App.show('online');
          this.renderWaiting();
        }
        return;
      }
      this.view = st.view;
      this.you = st.you;
      this.turnMs = st.turnMs;
      // adjust for clock skew between server and browser
      this.actingSince = st.actingSince ? Date.now() - (st.serverNow - st.actingSince) : 0;
      const hs = this.you && this.view.seats[this.you.seat];
      this.rebuyOffer = hs && st.view.config.mode === 'cash' && hs.stack === 0 && (!hs.inHand || st.view.street === 'complete') ? st.cfg.stack : 0;
      this.statusText = st.status === 'waiting' ? 'Waiting for more players…' : st.status === 'over' ? 'Game over.' : '';
      if (!this.attached) { this.attached = true; root.App.table.attach(this); }
      else if (this.onUpdate) this.onUpdate();
      if (st.status === 'over' && !this.overShown) {
        this.overShown = true;
        const g = this.view;
        const rows = g.seats.slice().sort((a, b) => (a.place || 99) - (b.place || 99)).map((s) => `<tr><td>#${s.place || '-'}</td><td>${esc(s.name)}</td></tr>`).join('');
        root.UI.modal(`<div class="result-hero"><p class="eyebrow">Game over</p><h2>${g.winnerSeat >= 0 ? esc(g.seats[g.winnerSeat].name) + ' wins!' : 'Thanks for playing'}</h2></div><table class="result-table">${rows}</table>
          <div class="modal-actions" style="justify-content:center"><button class="btn btn-gold" data-action="leave-table" data-close>Back to lobby</button></div>`);
        if (this.you && g.winnerSeat === this.you.seat) root.UI.confetti(4000);
      }
    }
    onChat(c) {
      if (root.App.table.source === this) root.App.table.addChat(c.name, c.text, c.system ? null : c.seat);
      else if (this.lastState && this.lastState.type === 'lobby') {
        const log = $('#lobbyChat');
        if (log) log.insertAdjacentHTML('beforeend', `<div class="chat-msg"><b>${esc(c.name)}</b>${esc(c.text)}</div>`);
      }
    }
    renderWaiting() {
      const st = this.lastState;
      if (!st || st.type !== 'lobby') return;
      const you = st.you || {};
      const link = location.origin + location.pathname + '?room=' + st.code;
      const humans = st.members.filter((m) => !m.isBot).length;
      page().innerHTML = `<div class="online-wrap"><div class="online-cards">
        <div class="panel-box"><span class="field-label">Room code</span><div class="room-code">${esc(st.code)}</div>
          <p style="color:var(--ink-2);margin:6px 0 14px">Share the code or the link. Friends join from <b>Play Online</b>.</p>
          <div style="display:flex;gap:8px"><input class="text-input" readonly value="${esc(link)}" aria-label="Invite link" style="font-size:13px"><button class="btn" data-net="copy">Copy</button></div>
          <div style="margin-top:16px;color:var(--muted);font-size:13px">${st.cfg.mode === 'tournament' ? 'Sit &amp; Go' : 'Cash game'} · blinds ${st.cfg.sb}/${st.cfg.bb} · ${fmt(st.cfg.stack)} chips · ${st.cfg.turnSeconds}s per turn</div></div>
        <div class="panel-box"><h3>Players (${st.members.length}/9)</h3>
          <div class="player-list">${st.members.map((m) => `<div class="player-row">${avatarHTML(m.name, m.hue)}<b>${esc(m.name)}</b>
            ${m.host ? '<span class="tag host">Host</span>' : ''}${m.isBot ? `<span class="tag bot">Bot</span>${you.host ? `<button class="icon-btn" data-rmbot="${esc(m.name)}" aria-label="Remove bot" style="width:30px;height:30px"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : ''}` : m.connected ? '' : '<span class="tag off">Away</span>'}</div>`).join('')}</div>
          ${you.host ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"><button class="btn btn-sm" data-bot="easy">+ Easy bot</button><button class="btn btn-sm" data-bot="medium">+ Medium bot</button><button class="btn btn-sm" data-bot="hard">+ Hard bot</button></div>
            <button class="btn btn-gold" data-net="start" style="width:100%" ${st.members.length < 2 ? 'disabled' : ''}>Start game</button>
            ${st.members.length < 2 ? '<p style="color:var(--muted);font-size:13px;margin:8px 0 0">Waiting for players, or add a bot to start.</p>' : ''}`
          : '<p style="color:var(--ink-2)">Waiting for the host to start the game <span class="thinking"><i></i><i></i><i></i></span></p>'}
          <button class="btn btn-ghost btn-sm" data-net="leave" style="margin-top:12px">Leave room</button>
          <div class="chat-log" id="lobbyChat" style="margin-top:12px"></div></div></div>
          <p style="color:var(--muted);font-size:13px;margin-top:14px">${humans > 1 ? 'Everyone is connected. ' : ''}Your cards are private: the server only ever sends each player their own hand.</p></div>`;
      page().onclick = async (e) => {
        try {
          if (e.target.closest('[data-net=copy]')) { await navigator.clipboard.writeText(link).catch(() => {}); toast('Invite link copied'); }
          const bot = e.target.closest('[data-bot]');
          if (bot) await api(`rooms/${this.code}/bot`, { token: this.token, difficulty: bot.dataset.bot });
          const rb = e.target.closest('[data-rmbot]');
          if (rb) await api(`rooms/${this.code}/removebot`, { token: this.token, name: rb.dataset.rmbot });
          if (e.target.closest('[data-net=start]')) await api(`rooms/${this.code}/start`, { token: this.token });
          if (e.target.closest('[data-net=leave]')) { this.leave(); renderLobby(); }
        } catch (err) { toast(esc(err.message)); }
      };
    }

    // ---- source interface for TableScreen ----
    getView() { return this.view; }
    heroSeat() { return this.you && this.you.seat >= 0 ? this.you.seat : null; }
    async act(action) {
      try { await api(`rooms/${this.code}/act`, { token: this.token, action }); } catch (e) { toast(esc(e.message)); if (this.onUpdate) this.onUpdate(); }
    }
    async chat(text) { try { await api(`rooms/${this.code}/chat`, { token: this.token, text }); } catch (e) { toast(esc(e.message)); } }
    async rebuy() { try { await api(`rooms/${this.code}/rebuy`, { token: this.token }); } catch (e) { toast(esc(e.message)); } }
    leave() {
      api(`rooms/${this.code}/leave`, { token: this.token }).catch(() => {});
      this.close();
      clearSession();
      if (history.replaceState) history.replaceState(null, '', location.pathname);
    }
    close() { this.status = 'closed'; if (this.es) this.es.close(); if (conn === this) conn = null; }
    destroy() { /* TableScreen detach: leave() is called explicitly by the app */ }
  }

  root.Net = { renderLobby, connect };
})(window);
