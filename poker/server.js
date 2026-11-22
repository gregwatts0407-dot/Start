#!/usr/bin/env node
/*
 * Felt Hold'em — online multiplayer server (no dependencies).
 *   node server.js            → http://localhost:8080
 *   PORT=3000 node server.js
 *
 * Serves the game files and hosts private rooms. The server runs the same
 * engine and bots as the browser and is the single source of truth: each
 * player only ever receives their own hole cards (plus any shown at showdown).
 * Live updates use Server-Sent Events; actions are plain JSON POSTs.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const C = require('./js/cards.js');
const E = require('./js/engine.js');
const AI = require('./js/ai.js');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = __dirname;
const MAX_SEATS = 9;
const rooms = new Map();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.md': 'text/plain; charset=utf-8',
};

const token = () => crypto.randomBytes(16).toString('hex');
function roomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from({ length: 5 }, () => A[crypto.randomInt(A.length)]).join(''); } while (rooms.has(c));
  return c;
}
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 14) || 'Player';
const clampInt = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };

// ---------------------------------------------------------------------------
class Room {
  constructor(code, cfg) {
    this.code = code;
    this.cfg = {
      mode: cfg.mode === 'tournament' ? 'tournament' : 'cash',
      sb: clampInt(cfg.sb, 1, 1000, 5), bb: 0, stack: clampInt(cfg.stack, 100, 100000, 1000),
      turnSeconds: clampInt(cfg.turnSeconds, 10, 120, 30), handsPerLevel: clampInt(cfg.handsPerLevel, 3, 30, 8),
    };
    this.cfg.bb = this.cfg.sb * 2;
    this.members = []; // {token, name, hue, isBot, profile, seat, connected, host}
    this.clients = new Set(); // {res, token}
    this.status = 'lobby';
    this.game = null;
    this.timer = null;
    this.turnTimer = null;
    this.actingSince = 0;
    this.lastActive = Date.now();
    this.usedNames = new Set();
    this.rng = Math.random;
  }

  member(tok) { return this.members.find((m) => m.token === tok && !m.isBot); }
  seatsUsed() { return this.members.filter((m) => !m.left).length; }

  addMember(name, hue, isBot, profile) {
    if (this.seatsUsed() >= MAX_SEATS) return null;
    let nm = cleanName(name);
    let k = 2;
    const base = nm;
    while (this.members.some((m) => m.name === nm && !m.left)) nm = (base.slice(0, 11) + ' ' + k++);
    const m = { token: token(), name: nm, hue: clampInt(hue, 0, 359, 42), isBot: !!isBot, profile: profile || null, seat: -1, connected: false, host: false };
    this.usedNames.add(nm);
    this.members.push(m);
    if (this.status !== 'lobby') this.seatMember(m);
    return m;
  }

  seatMember(m) {
    const s = E.addPlayer(this.game, { name: m.name, isBot: m.isBot, profile: m.profile, id: m.token.slice(0, 8) });
    s.hue = m.hue;
    s.sittingOut = false;
    m.seat = s.index;
  }

  start() {
    if (this.status !== 'lobby') return 'Already started';
    const active = this.members.filter((m) => !m.left);
    if (active.length < 2) return 'Need at least 2 players (add a bot?)';
    this.game = E.createGame({ mode: this.cfg.mode, smallBlind: this.cfg.sb, bigBlind: this.cfg.bb, startingStack: this.cfg.stack, handsPerLevel: this.cfg.handsPerLevel, players: [] });
    // shuffle seating
    active.sort(() => this.rng() - 0.5).forEach((m) => this.seatMember(m));
    this.status = 'playing';
    this.broadcast();
    this.timer = setTimeout(() => this.nextHand(), 1200);
    return null;
  }

  nextHand() {
    const g = this.game;
    if (!g || this.status !== 'playing') return;
    // cash game: bots rebuy, humans who left stay out
    for (const m of this.members) {
      const s = g.seats[m.seat];
      if (!s) continue;
      if (m.left) s.sittingOut = true;
      if (g.config.mode === 'cash' && m.isBot && s.stack === 0) s.stack = g.config.startingStack;
    }
    if (!E.startHand(g, this.rng)) {
      if (g.over) { this.status = 'over'; this.broadcast(); return; }
      this.status = 'waiting';
      this.broadcast();
      return;
    }
    this.status = 'playing';
    this.afterChange();
  }

  afterChange() {
    clearTimeout(this.timer);
    clearTimeout(this.turnTimer);
    this.lastActive = Date.now();
    const g = this.game;
    if (g.street === 'complete') {
      this.broadcast();
      if (g.over) { this.timer = setTimeout(() => { this.status = 'over'; this.broadcast(); }, 2500); return; }
      const pause = g.result && g.result.uncontested ? 2200 : 4500;
      this.timer = setTimeout(() => this.nextHand(), pause);
      return;
    }
    if (E.needsAdvance(g)) {
      this.broadcast();
      const runout = g.seats.filter(E.canAct).length < 2;
      this.timer = setTimeout(() => { E.advance(g); this.afterChange(); }, runout ? 1300 : 800);
      return;
    }
    const idx = g.toAct;
    const s = g.seats[idx];
    this.actingSince = Date.now();
    this.broadcast();
    const m = this.members.find((x) => x.seat === idx);
    if (s.isBot) {
      this.timer = setTimeout(() => {
        if (this.game !== g || g.toAct !== idx) return;
        E.act(g, idx, AI.decide(g, idx, this.rng));
        this.afterChange();
      }, AI.thinkTime(g, idx, this.rng));
    } else {
      const ms = m && (m.left || !m.connected) ? 6000 : this.cfg.turnSeconds * 1000;
      this.turnMs = ms;
      this.turnTimer = setTimeout(() => {
        if (this.game !== g || g.toAct !== idx) return;
        const L = E.legalActions(g, idx);
        E.act(g, idx, L.canCheck ? { type: 'check' } : { type: 'fold' });
        this.chatSystem(`${s.name} ran out of time`);
        this.afterChange();
      }, ms);
    }
  }

  act(m, action) {
    const g = this.game;
    if (!g || this.status !== 'playing') return 'Game not running';
    if (g.toAct !== m.seat) return 'Not your turn';
    const type = String(action && action.type);
    if (!['fold', 'check', 'call', 'raise', 'allin'].includes(type)) return 'Bad action';
    const r = E.act(g, m.seat, { type, amount: Number(action.amount) || 0 });
    if (!r.ok) return r.error;
    this.afterChange();
    return null;
  }

  rebuy(m) {
    const g = this.game;
    if (!g || g.config.mode !== 'cash') return 'Rebuys are only allowed in cash games';
    const s = g.seats[m.seat];
    if (!s || s.stack > 0) return 'You still have chips';
    if (s.inHand && g.street !== 'complete') return 'Wait for the hand to finish';
    s.stack = g.config.startingStack;
    this.chatSystem(`${s.name} rebuys for ${s.stack}`);
    if (this.status === 'waiting') this.nextHand();
    else this.broadcast();
    return null;
  }

  leave(m) {
    m.left = true;
    if (this.status === 'lobby') {
      this.members = this.members.filter((x) => x !== m);
      if (m.host) { const h = this.members.find((x) => !x.isBot); if (h) h.host = true; }
      this.broadcast();
      return;
    }
    const g = this.game;
    const s = g.seats[m.seat];
    if (s) {
      s.sittingOut = true;
      if (g.toAct === m.seat) { E.act(g, m.seat, { type: 'fold' }); this.afterChange(); }
    }
    if (m.host) { const h = this.members.find((x) => !x.isBot && !x.left); if (h) h.host = true; }
    this.chatSystem(`${m.name} left the table`);
    this.broadcast();
  }

  // ---- messaging ----
  stateFor(tok) {
    const m = this.member(tok);
    const you = m ? { seat: m.seat, host: m.host, name: m.name } : null;
    if (this.status === 'lobby') {
      return {
        type: 'lobby', code: this.code, cfg: this.cfg, you,
        members: this.members.filter((x) => !x.left).map((x) => ({ name: x.name, hue: x.hue, isBot: x.isBot, profile: x.profile, host: x.host, connected: x.isBot || x.connected })),
      };
    }
    const g = this.game;
    const view = E.viewFor(g, m ? m.seat : -9);
    view.seats.forEach((s, i) => {
      const mem = this.members.find((x) => x.seat === i);
      s.hue = g.seats[i].hue;
      s.connected = mem ? (mem.isBot || (mem.connected && !mem.left)) : true;
      if (mem && mem.left) s.name = g.seats[i].name;
    });
    return {
      type: 'game', code: this.code, status: this.status, view, you, cfg: this.cfg,
      turnMs: this.turnMs, actingSince: this.actingSince, serverNow: Date.now(),
    };
  }

  send(client, event, data) {
    try { client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch (e) { /* closed */ }
  }
  broadcast() {
    for (const c of this.clients) this.send(c, 'state', this.stateFor(c.token));
  }
  chat(m, text) {
    const t = String(text || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 140);
    if (!t) return;
    for (const c of this.clients) this.send(c, 'chat', { name: m.name, text: t, seat: m.seat });
  }
  chatSystem(text) {
    for (const c of this.clients) this.send(c, 'chat', { name: 'Dealer', text, seat: null, system: true });
  }

  connect(tok, res) {
    const m = this.member(tok);
    const client = { res, token: tok };
    this.clients.add(client);
    if (m) {
      m.connected = true;
      if (m.left && this.status !== 'lobby') { m.left = false; const s = this.game.seats[m.seat]; if (s) s.sittingOut = false; }
    }
    this.send(client, 'state', this.stateFor(tok));
    this.broadcast();
    return () => {
      this.clients.delete(client);
      if (m && ![...this.clients].some((c) => c.token === tok)) {
        m.connected = false;
        this.broadcast();
        // speed up their turn if they disconnect while acting
        if (this.game && this.game.toAct === m.seat && this.status === 'playing') this.afterChange();
      }
    };
  }

  destroy() { clearTimeout(this.timer); clearTimeout(this.turnTimer); }
}

