(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  const TILE = 40;
  const COLS = 20;
  const ROWS = 12;
  const WIDTH = COLS * TILE;
  const HEIGHT = ROWS * TILE;

  const START_GOLD = 150;
  const START_LIVES = 20;
  const TOTAL_WAVES = 15;
  const SELL_REFUND = 0.7;
  const MAX_UPGRADE = 3;

  // Path waypoints in tile coordinates. The first and last points sit just
  // off-screen so creeps walk in and out of view.
  const PATH_TILES = [
    [-1, 2], [4, 2], [4, 8], [9, 8], [9, 3], [14, 3],
    [14, 9], [17, 9], [17, 5], [20, 5],
  ];

  const TOWER_TYPES = {
    arrow: {
      name: 'Arrow', key: '1', cost: 50, range: 110, damage: 12, rate: 2.0,
      color: '#6fbf5a', projectile: { speed: 480, color: '#e9f5d0', size: 3 },
      desc: 'Cheap, fast single-target.',
    },
    cannon: {
      name: 'Cannon', key: '2', cost: 100, range: 90, damage: 32, rate: 0.8, splash: 55,
      color: '#c9783d', projectile: { speed: 300, color: '#2b2b2b', size: 5 },
      desc: 'Slow, splash damage.',
    },
    frost: {
      name: 'Frost', key: '3', cost: 80, range: 95, damage: 6, rate: 1.2, slow: 0.5, slowTime: 1.6,
      color: '#5cb8e6', projectile: { speed: 380, color: '#c8f0ff', size: 4 },
      desc: 'Slows creeps by 50%.',
    },
    sniper: {
      name: 'Sniper', key: '4', cost: 150, range: 230, damage: 85, rate: 0.45,
      color: '#a77de0', projectile: { speed: 900, color: '#f1e3ff', size: 2 },
      desc: 'Huge range and damage, slow.',
    },
  };

  const ENEMY_TYPES = {
    grunt:  { hp: 40,  speed: 60,  reward: 5,  radius: 10, color: '#d9d36a', lives: 1 },
    runner: { hp: 26,  speed: 115, reward: 6,  radius: 8,  color: '#7de3c4', lives: 1 },
    tank:   { hp: 160, speed: 40,  reward: 14, radius: 14, color: '#b05656', lives: 2 },
    boss:   { hp: 950, speed: 34,  reward: 90, radius: 19, color: '#7a3bb8', lives: 5 },
  };

  // Upgrade multipliers per level.
  const DAMAGE_STEP = 0.45; // +45% damage per level
  const RATE_STEP = 0.3;    // +30% fire rate per level

  // ---------------------------------------------------------------------------
  // Path geometry
  // ---------------------------------------------------------------------------

  const tileCenter = ([c, r]) => ({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 });
  const WAYPOINTS = PATH_TILES.map(tileCenter);

  const pathTiles = new Set();
  for (let i = 0; i < PATH_TILES.length - 1; i++) {
    const [c1, r1] = PATH_TILES[i];
    const [c2, r2] = PATH_TILES[i + 1];
    const dc = Math.sign(c2 - c1);
    const dr = Math.sign(r2 - r1);
    let c = c1, r = r1;
    for (;;) {
      if (c >= 0 && c < COLS && r >= 0 && r < ROWS) pathTiles.add(`${c},${r}`);
      if (c === c2 && r === r2) break;
      c += dc; r += dr;
    }
  }

  // ---------------------------------------------------------------------------
  // Waves
  // ---------------------------------------------------------------------------

  function buildWave(n) {
    const groups = [];
    groups.push({ type: 'grunt', count: 6 + n * 2, gap: Math.max(0.35, 0.9 - n * 0.03) });
    if (n >= 3) groups.push({ type: 'runner', count: 2 + n, gap: 0.45 });
    if (n >= 5) groups.push({ type: 'tank', count: Math.floor(n / 2), gap: 1.3 });
    if (n % 5 === 0) groups.push({ type: 'boss', count: n / 5, gap: 3 });

    const hpMult = Math.pow(1.17, n - 1);
    const queue = [];
    let t = 0;
    for (const g of groups) {
      for (let i = 0; i < g.count; i++) {
        queue.push({ type: g.type, at: t, hpMult });
        t += g.gap;
      }
      t += 1.5; // breather between groups
    }
    return queue;
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  let state;

  function newState() {
    return {
      gold: START_GOLD,
      lives: START_LIVES,
      wave: 0,
      waveActive: false,
      spawnQueue: [],
      waveTime: 0,
      towers: [],
      enemies: [],
      projectiles: [],
      effects: [],
      selectedType: null,
      selectedTower: null,
      hover: null,
      speed: 1,
      paused: false,
      over: false,
      kills: 0,
      nextId: 1,
    };
  }

  // ---------------------------------------------------------------------------
  // Towers
  // ---------------------------------------------------------------------------

  const towerDamage = (t) => TOWER_TYPES[t.type].damage * (1 + DAMAGE_STEP * t.dmgLvl);
  const towerRate = (t) => TOWER_TYPES[t.type].rate * (1 + RATE_STEP * t.rateLvl);
  const towerRange = (t) => TOWER_TYPES[t.type].range;
  const upgradeCost = (t, lvl) => Math.round(TOWER_TYPES[t.type].cost * 0.6 * (lvl + 1));
  const sellValue = (t) => Math.floor(t.spent * SELL_REFUND);

  function canBuild(c, r) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false;
    if (pathTiles.has(`${c},${r}`)) return false;
    return !state.towers.some((t) => t.c === c && t.r === r);
  }

  function placeTower(type, c, r) {
    const def = TOWER_TYPES[type];
    if (!canBuild(c, r) || state.gold < def.cost) return null;
    state.gold -= def.cost;
    const { x, y } = tileCenter([c, r]);
    const tower = {
      id: state.nextId++, type, c, r, x, y,
      dmgLvl: 0, rateLvl: 0, cooldown: 0, angle: -Math.PI / 2, spent: def.cost,
    };
    state.towers.push(tower);
    return tower;
  }

  function upgrade(tower, stat) {
    const key = stat === 'damage' ? 'dmgLvl' : 'rateLvl';
    if (tower[key] >= MAX_UPGRADE) return false;
    const cost = upgradeCost(tower, tower[key]);
    if (state.gold < cost) return false;
    state.gold -= cost;
    tower.spent += cost;
    tower[key]++;
    return true;
  }

  function sell(tower) {
    state.gold += sellValue(tower);
    state.towers = state.towers.filter((t) => t !== tower);
    if (state.selectedTower === tower) state.selectedTower = null;
  }

  // ---------------------------------------------------------------------------
  // Enemies
  // ---------------------------------------------------------------------------

  function spawnEnemy(type, hpMult) {
    const def = ENEMY_TYPES[type];
    const hp = Math.round(def.hp * hpMult);
    state.enemies.push({
      id: state.nextId++, type,
      x: WAYPOINTS[0].x, y: WAYPOINTS[0].y,
      wp: 1, progress: 0,
      hp, maxHp: hp,
      speed: def.speed, radius: def.radius,
      reward: def.reward + Math.floor((state.wave - 1) / 3),
      slowFactor: 1, slowTimer: 0,
      dead: false,
    });
  }

  function damageEnemy(e, amount) {
    if (e.dead) return;
    e.hp -= amount;
    if (e.hp <= 0) {
      e.dead = true;
      state.gold += e.reward;
      state.kills++;
      state.effects.push({ kind: 'text', x: e.x, y: e.y - 10, text: `+${e.reward}`, color: '#f5b942', life: 0.9, max: 0.9 });
      state.effects.push({ kind: 'burst', x: e.x, y: e.y, r: e.radius, color: ENEMY_TYPES[e.type].color, life: 0.3, max: 0.3 });
    }
  }

  function updateEnemies(dt) {
    for (const e of state.enemies) {
      if (e.dead) continue;
      if (e.slowTimer > 0) {
        e.slowTimer -= dt;
        if (e.slowTimer <= 0) e.slowFactor = 1;
      }
      let move = e.speed * e.slowFactor * dt;
      while (move > 0 && e.wp < WAYPOINTS.length) {
        const target = WAYPOINTS[e.wp];
        const dx = target.x - e.x;
        const dy = target.y - e.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= move) {
          e.x = target.x; e.y = target.y;
          e.progress += dist;
          move -= dist;
          e.wp++;
        } else {
          e.x += (dx / dist) * move;
          e.y += (dy / dist) * move;
          e.progress += move;
          move = 0;
        }
      }
      if (e.wp >= WAYPOINTS.length) {
        e.dead = true;
        e.leaked = true;
        state.lives = Math.max(0, state.lives - ENEMY_TYPES[e.type].lives);
      }
    }
    state.enemies = state.enemies.filter((e) => !e.dead);
  }

  // ---------------------------------------------------------------------------
  // Combat
  // ---------------------------------------------------------------------------

  function findTarget(tower) {
    const range = towerRange(tower);
    let best = null;
    for (const e of state.enemies) {
      if (e.dead) continue;
      if (Math.hypot(e.x - tower.x, e.y - tower.y) > range + e.radius) continue;
      // Target the creep furthest along the path.
      if (!best || e.progress > best.progress) best = e;
    }
    return best;
  }

  function updateTowers(dt) {
    for (const t of state.towers) {
      t.cooldown = Math.max(0, t.cooldown - dt);
      const target = findTarget(t);
      if (!target) continue;
      t.angle = Math.atan2(target.y - t.y, target.x - t.x);
      if (t.cooldown > 0) continue;
      t.cooldown = 1 / towerRate(t);
      const def = TOWER_TYPES[t.type];
      state.projectiles.push({
        x: t.x + Math.cos(t.angle) * 16,
        y: t.y + Math.sin(t.angle) * 16,
        tx: target.x, ty: target.y,
        target, type: t.type,
        damage: towerDamage(t),
        speed: def.projectile.speed,
      });
    }
  }

  function impact(p) {
    const def = TOWER_TYPES[p.type];
    if (def.splash) {
      for (const e of state.enemies) {
        if (Math.hypot(e.x - p.tx, e.y - p.ty) <= def.splash + e.radius) damageEnemy(e, p.damage);
      }
      state.effects.push({ kind: 'ring', x: p.tx, y: p.ty, r: def.splash, color: 'rgba(255,170,80,', life: 0.3, max: 0.3 });
      return;
    }
    if (p.target.dead) return;
    if (def.slow) {
      p.target.slowFactor = Math.min(p.target.slowFactor, def.slow);
      p.target.slowTimer = def.slowTime;
    }
    damageEnemy(p.target, p.damage);
  }

  function updateProjectiles(dt) {
    const alive = [];
    for (const p of state.projectiles) {
      // Home in on the target while it lives; otherwise fly to its last spot.
      if (!p.target.dead) { p.tx = p.target.x; p.ty = p.target.y; }
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * dt;
      if (dist <= step) {
        p.x = p.tx; p.y = p.ty;
        impact(p);
      } else {
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
        alive.push(p);
      }
    }
    state.projectiles = alive;
  }

  function updateEffects(dt) {
    for (const fx of state.effects) {
      fx.life -= dt;
      if (fx.kind === 'text') fx.y -= 28 * dt;
    }
    state.effects = state.effects.filter((fx) => fx.life > 0);
  }

  // ---------------------------------------------------------------------------
  // Wave flow
  // ---------------------------------------------------------------------------

  function startWave() {
    if (state.waveActive || state.over || state.wave >= TOTAL_WAVES) return;
    state.wave++;
    state.waveActive = true;
    state.waveTime = 0;
    state.spawnQueue = buildWave(state.wave);
  }

  function updateWave(dt) {
    if (!state.waveActive) return;
    state.waveTime += dt;
    while (state.spawnQueue.length && state.spawnQueue[0].at <= state.waveTime) {
      const s = state.spawnQueue.shift();
      spawnEnemy(s.type, s.hpMult);
    }
    if (!state.spawnQueue.length && !state.enemies.length && state.lives > 0) {
      state.waveActive = false;
      const bonus = 20 + state.wave * 5;
      state.gold += bonus;
      state.effects.push({ kind: 'banner', text: `Wave ${state.wave} cleared! +${bonus} gold`, life: 2.2, max: 2.2 });
      if (state.wave >= TOTAL_WAVES) endGame(true);
    }
  }

  function endGame(won) {
    state.over = true;
    state.waveActive = false;
    state.selectedType = null;
    const title = ui.overlayTitle;
    title.textContent = won ? 'Victory!' : 'Game Over';
    title.className = won ? 'win' : 'lose';
    ui.overlayText.textContent = won
      ? `You held the line through all ${TOTAL_WAVES} waves with ${state.lives} lives left and ${state.kills} kills.`
      : `The creeps broke through on wave ${state.wave} of ${TOTAL_WAVES}. You scored ${state.kills} kills.`;
    ui.overlay.classList.remove('hidden');
    renderUI();
  }

  function step(dt) {
    if (state.over) return;
    updateWave(dt);
    updateTowers(dt);
    updateProjectiles(dt);
    updateEnemies(dt);
    updateEffects(dt);
    if (state.lives <= 0) endGame(false);
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  function drawMap() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const onPath = pathTiles.has(`${c},${r}`);
        ctx.fillStyle = onPath
          ? ((c + r) % 2 ? '#b89a6a' : '#b39564')
          : ((c + r) % 2 ? '#3f6b3a' : '#3b6537');
        ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
      }
    }
    // Entry/exit markers.
    const entry = tileCenter(PATH_TILES[1]);
    const exit = tileCenter(PATH_TILES[PATH_TILES.length - 2]);
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.fillRect(0, entry.y - TILE / 2, 6, TILE);
    ctx.fillStyle = 'rgba(229,83,75,.6)';
    ctx.fillRect(WIDTH - 6, exit.y - TILE / 2, 6, TILE);
  }

  function drawRange(x, y, range, ok) {
    ctx.beginPath();
    ctx.arc(x, y, range, 0, Math.PI * 2);
    ctx.fillStyle = ok ? 'rgba(255,255,255,.08)' : 'rgba(229,83,75,.12)';
    ctx.fill();
    ctx.strokeStyle = ok ? 'rgba(255,255,255,.45)' : 'rgba(229,83,75,.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawTowerShape(type, x, y, angle, alpha = 1) {
    const def = TOWER_TYPES[type];
    ctx.save();
    ctx.globalAlpha = alpha;
    // Base
    ctx.fillStyle = '#2a2f3d';
    ctx.fillRect(x - 15, y - 15, 30, 30);
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fillStyle = def.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,.4)';
    ctx.stroke();
    // Barrel
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = '#1b1e27';
    const len = type === 'sniper' ? 20 : type === 'cannon' ? 15 : 16;
    const w = type === 'cannon' ? 8 : type === 'sniper' ? 3 : 4;
    ctx.fillRect(0, -w / 2, len, w);
    ctx.restore();
  }

  function drawTowers() {
    for (const t of state.towers) {
      drawTowerShape(t.type, t.x, t.y, t.angle);
      // Upgrade pips: damage (red) on the left, rate (yellow) on the right.
      for (let i = 0; i < t.dmgLvl; i++) {
        ctx.fillStyle = '#ff7b6b';
        ctx.fillRect(t.x - 14, t.y + 10 - i * 5, 4, 3);
      }
      for (let i = 0; i < t.rateLvl; i++) {
        ctx.fillStyle = '#f5d742';
        ctx.fillRect(t.x + 10, t.y + 10 - i * 5, 4, 3);
      }
      if (t === state.selectedTower) {
        ctx.strokeStyle = '#f5b942';
        ctx.lineWidth = 2;
        ctx.strokeRect(t.x - 17, t.y - 17, 34, 34);
      }
    }
  }

  function drawEnemies() {
    for (const e of state.enemies) {
      const def = ENEMY_TYPES[e.type];
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.fillStyle = def.color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = e.slowTimer > 0 ? '#9fe3ff' : 'rgba(0,0,0,.45)';
      ctx.stroke();
      if (e.slowTimer > 0) {
        ctx.fillStyle = 'rgba(140,210,255,.35)';
        ctx.fill();
      }
      // Health bar
      const w = Math.max(20, e.radius * 2);
      const pct = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillRect(e.x - w / 2, e.y - e.radius - 8, w, 4);
      ctx.fillStyle = pct > 0.5 ? '#57c084' : pct > 0.25 ? '#f5b942' : '#e5534b';
      ctx.fillRect(e.x - w / 2, e.y - e.radius - 8, w * pct, 4);
    }
  }

  function drawProjectiles() {
    for (const p of state.projectiles) {
      const def = TOWER_TYPES[p.type].projectile;
      ctx.beginPath();
      ctx.arc(p.x, p.y, def.size, 0, Math.PI * 2);
      ctx.fillStyle = def.color;
      ctx.fill();
    }
  }

  function drawEffects() {
    for (const fx of state.effects) {
      const a = Math.max(0, fx.life / fx.max);
      if (fx.kind === 'text') {
        ctx.globalAlpha = a;
        ctx.fillStyle = fx.color;
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(fx.text, fx.x, fx.y);
        ctx.globalAlpha = 1;
      } else if (fx.kind === 'ring') {
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, fx.r * (1.1 - a * 0.5), 0, Math.PI * 2);
        ctx.strokeStyle = `${fx.color}${a})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      } else if (fx.kind === 'burst') {
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, fx.r * (1.6 - a * 0.6), 0, Math.PI * 2);
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (fx.kind === 'banner') {
        ctx.globalAlpha = Math.min(1, a * 2);
        ctx.fillStyle = 'rgba(15,18,26,.8)';
        ctx.fillRect(WIDTH / 2 - 170, 14, 340, 34);
        ctx.fillStyle = '#f5b942';
        ctx.font = 'bold 16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(fx.text, WIDTH / 2, 37);
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawPlacementPreview() {
    if (!state.hover || state.over) return;
    const { c, r } = state.hover;
    if (state.selectedType) {
      const def = TOWER_TYPES[state.selectedType];
      const ok = canBuild(c, r) && state.gold >= def.cost;
      const { x, y } = tileCenter([c, r]);
      drawRange(x, y, def.range, ok);
      drawTowerShape(state.selectedType, x, y, -Math.PI / 2, 0.6);
      if (!ok) {
        ctx.strokeStyle = '#e5534b';
        ctx.lineWidth = 2;
        ctx.strokeRect(c * TILE + 2, r * TILE + 2, TILE - 4, TILE - 4);
      }
    } else if (!pathTiles.has(`${c},${r}`)) {
      ctx.strokeStyle = 'rgba(255,255,255,.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(c * TILE + 0.5, r * TILE + 0.5, TILE - 1, TILE - 1);
    }
  }

  function drawPaused() {
    if (!state.paused || state.over) return;
    ctx.fillStyle = 'rgba(10,12,18,.5)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#e8ebf2';
    ctx.font = 'bold 32px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Paused', WIDTH / 2, HEIGHT / 2);
  }

  function render() {
    drawMap();
    if (state.selectedTower) drawRange(state.selectedTower.x, state.selectedTower.y, towerRange(state.selectedTower), true);
    drawTowers();
    drawEnemies();
    drawProjectiles();
    drawEffects();
    drawPlacementPreview();
    drawPaused();
  }

  // ---------------------------------------------------------------------------
  // DOM UI
  // ---------------------------------------------------------------------------

  const ui = {
    lives: document.getElementById('lives'),
    gold: document.getElementById('gold'),
    wave: document.getElementById('wave'),
    startWave: document.getElementById('startWave'),
    speed: document.getElementById('speed'),
    pause: document.getElementById('pause'),
    shop: document.getElementById('shop'),
    details: document.getElementById('details'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlayTitle'),
    overlayText: document.getElementById('overlayText'),
    restart: document.getElementById('restart'),
  };

  const shopButtons = {};
  for (const [type, def] of Object.entries(TOWER_TYPES)) {
    const btn = document.createElement('button');
    btn.className = 'shop-item';
    btn.innerHTML = `
      <span class="swatch" style="background:${def.color}"></span>
      <span><span class="name">${def.name}</span> <kbd>${def.key}</kbd><br>
        <span class="meta">${def.desc}<br>Range ${def.range} · Dmg ${def.damage} · ${def.rate}/s</span></span>
      <span class="cost">${def.cost}g</span>`;
    btn.addEventListener('click', () => selectType(type));
    ui.shop.appendChild(btn);
    shopButtons[type] = btn;
  }

  function selectType(type) {
    if (state.over) return;
    state.selectedType = state.selectedType === type ? null : type;
    state.selectedTower = null;
    renderUI();
  }

  const pips = (lvl) =>
    `<span class="pips">${Array.from({ length: MAX_UPGRADE }, (_, i) => `<span class="pip${i < lvl ? ' on' : ''}"></span>`).join('')}</span>`;

  let lastUIKey = '';

  function renderUI() {
    ui.lives.textContent = state.lives;
    ui.gold.textContent = state.gold;
    ui.wave.textContent = `${state.wave} / ${TOTAL_WAVES}`;

    const btn = ui.startWave;
    if (state.waveActive) {
      btn.textContent = `Wave ${state.wave} in progress`;
      btn.disabled = true;
    } else if (state.wave >= TOTAL_WAVES || state.over) {
      btn.textContent = 'No more waves';
      btn.disabled = true;
    } else {
      btn.textContent = `Start Wave ${state.wave + 1}`;
      btn.disabled = false;
    }
    ui.speed.textContent = `${state.speed}x`;
    ui.pause.textContent = state.paused ? 'Resume' : 'Pause';

    for (const [type, b] of Object.entries(shopButtons)) {
      b.classList.toggle('active', state.selectedType === type);
      b.disabled = state.over || state.gold < TOWER_TYPES[type].cost;
    }

    // Only rebuild the details panel when something it shows changes, so
    // buttons don't get replaced under the cursor every frame.
    const t = state.selectedTower;
    const key = t ? `${t.id}|${t.dmgLvl}|${t.rateLvl}|${state.gold}|${state.over}` : `none|${state.selectedType}`;
    if (key === lastUIKey) return;
    lastUIKey = key;

    if (!t) {
      ui.details.innerHTML = state.selectedType
        ? `<p class="muted">Placing <strong>${TOWER_TYPES[state.selectedType].name}</strong>.
            <span class="mouse-only">Click a grass tile, or press Esc to cancel.</span>
            <span class="touch-only">Tap a grass tile to preview its range, then tap the same tile again to build.</span></p>
           <div class="actions"><button data-act="cancel">Cancel</button></div>`
        : '<p class="muted">No tower selected. Tap a tower on the map to upgrade or sell it.</p>';
      return;
    }

    const def = TOWER_TYPES[t.type];
    const dmgMax = t.dmgLvl >= MAX_UPGRADE;
    const rateMax = t.rateLvl >= MAX_UPGRADE;
    const dmgCost = dmgMax ? 0 : upgradeCost(t, t.dmgLvl);
    const rateCost = rateMax ? 0 : upgradeCost(t, t.rateLvl);
    const nextDmg = def.damage * (1 + DAMAGE_STEP * (t.dmgLvl + 1));
    const nextRate = def.rate * (1 + RATE_STEP * (t.rateLvl + 1));

    ui.details.innerHTML = `
      <div class="title"><span class="swatch" style="display:inline-block;width:16px;height:16px;border-radius:50%;background:${def.color}"></span>${def.name} Tower</div>
      <table>
        <tr><td>Damage ${pips(t.dmgLvl)}</td><td>${towerDamage(t).toFixed(0)}${dmgMax ? '' : ` <span class="up">→ ${nextDmg.toFixed(0)}</span>`}</td></tr>
        <tr><td>Fire rate ${pips(t.rateLvl)}</td><td>${towerRate(t).toFixed(2)}/s${rateMax ? '' : ` <span class="up">→ ${nextRate.toFixed(2)}</span>`}</td></tr>
        <tr><td>Range</td><td>${def.range}</td></tr>
        ${def.splash ? `<tr><td>Splash radius</td><td>${def.splash}</td></tr>` : ''}
        ${def.slow ? `<tr><td>Slow</td><td>${Math.round((1 - def.slow) * 100)}% for ${def.slowTime}s</td></tr>` : ''}
        <tr><td>DPS</td><td>${(towerDamage(t) * towerRate(t)).toFixed(1)}</td></tr>
      </table>
      <div class="actions">
        <button data-act="damage" ${dmgMax || state.gold < dmgCost || state.over ? 'disabled' : ''}>
          <span>Upgrade damage</span><span>${dmgMax ? 'MAX' : dmgCost + 'g'}</span></button>
        <button data-act="rate" ${rateMax || state.gold < rateCost || state.over ? 'disabled' : ''}>
          <span>Upgrade fire rate</span><span>${rateMax ? 'MAX' : rateCost + 'g'}</span></button>
        <button data-act="sell" class="danger" ${state.over ? 'disabled' : ''}>
          <span>Sell</span><span>+${sellValue(t)}g</span></button>
      </div>`;
  }

  ui.details.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-act]');
    if (!btn || state.over) return;
    const act = btn.dataset.act;
    if (act === 'cancel') {
      state.selectedType = null;
      state.hover = null;
      renderUI();
      return;
    }
    const t = state.selectedTower;
    if (!t) return;
    if (act === 'sell') sell(t);
    else upgrade(t, act);
    renderUI();
  });

  ui.startWave.addEventListener('click', () => { startWave(); renderUI(); });
  ui.speed.addEventListener('click', () => { state.speed = state.speed === 1 ? 2 : state.speed === 2 ? 3 : 1; renderUI(); });
  ui.pause.addEventListener('click', togglePause);
  ui.restart.addEventListener('click', restart);

  function togglePause() {
    if (state.over) return;
    state.paused = !state.paused;
    renderUI();
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  function eventToTile(ev) {
    const rect = canvas.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * WIDTH;
    const y = ((ev.clientY - rect.top) / rect.height) * HEIGHT;
    return { c: Math.floor(x / TILE), r: Math.floor(y / TILE) };
  }

  // Touch screens have no hover, so a tap previews a tile (range + validity)
  // and a second tap on the same tile builds there.
  let lastPointer = 'mouse';
  canvas.addEventListener('pointerdown', (ev) => { lastPointer = ev.pointerType || 'mouse'; });
  window.addEventListener('pointerdown', (ev) => {
    document.body.classList.toggle('touch', ev.pointerType === 'touch' || ev.pointerType === 'pen');
  }, true);
  canvas.addEventListener('pointermove', (ev) => {
    if (ev.pointerType === 'mouse') state.hover = eventToTile(ev);
  });
  canvas.addEventListener('pointerleave', (ev) => {
    if (ev.pointerType === 'mouse') state.hover = null;
  });

  canvas.addEventListener('click', (ev) => {
    if (state.over) return;
    const touch = lastPointer !== 'mouse';
    const tile = eventToTile(ev);
    const { c, r } = tile;
    const existing = state.towers.find((t) => t.c === c && t.r === r);
    if (existing) {
      state.selectedTower = existing;
      state.selectedType = null;
      if (touch) state.hover = null;
    } else if (state.selectedType) {
      const previewed = state.hover && state.hover.c === c && state.hover.r === r;
      if (touch && !previewed) {
        state.hover = tile;
      } else {
        const placed = placeTower(state.selectedType, c, r);
        if (placed && touch) state.hover = null;
        // Keep the type selected while the player can afford another one.
        if (placed && state.gold < TOWER_TYPES[state.selectedType].cost) state.selectedType = null;
      }
    } else {
      state.selectedTower = null;
      if (touch) state.hover = null;
    }
    renderUI();
  });

  canvas.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    // A long press on touch screens also fires this; only right-click cancels.
    if (lastPointer !== 'mouse') return;
    state.selectedType = null;
    state.selectedTower = null;
    renderUI();
  });

  window.addEventListener('keydown', (ev) => {
    if (ev.target instanceof HTMLInputElement) return;
    const type = Object.keys(TOWER_TYPES).find((k) => TOWER_TYPES[k].key === ev.key);
    if (type) { selectType(type); return; }
    if (ev.key === 'Escape') {
      state.selectedType = null;
      state.selectedTower = null;
      renderUI();
    } else if (ev.key === ' ') {
      ev.preventDefault();
      startWave();
      renderUI();
    } else if (ev.key === 'p' || ev.key === 'P') {
      togglePause();
    }
  });

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------

  function restart() {
    state = newState();
    lastUIKey = '';
    ui.overlay.classList.add('hidden');
    renderUI();
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!state.paused) {
      // Sub-step at higher speeds so fast creeps and projectiles stay accurate.
      for (let i = 0; i < state.speed; i++) step(dt);
    }
    render();
    renderUI();
    requestAnimationFrame(frame);
  }

  restart();
  requestAnimationFrame(frame);

  // Exposed for debugging and automated testing.
  window.TD = {
    get state() { return state; },
    placeTower, upgrade, sell, startWave, step, restart, buildWave,
    TOWER_TYPES, ENEMY_TYPES, TOTAL_WAVES,
  };
})();
