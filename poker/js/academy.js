/* academy.js — lessons, interactive widgets, quizzes and practice drills. */
(function (root) {
  'use strict';
  const { $, $$, esc, fmt, cardHTML, cardsInline, toast } = root.UI;
  const C = root.PokerCards, Q = root.PokerEquity, Coach = root.PokerCoach;
  const Store = root.Store;
  const AC = () => root.AcademyContent;
  const XP_LESSON = 60, XP_DRILL = 5;

  let tab = 'lessons';
  const el = () => $('#academy');

  function lessonsInOrder() { return AC().lessons; }
  function lessonById(id) { return AC().lessons.find((l) => l.id === id); }

  function renderXp() {
    const r = Store.rank();
    $('#academyXp').innerHTML = `<span>${esc(r.name)}</span><span class="xp-bar" title="${Store.academy.xp} XP"><i style="width:${Math.round(r.progress * 100)}%"></i></span><b class="num">${Store.academy.xp} XP</b>`;
  }

  // ---------------- token rendering ----------------
  function renderTokens(html) {
    return html
      .replace(/\{\{c:([^}]+)\}\}/g, (m, cs) => cardsInline(cs))
      .replace(/\{\{ex:([^}]+)\}\}/g, (m, body) => `<div class="example">${body.split(';').map((part) => {
        const [label, cs] = part.split('|');
        return `<div><span class="lbl">${esc(label)}</span>${cardsInline(cs)}</div>`;
      }).join('')}</div>`)
      .replace(/\{\{w:(\w+)\}\}/g, (m, w) => `<div class="widget" data-widget="${w}"></div>`);
  }

  // ---------------- home ----------------
  function renderHome() {
    renderXp();
    const a = Store.academy;
    const lessons = lessonsInOrder();
    const done = lessons.filter((l) => a.done[l.id]).length;
    const r = Store.rank();
    const drillStats = Object.values(a.drills || {});
    const answered = drillStats.reduce((x, d) => x + (d.total || 0), 0);
    const correct = drillStats.reduce((x, d) => x + (d.correct || 0), 0);
    const next = nextLesson();
    const pctDone = Math.round((done / lessons.length) * 100);
    let body = '';
    if (tab === 'lessons') {
      body = AC().TRACKS.map((t) => {
        const ls = lessons.filter((l) => l.track === t.id);
        const d = ls.filter((l) => a.done[l.id]).length;
        return `<div class="track"><div class="track-head"><h3>${esc(t.title)}</h3><span>${d}/${ls.length} complete · ${esc(t.blurb)}</span></div>
          <div class="lesson-grid">${ls.map((l) => {
            const n = lessons.indexOf(l) + 1;
            const isDone = !!a.done[l.id];
            return `<button class="lesson-card ${isDone ? 'done' : ''}" data-open-lesson="${l.id}"><span class="lc-num">${isDone ? '✓' : n}</span>
              <span><b>${esc(l.title)}</b><small>${esc(l.summary)}</small><span class="lc-meta"><span>${l.minutes} min</span><span>${l.quiz.length} questions</span>${a.quiz[l.id] != null ? `<span>Best ${a.quiz[l.id]}/${l.quiz.length}</span>` : ''}</span></span></button>`;
          }).join('')}</div></div>`;
      }).join('');
    } else if (tab === 'gym') {
      body = `<p style="color:var(--ink-2);margin:0 0 16px">Short, endless drills. Each correct answer earns ${XP_DRILL} XP. Build a streak!</p>
        <div class="drill-grid">${AC().DRILLS.map((d) => {
          const s = a.drills[d.id] || {};
          return `<button class="drill-card" data-open-drill="${d.id}"><span class="dc-icon" aria-hidden="true">${d.icon}</span><b>${esc(d.title)}</b><small>${esc(d.blurb)}</small>
            <div class="dc-best">${s.total ? `Best streak ${s.best || 0} · ${Math.round((100 * (s.correct || 0)) / s.total)}% accuracy` : 'Not tried yet'}</div></button>`;
        }).join('')}</div>`;
    } else {
      body = `<div class="prose"><table>${AC().GLOSSARY.map(([t, d]) => `<tr><td style="width:30%"><b>${esc(t)}</b></td><td>${esc(d)}</td></tr>`).join('')}</table></div>`;
    }
    el().innerHTML = `<div class="ac-wrap">
      <div class="ac-hero"><div class="ring" style="--p:${pctDone}">${pctDone}%</div>
        <div><h1>${done === lessons.length ? 'Academy graduate' : done ? 'Keep going' : 'Welcome to the Academy'}</h1>
          <p>${done}/${lessons.length} lessons · ${answered ? `${Math.round((100 * correct) / answered)}% drill accuracy · ` : ''}Rank: <b>${esc(r.name)}</b>${r.nextName ? ` · ${r.next - a.xp} XP to ${esc(r.nextName)}` : ''}</p></div>
        ${next ? `<button class="btn btn-coach" data-open-lesson="${next.id}">${done ? 'Continue' : 'Start'}: ${esc(next.title)}</button>` : '<button class="btn btn-gold" data-action="setup-tournament">Test yourself in a tournament</button>'}
      </div>
      <div class="ac-tabs" role="tablist">
        <button class="ac-tab ${tab === 'lessons' ? 'on' : ''}" data-tab="lessons" role="tab">Lessons</button>
        <button class="ac-tab ${tab === 'gym' ? 'on' : ''}" data-tab="gym" role="tab">Practice Gym</button>
        <button class="ac-tab ${tab === 'glossary' ? 'on' : ''}" data-tab="glossary" role="tab">Glossary</button>
      </div>${body}</div>`;
    el().scrollTop = 0;
  }

  function nextLesson() {
    const ls = lessonsInOrder();
    const i = ls.findIndex((l) => !Store.academy.done[l.id]);
    if (i < 0) return null;
    return Object.assign({ num: i + 1 }, ls[i]);
  }

  // ---------------- lessons ----------------
  function lessonHTML(id, overlay) {
    const l = lessonById(id);
    if (!l) return '<p>Lesson not found.</p>';
    const ls = lessonsInOrder();
    const i = ls.indexOf(l);
    const track = AC().TRACKS.find((t) => t.id === l.track);
    const prev = ls[i - 1], next = ls[i + 1];
    return `<div class="lesson-crumbs"><span>${esc(track.title)}</span><span>·</span><span>Lesson ${i + 1} of ${ls.length}</span><span>·</span><span>${l.minutes} min</span>${Store.academy.done[id] ? '<span class="grade great">Completed</span>' : ''}</div>
      <h1>${esc(l.title)}</h1><p class="lesson-sub">${esc(l.summary)}</p>
      <div class="prose">${renderTokens(l.body)}</div>
      <div class="quiz"><h2>Check your understanding</h2><p style="color:var(--muted);margin:0">Answer ${Math.ceil(l.quiz.length * 2 / 3)} of ${l.quiz.length} correctly to complete the lesson${Store.academy.done[id] ? '' : ` and earn ${XP_LESSON} XP`}.</p>
        ${l.quiz.map((q, qi) => `<div class="q-card" data-q="${qi}"><div class="q-text">${qi + 1}. ${renderTokens(q.q)}</div>
          <div class="q-opts">${q.o.map((o, oi) => `<button class="q-opt" data-o="${oi}">${renderTokens(o)}</button>`).join('')}</div></div>`).join('')}
        <div class="quiz-result"></div></div>
      ${overlay ? '<div class="lesson-nav"><span></span><button class="btn btn-gold" data-close>Back to the table</button></div>'
        : `<div class="lesson-nav">${prev ? `<button class="btn" data-open-lesson="${prev.id}">← ${esc(prev.title)}</button>` : '<span></span>'}
        ${next ? `<button class="btn btn-coach" data-open-lesson="${next.id}">Next: ${esc(next.title)} →</button>` : '<button class="btn btn-gold" data-action="quick-play">Put it into practice</button>'}</div>`}`;
  }

  function openLesson(id) {
    renderXp();
    Store.academy.lastLesson = id;
    Store.save();
    el().innerHTML = `<div class="lesson"><button class="btn btn-sm btn-ghost" data-ac-home style="margin-bottom:14px">← All lessons</button>${lessonHTML(id)}</div>`;
    wireLesson(el(), id);
    el().scrollTop = 0;
  }

  function wireLesson(container, id) {
    const l = lessonById(id);
    $$('[data-widget]', container).forEach((w) => mountWidget(w, w.dataset.widget));
    const answers = {};
    container.addEventListener('click', (e) => {
      const opt = e.target.closest('.q-opt');
      if (!opt) return;
      const card = opt.closest('.q-card');
      const qi = Number(card.dataset.q);
      if (answers[qi] != null) return;
      const q = l.quiz[qi];
      const oi = Number(opt.dataset.o);
      answers[qi] = oi === q.a;
      $$('.q-opt', card).forEach((b, k) => { b.disabled = true; if (k === q.a) b.classList.add('correct'); else if (k === oi) b.classList.add('wrong'); });
      card.insertAdjacentHTML('beforeend', `<div class="q-explain">${answers[qi] ? '✅ ' : '❌ '}${renderTokens(esc(q.e).replace(/\{\{c:([^}]+)\}\}/g, '{{c:$1}}'))}</div>`);
      root.Sound.play(answers[qi] ? 'correct' : 'wrong');
      if (Object.keys(answers).length === l.quiz.length) {
        const score = Object.values(answers).filter(Boolean).length;
        const pass = score >= Math.ceil(l.quiz.length * 2 / 3);
        const a = Store.academy;
        a.quiz[id] = Math.max(a.quiz[id] || 0, score);
        let msg;
        if (pass && !a.done[id]) {
          a.done[id] = Date.now();
          Store.addXP(XP_LESSON);
          msg = `<b>Lesson complete!</b> +${XP_LESSON} XP`;
          toast(`🎓 Lesson complete · +${XP_LESSON} XP`, 'gold');
          root.UI.confetti(1600);
        } else if (pass) msg = '<b>Nice — still sharp.</b>';
        else msg = '<b>Not quite.</b> Re-read the sections above and try again.';
        Store.save();
        renderXp();
        $('.quiz-result', container).innerHTML = `<div class="q-card" style="text-align:center">${msg} You scored ${score}/${l.quiz.length}.
          ${pass ? '' : `<div style="margin-top:10px"><button class="btn btn-sm" data-retry>Try again</button></div>`}</div>`;
        const retry = $('[data-retry]', container);
        if (retry) retry.onclick = () => { const parent = container.closest('.modal') ? container : el(); if (container.closest('.modal')) { container.querySelector('.lesson').innerHTML = lessonHTML(id, true); wireLesson(container, id); } else openLesson(id); void parent; };
      }
    });
  }

  // ---------------- widgets ----------------
  function mountWidget(w, name) {
    const fn = WIDGETS[name];
    if (fn) fn(w); else w.remove();
  }

  const WIDGETS = {
    ladder(w) {
      const rows = [
        ['Royal Flush', 'A-K-Q-J-10, all one suit.', 'As Ks Qs Js Ts'],
        ['Straight Flush', 'Five in a row, all one suit.', '9h 8h 7h 6h 5h'],
        ['Four of a Kind', 'Four cards of the same rank.', 'Qc Qd Qh Qs 7d'],
        ['Full House', 'Three of a kind plus a pair.', 'Kc Kd Kh 4s 4d'],
        ['Flush', 'Any five cards of one suit.', 'Ad Jd 8d 6d 2d'],
        ['Straight', 'Five ranks in a row, mixed suits.', 'Tc 9d 8h 7s 6c'],
        ['Three of a Kind', 'Three cards of the same rank.', '7c 7d 7s Kh 2d'],
        ['Two Pair', 'Two different pairs.', 'Jc Jh 5d 5s Ac'],
        ['One Pair', 'Two cards of the same rank.', 'Ac Ad 9h 6s 3c'],
        ['High Card', 'None of the above: highest card plays.', 'Ac Qd 8h 5s 3c'],
      ];
      w.innerHTML = `<h4>From best to worst</h4><div class="ladder">${rows.map((r, i) => `<div class="ladder-row"><span class="lr-n">${i + 1}</span><span><b>${r[0]}</b><small>${r[1]}</small></span>${cardsInline(r[2])}</div>`).join('')}</div>`;
    },

    range(w) {
      const positions = [['UTG', 'Under the gun'], ['HJ', 'Hijack'], ['CO', 'Cutoff'], ['BTN', 'Button'], ['SB', 'Small blind']];
      let pos = 'CO';
      const draw = () => {
        const pctRange = Coach.openRangeFor(pos, 6);
        const cells = [];
        let combos = 0;
        for (let r = 0; r < 13; r++) for (let c = 0; c < 13; c++) {
          const cls = C.gridClass(r, c);
          const inR = Q.classPct(cls) <= pctRange + 1e-9;
          if (inR) combos += C.classCombos(cls);
          const kind = r === c ? 'pair' : c > r ? 'suited' : 'off';
          cells.push(`<div class="rc ${inR ? 'in' : ''} ${kind}" title="${cls} · top ${Math.max(1, Math.round(Q.classPct(cls) * 100))}% · ${Math.round(Q.EQUITY[cls][0] * 100)}% vs a random hand">${cls.length === 2 ? cls : cls.slice(0, 2)}</div>`);
        }
        w.innerHTML = `<h4>Opening range · 6-handed</h4>
          <div class="pos-wheel seg">${positions.map(([k, label]) => `<button data-pos="${k}" class="${k === pos ? 'on' : ''}">${k}<small>${label}</small></button>`).join('')}</div>
          <div class="range-grid">${cells.join('')}</div>
          <div class="range-legend"><span><i style="background:#e0b65a"></i>Pairs</span><span><i style="background:#4b95e6"></i>Suited (upper right)</span><span><i style="background:#2fae74"></i>Offsuit (lower left)</span>
          <span>Opening <b>${Math.round((combos / 1326) * 100)}%</b> of hands from ${pos}</span></div>
          <p style="font-size:13px;color:var(--muted);margin:10px 0 0">Hover or long-press a cell to see the hand's rank and its equity against a random hand.</p>`;
      };
      draw();
      w.addEventListener('click', (e) => { const b = e.target.closest('[data-pos]'); if (b) { pos = b.dataset.pos; draw(); } });
    },

    potodds(w) {
      w.innerHTML = `<h4>Pot odds calculator</h4><div class="calc-grid">
        <div class="field" style="margin:0"><label>Pot before the bet</label><input type="number" data-k="pot" value="100" min="0"></div>
        <div class="field" style="margin:0"><label>Opponent bets</label><input type="number" data-k="bet" value="50" min="0"></div>
        <div class="field" style="margin:0"><label>Your equity (%)</label><input type="number" data-k="eq" value="35" min="0" max="100"></div></div>
        <div class="calc-out"></div>`;
      const calc = () => {
        const v = (k) => Math.max(0, Number($(`[data-k=${k}]`, w).value) || 0);
        const pot = v('pot'), bet = v('bet'), eq = Math.min(100, v('eq')) / 100;
        const need = bet / (pot + bet * 2 || 1);
        const ev = eq * (pot + bet) - (1 - eq) * bet;
        $('.calc-out', w).innerHTML = `You call <b>${fmt(bet)}</b> to win <b>${fmt(pot + bet)}</b> → you need <b>${(need * 100).toFixed(1)}%</b> equity (${need ? ((1 - need) / need).toFixed(1) : '∞'}-to-1).<br>
          With ${Math.round(eq * 100)}% equity, calling ${ev >= 0 ? 'earns' : 'loses'} about <b style="color:${ev >= 0 ? 'var(--good)' : 'var(--bad)'}">${fmt(Math.abs(ev))}</b> chips per call on average → <b>${ev >= 0 ? 'Call' : 'Fold'}</b>.`;
      };
      w.addEventListener('input', calc);
      calc();
    },

    outs(w) {
      const draw = () => {
        const sc = makeDrawScenario(Math.random() < 0.5 ? 3 : 4);
        const outs = drawOuts(sc.hole, sc.board);
        const groups = {};
        outs.forEach((c) => { const k = sc.groupOf[c]; (groups[k] = groups[k] || []).push(c); });
        const mult = sc.board.length === 3 ? 4 : 2;
        w.innerHTML = `<h4>Outs explorer</h4><div class="example" style="margin:0 0 12px"><div><span class="lbl">Your hand</span>${cardsInline(sc.hole)}</div><div><span class="lbl">Board</span>${cardsInline(sc.board)}</div></div>
          <p style="margin:0 0 8px"><b>${outs.length} outs</b> to a straight or flush · rule of ${mult}: ≈ ${Math.min(100, outs.length * mult)}%</p>
          ${Object.entries(groups).map(([k, cs]) => `<div style="margin:6px 0"><small style="color:var(--muted)">${esc(k)} (${cs.length})</small><div class="outs-list">${cs.map((c) => cardHTML(c)).join('')}</div></div>`).join('')}
          <button class="btn btn-sm" data-new style="margin-top:10px">New example</button>`;
      };
      draw();
      w.addEventListener('click', (e) => { if (e.target.closest('[data-new]')) draw(); });
    },

    position(w) {
      const seats = ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO'];
      const color = (p) => (['UTG', 'UTG+1'].includes(p) ? '#ff6b6b' : ['MP', 'LJ', 'HJ'].includes(p) ? '#f5b041' : ['CO', 'BTN'].includes(p) ? '#34d399' : '#5cc8ff');
      const n = seats.length;
      const pts = seats.map((p, i) => {
        const th = Math.PI / 2 + (i * 2 * Math.PI) / n;
        return { p, x: 50 + 44 * Math.cos(th), y: 50 + 40 * Math.sin(th) };
      });
      w.innerHTML = `<h4>Seats at a 9-handed table</h4>
        <div style="position:relative;aspect-ratio:2/1;max-width:560px;margin:0 auto;border-radius:999px;background:radial-gradient(ellipse at 50% 45%,var(--felt-1),var(--felt-2) 65%,var(--felt-3));box-shadow:0 0 0 10px #241810,0 0 0 11px rgba(233,196,106,.35)">
        ${pts.map((s) => `<div style="position:absolute;left:${s.x}%;top:${s.y}%;transform:translate(-50%,-50%);padding:5px 10px;border-radius:999px;font-weight:800;font-size:12px;background:#111821;border:2px solid ${color(s.p)};color:#fff;white-space:nowrap">${s.p}</div>`).join('')}
        <div style="position:absolute;inset:0;display:grid;place-items:center;color:rgba(255,255,255,.8);font-size:13px;text-align:center;padding:0 22%">Action after the flop goes clockwise from the small blind. The button always acts last.</div></div>
        <div class="range-legend" style="justify-content:center;margin-top:16px"><span><i style="background:#ff6b6b"></i>Early</span><span><i style="background:#f5b041"></i>Middle</span><span><i style="background:#34d399"></i>Late</span><span><i style="background:#5cc8ff"></i>Blinds</span></div>`;
    },

    bluff(w) {
      w.innerHTML = `<h4>Bluff break-even</h4><div class="slider-wrap"><span style="white-space:nowrap">Bet size</span><input type="range" min="10" max="200" value="50" step="5"><b class="num" data-v style="min-width:80px;text-align:right"></b></div><div class="calc-out"></div>`;
      const r = $('input', w);
      const calc = () => {
        const f = Number(r.value) / 100;
        const need = f / (1 + f);
        r.style.setProperty('--p', ((r.value - 10) / 190) * 100 + '%');
        $('[data-v]', w).textContent = r.value + '% pot';
        $('.calc-out', w).innerHTML = `Betting <b>${r.value}%</b> of the pot as a pure bluff must make your opponent fold <b>${Math.round(need * 100)}%</b> of the time to break even.`;
      };
      r.addEventListener('input', calc);
      calc();
    },
  };

  // ---------------- drill helpers ----------------
  function rnd(n) { return Math.floor(Math.random() * n); }
  function deal(n, dead) {
    const d = C.shuffle(C.newDeck().filter((c) => !(dead && dead.has(c))));
    return d.slice(0, n);
  }
  function drawOuts(hole, board) {
    const a = Q.analyze(hole, board);
    const set = new Set();
    ['Straight', 'Flush', 'Straight Flush'].forEach((k) => (a.outGroups[k] || []).forEach((c) => set.add(c)));
    return Array.from(set);
  }
  function makeDrawScenario(boardLen) {
    for (let t = 0; t < 4000; t++) {
      const cards = deal(2 + boardLen);
      const hole = cards.slice(0, 2), board = cards.slice(2);
      const s = C.evaluate(hole.concat(board));
      if ((s >> 20) >= 3) continue; // already strong
      const a = Q.analyze(hole, board);
      if (!(a.flushDraw || a.oesd || a.gutshot)) continue;
      const outs = drawOuts(hole, board);
      if (outs.length < 4) continue;
      const groupOf = {};
      ['Straight Flush', 'Flush', 'Straight'].forEach((k) => (a.outGroups[k] || []).forEach((c) => { if (!groupOf[c]) groupOf[c] = k; }));
      return { hole, board, info: a, groupOf };
    }
    return { hole: C.parseCards('Ah Kh'), board: C.parseCards('Qh 7h 2c'), info: Q.analyze(C.parseCards('Ah Kh'), C.parseCards('Qh 7h 2c')), groupOf: {} };
  }
  function shuffleArr(a) { return C.shuffle(a.slice()); }

  // Each generator returns {html, options:[{label, correct}], explain}
  const DRILL_GEN = {
    showdown() {
      for (;;) {
        const cards = deal(9);
        const a = cards.slice(0, 2), b = cards.slice(2, 4), board = cards.slice(4);
        const sa = C.evaluate(a.concat(board)), sb = C.evaluate(b.concat(board));
        // prefer interesting spots: both players have at least a pair, or close categories
        if ((sa >> 20) === 0 && (sb >> 20) === 0 && Math.random() < 0.85) continue;
        const res = sa > sb ? 'A' : sb > sa ? 'B' : 'Split';
        const na = C.describe(sa), nb = C.describe(sb);
        const ba = C.bestFive(a.concat(board)).cards, bb = C.bestFive(b.concat(board)).cards;
        return {
          html: `<div class="ds-label">Board</div><div class="cards-row">${board.map((c) => cardHTML(c)).join('')}</div>
            <div class="drill-hands"><div class="drill-hand" data-h="A"><div class="ds-label">Player A</div><div class="cards-row">${a.map((c) => cardHTML(c)).join('')}</div></div>
            <div class="drill-hand" data-h="B"><div class="ds-label">Player B</div><div class="cards-row">${b.map((c) => cardHTML(c)).join('')}</div></div></div>`,
          q: 'Who wins the pot?',
          options: [{ label: 'Player A', correct: res === 'A' }, { label: 'Player B', correct: res === 'B' }, { label: 'Split pot', correct: res === 'Split' }],
          explain: `Player A: <b>${esc(na)}</b> (${cardsInline(ba)}).<br>Player B: <b>${esc(nb)}</b> (${cardsInline(bb)}).<br>${res === 'Split' ? 'Identical five-card hands: the pot is split.' : `Player ${res} wins.`}`,
          after: (stage) => { const w = stage.querySelector(`[data-h="${res}"]`); if (w) w.classList.add('win'); },
        };
      }
    },
    name() {
      let cards, s;
      for (let t = 0; t < 100; t++) {
        cards = deal(7);
        s = C.evaluate(cards);
        const cat = s >> 20;
        if (cat === 0 && Math.random() < 0.85) continue;
        if (cat === 1 && Math.random() < 0.6) continue;
        break;
      }
      const cat = s >> 20;
      const names = C.CATEGORY_NAMES.slice(0, 8).concat(['Straight Flush']);
      const near = new Set([cat]);
      const cand = [cat - 1, cat + 1, cat - 2, cat + 2, cat + 3].filter((x) => x >= 0 && x <= 8);
      for (const c of shuffleArr(cand)) { if (near.size >= 4) break; near.add(c); }
      const opts = shuffleArr(Array.from(near)).map((c) => ({ label: names[c], correct: c === cat }));
      const best = C.bestFive(cards).cards;
      return {
        html: `<div class="ds-label">Hole cards</div><div class="cards-row">${cards.slice(0, 2).map((c) => cardHTML(c)).join('')}</div>
          <div class="ds-label" style="margin-top:16px">Board</div><div class="cards-row">${cards.slice(2).map((c) => cardHTML(c)).join('')}</div>`,
        q: 'What is the best five-card hand?',
        options: opts,
        explain: `Best hand: <b>${esc(C.describe(s))}</b> using ${cardsInline(best)}.`,
      };
    },
    outs() {
      const sc = makeDrawScenario(Math.random() < 0.6 ? 3 : 4);
      const n = drawOuts(sc.hole, sc.board).length;
      const opts = new Set([n]);
      [n - 4, n - 1, n + 1, n + 2, n + 4, n - 2, n + 3].filter((x) => x > 0).forEach((x) => { if (opts.size < 4) opts.add(x); });
      const groups = {};
      drawOuts(sc.hole, sc.board).forEach((c) => { const k = sc.groupOf[c]; (groups[k] = groups[k] || []).push(c); });
      const kinds = [sc.info.flushDraw && 'a flush draw', sc.info.oesd && 'an open-ended straight draw', sc.info.gutshot && 'a gutshot'].filter(Boolean).join(' and ');
      const mult = sc.board.length === 3 ? 4 : 2;
      return {
        html: `<div class="ds-label">Your hand</div><div class="cards-row">${sc.hole.map((c) => cardHTML(c)).join('')}</div>
          <div class="ds-label" style="margin-top:16px">${sc.board.length === 3 ? 'Flop' : 'Turn'}</div><div class="cards-row">${sc.board.map((c) => cardHTML(c)).join('')}</div>`,
        q: 'How many outs do you have to make a straight or a flush?',
        options: Array.from(opts).sort((a, b) => a - b).map((x) => ({ label: String(x), correct: x === n })),
        explain: `You have ${kinds} — <b>${n} outs</b>. Rule of ${mult}: about ${Math.min(100, n * mult)}% to hit ${sc.board.length === 3 ? 'by the river' : 'on the river'}.
          ${Object.entries(groups).map(([k, cs]) => `<div style="margin-top:8px"><small>${esc(k)}:</small> ${cardsInline(cs)}</div>`).join('')}`,
      };
    },
    potodds() {
      const pots = [40, 60, 80, 100, 120, 150, 200, 240, 300];
      const pot = pots[rnd(pots.length)];
      const fracs = [0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1, 1.5];
      const f = fracs[rnd(fracs.length)];
      const bet = Math.max(5, Math.round((pot * f) / 5) * 5);
      const need = bet / (pot + 2 * bet);
      const choices = [0.14, 0.17, 0.2, 0.25, 0.29, 0.3, 0.33, 0.38, 0.4, 0.45];
      const correct = choices.reduce((a, b) => (Math.abs(b - need) < Math.abs(a - need) ? b : a));
      const others = shuffleArr(choices.filter((c) => Math.abs(c - correct) > 0.035)).slice(0, 3);
      const opts = shuffleArr([correct, ...others]).map((c) => ({ label: Math.round(c * 100) + '%', correct: c === correct }));
      return {
        html: `<div class="drill-ctx"><span class="info-pill">Pot <b>${pot}</b></span><span class="info-pill gold">Opponent bets <b>${bet}</b></span></div>
          <div class="cards-row" style="justify-content:center">${root.UI.chipStacksHTML(pot, 4)}</div>`,
        q: 'What equity do you need to call?',
        options: opts,
        explain: `You call <b>${bet}</b> to win <b>${pot + bet}</b>. After your call the pot is ${pot + 2 * bet}: ${bet} ÷ ${pot + 2 * bet} = <b>${(need * 100).toFixed(1)}%</b>.`,
      };
    },
    callfold() {
      const sc = makeDrawScenario(4);
      const outs = drawOuts(sc.hole, sc.board).length;
      const eq = outs / 46;
      const pot = [60, 80, 100, 120, 150, 200][rnd(6)];
      const f = [0.33, 0.5, 0.66, 0.75, 1][rnd(5)];
      const bet = Math.max(5, Math.round((pot * f) / 5) * 5);
      const need = bet / (pot + 2 * bet);
      const call = eq >= need;
      return {
        html: `<div class="drill-ctx"><span class="info-pill">Pot <b>${pot}</b></span><span class="info-pill gold">Opponent bets <b>${bet}</b></span><span class="info-pill">Turn · last card to come</span></div>
          <div class="ds-label">Your hand</div><div class="cards-row">${sc.hole.map((c) => cardHTML(c)).join('')}</div>
          <div class="ds-label" style="margin-top:14px">Board</div><div class="cards-row">${sc.board.map((c) => cardHTML(c)).join('')}</div>
          <p style="margin:14px 0 0;color:rgba(255,255,255,.85);font-size:14px">Assume your opponent has a made hand that beats you unless you hit. Ignore implied odds.</p>`,
        q: 'Call or fold?',
        options: [{ label: 'Call', correct: call }, { label: 'Fold', correct: !call }],
        explain: `You have <b>${outs} outs</b> → about ${outs} × 2 ≈ ${outs * 2}% (exactly ${(eq * 100).toFixed(1)}%). You need ${bet} ÷ ${pot + 2 * bet} = <b>${(need * 100).toFixed(1)}%</b>. ${call ? 'Your equity is enough: <b>call</b>.' : 'Not enough equity: <b>fold</b>.'}`,
      };
    },
    preflop() {
      const positions = ['UTG', 'HJ', 'CO', 'BTN', 'SB'];
      const pos = positions[rnd(positions.length)];
      const range = Coach.openRangeFor(pos, 6);
      // bias toward hands near the edge of the range so drills are instructive
      let hole, p;
      for (let t = 0; t < 200; t++) {
        hole = deal(2);
        p = Q.handPct(hole[0], hole[1]);
        if (Math.abs(p - range) < 0.22 || t > 150) break;
      }
      const inRange = p <= range;
      const cls = C.handClass(hole[0], hole[1]);
      return {
        html: `<div class="drill-ctx"><span class="info-pill gold">6-handed</span><span class="info-pill">You are <b>${pos}</b></span><span class="info-pill">Folded to you</span></div>
          <div class="cards-row" style="justify-content:center">${hole.map((c) => cardHTML(c)).join('')}</div>`,
        q: `Open-raise or fold ${cls}?`,
        options: [{ label: 'Raise', correct: inRange }, { label: 'Fold', correct: !inRange }],
        explain: `${cls} is in the top <b>${Math.max(1, Math.round(p * 100))}%</b> of hands. A solid ${pos} opening range is about the top <b>${Math.round(range * 100)}%</b>, so the answer is <b>${inRange ? 'raise' : 'fold'}</b>.${pos === 'UTG' ? ' Early position needs strong hands: five players act after you.' : pos === 'BTN' ? ' The button is the best seat, so you can open wide.' : ''}`,
      };
    },
    equity() {
      const cards = deal(7);
      const a = cards.slice(0, 2), b = cards.slice(2, 4), board = cards.slice(4, 7);
      const r = Q.headsUpEquity(a, b, board);
      const e = r.a;
      const buckets = [[0, 0.2, 'Under 20%'], [0.2, 0.4, '20–40%'], [0.4, 0.6, '40–60%'], [0.6, 0.8, '60–80%'], [0.8, 1.01, 'Over 80%']];
      const infoA = Q.analyze(a, board);
      return {
        html: `<div class="ds-label">Board (flop)</div><div class="cards-row">${board.map((c) => cardHTML(c)).join('')}</div>
          <div class="drill-hands"><div class="drill-hand"><div class="ds-label">You</div><div class="cards-row">${a.map((c) => cardHTML(c)).join('')}</div></div>
          <div class="drill-hand"><div class="ds-label">Opponent</div><div class="cards-row">${b.map((c) => cardHTML(c)).join('')}</div></div></div>`,
        q: 'If all the money went in now, how often would you win?',
        options: buckets.map(([lo, hi, label]) => ({ label, correct: e >= lo && e < hi })),
        explain: `Your exact equity is <b>${(e * 100).toFixed(1)}%</b> (enumerating all ${board.length === 3 ? '990' : ''} turn and river cards). You have ${esc(infoA.relative || infoA.madeName)}${infoA.flushDraw ? ' plus a flush draw' : ''}${infoA.oesd ? ' plus an open-ended straight draw' : ''}; your opponent has ${esc(Q.relativeStrength(b, board))}.`,
      };
    },
  };

  let drillState = null;
  function openDrill(id) {
    renderXp();
    const d = AC().DRILLS.find((x) => x.id === id);
    drillState = { id, streak: 0, correct: 0, total: 0 };
    el().innerHTML = `<div class="drill"><button class="btn btn-sm btn-ghost" data-ac-home data-gym style="margin-bottom:14px">← Practice Gym</button>
      <div class="drill-top"><h1>${d.icon} ${esc(d.title)}</h1><div class="drill-score">
        <div class="metric"><span>Streak</span><b class="num" data-s="streak">0</b></div>
        <div class="metric"><span>Score</span><b class="num" data-s="score">0/0</b></div>
        <div class="metric"><span>Best</span><b class="num" data-s="best">${(Store.academy.drills[id] || {}).best || 0}</b></div></div></div>
      <div class="drill-stage" id="drillStage"></div></div>`;
    nextItem();
    el().scrollTop = 0;
  }
  function nextItem() {
    const st = drillState;
    const item = DRILL_GEN[st.id]();
    st.item = item;
    st.answered = false;
    const stage = $('#drillStage');
    stage.innerHTML = `${item.html}<div class="drill-q">${item.q}</div>
      <div class="drill-opts">${item.options.map((o, i) => `<button class="btn btn-lg" data-ans="${i}">${esc(o.label)}</button>`).join('')}</div>
      <div class="drill-fb"></div>`;
  }
  function answer(i) {
    const st = drillState;
    if (!st || st.answered) return;
    st.answered = true;
    const item = st.item;
    const ok = item.options[i].correct;
    st.total++;
    if (ok) { st.correct++; st.streak++; } else st.streak = 0;
    const rec = Store.academy.drills[st.id] || (Store.academy.drills[st.id] = { total: 0, correct: 0, best: 0 });
    rec.total++;
    if (ok) { rec.correct++; Store.addXP(XP_DRILL); }
    rec.best = Math.max(rec.best || 0, st.streak);
    Store.save();
    root.Sound.play(ok ? 'correct' : 'wrong');
    const stage = $('#drillStage');
    $$('[data-ans]', stage).forEach((b, k) => { b.disabled = true; if (item.options[k].correct) b.classList.add('correct'); else if (k === i) b.classList.add('wrong'); });
    if (item.after) item.after(stage);
    $('.drill-fb', stage).innerHTML = `<div class="drill-feedback ${ok ? 'good' : 'bad'}">${ok ? '<b>Correct!</b> ' : '<b>Not quite.</b> '}${item.explain}</div>
      <div style="margin-top:16px"><button class="btn btn-gold" data-next-item autofocus>Next <span style="opacity:.6">(Enter)</span></button></div>`;
    $('[data-s=streak]').textContent = st.streak;
    $('[data-s=score]').textContent = st.correct + '/' + st.total;
    $('[data-s=best]').textContent = rec.best;
    renderXp();
    if (ok && st.streak > 0 && st.streak % 10 === 0) { toast(`🔥 ${st.streak} in a row!`, 'gold'); root.UI.confetti(1400); }
    setTimeout(() => { const n = $('[data-next-item]'); if (n) n.focus(); }, 50);
  }

  // ---------------- events ----------------
  document.addEventListener('click', (e) => {
    const t = e.target;
    const ol = t.closest('[data-open-lesson]');
    if (ol) {
      if (ol.closest('.modal')) { root.UI.closeTopModal(); root.App.show('academy'); }
      openLesson(ol.dataset.openLesson); return;
    }
    const od = t.closest('[data-open-drill]');
    if (od) { openDrill(od.dataset.openDrill); return; }
    const tb = t.closest('[data-tab]');
    if (tb && t.closest('#academy')) { tab = tb.dataset.tab; renderHome(); return; }
    const home = t.closest('[data-ac-home]');
    if (home) { if (home.dataset.gym !== undefined) tab = 'gym'; else tab = 'lessons'; drillState = null; renderHome(); return; }
    const ans = t.closest('[data-ans]');
    if (ans && t.closest('#drillStage')) { answer(Number(ans.dataset.ans)); return; }
    if (t.closest('[data-next-item]')) nextItem();
  });
  document.addEventListener('keydown', (e) => {
    if (!$('#screen-academy').classList.contains('active') || !drillState) return;
    if (e.key === 'Enter' && drillState.answered) { e.preventDefault(); nextItem(); }
    else if (/^[1-5]$/.test(e.key) && !drillState.answered) {
      const i = Number(e.key) - 1;
      if (drillState.item.options[i]) answer(i);
    }
  });

  root.Academy = { renderHome, openLesson, lessonHTML, wireLesson, nextLesson, openDrill };
})(window);
