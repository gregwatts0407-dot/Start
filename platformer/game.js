(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  const TILE = 32;
  const ROWS = 15;
  const WIDTH = 800;
  const HEIGHT = ROWS * TILE;

  const STEP = 1 / 120;        // fixed physics step in seconds
  const GRAVITY = 2000;
  const MAX_FALL = 900;
  const RUN_SPEED = 230;
  const GROUND_ACCEL = 2400;
  const AIR_ACCEL = 1500;
  const FRICTION = 2600;
  const JUMP_SPEED = 700;      // about 3.8 tiles high
  const JUMP_CUT = 0.45;       // releasing jump early keeps this much upward speed
  const COYOTE_TIME = 0.08;    // can still jump this long after leaving a ledge
  const JUMP_BUFFER = 0.12;    // a jump pressed this long before landing still counts
  const STOMP_BOUNCE = 480;
  const ENEMY_SPEED = 60;
  const START_LIVES = 3;
  const DEATH_TIME = 1.1;

  const PLAYER_W = 22;
  const PLAYER_H = 28;
  const ENEMY_W = 26;
  const ENEMY_H = 22;

  // Map legend:
  //   #  ground          X  stone block     -  one-way platform
  //   ^  spikes          o  coin            e  walking enemy
  //   P  player start    F  goal flag       .  empty
  const LEVELS = [
    {
      name: 'First Steps',
      map: [
        '......................................................................',
        '......................................................................',
        '......................................................................',
        '......................................................................',
        '......................................................................',
        '......................................................................',
        '......................................................................',
        '......................................................................',
        '..................................................oooo................',
        '............oo...........ooo..........................................',
        '........................-----....................XXXXX................',
        '......ooo...XX..................................XXXXXX......ooo.......',
        '..P.........XX...................e...^^........XXXXXXX....e.......F...',
        '##################...####################...##########################',
        '##################...####################...##########################',
      ],
    },
    {
      name: 'Sky Steps',
      map: [
        '..........................................................................................',
        '..........................................................................................',
        '..........................................................................................',
        '................................................ooo.......................................',
        '................................................---.......................................',
        '..........................................................................................',
        '..........................................................................................',
        '............................................---...........................................',
        '..........................................................................................',
        '............ooo................oo.........................o..........e....................',
        '............---................XX.......---.......................XXXXXXX..ooo............',
        '.....ooo.......................XX.........................X.......XXXXXXX.................',
        '..P...................e....e...XX............e.....^^.....X.......XXXXXXX..^^^....e...F...',
        '###########^^^^^^##############......###################..X..#############################',
        '###############################......###################..X..#############################',
      ],
    },
    {
      name: 'The Climb',
      map: [
        '..............................................................................................................',
        '..............................................................................................................',
        '..............................................................................................................',
        '..............................................................................................................',
        '..............................................................................................................',
        '..............................................................................................................',
        '......................................................ooo.....................................................',
        '......................................................XXX..--..oo.............................................',
        '....................ooo...............................XXX......--.............................................',
        '....................---...............................XXX............................XXXXXXXX.................',
        '.........................ooo.......................XXXXXX.............e..^...e..........................X.....',
        '...............---.......---.......................XXXXXX..........XXXXXXXXXXXXXX.....oooooo...........XX.....',
        '..P...............................e..^..e..^...e...XXXXXX..........XXXXXXXXXXXXXX.......e......^^...e.XXX..F..',
        '#############.................#####################XXXXXX..........XXXXXXXXXXXXXX#############################',
        '#############.................#####################XXXXXX..........XXXXXXXXXXXXXX#############################',
      ],
    },
  ];

  const COLORS = {
    skyTop: '#1b2440',
    skyBottom: '#3d5a8a',
    hillFar: '#2a3b63',
    hillNear: '#30486f',
    dirt: '#6b4a2f',
    dirtDark: '#57391f',
    grass: '#57c084',
    stone: '#7a8194',
    stoneDark: '#5c6274',
    stoneLight: '#979eb2',
    plank: '#c9a25e',
    plankDark: '#9a7638',
    spike: '#d6dbe6',
    coin: '#f5b942',
    coinLight: '#ffe29a',
    player: '#5cb8e6',
    playerDark: '#3a8fbd',
    enemy: '#b05656',
    enemyDark: '#863d3d',
    flag: '#e5534b',
    pole: '#d6dbe6',
  };

  // ---------------------------------------------------------------------------
  // Levels
  // ---------------------------------------------------------------------------

  function loadLevel(index) {
    const def = LEVELS[index];
    const cols = Math.max(...def.map.map((row) => row.length));
    const tiles = def.map.map((row) => row.padEnd(cols, '.').split(''));
    const level = {
      index, name: def.name, cols, width: cols * TILE, tiles,
      start: { x: TILE, y: 12 * TILE }, goal: null, coins: [], enemies: [],
    };

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < cols; c++) {
        const ch = tiles[r][c];
        if (ch === 'P') {
          level.start = { x: c * TILE + (TILE - PLAYER_W) / 2, y: (r + 1) * TILE - PLAYER_H };
        } else if (ch === 'o') {
          level.coins.push({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2, taken: false });
        } else if (ch === 'e') {
          level.enemies.push({
            x: c * TILE + (TILE - ENEMY_W) / 2, y: (r + 1) * TILE - ENEMY_H,
            w: ENEMY_W, h: ENEMY_H, vx: -ENEMY_SPEED, vy: 0, alive: true, squash: 0,
          });
        } else if (ch === 'F') {
          // The pole is four tiles tall and its base sits on this tile.
          level.goal = { x: c * TILE + 10, y: (r - 3) * TILE, w: 12, h: TILE * 4, baseX: c * TILE + TILE / 2, baseY: (r + 1) * TILE };
        } else {
          continue;
        }
        tiles[r][c] = '.';
      }
    }
    return level;
  }

  function tileAt(c, r) {
    const level = state.level;
    if (c < 0 || c >= level.cols) return 'X'; // invisible walls at both ends
    if (r < 0 || r >= ROWS) return '.';
    return level.tiles[r][c];
  }

  const isSolid = (ch) => ch === '#' || ch === 'X';

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  let state;

  function newState() {
    return {
      mode: 'title', // title | play | dying | clear | over | won
      paused: false,
      levelIndex: 0,
      level: null,
      lives: START_LIVES,
      bankedCoins: 0, // coins from finished levels
      levelCoins: 0,
      bankedTime: 0,
      time: 0,
      clock: 0,
      deathTimer: 0,
      camX: 0,
      player: null,
      particles: [],
    };
  }

  function startLevel(index) {
    state.levelIndex = index;
    state.level = loadLevel(index);
    state.levelCoins = 0;
    state.time = 0;
    state.particles = [];
    const { x, y } = state.level.start;
    state.player = {
      x, y, w: PLAYER_W, h: PLAYER_H, vx: 0, vy: 0, prevBottom: y + PLAYER_H,
      facing: 1, onGround: false, coyote: 0, jumpBuffer: 0, jumping: false,
    };
    state.camX = cameraTarget();
    state.mode = 'play';
    hideOverlay();
  }

  // ---------------------------------------------------------------------------
  // Physics
  // ---------------------------------------------------------------------------

  // Moves a body horizontally and stops it at walls. Returns true on a hit.
  function moveX(body, dx) {
    if (!dx) return false;
    body.x += dx;
    const top = Math.floor(body.y / TILE);
    const bottom = Math.floor((body.y + body.h - 0.01) / TILE);
    const c = dx > 0 ? Math.floor((body.x + body.w - 0.01) / TILE) : Math.floor(body.x / TILE);
    for (let r = top; r <= bottom; r++) {
      if (!isSolid(tileAt(c, r))) continue;
      body.x = dx > 0 ? c * TILE - body.w : (c + 1) * TILE;
      body.vx = 0;
      return true;
    }
    return false;
  }

  // Moves a body vertically. One-way platforms only stop it when it falls onto
  // them from above. Returns 'floor', 'ceiling' or null.
  function moveY(body, dy) {
    if (!dy) return null;
    const prevBottom = body.y + body.h;
    body.y += dy;
    const left = Math.floor(body.x / TILE);
    const right = Math.floor((body.x + body.w - 0.01) / TILE);
    if (dy > 0) {
      const r = Math.floor((body.y + body.h - 0.01) / TILE);
      for (let c = left; c <= right; c++) {
        const ch = tileAt(c, r);
        if (isSolid(ch) || (ch === '-' && prevBottom <= r * TILE + 0.01)) {
          body.y = r * TILE - body.h;
          body.vy = 0;
          return 'floor';
        }
      }
    } else {
      const r = Math.floor(body.y / TILE);
      for (let c = left; c <= right; c++) {
        if (!isSolid(tileAt(c, r))) continue;
        body.y = (r + 1) * TILE;
        body.vy = 0;
        return 'ceiling';
      }
    }
    return null;
  }

  const overlaps = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  function touchesSpikes(body) {
    const left = Math.floor(body.x / TILE);
    const right = Math.floor((body.x + body.w - 0.01) / TILE);
    const top = Math.floor(body.y / TILE);
    const bottom = Math.floor((body.y + body.h - 0.01) / TILE);
    for (let r = top; r <= bottom; r++) {
      for (let c = left; c <= right; c++) {
        if (tileAt(c, r) !== '^') continue;
        const spike = { x: c * TILE + 4, y: r * TILE + 14, w: TILE - 8, h: TILE - 14 };
        if (overlaps(body, spike)) return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  function update(dt) {
    state.clock += dt;
    updateParticles(dt);

    if (state.mode === 'dying') {
      const p = state.player;
      p.vy = Math.min(p.vy + GRAVITY * dt, MAX_FALL);
      p.y += p.vy * dt;
      state.deathTimer -= dt;
      if (state.deathTimer <= 0) afterDeath();
      return;
    }
    if (state.mode !== 'play') return;

    state.time += dt;
    updatePlayer(dt);
    updateEnemies(dt);
    if (state.mode !== 'play') return;
    collectCoins();
    checkGoal();

    const target = cameraTarget();
    state.camX += (target - state.camX) * Math.min(1, dt * 6);
  }

  function updatePlayer(dt) {
    const p = state.player;
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);

    if (dir) {
      let accel = p.onGround ? GROUND_ACCEL : AIR_ACCEL;
      if (Math.sign(p.vx) === -dir) accel += FRICTION; // turn around quickly
      p.vx = Math.max(-RUN_SPEED, Math.min(RUN_SPEED, p.vx + dir * accel * dt));
      p.facing = dir;
    } else {
      const slow = (p.onGround ? FRICTION : FRICTION * 0.4) * dt;
      p.vx = Math.abs(p.vx) <= slow ? 0 : p.vx - Math.sign(p.vx) * slow;
    }

    if (input.jumpPressed) {
      p.jumpBuffer = JUMP_BUFFER;
      input.jumpPressed = false;
    }
    p.coyote = p.onGround ? COYOTE_TIME : p.coyote - dt;
    p.jumpBuffer -= dt;
    if (p.jumpBuffer > 0 && p.coyote > 0) {
      p.vy = -JUMP_SPEED;
      p.jumpBuffer = 0;
      p.coyote = 0;
      p.jumping = true;
    }
    if (p.jumping && !input.jump && p.vy < 0) {
      p.vy *= JUMP_CUT;
      p.jumping = false;
    }
    if (p.vy >= 0) p.jumping = false;

    p.vy = Math.min(p.vy + GRAVITY * dt, MAX_FALL);
    p.prevBottom = p.y + p.h;
    moveX(p, p.vx * dt);
    p.onGround = moveY(p, p.vy * dt) === 'floor';

    if (p.y > HEIGHT + 40 || touchesSpikes(p)) die();
  }

  function updateEnemies(dt) {
    const p = state.player;
    for (const e of state.level.enemies) {
      if (!e.alive) {
        e.squash -= dt;
        continue;
      }
      e.vy = Math.min(e.vy + GRAVITY * dt, MAX_FALL);
      const speed = e.vx;
      if (moveX(e, e.vx * dt)) e.vx = -speed;
      if (moveY(e, e.vy * dt) === 'floor') {
        // Turn around before walking off a ledge or into spikes.
        const aheadX = e.vx > 0 ? e.x + e.w + 1 : e.x - 1;
        const c = Math.floor(aheadX / TILE);
        const footRow = Math.floor((e.y + e.h + 1) / TILE);
        const below = tileAt(c, footRow);
        if (!(isSolid(below) || below === '-') || tileAt(c, footRow - 1) === '^') e.vx = -e.vx;
      }

      if (state.mode !== 'play' || !overlaps(p, e)) continue;
      if (p.vy > 0 && p.prevBottom <= e.y + 8) {
        e.alive = false;
        e.squash = 0.4;
        p.vy = input.jump ? -JUMP_SPEED * 0.85 : -STOMP_BOUNCE;
        p.jumping = input.jump;
        burst(e.x + e.w / 2, e.y + e.h, COLORS.enemy, 10);
      } else {
        die();
      }
    }
  }

  function collectCoins() {
    const p = state.player;
    for (const coin of state.level.coins) {
      if (coin.taken) continue;
      if (!overlaps(p, { x: coin.x - 10, y: coin.y - 10, w: 20, h: 20 })) continue;
      coin.taken = true;
      state.levelCoins++;
      burst(coin.x, coin.y, COLORS.coin, 8);
    }
  }

  function checkGoal() {
    const goal = state.level.goal;
    if (!goal || !overlaps(state.player, goal)) return;
    state.bankedCoins += state.levelCoins;
    state.bankedTime += state.time;
    burst(goal.baseX, goal.y + 10, COLORS.flag, 24);
    const coinsHere = `${state.levelCoins} / ${state.level.coins.length} coins in ${formatTime(state.time)}.`;
    if (state.levelIndex === LEVELS.length - 1) {
      state.mode = 'won';
      showOverlay('You Win!',
        `${coinsHere} Total: ${state.bankedCoins} coins in ${formatTime(state.bankedTime)}.`, 'Play Again');
    } else {
      state.mode = 'clear';
      showOverlay('Level Complete', coinsHere, 'Next Level');
    }
  }

  function die() {
    const p = state.player;
    state.mode = 'dying';
    state.deathTimer = DEATH_TIME;
    p.vx = 0;
    p.vy = -520;
    burst(p.x + p.w / 2, p.y + p.h / 2, COLORS.player, 14);
  }

  function afterDeath() {
    state.lives--;
    if (state.lives > 0) {
      startLevel(state.levelIndex);
      return;
    }
    state.mode = 'over';
    showOverlay('Game Over',
      `You reached level ${state.levelIndex + 1} with ${state.bankedCoins + state.levelCoins} coins.`, 'Try Again');
  }

  function cameraTarget() {
    const p = state.player;
    const x = p.x + p.w / 2 - WIDTH / 2 + p.facing * 40;
    return Math.max(0, Math.min(state.level.width - WIDTH, x));
  }

  // ---------------------------------------------------------------------------
  // Particles
  // ---------------------------------------------------------------------------

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 160;
      const life = 0.35 + Math.random() * 0.35;
      state.particles.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 80,
        life, max: life, color, size: 2 + Math.random() * 2,
      });
    }
  }

  function updateParticles(dt) {
    for (const pt of state.particles) {
      pt.life -= dt;
      pt.vy += GRAVITY * 0.4 * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
    }
    state.particles = state.particles.filter((pt) => pt.life > 0);
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  function render() {
    drawBackground();
    if (!state.level) return;

    const camX = Math.round(state.camX);
    ctx.save();
    ctx.translate(-camX, 0);
    drawTiles(camX);
    drawGoal();
    drawCoins();
    drawEnemies();
    if (state.player) drawPlayer();
    drawParticles();
    ctx.restore();

    if (state.paused) {
      ctx.fillStyle = 'rgba(10, 12, 18, 0.55)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = '#e8ebf2';
      ctx.font = 'bold 32px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Paused', WIDTH / 2, HEIGHT / 2);
    }
  }

  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, COLORS.skyTop);
    sky.addColorStop(1, COLORS.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    drawHills(state.camX * 0.2, 300, 60, 0.008, COLORS.hillFar);
    drawHills(state.camX * 0.45, 350, 45, 0.013, COLORS.hillNear);
  }

  function drawHills(offset, base, amp, freq, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT);
    for (let x = 0; x <= WIDTH; x += 10) {
      const wx = x + offset;
      ctx.lineTo(x, base - amp * (Math.sin(wx * freq) * 0.6 + Math.sin(wx * freq * 2.3 + 1) * 0.4));
    }
    ctx.lineTo(WIDTH, HEIGHT);
    ctx.closePath();
    ctx.fill();
  }

  function drawTiles(camX) {
    const first = Math.max(0, Math.floor(camX / TILE));
    const last = Math.min(state.level.cols - 1, Math.floor((camX + WIDTH) / TILE));
    for (let r = 0; r < ROWS; r++) {
      for (let c = first; c <= last; c++) {
        const ch = state.level.tiles[r][c];
        const x = c * TILE;
        const y = r * TILE;
        if (ch === '#') {
          ctx.fillStyle = COLORS.dirt;
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = COLORS.dirtDark;
          ctx.fillRect(x + 6, y + 14, 4, 4);
          ctx.fillRect(x + 20, y + 24, 4, 4);
          if (!isSolid(tileAt(c, r - 1))) {
            ctx.fillStyle = COLORS.grass;
            ctx.fillRect(x, y, TILE, 7);
          }
        } else if (ch === 'X') {
          ctx.fillStyle = COLORS.stoneDark;
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = COLORS.stone;
          ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
          ctx.fillStyle = COLORS.stoneLight;
          ctx.fillRect(x + 2, y + 2, TILE - 4, 3);
        } else if (ch === '-') {
          ctx.fillStyle = COLORS.plank;
          ctx.fillRect(x, y, TILE, 9);
          ctx.fillStyle = COLORS.plankDark;
          ctx.fillRect(x, y + 9, TILE, 3);
          ctx.fillRect(x + TILE - 2, y, 2, 9);
        } else if (ch === '^') {
          ctx.fillStyle = COLORS.spike;
          ctx.beginPath();
          for (let i = 0; i < 2; i++) {
            const sx = x + i * (TILE / 2);
            ctx.moveTo(sx, y + TILE);
            ctx.lineTo(sx + TILE / 4, y + 10);
            ctx.lineTo(sx + TILE / 2, y + TILE);
          }
          ctx.fill();
        }
      }
    }
  }

  function drawGoal() {
    const goal = state.level.goal;
    if (!goal) return;
    ctx.fillStyle = COLORS.pole;
    ctx.fillRect(goal.baseX - 2, goal.y, 4, goal.h);
    ctx.beginPath();
    ctx.arc(goal.baseX, goal.y, 5, 0, Math.PI * 2);
    ctx.fill();
    const wave = Math.sin(state.clock * 6) * 4;
    ctx.fillStyle = COLORS.flag;
    ctx.beginPath();
    ctx.moveTo(goal.baseX + 2, goal.y + 6);
    ctx.quadraticCurveTo(goal.baseX + 20, goal.y + 10 + wave, goal.baseX + 36, goal.y + 18);
    ctx.lineTo(goal.baseX + 2, goal.y + 32);
    ctx.closePath();
    ctx.fill();
  }

  function drawCoins() {
    for (const coin of state.level.coins) {
      if (coin.taken) continue;
      const spin = Math.abs(Math.cos(state.clock * 3 + coin.x * 0.05));
      const bob = Math.sin(state.clock * 4 + coin.x * 0.1) * 2;
      ctx.fillStyle = COLORS.coin;
      ctx.beginPath();
      ctx.ellipse(coin.x, coin.y + bob, Math.max(1.5, 8 * spin), 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.coinLight;
      ctx.fillRect(coin.x - spin * 2 - 1, coin.y + bob - 5, 2, 10);
    }
  }

  function drawEnemies() {
    for (const e of state.level.enemies) {
      if (!e.alive) {
        if (e.squash <= 0) continue;
        ctx.globalAlpha = e.squash / 0.4;
        ctx.fillStyle = COLORS.enemy;
        ctx.fillRect(e.x - 2, e.y + e.h - 6, e.w + 4, 6);
        ctx.globalAlpha = 1;
        continue;
      }
      const step = Math.sin(state.clock * 12 + e.x * 0.1) * 1.5;
      ctx.fillStyle = COLORS.enemyDark;
      ctx.fillRect(e.x + 3, e.y + e.h - 5 + step, 7, 5);
      ctx.fillRect(e.x + e.w - 10, e.y + e.h - 5 - step, 7, 5);
      ctx.fillStyle = COLORS.enemy;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y + e.h - 4);
      ctx.lineTo(e.x, e.y + e.h / 2);
      ctx.arc(e.x + e.w / 2, e.y + e.h / 2, e.w / 2, Math.PI, 0);
      ctx.lineTo(e.x + e.w, e.y + e.h - 4);
      ctx.closePath();
      ctx.fill();
      drawEyes(e.x + e.w / 2, e.y + 9, Math.sign(e.vx), 5);
    }
  }

  function drawPlayer() {
    const p = state.player;
    const dying = state.mode === 'dying';
    // Stretch while rising, squash while falling fast.
    const stretch = dying ? 0 : Math.max(-0.12, Math.min(0.12, -p.vy / 4000));
    const w = p.w * (1 - stretch);
    const h = p.h * (1 + stretch);
    const x = p.x + (p.w - w) / 2;
    const y = p.y + p.h - h;

    ctx.save();
    if (dying) {
      ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
      ctx.rotate((DEATH_TIME - state.deathTimer) * 8);
      ctx.translate(-(p.x + p.w / 2), -(p.y + p.h / 2));
    }
    ctx.fillStyle = COLORS.playerDark;
    roundRect(x, y + 3, w, h - 3, 6);
    ctx.fillStyle = COLORS.player;
    roundRect(x, y, w, h - 6, 6);
    drawEyes(x + w / 2 + p.facing * 3, y + 10, p.facing, 4);
    ctx.restore();
  }

  function drawEyes(cx, cy, dir, size) {
    for (const side of [-1, 1]) {
      const ex = cx + side * size * 1.1;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex, cy, size * 0.75, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#14171f';
      ctx.beginPath();
      ctx.arc(ex + dir * size * 0.3, cy, size * 0.38, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  function drawParticles() {
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------------------
  // HUD and overlay
  // ---------------------------------------------------------------------------

  const ui = {
    level: document.getElementById('level'),
    coins: document.getElementById('coins'),
    lives: document.getElementById('lives'),
    time: document.getElementById('time'),
    pause: document.getElementById('pause'),
    restart: document.getElementById('restart'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlayTitle'),
    overlayText: document.getElementById('overlayText'),
    overlayButton: document.getElementById('overlayButton'),
  };

  const hudCache = {};
  function setText(key, value) {
    if (hudCache[key] === value) return;
    hudCache[key] = value;
    ui[key].textContent = value;
  }

  function updateHud() {
    setText('level', `${state.levelIndex + 1} / ${LEVELS.length}`);
    setText('coins', String(state.bankedCoins + state.levelCoins));
    setText('lives', String(state.lives));
    setText('time', formatTime(state.time));
    setText('pause', state.paused ? 'Resume' : 'Pause');
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function showOverlay(title, text, button) {
    ui.overlayTitle.textContent = title;
    ui.overlayText.textContent = text;
    ui.overlayButton.textContent = button;
    ui.overlay.classList.remove('hidden');
    ui.overlayButton.focus({ preventScroll: true });
  }

  function hideOverlay() {
    ui.overlay.classList.add('hidden');
  }

  // Handles the overlay button and Enter: start, next level or play again.
  function advance() {
    if (state.mode === 'clear') {
      startLevel(state.levelIndex + 1);
    } else if (state.mode === 'title' || state.mode === 'over' || state.mode === 'won') {
      state = newState();
      startLevel(0);
    }
  }

  function togglePause() {
    if (state.mode !== 'play' && state.mode !== 'dying') return;
    state.paused = !state.paused;
  }

  function restartLevel() {
    if (state.mode !== 'play' && state.mode !== 'dying') return;
    state.paused = false;
    startLevel(state.levelIndex);
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  const input = { left: false, right: false, jump: false, jumpPressed: false };

  const KEYS = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', KeyZ: 'jump',
  };

  function press(action) {
    if (action === 'jump' && !input.jump) input.jumpPressed = true;
    input[action] = true;
  }

  function release(action) {
    input[action] = false;
  }

  window.addEventListener('keydown', (ev) => {
    const action = KEYS[ev.code];
    if (action) {
      ev.preventDefault();
      if (state.mode === 'play' && !state.paused) press(action);
      return;
    }
    if (ev.code === 'KeyP' || ev.code === 'Escape') togglePause();
    else if (ev.code === 'KeyR') restartLevel();
    else if (ev.code === 'Enter' && document.activeElement !== ui.overlayButton) advance();
  });

  window.addEventListener('keyup', (ev) => {
    const action = KEYS[ev.code];
    if (action) release(action);
  });

  window.addEventListener('blur', () => {
    input.left = input.right = input.jump = input.jumpPressed = false;
  });

  for (const button of document.querySelectorAll('[data-action]')) {
    const action = button.dataset.action;
    button.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      button.setPointerCapture(ev.pointerId);
      button.classList.add('down');
      if (state.mode === 'play' && !state.paused) press(action);
    });
    const up = () => {
      button.classList.remove('down');
      release(action);
    };
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('lostpointercapture', up);
    button.addEventListener('contextmenu', (ev) => ev.preventDefault());
  }

  window.addEventListener('pointerdown', (ev) => {
    document.body.classList.toggle('touch', ev.pointerType === 'touch' || ev.pointerType === 'pen');
  });

  ui.overlayButton.addEventListener('click', advance);
  ui.pause.addEventListener('click', () => { togglePause(); ui.pause.blur(); });
  ui.restart.addEventListener('click', () => { restartLevel(); ui.restart.blur(); });

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------

  state = newState();
  state.level = loadLevel(0);
  state.camX = 0;
  showOverlay('Platformer',
    'Run and jump to the flag at the end of each level. Stomp enemies from above, and watch out for spikes and pits.',
    'Play');

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!state.paused) {
      acc += dt;
      while (acc >= STEP) {
        update(STEP);
        acc -= STEP;
      }
    }
    render();
    updateHud();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
