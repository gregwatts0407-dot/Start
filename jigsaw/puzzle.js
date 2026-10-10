/*
 * Cottage Garden jigsaw.
 *
 * The picture comes from scene.js. This file cuts it into classic interlocking
 * pieces, lays them out round the board, and handles dragging, snapping,
 * zooming, the two play modes and saving.
 *
 * World coordinates are pixels of the 2400 x 1920 picture. The board (where the
 * finished picture goes) covers (0, 0)-(2400, 1920); loose pieces sit on the
 * table around it. A group of joined pieces is stored as one offset from the
 * pieces' home positions, so a piece is correctly placed when its group's
 * offset is (0, 0), and two groups fit together when their offsets match.
 */
(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  const IMG_W = CottageScene.width;
  const IMG_H = CottageScene.height;
  const SCENE_SEED = 52126;

  // `cm` is the size of one piece on the printed puzzle, used for the
  // finished-size label. Smaller puzzles have bigger pieces, as in real life.
  const SIZES = [
    { pieces: 2000, cols: 50, rows: 40, cm: 1.95 },
    { pieces: 1000, cols: 36, rows: 28, cm: 1.95 },
    { pieces: 500, cols: 25, rows: 20, cm: 2.4 },
    { pieces: 250, cols: 18, rows: 14, cm: 2.6 },
    { pieces: 100, cols: 11, rows: 9, cm: 3.6 },
    { pieces: 48, cols: 8, rows: 6, cm: 4.5 },
  ];

  const TAB = 0.1;            // tab size, as a fraction of the piece size
  const JITTER = 0.04;        // how much each tab wanders from the centre
  const SPRITE_BUDGET = 8e6;  // total sprite pixels for all pieces
  const ATLAS_MAX = 4096;     // largest sprite sheet side
  const SPRITE_MARGIN = 4;    // transparent border round each sprite
  const IDLE_MS = 120000;     // the clock stops after two idle minutes
  const SAVE_VERSION = 1;
  const STORE_PREFIX = 'cottage-garden-jigsaw/v1/';

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------

  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const nextTick = () => new Promise((r) => setTimeout(r, 0));

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  const fmtInt = (n) => n.toLocaleString('en-GB');

  function formatClock(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (v) => String(v).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
  }

  function formatDuration(ms) {
    const mins = Math.round(ms / 60000);
    if (mins < 1) return `${Math.max(1, Math.round(ms / 1000))}s`;
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
  }

  const finishedSize = (s) => `${Math.round(s.cols * s.cm)} × ${Math.round(s.rows * s.cm)} cm`;
  const sizeFor = (pieces) => SIZES.find((s) => s.pieces === pieces);

  // ---------------------------------------------------------------------------
  // Storage: this browser (localStorage), plus the viewer's own private store
  // when the page runs inside claude.ai. Each save carries `savedAt`, and the
  // newer copy wins when both exist.
  // ---------------------------------------------------------------------------

  const local = {
    ok: false,
    init() {
      try {
        const k = STORE_PREFIX + 'probe';
        localStorage.setItem(k, '1');
        localStorage.removeItem(k);
        this.ok = true;
      } catch {
        this.ok = false;
      }
    },
    get(key) {
      if (!this.ok) return null;
      try {
        const raw = localStorage.getItem(STORE_PREFIX + key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      if (!this.ok) return false;
      try {
        localStorage.setItem(STORE_PREFIX + key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
  };

  const cloud = {
    db: null,
    uid: null,
    docs: {},
    pending: new Map(),
    writing: new Set(),
    retries: new Map(),
    timer: null,
    get available() { return !!this.db; },
    async init() {
      const host = window.claude;
      if (!host || typeof host.use !== 'function') return false;
      try {
        const [db, user] = await Promise.all([host.use('db'), host.use('user')]);
        if (!db || !user || typeof user.id !== 'function') return false;
        const uid = await user.id();
        if (!uid) return false;
        const snap = await db.collection('data/users/' + uid).get();
        for (const doc of snap.docs) if (doc.exists) this.docs[doc.id] = doc.data();
        this.db = db;
        this.uid = uid;
        return true;
      } catch {
        return false;
      }
    },
    queue(key, value, delay = 2500) {
      if (!this.db) return;
      this.pending.set(key, value);
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flushAll(), delay);
    },
    flushAll() {
      clearTimeout(this.timer);
      for (const key of [...this.pending.keys()]) this.flush(key);
    },
    async flush(key) {
      if (!this.db || this.writing.has(key) || !this.pending.has(key)) return;
      const value = this.pending.get(key);
      this.pending.delete(key);
      this.writing.add(key);
      try {
        await this.db.collection('data/users/' + this.uid).doc(key).set(value);
        this.docs[key] = value;
        this.retries.delete(key);
      } catch (err) {
        const code = err && err.code;
        if (code === 'unavailable' || code === 'resource_exhausted') {
          const n = (this.retries.get(key) || 0) + 1;
          this.retries.set(key, n);
          if (n <= 3 && !this.pending.has(key)) this.pending.set(key, value);
        } else {
          // Not allowed to write here (or the page lost access): stop trying.
          this.db = null;
          updateStorageNote();
        }
      } finally {
        this.writing.delete(key);
        if (this.db && this.pending.has(key)) setTimeout(() => this.flush(key), 1500 + Math.random() * 1000);
      }
    },
  };

  const saves = {
    key: (pieces) => 'save-' + pieces,
    load(pieces) {
      const key = this.key(pieces);
      const a = local.get(key);
      const b = cloud.docs[key] || null;
      let best = a;
      if (b && (!a || (b.savedAt || 0) > (a.savedAt || 0))) best = b;
      return best && !best.deleted ? best : null;
    },
    store(pieces, data, toCloud) {
      const key = this.key(pieces);
      const ok = local.set(key, data);
      if (toCloud) cloud.queue(key, data);
      return ok || cloud.available;
    },
    clear(pieces) {
      const key = this.key(pieces);
      const tomb = { deleted: true, savedAt: Date.now() };
      local.set(key, tomb);
      cloud.queue(key, tomb, 200);
    },
  };

  function loadRecords() {
    const a = local.get('records') || {};
    const b = cloud.docs.records || {};
    const out = { ...a };
    for (const k of Object.keys(b)) {
      if (!out[k] || (b[k].best && b[k].best < out[k].best)) out[k] = b[k];
    }
    return out;
  }

  function loadPrefs() {
    return { pieces: 500, mode: 'assisted', sound: true, ...(local.get('prefs') || {}) };
  }

  let prefs = { pieces: 500, mode: 'assisted', sound: true };
  const savePrefs = () => local.set('prefs', prefs);

  // ---------------------------------------------------------------------------
  // Sound: a short woody click when pieces fit, a few notes on completion.
  // ---------------------------------------------------------------------------

  const sound = {
    ac: null,
    noise: null,
    unlock() {
      if (this.ac) {
        if (this.ac.state === 'suspended') this.ac.resume().catch(() => {});
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ac = new AC();
        const len = Math.floor(this.ac.sampleRate * 0.06);
        this.noise = this.ac.createBuffer(1, len, this.ac.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 5);
      } catch {
        this.ac = null;
      }
    },
    click(strength = 1) {
      if (!prefs.sound || !this.ac) return;
      const ac = this.ac;
      const src = ac.createBufferSource();
      src.buffer = this.noise;
      const filter = ac.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1500 + 700 * strength;
      filter.Q.value = 1.4;
      const gain = ac.createGain();
      gain.gain.value = 0.35 + 0.25 * strength;
      src.connect(filter).connect(gain).connect(ac.destination);
      src.start();
    },
    chime() {
      if (!prefs.sound || !this.ac) return;
      const ac = this.ac;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => {
        const t = ac.currentTime + i * 0.14;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
        osc.connect(gain).connect(ac.destination);
        osc.start(t);
        osc.stop(t + 1);
      });
    },
  };

  // ---------------------------------------------------------------------------
  // Cutting: interlocking edges and piece outlines
  // ---------------------------------------------------------------------------

  // One tabbed edge as ten Bezier control points, (along, across) in units of
  // the piece size. Based on the well-known jigsaw generator by Draradech.
  function edgeCurve(s, a, b, c, d, e) {
    const t = TAB;
    return [
      0, 0,
      0.2, a * s, 0.5 + b + d, (-t + c) * s, 0.5 - t + b, (t + c) * s,
      0.5 - 2 * t + b - d, (3 * t + c) * s, 0.5 + 2 * t + b - d, (3 * t + c) * s, 0.5 + t + b, (t + c) * s,
      0.5 + b + d, (-t + c) * s, 0.8, e * s, 1, 0,
    ];
  }

  // A full line of edges across the puzzle. Consecutive edges share tangents
  // at the corners so the cut lines run smoothly.
  function edgeLine(rng, count) {
    const u = () => (rng() * 2 - 1) * JITTER;
    const out = [];
    let flip = rng() > 0.5;
    let e = u();
    for (let i = 0; i < count; i++) {
      const prev = flip;
      flip = rng() > 0.5;
      const a = flip === prev ? -e : e;
      const b = u(), c = u(), d = u();
      e = u();
      out.push(edgeCurve(flip ? -1 : 1, a, b, c, d, e));
    }
    return out;
  }

  function createPuzzle(size, seed) {
    const { cols, rows } = size;
    const n = cols * rows;
    const cw = IMG_W / cols;
    const ch = IMG_H / rows;
    const rng = mulberry32(seed);
    const hEdges = [];
    const vEdges = [];
    for (let k = 0; k < rows - 1; k++) hEdges.push(edgeLine(rng, cols));
    for (let k = 0; k < cols - 1; k++) vEdges.push(edgeLine(rng, rows));

    const pieces = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p = {
          i: r * cols + c, c, r,
          edge: r === 0 || c === 0 || r === rows - 1 || c === cols - 1,
          group: null, rank: 0, path: null,
          bx0: 0, by0: 0, bx1: 0, by1: 0,
          sheet: 0, sx: 0, sy: 0,
        };
        outlinePiece(p, cols, rows, cw, ch, hEdges, vEdges);
        pieces.push(p);
      }
    }
    // A stable random order, used to lay pieces out on the table.
    const ranks = shuffle(pieces.map((p) => p.i), rng);
    ranks.forEach((idx, k) => { pieces[idx].rank = k; });
    return { size, cols, rows, n, cw, ch, seed, pieces };
  }

  function outlinePiece(p, cols, rows, cw, ch, hEdges, vEdges) {
    const { c, r } = p;
    const x0 = c * cw, y0 = r * ch, x1 = x0 + cw, y1 = y0 + ch;
    const path = new Path2D();
    let minX = x0, minY = y0, maxX = x1, maxY = y1;

    function addEdge(e, map, reverse) {
      const pts = [];
      for (let k = 0; k < 20; k += 2) {
        const pt = map(e[k], e[k + 1]);
        pts.push(pt);
        if (pt[0] < minX) minX = pt[0];
        if (pt[0] > maxX) maxX = pt[0];
        if (pt[1] < minY) minY = pt[1];
        if (pt[1] > maxY) maxY = pt[1];
      }
      const seq = reverse ? [8, 7, 6, 5, 4, 3, 2, 1, 0] : [1, 2, 3, 4, 5, 6, 7, 8, 9];
      for (let k = 0; k < 9; k += 3) {
        const a = pts[seq[k]], b = pts[seq[k + 1]], d = pts[seq[k + 2]];
        path.bezierCurveTo(a[0], a[1], b[0], b[1], d[0], d[1]);
      }
    }

    path.moveTo(x0, y0);
    if (r === 0) path.lineTo(x1, y0);
    else addEdge(hEdges[r - 1][c], (l, w) => [x0 + l * cw, y0 + w * ch], false);
    if (c === cols - 1) path.lineTo(x1, y1);
    else addEdge(vEdges[c][r], (l, w) => [x1 + w * cw, y0 + l * ch], false);
    if (r === rows - 1) path.lineTo(x0, y1);
    else addEdge(hEdges[r][c], (l, w) => [x0 + l * cw, y1 + w * ch], true);
    if (c === 0) path.lineTo(x0, y0);
    else addEdge(vEdges[c - 1][r], (l, w) => [x0 + w * cw, y0 + l * ch], true);
    path.closePath();

    p.path = path;
    p.bx0 = Math.max(0, minX);
    p.by0 = Math.max(0, minY);
    p.bx1 = Math.min(IMG_W, maxX);
    p.by1 = Math.min(IMG_H, maxY);
  }

  // Paints one piece: the picture inside its outline, a bevel lit from the
  // upper left, and a fine cut line. `px` is the size of one device pixel in
  // picture units.
  function paintPiece(c, p, bevel, px) {
    const w = p.bx1 - p.bx0, h = p.by1 - p.by0;
    c.save();
    c.clip(p.path);
    c.drawImage(sceneCanvas, p.bx0, p.by0, w, h, p.bx0, p.by0, w, h);
    c.lineWidth = bevel;
    c.translate(bevel / 2, bevel / 2);
    c.strokeStyle = 'rgba(255,250,235,0.34)';
    c.stroke(p.path);
    c.translate(-bevel, -bevel);
    c.strokeStyle = 'rgba(20,12,4,0.36)';
    c.stroke(p.path);
    c.restore();
    c.lineWidth = px;
    c.strokeStyle = 'rgba(25,18,10,0.5)';
    c.stroke(p.path);
  }

  // Pre-renders every piece into a few large sprite sheets (plus half and
  // quarter size copies for zoomed-out views), so drawing the table is just
  // a series of image copies.
  async function buildAtlas(puz, onProgress) {
    let maxW = 0, maxH = 0;
    for (const p of puz.pieces) {
      maxW = Math.max(maxW, p.bx1 - p.bx0);
      maxH = Math.max(maxH, p.by1 - p.by0);
    }
    const scale = Math.min(1, Math.sqrt(SPRITE_BUDGET / (puz.n * maxW * maxH)));
    const slotW = Math.ceil(maxW * scale) + SPRITE_MARGIN * 2;
    const slotH = Math.ceil(maxH * scale) + SPRITE_MARGIN * 2;
    const perRow = Math.max(1, Math.floor(ATLAS_MAX / slotW));
    const perSheet = perRow * Math.max(1, Math.floor(ATLAS_MAX / slotH));
    const bevel = Math.max(1.2 / scale, Math.min(puz.cw, puz.ch) * 0.045);

    const sheets = [];
    for (let start = 0; start < puz.n; start += perSheet) {
      const count = Math.min(perSheet, puz.n - start);
      const cv = document.createElement('canvas');
      cv.width = Math.min(perRow, count) * slotW;
      cv.height = Math.ceil(count / perRow) * slotH;
      sheets.push({ levels: [cv], ctx: cv.getContext('2d') });
    }

    for (let i = 0; i < puz.n; i++) {
      const p = puz.pieces[i];
      const si = Math.floor(i / perSheet);
      const k = i % perSheet;
      p.sheet = si;
      p.sx = (k % perRow) * slotW;
      p.sy = Math.floor(k / perRow) * slotH;
      const c = sheets[si].ctx;
      c.save();
      c.translate(p.sx + SPRITE_MARGIN, p.sy + SPRITE_MARGIN);
      c.scale(scale, scale);
      c.translate(-p.bx0, -p.by0);
      paintPiece(c, p, bevel, 1 / scale);
      c.restore();
      if (i % 60 === 59) {
        onProgress((i + 1) / puz.n);
        await nextTick();
      }
    }

    for (const sh of sheets) {
      let src = sh.levels[0];
      for (let l = 1; l <= 2; l++) {
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.ceil(src.width / 2));
        cv.height = Math.max(1, Math.ceil(src.height / 2));
        const c = cv.getContext('2d');
        c.imageSmoothingEnabled = true;
        c.imageSmoothingQuality = 'high';
        c.drawImage(src, 0, 0, cv.width, cv.height);
        sh.levels.push(cv);
        src = cv;
      }
      sh.ctx = null;
    }
    onProgress(1);
    return { sheets, scale, slotW, slotH, bevel };
  }

  function releaseAtlas(atlas) {
    if (!atlas) return;
    for (const sh of atlas.sheets) for (const cv of sh.levels) { cv.width = 0; cv.height = 0; }
  }

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------

  const sceneCanvas = document.createElement('canvas');
  let sceneReady = null;

  let game = null;
  // game = { puz, atlas, mode, board, order, elapsed, startedAt, complete,
  //          edgesOnly, ghost, revealStart }

  const anims = [];        // pieces gliding to the board in assisted mode
  let drag = null;         // the group being dragged
  let gesture = null;      // current pointer gesture
  const pointers = new Map();
  let lastPointer = null;
  let lastActivity = Date.now();

  function makeGroup(pieces, ox, oy) {
    const g = { pieces: [], ox, oy, locked: false, hasEdge: false, bx0: 0, by0: 0, bx1: 0, by1: 0 };
    for (const p of pieces) { p.group = g; g.pieces.push(p); }
    refreshGroup(g);
    return g;
  }

  function refreshGroup(g) {
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity, edge = false;
    for (const p of g.pieces) {
      if (p.bx0 < bx0) bx0 = p.bx0;
      if (p.by0 < by0) by0 = p.by0;
      if (p.bx1 > bx1) bx1 = p.bx1;
      if (p.by1 > by1) by1 = p.by1;
      if (p.edge) edge = true;
    }
    g.bx0 = bx0; g.by0 = by0; g.bx1 = bx1; g.by1 = by1;
    g.hasEdge = edge;
  }

  function removeFromOrder(g) {
    const i = game.order.indexOf(g);
    if (i >= 0) game.order.splice(i, 1);
  }

  function bringToTop(g) {
    removeFromOrder(g);
    game.order.push(g);
  }

  function lockGroup(g) {
    removeFromOrder(g);
    const board = game.board;
    for (const p of g.pieces) { p.group = board; board.pieces.push(p); }
    g.pieces = [];
    g.ox = 0;
    g.oy = 0;
  }

  // Moves `moving` onto `target` and merges them. The merged group keeps the
  // moving group's place at the top of the pile.
  function joinGroups(moving, target) {
    if (target.locked) {
      lockGroup(moving);
      return game.board;
    }
    moving.ox = target.ox;
    moving.oy = target.oy;
    for (const p of target.pieces) { p.group = moving; moving.pieces.push(p); }
    target.pieces = [];
    removeFromOrder(target);
    refreshGroup(moving);
    return moving;
  }

  function neighbours(p) {
    const { cols, rows, pieces } = game.puz;
    const out = [];
    if (p.r > 0) out.push(pieces[p.i - cols]);
    if (p.r < rows - 1) out.push(pieces[p.i + cols]);
    if (p.c > 0) out.push(pieces[p.i - 1]);
    if (p.c < cols - 1) out.push(pieces[p.i + 1]);
    return out;
  }

  function snapTolerance() {
    const cell = Math.min(game.puz.cw, game.puz.ch);
    return clamp(Math.max(cell * 0.2, 8 / view.zoom), 2, cell * 0.45);
  }

  // After a drop: join any neighbours that line up, then lock the group to the
  // board if it is close enough to home. Returns how many joins were made.
  function settle(g) {
    const tol = snapTolerance();
    let joins = 0;
    let changed = true;
    while (changed && !g.locked) {
      changed = false;
      outer:
      for (const p of g.pieces) {
        for (const q of neighbours(p)) {
          const h = q.group;
          if (h === g || anims.some((a) => a.g === h)) continue;
          if (Math.abs(h.ox - g.ox) <= tol && Math.abs(h.oy - g.oy) <= tol) {
            g = joinGroups(g, h);
            joins++;
            changed = true;
            break outer;
          }
        }
      }
    }
    if (!g.locked && Math.abs(g.ox) <= tol && Math.abs(g.oy) <= tol) {
      lockGroup(g);
      joins++;
    }
    return joins;
  }

  function fittedCount() {
    if (!game) return 0;
    let n = game.board.pieces.length;
    for (const g of game.order) if (g.pieces.length > 1) n += g.pieces.length;
    for (const a of anims) n += a.g.pieces.length;
    return n;
  }

  // Assisted mode: glide a group to its home and lock it there.
  function autoPlace(g) {
    removeFromOrder(g);
    const dist = Math.hypot(g.ox, g.oy) * view.zoom;
    const dur = clamp(240 + dist * 0.45, 280, 760);
    anims.push({ g, x0: g.ox, y0: g.oy, t0: performance.now(), dur });
    invalidate();
  }

  function stepAnims(now) {
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i];
      const t = clamp((now - a.t0) / a.dur, 0, 1);
      const e = 1 - Math.pow(1 - t, 3);
      a.g.ox = a.x0 * (1 - e);
      a.g.oy = a.y0 * (1 - e);
      if (t >= 1) {
        anims.splice(i, 1);
        a.g.ox = 0;
        a.g.oy = 0;
        lockGroup(a.g);
        sound.click(1);
        cache.valid = false;
        afterChange();
      }
    }
  }

  function afterChange() {
    updateHud();
    markDirty();
    checkComplete();
  }

  function checkComplete() {
    if (!game || game.complete) return;
    if (game.board.pieces.length === game.puz.n) {
      completeGame();
      return;
    }
    // Everything joined off the board: carry it home.
    if (!anims.length && game.order.length === 1 && game.order[0].pieces.length === game.puz.n) {
      autoPlace(game.order[0]);
    }
  }

  // ---------------------------------------------------------------------------
  // Laying pieces out on the table
  // ---------------------------------------------------------------------------

  // Slots for loose pieces, in rectangular rings round the board. Ring 0 is
  // closest to the board. On a wide screen each ring is `mx` columns deep at
  // the sides (and on a tall screen `my` rows deep at top and bottom), so the
  // whole table fills the screen better.
  function ringSlots(puz, k, mx, my) {
    const sw = puz.cw * 1.42;
    const sh = puz.ch * 1.42;
    const gap = Math.max(puz.cw, puz.ch) * 0.6;
    const L = -gap - (k + 1) * mx * sw, R = IMG_W + gap + (k + 1) * mx * sw;
    const T = -gap - (k + 1) * my * sh, B = IMG_H + gap + (k + 1) * my * sh;
    const innerT = T + my * sh, innerB = B - my * sh;
    const nx = Math.floor((R - L) / sw);
    const stepX = (R - L) / nx;
    const ny = Math.max(0, Math.floor((innerB - innerT) / sh));
    const stepY = ny ? (innerB - innerT) / ny : 0;
    const ring = [];
    const add = (x, y) => ring.push({ x, y, w: sw, h: sh });
    const colX = (i) => L + i * stepX + (stepX - sw) / 2;
    const rowY = (i) => innerT + i * stepY + (stepY - sh) / 2;
    // Innermost rows and columns of the ring first.
    for (let d = 0; d < Math.max(mx, my); d++) {
      if (d < my) for (let i = 0; i < nx; i++) add(colX(i), T + (my - 1 - d) * sh);
      if (d < mx) for (let i = 0; i < ny; i++) add(R - sw - (mx - 1 - d) * sw, rowY(i));
      if (d < my) for (let i = nx - 1; i >= 0; i--) add(colX(i), B - sh - (my - 1 - d) * sh);
      if (d < mx) for (let i = ny - 1; i >= 0; i--) add(L + (mx - 1 - d) * sw, rowY(i));
    }
    return ring;
  }

  // How deep each ring should be at the sides and at top and bottom, from the
  // shape of the visible table.
  function tableShape() {
    const area = usableArea();
    const aspect = area.w / area.h;
    if (aspect > 1.45) return [clamp(Math.round(aspect), 2, 3), 1];
    if (aspect < 0.95) return [1, clamp(Math.round(1.25 / aspect), 2, 3)];
    return [1, 1];
  }

  function placeInSlot(g, slot, jitter, rng) {
    const p = g.pieces[0];
    const { cw, ch } = game.puz;
    const jx = jitter ? (rng() - 0.5) * jitter * cw : 0;
    const jy = jitter ? (rng() - 0.5) * jitter * ch : 0;
    g.ox = slot.x + (slot.w - cw) / 2 - p.c * cw + jx;
    g.oy = slot.y + (slot.h - ch) / 2 - p.r * ch + jy;
  }

  // A new game: every piece on its own, spread round the board in a random
  // order. Each ring is filled in shuffled order so a partly filled outer
  // ring is spread all the way round.
  function scatter() {
    const { puz } = game;
    const rng = mulberry32(puz.seed ^ 0x51ed);
    const singles = puz.pieces.slice().sort((a, b) => a.rank - b.rank).map((p) => makeGroup([p], 0, 0));
    const [mx, my] = tableShape();
    let i = 0;
    for (let k = 0; i < singles.length; k++) {
      for (const slot of shuffle(ringSlots(puz, k, mx, my), rng)) {
        if (i >= singles.length) break;
        placeInSlot(singles[i++], slot, 0.22, rng);
      }
    }
    game.order = singles;
  }

  function tidy() {
    if (!game || game.complete) return;
    const { puz } = game;
    const singles = game.order.filter((g) => g.pieces.length === 1);
    const blockers = game.order.filter((g) => g.pieces.length > 1).map((g) => ({
      x0: g.bx0 + g.ox - puz.cw * 0.2, y0: g.by0 + g.oy - puz.ch * 0.2,
      x1: g.bx1 + g.ox + puz.cw * 0.2, y1: g.by1 + g.oy + puz.ch * 0.2,
    }));
    singles.sort((a, b) => (b.pieces[0].edge - a.pieces[0].edge) || (a.pieces[0].rank - b.pieces[0].rank));
    const [mx, my] = tableShape();
    let i = 0;
    for (let k = 0; i < singles.length && k < 400; k++) {
      for (const slot of ringSlots(puz, k, mx, my)) {
        if (i >= singles.length) break;
        const hit = blockers.some((b) => slot.x < b.x1 && slot.x + slot.w > b.x0 && slot.y < b.y1 && slot.y + slot.h > b.y0);
        if (!hit) placeInSlot(singles[i++], slot, 0, null);
      }
    }
    // Put the tidied pieces underneath any joined groups.
    const multis = game.order.filter((g) => g.pieces.length > 1);
    game.order = singles.concat(multis);
    updateZoomLimits();
    invalidate();
    markDirty();
    toast(singles.length ? 'Loose pieces are lined up round the board, edge pieces on the inside.' : 'No loose pieces to tidy.');
  }

  // ---------------------------------------------------------------------------
  // Saving and restoring
  // ---------------------------------------------------------------------------

  function serialize() {
    const { puz } = game;
    const pg = new Array(puz.n).fill(-1);
    const go = [];
    game.order.forEach((g, idx) => {
      go.push(Math.round(g.ox), Math.round(g.oy));
      for (const p of g.pieces) pg[p.i] = idx;
    });
    const area = usableArea();
    const [cx, cy] = screenToWorld(area.x + area.w / 2, area.y + area.h / 2);
    return {
      v: SAVE_VERSION,
      pieces: puz.size.pieces,
      cols: puz.cols,
      rows: puz.rows,
      seed: puz.seed,
      mode: game.mode,
      elapsed: Math.round(game.elapsed),
      startedAt: game.startedAt,
      savedAt: Date.now(),
      go,
      pg,
      view: [Math.round(view.zoom * 10000) / 10000, Math.round(cx), Math.round(cy)],
      edgesOnly: game.edgesOnly,
      ghost: game.ghost,
      placed: game.board.pieces.length + anims.reduce((s, a) => s + a.g.pieces.length, 0),
      fitted: fittedCount(),
    };
  }

  function validSave(s, size) {
    if (!s || s.v !== SAVE_VERSION || s.cols !== size.cols || s.rows !== size.rows) return false;
    if (!Number.isInteger(s.seed) || !Array.isArray(s.go) || !Array.isArray(s.pg)) return false;
    const n = size.cols * size.rows;
    if (s.pg.length !== n || s.go.length % 2) return false;
    const groups = s.go.length / 2;
    if (!s.go.every(Number.isFinite)) return false;
    return s.pg.every((g) => Number.isInteger(g) && g >= -1 && g < groups);
  }

  function restore(s) {
    const { puz } = game;
    const buckets = [];
    for (let k = 0; k < s.go.length; k += 2) buckets.push({ pieces: [], ox: s.go[k], oy: s.go[k + 1] });
    for (const p of puz.pieces) {
      const gi = s.pg[p.i];
      if (gi === -1) { p.group = game.board; game.board.pieces.push(p); }
      else buckets[gi].pieces.push(p);
    }
    game.order = buckets.filter((b) => b.pieces.length).map((b) => makeGroup(b.pieces, b.ox, b.oy));
  }

  let saveTimer = null;

  function markDirty() {
    if (!game || game.complete) return;
    setSaveState('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveNow(true), 500);
  }

  function saveNow(toCloud) {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!game || game.complete) return;
    const ok = saves.store(game.puz.size.pieces, serialize(), toCloud);
    setSaveState(ok ? 'saved' : 'off');
  }

  // ---------------------------------------------------------------------------
  // View and rendering
  // ---------------------------------------------------------------------------

  const canvas = $('table');
  const ctx = canvas.getContext('2d');
  const cacheCanvas = document.createElement('canvas');
  const cacheCtx = cacheCanvas.getContext('2d');
  const hitCtx = document.createElement('canvas').getContext('2d');
  const cache = { valid: false };
  const view = { zoom: 0.25, panX: 0, panY: 0, w: 1, h: 1, dpr: 1, minZoom: 0.05, maxZoom: 4 };
  const colors = { table: '#d6dbcc', board: '#c4cab8', boardEdge: '#a9b09c', accent: '#7b386a' };
  let feltTile = null;
  const feltPatterns = new WeakMap();
  let renderQueued = false;

  const screenToWorld = (x, y) => [(x - view.panX) / view.zoom, (y - view.panY) / view.zoom];

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
    colors.table = v('--table', colors.table);
    colors.board = v('--board', colors.board);
    colors.boardEdge = v('--board-edge', colors.boardEdge);
    colors.accent = v('--accent', colors.accent);
    feltTile = feltTile || makeFelt();
    invalidate();
  }

  // A faint speckle so the table reads as cloth rather than flat colour.
  function makeFelt() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 160;
    const c = cv.getContext('2d');
    const rng = mulberry32(7);
    for (let i = 0; i < 2200; i++) {
      c.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
      c.fillRect(rng() * 160, rng() * 160, 1 + rng() * 1.5, 1 + rng() * 1.5);
    }
    return cv;
  }

  function feltFor(c) {
    if (!feltTile) return null;
    let pat = feltPatterns.get(c);
    if (!pat) {
      pat = c.createPattern(feltTile, 'repeat');
      feltPatterns.set(c, pat);
    }
    return pat;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const [cx, cy] = view.w > 1 ? screenToWorld(view.w / 2, view.h / 2) : [IMG_W / 2, IMG_H / 2];
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.w = Math.max(1, rect.width);
    view.h = Math.max(1, rect.height);
    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
    cacheCanvas.width = canvas.width;
    cacheCanvas.height = canvas.height;
    view.panX = view.w / 2 - cx * view.zoom;
    view.panY = view.h / 2 - cy * view.zoom;
    if (game) updateZoomLimits();
    invalidate();
    if (!$('boxLid').hidden) drawBoxLid();
  }

  function invalidate() {
    cache.valid = false;
    requestRender();
  }

  function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(frame);
  }

  function frame(now) {
    renderQueued = false;
    if (!game) return;
    if (anims.length) stepAnims(now);
    const panned = autoPan();
    render(now);
    if (anims.length || panned || (game.revealStart && now - game.revealStart < 1600)) requestRender();
  }

  function worldTransform(c) {
    const s = view.zoom * view.dpr;
    c.setTransform(s, 0, 0, s, view.panX * view.dpr, view.panY * view.dpr);
  }

  function visibleRect() {
    const [x0, y0] = screenToWorld(0, 0);
    const [x1, y1] = screenToWorld(view.w, view.h);
    return { x0, y0, x1, y1 };
  }

  const isHidden = (g) => game.edgesOnly && !g.hasEdge;

  function activeGroups() {
    const out = anims.map((a) => a.g);
    if (drag) out.push(drag);
    return out;
  }

  // Sprites blur when zoomed in past their resolution; then, if only a few
  // pieces are on screen, paint those straight from the picture instead.
  let frameDirect = false;

  function chooseDirect(rect) {
    const ratio = (view.zoom * view.dpr) / game.atlas.scale;
    if (ratio <= 1.25) return false;
    let n = 0;
    const groups = [game.board, ...game.order, ...anims.map((a) => a.g)];
    for (const g of groups) {
      if (g !== game.board && isHidden(g)) continue;
      for (const p of g.pieces) {
        if (p.bx0 + g.ox > rect.x1 || p.by0 + g.oy > rect.y1 || p.bx1 + g.ox < rect.x0 || p.by1 + g.oy < rect.y0) continue;
        if (++n > 260) return false;
      }
    }
    return true;
  }

  function render(now) {
    const active = activeGroups();
    if (active.length) {
      if (!cache.valid) {
        frameDirect = chooseDirect(visibleRect());
        renderScene(cacheCtx, new Set(active), now);
        cache.valid = true;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(cacheCanvas, 0, 0);
      worldTransform(ctx);
      if (drag && game.mode === 'assisted') drawTarget(ctx, drag);
      for (const g of active) drawGroup(ctx, g, visibleRect(), true);
    } else {
      frameDirect = chooseDirect(visibleRect());
      renderScene(ctx, null, now);
    }
  }

  function renderScene(c, exclude, now) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = colors.table;
    c.fillRect(0, 0, canvas.width, canvas.height);
    const felt = feltFor(c);
    if (felt) {
      c.save();
      c.translate((view.panX * view.dpr) % 160, (view.panY * view.dpr) % 160);
      c.fillStyle = felt;
      c.fillRect(-160, -160, canvas.width + 320, canvas.height + 320);
      c.restore();
    }
    worldTransform(c);
    const px = 1 / view.zoom;
    // The board: a recessed frame where the picture goes.
    c.fillStyle = 'rgba(0,0,0,0.12)';
    c.fillRect(-6 * px, -6 * px, IMG_W + 12 * px, IMG_H + 12 * px);
    c.fillStyle = colors.board;
    c.fillRect(0, 0, IMG_W, IMG_H);
    c.lineWidth = 1.5 * px;
    c.strokeStyle = colors.boardEdge;
    c.strokeRect(0, 0, IMG_W, IMG_H);
    if (game.ghost && game.mode === 'assisted' && !game.complete) {
      c.globalAlpha = 0.24;
      c.drawImage(sceneCanvas, 0, 0);
      c.globalAlpha = 1;
    }
    const rect = visibleRect();
    drawGroup(c, game.board, rect, false);
    for (const g of game.order) {
      if (exclude && exclude.has(g)) continue;
      if (isHidden(g)) continue;
      drawGroup(c, g, rect, false);
    }
    if (game.complete && game.revealStart) {
      const t = clamp((now - game.revealStart) / 1500, 0, 1);
      c.globalAlpha = t * t * (3 - 2 * t);
      c.drawImage(sceneCanvas, 0, 0);
      c.globalAlpha = 1;
    }
  }

  // Draws the pieces of one group: from the sprite sheets normally, or straight
  // from the picture when zoomed in close enough that sprites would blur.
  function drawGroup(c, g, rect, lifted) {
    if (!g.pieces.length) return;
    const ox = g.ox, oy = g.oy;
    if (g.bx0 + ox > rect.x1 || g.by0 + oy > rect.y1 || g.bx1 + ox < rect.x0 || g.by1 + oy < rect.y0) return;
    const a = game.atlas;
    const dev = view.zoom * view.dpr;
    const ratio = dev / a.scale;
    const direct = frameDirect;
    const level = ratio < 0.25 ? 2 : ratio < 0.5 ? 1 : 0;
    const f = 1 << level;
    const m = SPRITE_MARGIN / a.scale;
    const dw = a.slotW / a.scale, dh = a.slotH / a.scale;

    const drawAll = () => {
      for (const p of g.pieces) {
        const x0 = p.bx0 + ox, y0 = p.by0 + oy;
        if (x0 > rect.x1 || y0 > rect.y1 || p.bx1 + ox < rect.x0 || p.by1 + oy < rect.y0) continue;
        if (direct) {
          c.save();
          c.translate(ox, oy);
          paintPiece(c, p, a.bevel, 1 / view.zoom / view.dpr);
          c.restore();
        } else {
          const sheet = a.sheets[p.sheet].levels[level];
          c.drawImage(sheet, p.sx / f, p.sy / f, a.slotW / f, a.slotH / f, x0 - m, y0 - m, dw, dh);
        }
      }
    };

    if (lifted && g.pieces.length <= 300) {
      c.save();
      c.shadowColor = 'rgba(10,15,10,0.38)';
      c.shadowBlur = 12 * view.dpr;
      c.shadowOffsetX = 3 * view.dpr;
      c.shadowOffsetY = 7 * view.dpr;
      if (direct) {
        // Painting clips to the outline, which would clip the shadow too, so
        // cast it from a filled outline underneath.
        c.translate(ox, oy);
        c.fillStyle = 'rgba(20,20,15,0.3)';
        for (const p of g.pieces) c.fill(p.path);
        c.restore();
        drawAll();
      } else {
        drawAll();
        c.restore();
        if (g.pieces.length > 1) drawAll();
      }
    } else {
      drawAll();
    }
  }

  // Assisted mode: outline where the dragged pieces belong.
  function drawTarget(c, g) {
    if (g.pieces.length > 60) return;
    c.save();
    c.lineWidth = 2.5 / view.zoom;
    c.strokeStyle = colors.accent;
    c.setLineDash([6 / view.zoom, 5 / view.zoom]);
    for (const p of g.pieces) c.stroke(p.path);
    c.restore();
  }

  // ---------------------------------------------------------------------------
  // Camera
  // ---------------------------------------------------------------------------

  function contentBounds() {
    let x0 = 0, y0 = 0, x1 = IMG_W, y1 = IMG_H;
    for (const g of game.order) {
      if (isHidden(g)) continue;
      x0 = Math.min(x0, g.bx0 + g.ox);
      y0 = Math.min(y0, g.by0 + g.oy);
      x1 = Math.max(x1, g.bx1 + g.ox);
      y1 = Math.max(y1, g.by1 + g.oy);
    }
    return { x0, y0, x1, y1 };
  }

  function usableArea() {
    const hud = $('hud'), tools = $('tools');
    const top = hud.hidden ? 0 : hud.getBoundingClientRect().bottom;
    const bottom = tools.hidden ? view.h : tools.getBoundingClientRect().top;
    return { x: 0, y: top, w: view.w, h: Math.max(80, bottom - top) };
  }

  function fitZoomFor(b) {
    const area = usableArea();
    const pad = 16;
    return Math.min((area.w - pad * 2) / (b.x1 - b.x0), (area.h - pad * 2) / (b.y1 - b.y0));
  }

  function updateZoomLimits() {
    const fit = fitZoomFor(contentBounds());
    const cell = Math.min(game.puz.cw, game.puz.ch);
    view.minZoom = fit * 0.6;
    view.maxZoom = Math.max(fit * 2, 220 / cell);
  }

  function centerOn(b, zoom) {
    const area = usableArea();
    view.zoom = clamp(zoom, view.minZoom, view.maxZoom);
    view.panX = area.x + area.w / 2 - ((b.x0 + b.x1) / 2) * view.zoom;
    view.panY = area.y + area.h / 2 - ((b.y0 + b.y1) / 2) * view.zoom;
    invalidate();
  }

  function fitAll() {
    updateZoomLimits();
    const b = contentBounds();
    centerOn(b, fitZoomFor(b));
  }

  function zoomAt(x, y, factor) {
    const z = clamp(view.zoom * factor, view.minZoom, view.maxZoom);
    if (z === view.zoom) return;
    const [wx, wy] = screenToWorld(x, y);
    view.zoom = z;
    view.panX = x - wx * z;
    view.panY = y - wy * z;
    invalidate();
    viewChanged();
  }

  let viewTimer = null;
  function viewChanged() {
    clearTimeout(viewTimer);
    viewTimer = setTimeout(markDirty, 1200);
  }

  // While dragging near the edge of the screen, scroll the table.
  function autoPan() {
    if (!drag || !lastPointer || gesture?.type !== 'piece') return false;
    const area = usableArea();
    const edge = 44;
    const { x, y } = lastPointer;
    let vx = 0, vy = 0;
    if (x < edge) vx = (edge - x) / edge;
    else if (x > view.w - edge) vx = -(x - (view.w - edge)) / edge;
    if (y < area.y + edge) vy = (area.y + edge - y) / edge;
    else if (y > area.y + area.h - edge) vy = -(y - (area.y + area.h - edge)) / edge;
    if (!vx && !vy) return false;
    view.panX += clamp(vx, -1, 1) * 14;
    view.panY += clamp(vy, -1, 1) * 14;
    const [wx, wy] = screenToWorld(x, y);
    drag.ox = wx - gesture.dx;
    drag.oy = wy - gesture.dy;
    cache.valid = false;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  function pick(wx, wy) {
    for (let k = game.order.length - 1; k >= 0; k--) {
      const g = game.order[k];
      if (isHidden(g)) continue;
      const lx = wx - g.ox, ly = wy - g.oy;
      if (lx < g.bx0 || lx > g.bx1 || ly < g.by0 || ly > g.by1) continue;
      for (const p of g.pieces) {
        if (lx < p.bx0 || lx > p.bx1 || ly < p.by0 || ly > p.by1) continue;
        if (hitCtx.isPointInPath(p.path, lx, ly)) return g;
      }
    }
    return null;
  }

  function localPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function activity() {
    lastActivity = Date.now();
    sound.unlock();
  }

  function onPointerDown(e) {
    if (!game) return;
    activity();
    const pt = localPoint(e);
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    pointers.set(e.pointerId, pt);

    if (pointers.size === 2) {
      if (gesture?.type === 'piece') endPieceGesture(false);
      startPinch();
      return;
    }
    if (pointers.size > 2) return;

    const [wx, wy] = screenToWorld(pt.x, pt.y);
    const g = e.button === 0 && !game.complete ? pick(wx, wy) : null;
    if (g) {
      gesture = { type: 'piece', id: e.pointerId, g, sx: pt.x, sy: pt.y, dx: wx - g.ox, dy: wy - g.oy, moved: false, touch: e.pointerType !== 'mouse' };
      lastPointer = pt;
    } else {
      gesture = { type: 'pan', id: e.pointerId, sx: pt.x, sy: pt.y, px: view.panX, py: view.panY, moved: false };
      canvas.style.cursor = 'grabbing';
    }
  }

  function onPointerMove(e) {
    if (!game) return;
    const pt = localPoint(e);
    if (!pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse') hover(pt);
      return;
    }
    pointers.set(e.pointerId, pt);
    if (!gesture) return;
    if (gesture.type === 'pinch') { updatePinch(); return; }
    if (gesture.id !== e.pointerId) return;
    const dist = Math.hypot(pt.x - gesture.sx, pt.y - gesture.sy);
    if (gesture.type === 'piece') {
      lastPointer = pt;
      if (!gesture.moved && dist > (gesture.touch ? 8 : 4)) {
        gesture.moved = true;
        drag = gesture.g;
        bringToTop(drag);
        canvas.style.cursor = 'grabbing';
        cache.valid = false;
      }
      if (gesture.moved) {
        const [wx, wy] = screenToWorld(pt.x, pt.y);
        drag.ox = wx - gesture.dx;
        drag.oy = wy - gesture.dy;
        requestRender();
      }
    } else if (gesture.type === 'pan') {
      if (dist > 3) gesture.moved = true;
      view.panX = gesture.px + (pt.x - gesture.sx);
      view.panY = gesture.py + (pt.y - gesture.sy);
      invalidate();
    }
    activity();
  }

  function onPointerUp(e) {
    if (!game) return;
    pointers.delete(e.pointerId);
    if (!gesture) return;
    if (gesture.type === 'pinch') {
      if (pointers.size === 1) {
        const [id, pt] = [...pointers.entries()][0];
        gesture = { type: 'pan', id, sx: pt.x, sy: pt.y, px: view.panX, py: view.panY, moved: true };
      } else if (pointers.size === 0) {
        gesture = null;
      }
      viewChanged();
      return;
    }
    if (gesture.id !== e.pointerId) return;
    if (gesture.type === 'piece') endPieceGesture(e.type !== 'pointercancel');
    else {
      if (gesture.moved) viewChanged();
      gesture = null;
    }
    canvas.style.cursor = '';
  }

  function endPieceGesture(allowTap) {
    const g = gesture.g;
    const moved = gesture.moved;
    gesture = null;
    lastPointer = null;
    if (moved) {
      drag = null;
      const joins = settle(g);
      if (joins) sound.click(Math.min(1, 0.5 + joins * 0.25));
      cache.valid = false;
      invalidate();
      afterChange();
    } else if (allowTap) {
      if (game.mode === 'assisted') {
        autoPlace(g);
      } else {
        bringToTop(g);
        invalidate();
      }
    }
  }

  function startPinch() {
    const [a, b] = [...pointers.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    gesture = { type: 'pinch', d0: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), z0: view.zoom, world: screenToWorld(mid.x, mid.y) };
  }

  function updatePinch() {
    const pts = [...pointers.values()];
    if (pts.length < 2) return;
    const [a, b] = pts;
    const d = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    view.zoom = clamp(gesture.z0 * (d / gesture.d0), view.minZoom, view.maxZoom);
    view.panX = mid.x - gesture.world[0] * view.zoom;
    view.panY = mid.y - gesture.world[1] * view.zoom;
    invalidate();
  }

  let hoverQueued = false;
  function hover(pt) {
    if (hoverQueued) return;
    hoverQueued = true;
    requestAnimationFrame(() => {
      hoverQueued = false;
      if (!game || gesture) return;
      const [wx, wy] = screenToWorld(pt.x, pt.y);
      const g = game.complete ? null : pick(wx, wy);
      canvas.style.cursor = g ? (game.mode === 'assisted' ? 'pointer' : 'grab') : '';
    });
  }

  function onWheel(e) {
    if (!game) return;
    e.preventDefault();
    activity();
    const pt = localPoint(e);
    const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
    const dy = e.deltaY * unit;
    zoomAt(pt.x, pt.y, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0016)));
  }

  function onKey(e) {
    if (!game || $('hud').hidden) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    let handled = true;
    if (k === '+' || k === '=') zoomAt(view.w / 2, view.h / 2, 1.25);
    else if (k === '-' || k === '_') zoomAt(view.w / 2, view.h / 2, 0.8);
    else if (k === '0') { fitAll(); viewChanged(); }
    else if (k === 'e' || k === 'E') toggleEdges();
    else if (k === 'g' || k === 'G') toggleGhost();
    else if (k === 'b' || k === 'B') toggleBoxLid();
    else if (k === 't' || k === 'T') tidy();
    else if (k === 'Escape') { if (!$('boxLid').hidden) toggleBoxLid(false); else handled = false; }
    else if (k.startsWith('Arrow')) {
      const step = 90;
      if (k === 'ArrowLeft') view.panX += step;
      if (k === 'ArrowRight') view.panX -= step;
      if (k === 'ArrowUp') view.panY += step;
      if (k === 'ArrowDown') view.panY -= step;
      invalidate();
      viewChanged();
    } else handled = false;
    if (handled) { e.preventDefault(); activity(); }
  }

  // ---------------------------------------------------------------------------
  // Play screen
  // ---------------------------------------------------------------------------

  function setSaveState(state) {
    const el = $('hudSave');
    el.dataset.state = state;
    if (state === 'off') {
      el.textContent = 'Not saving';
      el.title = 'This browser is blocking storage, so progress cannot be saved.';
    } else {
      el.textContent = state === 'saving' ? 'Saving…' : 'Saved';
      el.title = cloud.available ? 'Saved in this browser and to your account' : 'Saved in this browser';
    }
  }

  function updateHud() {
    if (!game) return;
    const n = game.puz.n;
    const fitted = fittedCount();
    $('hudCount').innerHTML = game.complete
      ? '<strong>Complete</strong>'
      : `<strong>${fmtInt(fitted)}</strong> / ${fmtInt(n)} fitted`;
    $('hudBar').style.width = `${(fitted / n) * 100}%`;
    $('hudTimer').textContent = formatClock(game.elapsed);
    const assisted = game.mode === 'assisted';
    $('modeAssisted').setAttribute('aria-pressed', String(assisted));
    $('modeUnassisted').setAttribute('aria-pressed', String(!assisted));
    $('toolGhost').hidden = !assisted;
    $('toolGhost').setAttribute('aria-pressed', String(game.ghost));
    $('toolEdges').setAttribute('aria-pressed', String(game.edgesOnly));
    $('toolSound').setAttribute('aria-pressed', String(prefs.sound));
    $('toolBox').setAttribute('aria-pressed', String(!$('boxLid').hidden));
  }

  function setMode(mode) {
    if (!game || game.mode === mode) return;
    game.mode = mode;
    prefs.mode = mode;
    savePrefs();
    updateHud();
    invalidate();
    markDirty();
    toast(mode === 'assisted'
      ? 'Assisted: tap a piece and it glides into place.'
      : 'Unassisted: drag pieces together. They lock when they fit.');
  }

  function toggleEdges() {
    if (!game) return;
    game.edgesOnly = !game.edgesOnly;
    updateZoomLimits();
    updateHud();
    invalidate();
    markDirty();
    toast(game.edgesOnly ? 'Showing edge pieces only.' : 'Showing all pieces.');
  }

  function toggleGhost() {
    if (!game || game.mode !== 'assisted') return;
    game.ghost = !game.ghost;
    updateHud();
    invalidate();
    markDirty();
  }

  function toggleBoxLid(force) {
    const el = $('boxLid');
    const show = typeof force === 'boolean' ? force : el.hidden;
    el.hidden = !show;
    if (show) drawBoxLid();
    updateHud();
  }

  function drawBoxLid() {
    const cv = $('boxLidCanvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(cv.clientWidth * dpr));
    const h = Math.round(w * (IMG_H / IMG_W));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const c = cv.getContext('2d');
    c.imageSmoothingQuality = 'high';
    c.drawImage(sceneCanvas, 0, 0, w, h);
  }

  let toastTimer = null;
  function toast(msg, ms = 2800) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  // The clock runs while the puzzle is on screen and someone is playing.
  let lastTick = performance.now();
  let lastPeriodicSave = Date.now();
  setInterval(() => {
    const now = performance.now();
    const dt = Math.min(2000, now - lastTick);
    lastTick = now;
    if (!game || game.complete || $('hud').hidden) return;
    if (document.visibilityState !== 'visible' || Date.now() - lastActivity > IDLE_MS) return;
    game.elapsed += dt;
    $('hudTimer').textContent = formatClock(game.elapsed);
    if (Date.now() - lastPeriodicSave > 15000 && !saveTimer) {
      lastPeriodicSave = Date.now();
      saveNow(false);
    }
  }, 1000);

  function completeGame() {
    game.complete = true;
    clearTimeout(saveTimer);
    saveTimer = null;
    const pieces = game.puz.size.pieces;
    saves.clear(pieces);
    const records = loadRecords();
    const key = `${pieces}-${game.mode}`;
    const prev = records[key];
    const isBest = !prev || game.elapsed < prev.best;
    records[key] = { best: isBest ? Math.round(game.elapsed) : prev.best, count: ((prev && prev.count) || 0) + 1, at: Date.now() };
    local.set('records', records);
    cloud.queue('records', records, 200);
    game.revealStart = performance.now();
    const board = { x0: 0, y0: 0, x1: IMG_W, y1: IMG_H };
    centerOn(board, fitZoomFor(board));
    sound.chime();
    updateHud();
    $('hudSave').dataset.state = 'saved';
    $('hudSave').textContent = 'Finished';
    invalidate();
    const modeName = game.mode === 'assisted' ? 'assisted' : 'unassisted';
    $('finishText').textContent = `${fmtInt(game.puz.n)} pieces in ${formatClock(game.elapsed)}, ${modeName}.`;
    $('finishBest').textContent = isBest
      ? (prev ? 'A new best time for this size and mode.' : 'Your first finish at this size and mode.')
      : `Your best at this size and mode is ${formatClock(prev.best)}.`;
    setTimeout(() => { if (game && game.complete) $('finish').hidden = false; }, 1300);
  }

  let starting = false;

  async function startGame(pieces, fresh) {
    if (starting) return;
    starting = true;
    try {
      await launch(pieces, fresh);
    } catch (err) {
      $('loading').hidden = true;
      toast('Something went wrong while cutting the pieces. Please try again.');
      console.error(err);
    } finally {
      starting = false;
    }
  }

  async function launch(pieces, fresh) {
    const size = sizeFor(pieces);
    const mode = selectedMode();
    let saved = fresh ? null : saves.load(pieces);
    let note = '';
    if (saved && !validSave(saved, size)) {
      saved = null;
      note = 'The saved game could not be read, so a new one has started.';
    }
    showLoading(`Cutting ${fmtInt(size.cols * size.rows)} pieces`);
    await sceneReady;
    const seed = saved ? saved.seed : Math.floor(Math.random() * 2147483647);
    const puz = createPuzzle(size, seed);
    const atlas = await buildAtlas(puz, (f) => { $('loadingBar').style.width = `${f * 100}%`; });

    endGame();
    game = {
      puz, atlas, mode,
      board: makeGroup([], 0, 0),
      order: [],
      elapsed: saved ? saved.elapsed || 0 : 0,
      startedAt: saved ? saved.startedAt || Date.now() : Date.now(),
      complete: false,
      edgesOnly: saved ? !!saved.edgesOnly : false,
      ghost: saved ? !!saved.ghost : false,
      revealStart: 0,
    };
    game.board.locked = true;
    game.board.bx0 = 0; game.board.by0 = 0; game.board.bx1 = IMG_W; game.board.by1 = IMG_H;
    if (saved) restore(saved);
    else scatter();

    $('menu').hidden = true;
    $('loading').hidden = true;
    $('hud').hidden = false;
    $('tools').hidden = false;
    $('hudSize').textContent = `${fmtInt(puz.n)} pieces`;
    resize();
    updateZoomLimits();
    if (saved && Array.isArray(saved.view) && saved.view.length === 3 && saved.view.every(Number.isFinite)) {
      const [z, cx, cy] = saved.view;
      const area = usableArea();
      view.zoom = clamp(z, view.minZoom, view.maxZoom);
      view.panX = area.x + area.w / 2 - cx * view.zoom;
      view.panY = area.y + area.h / 2 - cy * view.zoom;
    } else {
      fitAll();
    }
    lastActivity = Date.now();
    updateHud();
    invalidate();
    saveNow(true);
    toast(note || (mode === 'assisted'
      ? 'Tap a piece to send it home, or drag it yourself. Scroll or pinch to zoom.'
      : 'Drag pieces together. They lock when they fit. Scroll or pinch to zoom.'), 4200);
    checkComplete();
  }

  function endGame() {
    if (!game) return;
    if (!game.complete) saveNow(true);
    releaseAtlas(game.atlas);
    game = null;
    anims.length = 0;
    drag = null;
    gesture = null;
    pointers.clear();
  }

  function backToMenu() {
    endGame();
    $('hud').hidden = true;
    $('tools').hidden = true;
    $('finish').hidden = true;
    toggleBoxLid(false);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    $('menu').hidden = false;
    refreshMenu();
    $('startBtn').focus({ preventScroll: true });
  }

  function showLoading(text) {
    $('loadingText').textContent = text;
    $('loadingBar').style.width = '0%';
    $('loading').hidden = false;
  }

  // ---------------------------------------------------------------------------
  // Menu
  // ---------------------------------------------------------------------------

  function buildMenu() {
    const list = $('sizeList');
    for (const s of SIZES) {
      const count = s.cols * s.rows;
      const label = document.createElement('label');
      label.className = 'choice size-choice';
      label.innerHTML =
        `<input type="radio" name="size" id="size-${s.pieces}" value="${s.pieces}">` +
        '<span class="choice-body">' +
        `<span class="count">${s.pieces}</span>` +
        `<span class="detail">${fmtInt(count)} pieces · ${s.cols} × ${s.rows}</span>` +
        `<span class="detail">${finishedSize(s)}</span>` +
        '<span class="status"></span>' +
        '</span>';
      list.appendChild(label);
    }
    list.addEventListener('change', () => {
      const pieces = selectedSize();
      prefs.pieces = pieces;
      const saved = saves.load(pieces);
      if (saved && (saved.mode === 'assisted' || saved.mode === 'unassisted')) setModeRadio(saved.mode);
      savePrefs();
      $('confirmRestart').hidden = true;
      refreshMenu();
    });
    document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener('change', () => {
      prefs.mode = selectedMode();
      savePrefs();
    }));
  }

  const selectedSize = () => Number((document.querySelector('input[name="size"]:checked') || {}).value) || 500;
  const selectedMode = () => (document.querySelector('input[name="mode"]:checked') || {}).value || 'assisted';
  function setModeRadio(mode) {
    const el = $(mode === 'unassisted' ? 'modeChoiceUnassisted' : 'modeChoiceAssisted');
    if (el) el.checked = true;
  }

  function refreshMenu() {
    const records = loadRecords();
    for (const s of SIZES) {
      const status = document.querySelector(`#size-${s.pieces} + .choice-body .status`);
      const saved = saves.load(s.pieces);
      const n = s.cols * s.rows;
      const best = ['assisted', 'unassisted']
        .map((m) => records[`${s.pieces}-${m}`])
        .filter(Boolean)
        .sort((a, b) => a.best - b.best)[0];
      if (saved) {
        status.className = 'status in-progress';
        status.textContent = `${Math.floor(((saved.fitted || 0) / n) * 100)}% done · ${formatDuration(saved.elapsed || 0)}`;
      } else if (best) {
        status.className = 'status done';
        status.textContent = `Done · best ${formatDuration(best.best)}`;
      } else {
        status.className = 'status';
        status.textContent = '';
      }
    }
    const pieces = selectedSize();
    const size = sizeFor(pieces);
    const saved = saves.load(pieces);
    const start = $('startBtn');
    start.disabled = !sceneCanvas.width || sceneBusy;
    start.textContent = saved
      ? `Continue · ${Math.floor(((saved.fitted || 0) / (size.cols * size.rows)) * 100)}% done`
      : `Start the ${pieces}-piece puzzle`;
    $('restartBtn').hidden = !saved;
    $('lidCount').textContent = String(pieces);
    $('lidCaption').textContent = `${fmtInt(size.cols * size.rows)} pieces · finished size ${finishedSize(size)}`;
  }

  function updateStorageNote() {
    const el = $('storageNote');
    el.classList.remove('warn');
    if (local.ok && cloud.available) el.textContent = 'Progress saves automatically, in this browser and to your account, so you can close it and carry on later.';
    else if (local.ok) el.textContent = 'Progress saves automatically in this browser, so you can close it and carry on later.';
    else if (cloud.available) el.textContent = 'Progress saves automatically to your account, so you can close the page and carry on later.';
    else {
      el.textContent = 'This browser is blocking storage, so progress can’t be saved. Private windows often do this.';
      el.classList.add('warn');
    }
  }

  let sceneBusy = true;

  function drawLid() {
    const cv = $('lidCanvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(cv.clientWidth * dpr));
    const h = Math.round(w * (IMG_H / IMG_W));
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d');
    c.imageSmoothingQuality = 'high';
    c.drawImage(sceneCanvas, 0, 0, w, h);
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  function bind() {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', () => {
      resize();
      if ($('menu').hidden === false && !sceneBusy) drawLid();
    });

    $('backBtn').addEventListener('click', backToMenu);
    $('modeAssisted').addEventListener('click', () => setMode('assisted'));
    $('modeUnassisted').addEventListener('click', () => setMode('unassisted'));
    $('toolBox').addEventListener('click', () => toggleBoxLid());
    $('toolGhost').addEventListener('click', toggleGhost);
    $('toolEdges').addEventListener('click', toggleEdges);
    $('toolTidy').addEventListener('click', tidy);
    $('toolZoomIn').addEventListener('click', () => zoomAt(view.w / 2, view.h / 2, 1.3));
    $('toolZoomOut').addEventListener('click', () => zoomAt(view.w / 2, view.h / 2, 1 / 1.3));
    $('toolFit').addEventListener('click', () => { fitAll(); viewChanged(); });
    $('toolSound').addEventListener('click', () => {
      prefs.sound = !prefs.sound;
      savePrefs();
      sound.unlock();
      updateHud();
      if (prefs.sound) sound.click(0.8);
    });
    $('boxLidClose').addEventListener('click', () => toggleBoxLid(false));
    $('boxLidSize').addEventListener('click', () => {
      const el = $('boxLid');
      el.classList.toggle('large');
      $('boxLidSize').textContent = el.classList.contains('large') ? 'Shrink' : 'Enlarge';
      drawBoxLid();
    });
    $('boxLidCanvas').addEventListener('click', () => $('boxLidSize').click());

    $('startBtn').addEventListener('click', () => { sound.unlock(); startGame(selectedSize(), false); });
    $('restartBtn').addEventListener('click', () => {
      $('confirmText').textContent = `Start the ${selectedSize()}-piece puzzle again? Your progress on it will be cleared.`;
      $('confirmRestart').hidden = false;
      $('confirmNo').focus();
    });
    $('confirmNo').addEventListener('click', () => { $('confirmRestart').hidden = true; });
    $('confirmYes').addEventListener('click', () => {
      $('confirmRestart').hidden = true;
      sound.unlock();
      startGame(selectedSize(), true);
    });
    $('finishAdmire').addEventListener('click', () => { $('finish').hidden = true; centerOn({ x0: 0, y0: 0, x1: IMG_W, y1: IMG_H }, fitZoomFor({ x0: 0, y0: 0, x1: IMG_W, y1: IMG_H })); });
    $('finishMenu').addEventListener('click', backToMenu);

    // Save when the page is hidden or closed, so nothing is lost.
    const flush = () => {
      if (game && !game.complete) saveNow(true);
      cloud.flushAll();
    };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    window.addEventListener('pagehide', flush);

    const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', readColors);
    new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  }

  function boot() {
    local.init();
    prefs = loadPrefs();
    buildMenu();
    const initial = sizeFor(prefs.pieces) ? prefs.pieces : 500;
    $(`size-${initial}`).checked = true;
    const saved = saves.load(initial);
    setModeRadio(saved ? saved.mode : prefs.mode);
    bind();
    readColors();
    resize();
    refreshMenu();
    updateStorageNote();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

    sceneReady = CottageScene.paint(sceneCanvas, {
      seed: SCENE_SEED,
      onProgress: (f) => { $('lidBar').style.width = `${f * 100}%`; },
    }).then(() => {
      sceneBusy = false;
      $('lidPainting').hidden = true;
      drawLid();
      refreshMenu();
    });

    cloud.init().then((ok) => {
      if (!ok) return;
      updateStorageNote();
      if (!game) {
        const s = saves.load(selectedSize());
        if (s) setModeRadio(s.mode);
        refreshMenu();
      }
    });
  }

  boot();
})();
