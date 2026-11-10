/* Holiday Launch Countdown
 * Counts weekday time only (Mon-Fri) until 12 December, local time.
 * URL helpers for trying things out:
 *   ?demo=12                  jump to 12 seconds before launch
 *   ?now=2026-11-14T10:00     pretend it is that local date and time
 */
(function () {
  'use strict';

  var HOLIDAY_MONTH = 11; // December (0-based)
  var HOLIDAY_DAY = 12;
  var DAY = 86400000;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  var $ = function (id) { return document.getElementById(id); };
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------ */
  /* Time                                                               */
  /* ------------------------------------------------------------------ */

  var params = new URLSearchParams(location.search);
  var clockOffset = 0;

  function holidayFor(date) {
    return new Date(date.getFullYear(), HOLIDAY_MONTH, HOLIDAY_DAY);
  }

  (function applyOverrides() {
    var fake = params.get('now');
    if (fake) {
      var t = new Date(fake).getTime();
      if (!isNaN(t)) clockOffset = t - Date.now();
    }
    var demo = parseFloat(params.get('demo'));
    if (!isNaN(demo)) {
      var base = new Date(Date.now() + clockOffset);
      var target = holidayFor(base);
      if (base >= target) target = new Date(base.getFullYear() + 1, HOLIDAY_MONTH, HOLIDAY_DAY);
      clockOffset = target.getTime() - demo * 1000 - Date.now();
    }
  })();

  function now() { return new Date(Date.now() + clockOffset); }
  function isWeekday(d) { var n = d.getDay(); return n !== 0 && n !== 6; }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* Milliseconds between two moments, skipping Saturdays and Sundays. */
  function weekdayMs(from, to) {
    var total = 0;
    var d = startOfDay(from);
    while (d < to) {
      var next = addDays(d, 1);
      if (isWeekday(d)) total += Math.min(next, to) - Math.max(d, from);
      d = next;
    }
    return Math.max(0, total);
  }

  /* Whole calendar days in [from, to), split into weekdays and weekend days. */
  function countDays(from, to) {
    var wd = 0, we = 0;
    for (var d = startOfDay(from); d < to; d = addDays(d, 1)) {
      if (isWeekday(d)) wd++; else we++;
    }
    return { weekdays: wd, weekend: we };
  }

  /* ------------------------------------------------------------------ */
  /* Readout                                                            */
  /* ------------------------------------------------------------------ */

  var el = {
    status: $('status'), statusText: $('statusText'),
    heroNum: $('heroNum'), heroLbl: $('heroLbl'),
    hh: $('hh'), mm: $('mm'), ss: $('ss'),
    readout: $('readout'), summary: $('summary'),
    plan: $('plan'), planWrap: $('planWrap'),
    liftoff: $('liftoff'), liftoffSub: $('liftoffSub'),
    launch: $('launch'), launchText: $('launchText'), sound: $('sound')
  };

  /* Write a string one character per span, rolling only the ones that changed. */
  function setDigits(node, str) {
    if (node._str === str) return;
    var first = node._str === undefined;
    node._str = str;
    while (node.children.length > str.length) node.removeChild(node.lastChild);
    while (node.children.length < str.length) {
      var s = document.createElement('span');
      s.className = 'd';
      node.appendChild(s);
    }
    if (first) node.firstChild && node.childNodes.forEach(function (n) { if (n.nodeType === 3) node.removeChild(n); });
    for (var i = 0; i < str.length; i++) {
      var span = node.children[i];
      if (span.textContent !== str[i]) {
        span.textContent = str[i];
        if (!first && !reduceMotion) {
          span.classList.remove('roll');
          void span.offsetWidth;
          span.classList.add('roll');
        }
      }
    }
  }

  var statusOverride = null;
  function setStatus(state, text) {
    if (el.status.dataset.state !== state) el.status.dataset.state = state;
    if (el.statusText.textContent !== text) el.statusText.textContent = text;
  }

  var planKey = '';
  function buildPlan(today, target) {
    var key = today.getTime() + '|' + target.getTime();
    if (key === planKey) return;
    planKey = key;

    var monday = addDays(today, -((today.getDay() + 6) % 7));
    var lastDay = addDays(target, -1);
    var weeks = [];
    for (var w = monday; w <= lastDay; w = addDays(w, 7)) weeks.push(w);

    var compact = weeks.length > 12;
    el.planWrap.classList.toggle('compact', compact);

    var frag = document.createDocumentFragment();
    var lastMonth = -1;
    var left = 0;
    weeks.forEach(function (wk, i) {
      var head = document.createElement('span');
      head.className = 'wk';
      if (compact) {
        if (wk.getMonth() !== lastMonth && i % 1 === 0) head.textContent = MONTHS[wk.getMonth()];
      } else {
        head.textContent = wk.getDate() + (wk.getMonth() !== lastMonth ? ' ' + MONTHS[wk.getMonth()] : '');
      }
      lastMonth = wk.getMonth();
      frag.appendChild(head);
      for (var k = 0; k < 5; k++) {
        var d = addDays(wk, k);
        var c = document.createElement('span');
        var cls = 'todo';
        if (d >= target) cls = 'none';
        else if (d < today) cls = 'done';
        else if (d.getTime() === today.getTime()) cls = 'today';
        if (cls === 'todo' || cls === 'today') left++;
        c.className = 'cell ' + cls;
        c.title = DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
        frag.appendChild(c);
      }
    });
    var end = document.createElement('span');
    end.className = 'wk end';
    end.textContent = compact ? '' : target.getDate() + ' ' + MONTHS[target.getMonth()];
    frag.appendChild(end);
    var goal = document.createElement('span');
    goal.className = 'goal';
    goal.title = 'Holidays begin';
    frag.appendChild(goal);

    el.plan.textContent = '';
    el.plan.appendChild(frag);
    el.plan.setAttribute('aria-label',
      'Flight plan: ' + left + ' weekdays left before ' + target.getDate() + ' ' + MONTHS[target.getMonth()]);
  }

  var lastRemaining = null;
  var lastSecondKey = '';
  var launchedMode = false;

  function updateReadout() {
    var n = now();
    var target = holidayFor(n);
    var launched = n >= target; // from 12 Dec until the year rolls over
    var remaining = launched ? 0 : weekdayMs(n, target);

    if (lastRemaining !== null && lastRemaining > 0 && remaining <= 0) {
      Scene.launch(true);
    }
    lastRemaining = remaining;

    if (launched !== launchedMode) {
      launchedMode = launched;
      document.body.classList.toggle('launched', launched);
      el.liftoff.hidden = !launched;
      el.launchText.textContent = launched ? 'Replay the launch' : 'Run a test launch';
      if (launched) document.body.classList.remove('final', 'hold');
    }
    if (launched) {
      if (!statusOverride) setStatus('go', 'Mission clock stopped');
      return;
    }

    var secs = Math.ceil(remaining / 1000);
    var key = secs + '|' + n.getDate();
    if (key === lastSecondKey) return;
    lastSecondKey = key;

    var days = Math.floor(secs / 86400);
    var h = Math.floor((secs % 86400) / 3600);
    var m = Math.floor((secs % 3600) / 60);
    var s = secs % 60;
    var weekend = !isWeekday(n);
    var final = secs <= 10 && secs > 0;

    document.body.classList.toggle('hold', weekend);
    document.body.classList.toggle('final', final);

    if (final) {
      setDigits(el.heroNum, String(secs));
      el.heroLbl.innerHTML = (secs === 1 ? 'second' : 'seconds') + ' <br>to liftoff';
    } else {
      setDigits(el.heroNum, String(days));
      el.heroLbl.innerHTML = (days === 1 ? 'weekday' : 'weekdays') + ' <br>to launch';
    }
    setDigits(el.hh, pad2(h));
    setDigits(el.mm, pad2(m));
    setDigits(el.ss, pad2(s));
    el.readout.setAttribute('aria-label',
      days + ' weekdays, ' + h + ' hours and ' + m + ' minutes of weekday time until the holidays');

    if (!statusOverride) {
      if (weekend) setStatus('hold', 'Weekend hold · resumes Monday');
      else if (final) setStatus('launch', 'Terminal count');
      else setStatus('counting', 'T-minus · counting');
    }

    var today = startOfDay(n);
    var c = countDays(today, target);
    var launchDay = DAYS_LONG[target.getDay()] + ' ' + target.getDate() + ' ' + MONTHS[target.getMonth()];
    var html;
    if (weekend) {
      html = 'Paused for the weekend. <b>' + c.weekdays + ' weekday' + (c.weekdays === 1 ? '' : 's') +
        '</b> still to fly before launch on <b>' + launchDay + '</b>.';
    } else if (c.weekdays === 1) {
      html = '<b>Last weekday.</b> When today runs out, the holidays lift off on <b>' + launchDay + '</b>.';
    } else {
      html = '<b>Today plus ' + (c.weekdays - 1) + ' more weekday' + (c.weekdays === 2 ? '' : 's') +
        '</b> until launch on <b>' + launchDay + '</b>.';
    }
    if (c.weekend > 0 && !weekend) html += ' <span class="extra">' + c.weekend + ' weekend day' + (c.weekend === 1 ? '' : 's') + ' not counted.</span>';
    if (el.summary._html !== html) { el.summary.innerHTML = html; el.summary._html = html; }

    buildPlan(today, target);
  }

  /* ------------------------------------------------------------------ */
  /* Sound: a filtered-noise rumble, only ever started by the launch     */
  /* ------------------------------------------------------------------ */

  var Sound = (function () {
    var on = true, ac = null, noise = null;
    try { on = localStorage.getItem('holiday-sound') !== 'off'; } catch (e) {}

    function ctxOk() {
      if (ac) return ac;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        ac = new AC();
        var len = ac.sampleRate * 2;
        noise = ac.createBuffer(1, len, ac.sampleRate);
        var data = noise.getChannelData(0), last = 0;
        for (var i = 0; i < len; i++) { // brown-ish noise
          last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04;
          data[i] = last * 4.5;
        }
      } catch (e) { ac = null; }
      return ac;
    }

    return {
      get on() { return on; },
      toggle: function () {
        on = !on;
        try { localStorage.setItem('holiday-sound', on ? 'on' : 'off'); } catch (e) {}
        if (!on && ac) { try { ac.suspend(); } catch (e) {} }
        return on;
      },
      rumble: function (dur) {
        if (!on || !ctxOk()) return;
        try {
          if (ac.state === 'suspended') ac.resume();
          var t = ac.currentTime;
          var src = ac.createBufferSource();
          src.buffer = noise; src.loop = true;
          var lp = ac.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.setValueAtTime(70, t);
          lp.frequency.exponentialRampToValueAtTime(900, t + 2.6);
          lp.frequency.exponentialRampToValueAtTime(160, t + dur);
          var g = ac.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.55, t + 2.2);
          g.gain.setValueAtTime(0.55, t + 3.2);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
          src.connect(lp); lp.connect(g); g.connect(ac.destination);
          src.start(t); src.stop(t + dur + 0.1);
        } catch (e) {}
      }
    };
  })();

  /* ------------------------------------------------------------------ */
  /* Scene                                                              */
  /* ------------------------------------------------------------------ */

  var Scene = (function () {
    var cv = $('scene');
    var ctx = cv.getContext('2d');
    var W = 0, H = 0, DPR = 1;
    var wide = false, groundY = 0, rx = 0, RH = 0, padH = 0;

    var phase = 'idle';      // idle | ignite | ascent | orbit
    var real = false;        // true when the launch is the actual one
    var tL = 0;              // seconds since launch start
    var alt = 0, vel = 0;    // rocket altitude above pad, px and px/s
    var cam = 0;             // how far the camera has risen
    var throttle = 0;
    var arm = 1;             // service arm extension 1..0
    var fade = 0, fadeDir = 0, fadeCb = null;
    var time = 0;
    var stars = [], hillsFar = [], hillsNear = [], lights = [];
    var smoke = [], sparks = [], confetti = [];
    var shootingStar = null, nextShoot = 6;
    var calloutsDone = {};
    var quality = 1, slow = 0, dprCap = 2; // adaptive detail for slower devices

    function rand(a, b) { return a + Math.random() * (b - a); }
    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function ease(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
    function mix(c1, c2, t) {
      return 'rgb(' + Math.round(lerp(c1[0], c2[0], t)) + ',' + Math.round(lerp(c1[1], c2[1], t)) + ',' +
        Math.round(lerp(c1[2], c2[2], t)) + ')';
    }

    /* soft round sprites for smoke */
    function makeSprite(r, g, b) {
      var c = document.createElement('canvas');
      c.width = c.height = 128;
      var x = c.getContext('2d');
      var grad = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      for (var i = 0; i <= 16; i++) { // gaussian falloff, no visible rim
        var t = i / 16;
        var a = Math.exp(-t * t * 4.2) * (1 - t * t) * 0.85;
        grad.addColorStop(t, 'rgba(' + r + ',' + g + ',' + b + ',' + a.toFixed(3) + ')');
      }
      x.fillStyle = grad;
      x.fillRect(0, 0, 128, 128);
      return c;
    }
    var sprSmoke = (function () { // lit top, shaded underside, baked once
      var c = document.createElement('canvas');
      c.width = c.height = 128;
      var x = c.getContext('2d');
      x.globalAlpha = 0.85;
      x.drawImage(makeSprite(118, 104, 138), 0, 8, 128, 120);
      x.globalAlpha = 1;
      x.drawImage(makeSprite(240, 232, 232), 6, 0, 116, 116);
      return c;
    })();
    var sprWarm = makeSprite(255, 176, 96);

    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, dprCap);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
      wide = W >= 900;
      groundY = H - Math.max(54, H * 0.1);
      rx = wide ? W * 0.74 : W * 0.5;
      RH = wide ? clamp(H * 0.5, 200, 430) : clamp(H * 0.24, 130, W < 600 ? 220 : 340);
      padH = RH * 0.07;

      stars = [];
      var count = Math.round(clamp(W * H / 5200, 90, 380));
      for (var i = 0; i < count; i++) {
        var layer = Math.random();
        stars.push({
          x: Math.random() * W, y: Math.random() * H,
          r: 0.4 + layer * layer * 1.3,
          par: 0.04 + layer * 0.22,
          ph: Math.random() * 6.28, sp: rand(0.6, 2.2),
          warm: Math.random() < 0.18
        });
      }
      hillsFar = makeHills(11, H * 0.05, 0.9);
      hillsNear = makeHills(29, H * 0.028, 1.7);
      lights = [];
      for (var k = 0; k < 16; k++) {
        var lx = Math.random() * W;
        if (Math.abs(lx - rx) < RH * 0.6) continue;
        lights.push({ x: lx, y: rand(2, 12), ph: Math.random() * 6, warm: Math.random() < 0.7 });
      }
      if (phase === 'orbit') { alt = H * 6; }
    }

    function makeHills(seed, amp, freq) {
      var pts = [];
      for (var x = 0; x <= W + 24; x += 24) {
        var u = x / 520 * freq;
        pts.push(amp * (0.55 + 0.45 * Math.sin(u * 1.7 + seed) + 0.3 * Math.sin(u * 3.9 + seed * 2.1) + 0.12 * Math.sin(u * 9.1 + seed)));
      }
      return pts;
    }

    function sy(gy) { return groundY - gy + cam; } // world height -> screen y

    /* ---------------- particles ---------------- */

    function emitSmoke(x, gy, vx, vy, r, life, grow, heat) {
      if (smoke.length > 360 * quality) smoke.shift();
      smoke.push({ x: x, y: gy, vx: vx, vy: vy, r: r, life: life, max: life, grow: grow, heat: heat, front: Math.random() < 0.45 });
    }

    function stepParticles(dt) {
      var i, p;
      for (i = smoke.length - 1; i >= 0; i--) {
        p = smoke[i];
        p.life -= dt;
        if (p.life <= 0) { smoke.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.y < p.r * 0.25 && p.vy < 0) { // hit the ground: billow outwards
          var push = -p.vy;
          p.y = p.r * 0.25;
          p.vy = rand(8, 46);
          p.vx += (p.x < rx ? -1 : 1) * push * rand(0.55, 1.25) + rand(-30, 30);
          p.grow *= 1.5;
        }
        var drag = Math.pow(0.22, dt);
        p.vx *= drag; p.vy = p.vy * drag + 14 * dt;
        p.r += p.grow * dt;
      }
      for (i = sparks.length - 1; i >= 0; i--) {
        p = sparks[i];
        p.life -= dt;
        if (p.life <= 0) { sparks.splice(i, 1); continue; }
        p.vy -= 520 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.y < 0) { p.y = 0; p.vy *= -0.35; p.vx *= 0.6; }
      }
      for (i = confetti.length - 1; i >= 0; i--) {
        p = confetti[i];
        p.life -= dt;
        if (p.life <= 0 || p.y > H + 30) { confetti.splice(i, 1); continue; }
        p.vy += 260 * dt;
        p.vx *= Math.pow(0.35, dt); p.vy *= Math.pow(0.5, dt);
        p.x += (p.vx + Math.sin(time * 3 + p.ph) * 40) * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
      }
    }

    function burstConfetti() {
      if (reduceMotion) return;
      var colors = ['#ff6b4a', '#ffc46b', '#6fe0d2', '#fdf3e3', '#ff9ec4'];
      for (var i = 0; i < 170; i++) {
        var a = rand(-Math.PI, 0), sp = rand(240, 900);
        confetti.push({
          x: W * rand(0.15, 0.85), y: H * rand(0.25, 0.5),
          vx: Math.cos(a) * sp * 0.7, vy: Math.sin(a) * sp,
          w: rand(5, 11), h: rand(3, 6), rot: rand(0, 6), vr: rand(-9, 9),
          ph: rand(0, 6), life: rand(3.5, 6), c: colors[i % colors.length]
        });
      }
    }

    /* ---------------- launch control ---------------- */

    function callout(key, text, state) {
      if (calloutsDone[key]) return;
      calloutsDone[key] = true;
      statusOverride = text;
      setStatus(state || 'launch', text);
    }

    function begin(isReal) {
      real = isReal;
      phase = 'ignite';
      tL = 0; alt = 0; vel = 0; cam = 0; throttle = 0; arm = 1;
      calloutsDone = {};
      smoke.length = 0; sparks.length = 0;
      document.body.classList.add('launching');
      el.launch.disabled = true;
      callout('seq', 'Ignition sequence start');
      Sound.rumble(real ? 11 : 9.5);
    }

    function toPad() {
      phase = 'idle';
      alt = 0; vel = 0; cam = 0; throttle = 0; arm = 1; tL = 0;
      smoke.length = 0; sparks.length = 0;
    }

    function fadeThrough(cb) {
      fadeDir = 1; fadeCb = cb;
    }

    function finishTest() {
      fadeThrough(function () {
        toPad();
        document.body.classList.remove('launching');
        el.launch.disabled = false;
        statusOverride = null;
        lastSecondKey = '';
      });
    }

    function launch(isReal) {
      if (phase === 'ignite' || phase === 'ascent' || fadeDir) return;
      if (phase === 'orbit') {
        el.launch.disabled = true;
        fadeThrough(function () { toPad(); begin(true); });
      } else {
        begin(isReal);
      }
    }

    function setOrbit() {
      phase = 'orbit'; real = true;
      alt = H * 6; vel = 150; throttle = 0.42; arm = 0;
      cam = alt - lift();
    }

    function lift() { return wide ? (groundY - padH) - H * 0.62 : (groundY - padH) - H * 0.66; }

    /* ---------------- update ---------------- */

    function update(dt) {
      time += dt;

      if (fadeDir) {
        fade += fadeDir * dt / 0.7;
        if (fadeDir > 0 && fade >= 1) {
          fade = 1; fadeDir = -1;
          if (fadeCb) { var cb = fadeCb; fadeCb = null; cb(); }
        } else if (fadeDir < 0 && fade <= 0) { fade = 0; fadeDir = 0; }
      }

      var nozY = padH + alt;

      if (phase === 'idle') {
        // cold vapour venting off the tank
        if (!reduceMotion && Math.random() < dt * 9) {
          emitSmoke(rx - RH * 0.1, nozY + RH * rand(0.3, 0.36), rand(-34, -12), rand(-4, 10), RH * 0.02, rand(1.4, 2.6), RH * 0.045, 0);
        }
        nextShoot -= dt;
        if (nextShoot <= 0 && !reduceMotion) {
          nextShoot = rand(7, 16);
          shootingStar = { x: rand(0.1, 0.9) * W, y: rand(0.04, 0.3) * H, t: 0, dir: Math.random() < 0.5 ? -1 : 1 };
        }
      }

      if (phase === 'ignite' || phase === 'ascent') {
        tL += dt;
        arm = 1 - ease(tL / 1.1);

        if (phase === 'ignite') {
          throttle = ease((tL - 0.7) / 1.9);
          if (tL > 0.7) callout('ign', 'Main engine start');
          if (tL > 3.0) { phase = 'ascent'; callout('lift', 'Liftoff!'); }
        } else {
          throttle = 1;
          var ta = tL - 3.0;
          var acc = (real && ta > 7) ? 0 : 55 + ta * 150;
          vel += acc * dt;
          if (real && ta > 7) vel = lerp(vel, 150, 1 - Math.pow(0.35, dt));
          alt += vel * dt;
          if (ta > 2.2) callout('tower', 'Tower cleared');
          if (ta > 4.3) callout('maxq', 'Passing max-Q');
          if (real) {
            if (ta > 6.2) callout('go', 'Holidays are go', 'go');
            if (ta > 7 && !calloutsDone.conf) { calloutsDone.conf = true; burstConfetti(); }
            if (ta > 9) {
              phase = 'orbit';
              throttle = 0.42;
              document.body.classList.remove('launching');
              el.launch.disabled = false;
              statusOverride = null;
            }
          } else if (ta > 6.4 && !calloutsDone.end) {
            calloutsDone.end = true;
            callout('done', 'Test complete · back to the pad', 'counting');
            finishTest();
          }
        }

        // camera: follow the rocket, then (on a test) let it run off the top
        var escape = 0;
        if (!real && phase === 'ascent') { var te = Math.max(0, tL - 3.0 - 3.6); escape = te * te * H * 0.5; }
        cam = Math.max(0, alt - lift() - escape);

        // exhaust
        if (throttle > 0.02 && !reduceMotion) {
          var skyT = clamp(cam / (H * 2.5), 0, 1);
          var nearGround = alt < RH * 2.2;
          var rate = (nearGround ? 95 : 48) * throttle * (1 - skyT) * quality;
          var n = Math.floor(rate * dt + Math.random());
          for (var i = 0; i < n; i++) {
            if (nearGround) {
              emitSmoke(rx + rand(-1, 1) * RH * 0.05, nozY - RH * 0.02,
                rand(-70, 70), -rand(380, 760) * (0.4 + throttle * 0.6),
                RH * rand(0.045, 0.08), rand(2.2, 4.6), RH * rand(0.13, 0.24), 1);
            } else {
              emitSmoke(rx + rand(-1, 1) * RH * 0.04, nozY - RH * rand(0.45, 0.7),
                rand(-26, 26), -rand(60, 200),
                RH * rand(0.035, 0.06), rand(1.3, 2.4), RH * rand(0.12, 0.2), 0);
            }
          }
          if (phase === 'ignite' && tL < 2.2 && Math.random() < dt * 80) {
            var dir = Math.random() < 0.5 ? -1 : 1;
            sparks.push({ x: rx + dir * RH * 0.03, y: padH * 0.6, vx: dir * rand(60, 420), vy: rand(-40, 260), life: rand(0.3, 0.9), max: 0.9 });
          }
        }
      }

      if (phase === 'orbit') {
        alt += vel * dt;
        cam = alt - lift();
      }

      stepParticles(dt);
    }

    /* ---------------- drawing ---------------- */

    var SKY_DAWN = [[6, 10, 30], [14, 26, 66], [44, 62, 120], [176, 100, 96], [255, 170, 110]];
    var SKY_SPACE = [[3, 5, 16], [5, 8, 24], [8, 12, 34], [12, 16, 44], [16, 20, 52]];

    function drawSky(skyT) {
      var g = ctx.createLinearGradient(0, 0, 0, groundY + cam * 0.55);
      var stops = [0, 0.38, 0.68, 0.9, 1];
      for (var i = 0; i < 5; i++) g.addColorStop(stops[i], mix(SKY_DAWN[i], SKY_SPACE[i], skyT));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // sun glow just under the horizon
      if (skyT < 1) {
        var gx = wide ? W * 0.56 : W * 0.3, gy = groundY + cam * 0.55 + H * 0.02;
        var rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(W, H) * 0.6);
        rg.addColorStop(0, 'rgba(255,196,120,' + 0.5 * (1 - skyT) + ')');
        rg.addColorStop(0.35, 'rgba(255,130,90,' + 0.2 * (1 - skyT) + ')');
        rg.addColorStop(1, 'rgba(255,120,90,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, W, H);
      }
    }

    function drawStars(skyT) {
      var streak = reduceMotion ? 0 : clamp(vel * 0.014, 0, 34);
      ctx.lineCap = 'round';
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var y = (s.y + cam * s.par) % H;
        var horizonFade = lerp(clamp(1 - y / (groundY * 0.92), 0, 1), 1, skyT);
        var tw = 0.62 + 0.38 * Math.sin(time * s.sp + s.ph);
        var a = horizonFade * tw * (0.5 + s.par * 2.2);
        if (a <= 0.02) continue;
        ctx.globalAlpha = Math.min(1, a);
        ctx.fillStyle = ctx.strokeStyle = s.warm ? '#ffe2b8' : '#eef2ff';
        var len = streak * s.par * 3;
        if (len > 2) {
          ctx.lineWidth = s.r * 1.3;
          ctx.globalAlpha = Math.min(1, a) * 0.55;
          ctx.beginPath(); ctx.moveTo(s.x, y); ctx.lineTo(s.x, y - len); ctx.stroke();
        } else {
          ctx.beginPath(); ctx.arc(s.x, y, s.r, 0, 6.283); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      if (shootingStar) {
        var ss = shootingStar;
        ss.t += 1 / 60;
        var p = ss.t / 0.9;
        if (p >= 1) shootingStar = null;
        else {
          var x = ss.x + ss.dir * p * 260, yy = ss.y + p * 110;
          var g = ctx.createLinearGradient(x, yy, x - ss.dir * 90, yy - 38);
          g.addColorStop(0, 'rgba(255,255,255,' + 0.9 * Math.sin(p * Math.PI) + ')');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.strokeStyle = g; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x - ss.dir * 90, yy - 38); ctx.stroke();
        }
      }
    }

    function drawMoon(skyT) {
      var r = wide ? clamp(H * 0.045, 22, 40) : 18;
      var x = wide ? W * 0.9 : W * 0.86;
      var y = (wide ? H * 0.17 : H * 0.6) + cam * 0.03;
      if (y > H + r * 3) return;
      ctx.save();
      var glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 4.5);
      glow.addColorStop(0, 'rgba(255,236,200,0.16)');
      glow.addColorStop(1, 'rgba(255,236,200,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
      ctx.fillStyle = 'rgba(255,240,214,0.09)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
      // lit limb: the disc minus an offset disc
      ctx.beginPath();
      ctx.rect(x - r * 3, y - r * 3, r * 6, r * 6);
      ctx.moveTo(x - r * 0.4 + r * 1.02, y - r * 0.22);
      ctx.arc(x - r * 0.4, y - r * 0.22, r * 1.02, 0, 6.283);
      ctx.clip('evenodd');
      ctx.fillStyle = '#ffeed2';
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
      ctx.restore();
    }

    /* the curve of the Earth, once we are high enough to see it */
    function drawEarth(skyT) {
      var k = ease((skyT - 0.55) / 0.45);
      if (k <= 0) return;
      var R = Math.max(W, H) * 1.5;
      var cx = W * 0.5, cy = H + R - H * 0.13 * k;
      ctx.save();
      var halo = ctx.createRadialGradient(cx, cy, R * 0.985, cx, cy, R * 1.07);
      halo.addColorStop(0, 'rgba(120,190,255,' + 0.55 * k + ')');
      halo.addColorStop(0.25, 'rgba(90,150,255,' + 0.2 * k + ')');
      halo.addColorStop(1, 'rgba(90,150,255,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, W, H);
      var body = ctx.createLinearGradient(0, cy - R, 0, H);
      body.addColorStop(0, '#15306a'); body.addColorStop(0.5, '#0c1c48'); body.addColorStop(1, '#070f2c');
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.fill();
      // sunrise catching the limb
      var sx = W * 0.2, sy0 = cy - Math.sqrt(R * R - (sx - cx) * (sx - cx));
      ctx.save();
      ctx.translate(sx, sy0);
      ctx.rotate(Math.atan2(sx - cx, cy - sy0));
      ctx.scale(1, 0.16);
      var sr = Math.max(W * 0.3, 260);
      var sun = ctx.createRadialGradient(0, 0, 0, 0, 0, sr);
      sun.addColorStop(0, 'rgba(255,236,200,' + 0.95 * k + ')');
      sun.addColorStop(0.12, 'rgba(255,190,130,' + 0.6 * k + ')');
      sun.addColorStop(0.45, 'rgba(255,130,100,' + 0.16 * k + ')');
      sun.addColorStop(1, 'rgba(255,130,100,0)');
      ctx.fillStyle = sun;
      ctx.beginPath(); ctx.arc(0, 0, sr, 0, 6.283); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(190,225,255,' + 0.7 * k + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
      ctx.restore();
    }

    function drawHills(pts, baseY, top, bottom) {
      ctx.beginPath();
      ctx.moveTo(0, H + 4);
      for (var i = 0; i < pts.length; i++) ctx.lineTo(i * 24, baseY - pts[i]);
      ctx.lineTo(W + 24, H + 4);
      ctx.closePath();
      var g = ctx.createLinearGradient(0, baseY - 60, 0, baseY + 80);
      g.addColorStop(0, top); g.addColorStop(1, bottom);
      ctx.fillStyle = g;
      ctx.fill();
    }

    function drawGround(glow) {
      var farY = groundY + cam * 0.55;
      var nearY = groundY + cam;
      if (farY - H * 0.08 < H) drawHills(hillsFar, farY, '#2c2a5c', '#141a40');
      if (nearY - H * 0.05 > H) return;
      drawHills(hillsNear, nearY + 6, '#10163a', '#070b1f');
      ctx.fillStyle = '#070b1f';
      ctx.fillRect(0, nearY + 6, W, H);

      // distant facility lights
      for (var i = 0; i < lights.length; i++) {
        var l = lights[i];
        ctx.globalAlpha = 0.45 + 0.35 * Math.sin(time * 1.3 + l.ph);
        ctx.fillStyle = l.warm ? '#ffc98a' : '#9fd8ff';
        ctx.fillRect(l.x, nearY + l.y, 2, 2);
      }
      ctx.globalAlpha = 1;

      // pad lighting and engine glow on the ground
      var cx = rx, cy = nearY;
      var a = 0.16 + glow * 0.75;
      var rad = RH * (0.9 + glow * 2.4);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, 0.22);
      var rg = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
      rg.addColorStop(0, 'rgba(255,200,130,' + a + ')');
      rg.addColorStop(0.4, 'rgba(255,130,70,' + a * 0.45 + ')');
      rg.addColorStop(1, 'rgba(255,120,70,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(0, 0, rad, 0, 6.283); ctx.fill();
      ctx.restore();
    }

    function drawTower() {
      var base = groundY + cam;
      if (base - RH * 1.3 > H) return;
      var tw = RH * 0.11, th = RH * 1.12;
      var tx = rx - RH * 0.36;
      ctx.save();
      ctx.translate(tx, base);
      ctx.strokeStyle = '#27315f';
      ctx.fillStyle = '#0d1333';
      ctx.lineWidth = Math.max(1.2, RH * 0.008);
      ctx.lineJoin = 'round';

      // body
      ctx.fillRect(-tw / 2, -th, tw, th);
      ctx.strokeRect(-tw / 2, -th, tw, th);
      var bays = 9, bh = th / bays;
      ctx.beginPath();
      for (var i = 0; i < bays; i++) {
        var y0 = -i * bh, y1 = -(i + 1) * bh;
        ctx.moveTo(-tw / 2, y0); ctx.lineTo(tw / 2, y1);
        ctx.moveTo(tw / 2, y0); ctx.lineTo(-tw / 2, y1);
        ctx.moveTo(-tw / 2, y1); ctx.lineTo(tw / 2, y1);
      }
      ctx.stroke();

      // mast and beacon
      ctx.beginPath(); ctx.moveTo(0, -th); ctx.lineTo(0, -th - RH * 0.12); ctx.stroke();
      var blink = Math.sin(time * 3.2) > 0.3 ? 1 : 0.25;
      ctx.fillStyle = 'rgba(255,80,70,' + blink + ')';
      ctx.beginPath(); ctx.arc(0, -th - RH * 0.12, RH * 0.012 + 1, 0, 6.283); ctx.fill();
      if (blink === 1) {
        var bg = ctx.createRadialGradient(0, -th - RH * 0.12, 0, 0, -th - RH * 0.12, RH * 0.08);
        bg.addColorStop(0, 'rgba(255,80,70,0.5)'); bg.addColorStop(1, 'rgba(255,80,70,0)');
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.arc(0, -th - RH * 0.12, RH * 0.08, 0, 6.283); ctx.fill();
      }

      // service arms
      var reach = (rx - RH * 0.095) - tx - tw / 2;
      ctx.strokeStyle = '#27315f';
      ctx.fillStyle = '#0d1333';
      [0.78, 0.42].forEach(function (f, idx) {
        var len = reach * (idx === 0 ? arm : Math.min(1, arm * 1.15));
        if (len < 1) return;
        var ay = -padH - RH * f;
        ctx.fillRect(tw / 2, ay, len, RH * 0.022);
        ctx.strokeRect(tw / 2, ay, len, RH * 0.022);
      });
      ctx.restore();
    }

    function drawPad() {
      var base = groundY + cam;
      if (base - padH > H) return;
      var pw = RH * 0.62;
      ctx.fillStyle = '#0d1333';
      ctx.strokeStyle = '#27315f';
      ctx.lineWidth = Math.max(1.2, RH * 0.008);
      ctx.beginPath();
      ctx.moveTo(rx - pw / 2, base - padH);
      ctx.lineTo(rx + pw / 2, base - padH);
      ctx.lineTo(rx + pw / 2 + padH * 0.9, base + 2);
      ctx.lineTo(rx - pw / 2 - padH * 0.9, base + 2);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // hazard ticks
      ctx.fillStyle = '#ffc46b';
      for (var i = -3; i <= 3; i++) {
        if (i === 0) continue;
        ctx.globalAlpha = 0.75;
        ctx.fillRect(rx + i * pw * 0.13 - pw * 0.025, base - padH + padH * 0.28, pw * 0.05, padH * 0.2);
      }
      ctx.globalAlpha = 1;
    }

    function drawSmoke(front) {
      var thin = 1 - clamp(cam / (H * 2.5), 0, 1); // smoke thins out with the air
      if (thin <= 0.02) return;
      for (var i = 0; i < smoke.length; i++) {
        var p = smoke[i];
        if (p.front !== front) continue;
        var y = sy(p.y);
        if (y < -p.r || y > H + p.r) continue;
        var age = 1 - p.life / p.max;
        var a = Math.min(1, age * 7) * Math.pow(1 - age, 1.3);
        var d = p.r * 2;
        ctx.globalAlpha = a * 0.6 * thin;
        ctx.drawImage(sprSmoke, p.x - p.r, y - p.r, d, d);
        if (p.heat) {
          var w = Math.max(0, 1 - age * 4.5) * p.heat * throttleGlow;
          if (w > 0.01) { ctx.globalAlpha = Math.min(1, w * 0.4); ctx.drawImage(sprWarm, p.x - p.r, y - p.r, d, d); }
        }
      }
      ctx.globalAlpha = 1;
    }
    var throttleGlow = 0;

    function flamePath(w, len, wob) {
      ctx.beginPath();
      ctx.moveTo(-w, 0);
      ctx.bezierCurveTo(-w * 1.5, len * 0.28, -w * 0.5 + wob, len * 0.7, wob * 1.6, len);
      ctx.bezierCurveTo(w * 0.5 + wob, len * 0.7, w * 1.5, len * 0.28, w, 0);
      ctx.closePath();
    }

    function drawFlame(x, y, h, thr) {
      if (thr <= 0.01) return;
      var w = h * 0.058;
      var flick = 0.86 + 0.14 * Math.sin(time * 47) + 0.08 * Math.sin(time * 83 + 1.3);
      var len = h * (0.2 + 0.58 * thr) * flick;
      var wob = Math.sin(time * 31) * w * 0.28;
      ctx.save();
      ctx.translate(x, y);
      ctx.globalCompositeOperation = 'lighter';

      var rg = ctx.createRadialGradient(0, len * 0.25, 0, 0, len * 0.25, len * 1.25);
      rg.addColorStop(0, 'rgba(255,170,90,' + 0.5 * thr + ')');
      rg.addColorStop(0.4, 'rgba(255,110,60,' + 0.16 * thr + ')');
      rg.addColorStop(1, 'rgba(255,90,50,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(0, len * 0.25, len * 1.25, 0, 6.283); ctx.fill();

      var g1 = ctx.createLinearGradient(0, 0, 0, len);
      g1.addColorStop(0, 'rgba(255,120,60,0.95)');
      g1.addColorStop(0.55, 'rgba(255,90,60,0.6)');
      g1.addColorStop(1, 'rgba(255,60,80,0)');
      ctx.fillStyle = g1; flamePath(w * 1.25, len, wob); ctx.fill();

      var g2 = ctx.createLinearGradient(0, 0, 0, len * 0.72);
      g2.addColorStop(0, 'rgba(255,220,130,0.95)');
      g2.addColorStop(1, 'rgba(255,170,70,0)');
      ctx.fillStyle = g2; flamePath(w * 0.85, len * 0.72, wob * 0.6); ctx.fill();

      var g3 = ctx.createLinearGradient(0, 0, 0, len * 0.42);
      g3.addColorStop(0, 'rgba(255,255,255,0.95)');
      g3.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g3; flamePath(w * 0.5, len * 0.42, wob * 0.3); ctx.fill();

      // shock diamonds
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (var i = 1; i <= 3; i++) {
        var dy = len * 0.14 * i, dw = w * (0.5 - i * 0.1);
        ctx.beginPath(); ctx.ellipse(0, dy, dw, dw * 0.55, 0, 0, 6.283); ctx.fill();
      }
      ctx.restore();
    }

    function drawRocket(x, by, h, thr) {
      var w = h * 0.19, hw = w / 2;
      var y0 = -h * 0.055;         // bottom of the body
      var ys = -h * 0.66;          // where the nose starts to curve
      var yt = -h;                 // tip
      ctx.save();
      ctx.translate(x, by);

      // fins (behind the body)
      var finG = ctx.createLinearGradient(-w * 1.3, 0, w * 1.3, 0);
      finG.addColorStop(0, '#ff7a55'); finG.addColorStop(0.5, '#f0523a'); finG.addColorStop(1, '#b8352c');
      ctx.fillStyle = finG;
      [-1, 1].forEach(function (s) {
        ctx.beginPath();
        ctx.moveTo(s * hw * 0.9, -h * 0.33);
        ctx.quadraticCurveTo(s * w * 0.95, -h * 0.2, s * w * 1.22, -h * 0.045);
        ctx.lineTo(s * w * 1.22, h * 0.0);
        ctx.quadraticCurveTo(s * w * 0.9, -h * 0.075, s * hw * 0.9, -h * 0.085);
        ctx.closePath();
        ctx.fill();
      });

      // nozzle
      var nz = ctx.createLinearGradient(-hw, 0, hw, 0);
      nz.addColorStop(0, '#59607f'); nz.addColorStop(0.45, '#2b3050'); nz.addColorStop(1, '#14172c');
      ctx.fillStyle = nz;
      ctx.beginPath();
      ctx.moveTo(-hw * 0.5, y0 - 1); ctx.lineTo(hw * 0.5, y0 - 1);
      ctx.lineTo(hw * 0.72, 0); ctx.lineTo(-hw * 0.72, 0);
      ctx.closePath(); ctx.fill();
      if (thr > 0.01) {
        ctx.fillStyle = 'rgba(255,190,110,' + 0.9 * thr + ')';
        ctx.fillRect(-hw * 0.72, -h * 0.012, hw * 1.44, h * 0.012);
      }

      // body silhouette
      ctx.beginPath();
      ctx.moveTo(-hw, y0);
      ctx.lineTo(-hw, ys);
      ctx.bezierCurveTo(-hw, ys - h * 0.17, -hw * 0.42, yt + h * 0.035, 0, yt);
      ctx.bezierCurveTo(hw * 0.42, yt + h * 0.035, hw, ys - h * 0.17, hw, ys);
      ctx.lineTo(hw, y0);
      ctx.closePath();
      ctx.save();
      ctx.clip();

      ctx.fillStyle = '#f6ecdd';
      ctx.fillRect(-hw, yt, w, h);

      // nose cone
      ctx.fillStyle = '#ff5d42';
      ctx.beginPath();
      ctx.moveTo(-hw, yt - 2); ctx.lineTo(hw, yt - 2); ctx.lineTo(hw, -h * 0.775);
      ctx.quadraticCurveTo(0, -h * 0.745, -hw, -h * 0.775);
      ctx.closePath(); ctx.fill();

      // bands
      function band(y, t, color) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(-hw, y); ctx.quadraticCurveTo(0, y + h * 0.022, hw, y);
        ctx.lineTo(hw, y + t); ctx.quadraticCurveTo(0, y + t + h * 0.022, -hw, y + t);
        ctx.closePath(); ctx.fill();
      }
      band(-h * 0.762, h * 0.014, '#ffc46b');
      band(-h * 0.305, h * 0.05, '#ff5d42');
      band(-h * 0.245, h * 0.012, '#ffc46b');
      band(-h * 0.105, h * 0.06, '#2b3050');

      // panel seams
      ctx.strokeStyle = 'rgba(60,50,70,0.16)';
      ctx.lineWidth = Math.max(1, h * 0.004);
      [-0.66, -0.43].forEach(function (f) {
        ctx.beginPath(); ctx.moveTo(-hw, h * f); ctx.quadraticCurveTo(0, h * f + h * 0.02, hw, h * f); ctx.stroke();
      });

      // cylindrical shading
      var sh = ctx.createLinearGradient(-hw, 0, hw, 0);
      sh.addColorStop(0, 'rgba(20,24,60,0.20)');
      sh.addColorStop(0.16, 'rgba(255,255,255,0.34)');
      sh.addColorStop(0.36, 'rgba(255,255,255,0)');
      sh.addColorStop(0.62, 'rgba(20,24,60,0.10)');
      sh.addColorStop(1, 'rgba(20,24,60,0.52)');
      ctx.fillStyle = sh;
      ctx.fillRect(-hw, yt, w, h);

      // warm light from the engine climbing the hull
      if (thr > 0.01) {
        var eg = ctx.createLinearGradient(0, 0, 0, -h * 0.5);
        eg.addColorStop(0, 'rgba(255,150,70,' + 0.55 * thr + ')');
        eg.addColorStop(1, 'rgba(255,150,70,0)');
        ctx.fillStyle = eg;
        ctx.fillRect(-hw, -h * 0.5, w, h * 0.5);
      }
      ctx.restore();

      // dawn rim light on the right edge
      ctx.strokeStyle = 'rgba(255,186,130,0.55)';
      ctx.lineWidth = Math.max(1, h * 0.005);
      ctx.beginPath();
      ctx.moveTo(hw - ctx.lineWidth / 2, y0);
      ctx.lineTo(hw - ctx.lineWidth / 2, ys);
      ctx.stroke();

      // centre fin
      ctx.fillStyle = '#d8432f';
      ctx.beginPath();
      ctx.moveTo(-w * 0.035, -h * 0.3); ctx.lineTo(w * 0.035, -h * 0.3);
      ctx.lineTo(w * 0.06, -h * 0.02); ctx.lineTo(-w * 0.06, -h * 0.02);
      ctx.closePath(); ctx.fill();

      // porthole
      var py = -h * 0.555, pr = w * 0.27;
      ctx.fillStyle = '#c9bfb2';
      ctx.beginPath(); ctx.arc(0, py, pr * 1.28, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#8d8478';
      ctx.beginPath(); ctx.arc(0, py, pr * 1.08, 0, 6.283); ctx.fill();
      var gl = ctx.createRadialGradient(-pr * 0.3, py - pr * 0.35, pr * 0.1, 0, py, pr);
      gl.addColorStop(0, '#9af0ea'); gl.addColorStop(0.6, '#2e9db0'); gl.addColorStop(1, '#0f5270');
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(0, py, pr, 0, 6.283); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = Math.max(1, pr * 0.14);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, py, pr * 0.66, Math.PI * 1.08, Math.PI * 1.42); ctx.stroke();

      ctx.restore();
    }

    function drawSparks() {
      ctx.strokeStyle = '#ffd9a0';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      for (var i = 0; i < sparks.length; i++) {
        var p = sparks[i];
        ctx.globalAlpha = clamp(p.life / 0.4, 0, 1);
        var y = sy(p.y);
        ctx.beginPath(); ctx.moveTo(p.x, y); ctx.lineTo(p.x - p.vx * 0.02, y + p.vy * 0.02); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function drawConfetti() {
      for (var i = 0; i < confetti.length; i++) {
        var p = confetti[i];
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = clamp(p.life, 0, 1);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2 * Math.cos(p.rot * 1.7), p.w, p.h * Math.cos(p.rot * 1.7));
        ctx.restore();
      }
    }

    function draw() {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      var skyT = clamp(cam / (H * 2.5), 0, 1);
      throttleGlow = throttle * (1 - skyT);

      // camera shake
      var shake = 0;
      if (!reduceMotion && (phase === 'ignite' || phase === 'ascent')) {
        var onScreen = clamp(1 - (alt - cam) / (H * 1.2), 0, 1);
        shake = throttle * RH * 0.012 * (0.4 + 0.6 * onScreen) * (phase === 'ascent' ? clamp(1.4 - (tL - 3) * 0.16, 0.3, 1.4) : 1);
      }
      var shx = (Math.random() - 0.5) * 2 * shake, shy = (Math.random() - 0.5) * 2 * shake;

      drawSky(skyT);
      drawStars(skyT);
      drawMoon(skyT);
      drawEarth(skyT);

      ctx.save();
      ctx.translate(shx, shy);
      drawGround(throttleGlow * clamp(1 - alt / (RH * 3), 0, 1));
      drawTower();
      drawSmoke(false);

      var bob = phase === 'orbit' && !reduceMotion ? Math.sin(time * 0.9) * RH * 0.012 : 0;
      var by = sy(padH + alt) + bob;
      if (by > -RH * 1.2) {
        ctx.save();
        ctx.beginPath(); ctx.rect(-50, -50, W + 100, groundY + cam + 56); ctx.clip();
        drawFlame(rx, by, RH, throttle);
        ctx.restore();
        drawRocket(rx, by, RH, throttle);
      }
      drawPad();
      drawSmoke(true);
      drawSparks();
      ctx.restore();

      // subtle readability veil behind the text column on small screens
      if (!wide && skyT < 1) {
        var v = ctx.createLinearGradient(0, 0, 0, H * 0.6);
        v.addColorStop(0, 'rgba(6,10,30,0.35)'); v.addColorStop(1, 'rgba(6,10,30,0)');
        ctx.fillStyle = v; ctx.fillRect(0, 0, W, H * 0.6);
      }

      drawConfetti();

      if (fade > 0) {
        ctx.fillStyle = 'rgba(5,8,22,' + ease(fade) + ')';
        ctx.fillRect(0, 0, W, H);
      }
    }

    var lastT = 0;
    function frame(t) {
      var raw = (t - lastT) / 1000 || 0.016;
      var dt = Math.min(0.05, raw);
      lastT = t;
      // ease detail down when frames run long, and back up when there is headroom
      if (raw < 0.25) {
        slow = slow * 0.9 + (raw > 0.024 ? 0.1 : 0);
        if (slow > 0.35) quality = Math.max(0.3, quality - 0.04);
        else if (slow < 0.05) quality = Math.min(1, quality + 0.004);
        if (quality <= 0.3 && slow > 0.6 && dprCap > 1) { dprCap = 1; resize(); }
      }
      updateReadout();
      update(dt);
      draw();
      requestAnimationFrame(frame);
    }

    window.addEventListener('resize', resize);
    resize();

    return {
      start: function () { requestAnimationFrame(frame); },
      launch: launch,
      setOrbit: setOrbit,
      // test hook: advance the simulation without waiting for real time
      _advance: function (seconds) { for (var t = 0; t < seconds; t += 1 / 60) update(1 / 60); draw(); }
    };
  })();

  /* ------------------------------------------------------------------ */
  /* Wiring                                                             */
  /* ------------------------------------------------------------------ */

  el.sound.setAttribute('aria-pressed', String(Sound.on));
  el.sound.addEventListener('click', function () {
    el.sound.setAttribute('aria-pressed', String(Sound.toggle()));
  });
  el.launch.addEventListener('click', function () { Scene.launch(launchedMode); });

  // The page is already past launch day: open in flight.
  if (now() >= holidayFor(now())) Scene.setOrbit();

  // Keep the readout honest even when the tab is in the background.
  setInterval(updateReadout, 1000);

  window.__scene = Scene;
  updateReadout();
  Scene.start();
})();