// ---------------------------------------------------------------------------
function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 16384) { reject(new Error('Body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

async function api(req, res, parts, url) {
  if (parts[1] === 'health') return json(res, 200, { ok: true, rooms: rooms.size });
  if (parts[1] !== 'rooms') return json(res, 404, { error: 'Not found' });

  if (req.method === 'POST' && parts.length === 2) {
    const b = await readBody(req);
    if (rooms.size > 500) return json(res, 503, { error: 'Server is full' });
    const room = new Room(roomCode(), b.config || {});
    const m = room.addMember(b.name, b.hue, false);
    m.host = true;
    rooms.set(room.code, room);
    return json(res, 200, { code: room.code, token: m.token });
  }

  const room = rooms.get(String(parts[2] || '').toUpperCase());
  if (!room) return json(res, 404, { error: 'Room not found. Check the code.' });
  const action = parts[3];

  if (req.method === 'GET' && action === 'stream') {
    const tok = url.searchParams.get('token') || '';
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 2000\n\n');
    const bye = room.connect(tok, res);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) { /* ignore */ } }, 20000);
    req.on('close', () => { clearInterval(ping); bye(); });
    return;
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const b = await readBody(req);

  if (action === 'join') {
    const existing = b.token && room.member(b.token);
    if (existing) return json(res, 200, { token: existing.token, code: room.code });
    if (room.status === 'over') return json(res, 400, { error: 'That game has finished.' });
    if (room.status !== 'lobby' && room.cfg.mode === 'tournament') return json(res, 400, { error: 'This tournament has already started.' });
    const m = room.addMember(b.name, b.hue, false);
    if (!m) return json(res, 400, { error: 'The table is full.' });
    room.broadcast();
    if (room.status === 'waiting') room.nextHand();
    return json(res, 200, { token: m.token, code: room.code });
  }

  const m = room.member(b.token);
  if (!m) return json(res, 403, { error: 'You are not in this room.' });
  let err = null;
  switch (action) {
    case 'start':
      if (!m.host) err = 'Only the host can start the game';
      else err = room.start();
      break;
    case 'bot': {
      if (!m.host) { err = 'Only the host can add bots'; break; }
      if (room.status === 'playing' && room.cfg.mode === 'tournament') { err = 'Cannot add bots mid-tournament'; break; }
      const bot = AI.makeBot(['easy', 'medium', 'hard'].includes(b.difficulty) ? b.difficulty : 'medium', crypto.randomInt(8), room.usedNames);
      const added = room.addMember(bot.name, crypto.randomInt(360), true, bot.profile);
      if (!added) err = 'The table is full';
      else { room.broadcast(); if (room.status === 'waiting') room.nextHand(); }
      break;
    }
    case 'removebot': {
      if (!m.host || room.status !== 'lobby') { err = 'Not allowed'; break; }
      const i = room.members.findIndex((x) => x.isBot && x.name === b.name);
      if (i >= 0) room.members.splice(i, 1);
      room.broadcast();
      break;
    }
    case 'act': err = room.act(m, b.action); break;
    case 'chat': room.chat(m, b.text); break;
    case 'rebuy': err = room.rebuy(m); break;
    case 'leave': room.leave(m); break;
    default: return json(res, 404, { error: 'Unknown action' });
  }
  return err ? json(res, 400, { error: err }) : json(res, 200, { ok: true });
}

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT + path.sep) || /[\\/]\.|[\\/](node_modules|test|tools)[\\/]/.test(file.slice(ROOT.length))) { res.writeHead(404); return res.end('Not found'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);
  try {
    if (parts[0] === 'api') return await api(req, res, parts, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return serveStatic(req, res, url);
  } catch (e) {
    if (!res.headersSent) json(res, 400, { error: e.message || 'Bad request' });
  }
});

// clean up idle rooms
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.clients.size === 0 && now - room.lastActive > 30 * 60 * 1000) { room.destroy(); rooms.delete(code); }
  }
}, 60 * 1000).unref();

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Felt Hold'em running at http://localhost:${PORT}`);
    console.log('Share your local network address with friends to play together.');
  });
}
module.exports = { server, rooms, Room };
void C;
