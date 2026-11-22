/* coach-panel.js — renders the coach sidebar / bottom sheet. */
(function (root) {
  'use strict';
  const { esc, fmt, pct, cardHTML, avatarHTML } = root.UI;
  const C = root.PokerCards;

  const TIPS = [
    ['Position is power', 'Acting last lets you see what everyone else does first. Play more hands on the button and fewer under the gun.'],
    ['Raise, don\'t limp', 'Entering the pot with a raise wins the blinds outright some of the time and gives you the initiative after the flop.'],
    ['Pot odds in one line', 'Divide the call by the pot after you call. If your chance of winning is higher, the call makes money.'],
    ['The rule of 4 and 2', 'With two cards to come, outs × 4 ≈ your % to hit. With one card to come, outs × 2.'],
    ['Value bet thinner', 'Most players don\'t bet their good-but-not-great hands enough. If worse hands can call, bet.'],
    ['Don\'t bluff calling stations', 'Some players call with anything. Against them, skip the bluffs and value-bet relentlessly.'],
    ['Respect the Rock', 'Tight, passive players rarely bluff. When they raise big, fold everything but your strongest hands.'],
    ['Small c-bets on dry boards', 'On boards like K-7-2 rainbow, a bet of about a third of the pot works as well as a big one, and costs less.'],
    ['Bet bigger on wet boards', 'When the board has flush and straight draws, bet more so drawing hands pay the wrong price.'],
    ['Think in ranges', 'Your opponent rarely has one exact hand. Ask: "which hands would play this way?" and how you do against all of them.'],
    ['Stack-to-pot ratio', 'With a low SPR (under 3), top pair is often strong enough to get all-in. With a deep SPR, be more careful.'],
    ['Short-stacked? Shove', 'Below about 12 big blinds, raising and folding wastes chips. Move all-in or fold.'],
    ['Avoid tilt', 'After a bad beat, take a breath. The cards don\'t remember, and the next decision deserves your best.'],
    ['Suited isn\'t magic', 'Being suited adds only about 2–3% equity. Don\'t overvalue weak suited hands like J4s.'],
    ['Kicker trouble', 'A-9 offsuit looks pretty but often loses to a better ace. Fold weak aces to early-position raises.'],
    ['Big blind defence', 'You already have a big blind in the pot, so you get a discount: defend more hands against small raises.'],
    ['Check your bet sizes', 'Changing bet size with hand strength gives away information. Use sizes based on the board, not your cards.'],
    ['Fold equity', 'A bet wins in two ways: they fold now, or you have the best hand later. Semi-bluffs use both.'],
  ];

  const LESSON_NAMES = {
    'starting-hands': 'Starting hands', position: 'Position', aggression: 'Aggression and initiative', 'pot-odds': 'Pot odds and equity',
    outs: 'Outs and the rule of 2 and 4', 'value-betting': 'Value betting and sizing', tournament: 'Tournament play',
  };

  function modeSwitch(mode) {
    const b = (m, l) => `<button data-coach-mode="${m}" class="${mode === m ? 'on' : ''}">${l}</button>`;
    return `<div class="cp-mode" role="group" aria-label="Coach mode">${b('always', 'Always')}${b('ask', 'On request')}${b('off', 'Off')}</div>`;
  }

  function metrics(adv) {
    const eqCls = adv.toCall > 0 ? (adv.equity >= adv.potOdds ? 'good' : 'bad') : '';
    const needLine = adv.toCall > 0 ? `<span class="need" style="left:${Math.min(100, adv.potOdds * 100)}%" title="Equity needed"></span>` : '';
    return `<div class="cp-card">
      <h4>Equity vs. likely ranges</h4>
      <div style="display:flex;align-items:baseline;gap:8px"><b style="font-size:28px" class="num">${pct(adv.equity)}</b>
        <span style="color:var(--muted);font-size:13px">${adv.toCall > 0 ? 'need ' + pct(adv.potOdds) + ' to call' : 'chance to win at showdown'}</span></div>
      <div class="meter"><i class="${eqCls}" style="width:${Math.round(adv.equity * 100)}%"></i>${needLine}</div>
      <div class="meter-legend"><span>0%</span><span>${adv.toCall > 0 ? 'White line = break-even' : ''}</span><span>100%</span></div>
    </div>
    <div class="cp-metrics">
      <div class="metric"><span>Pot</span><b class="num">${fmt(adv.pot)}</b></div>
      <div class="metric"><span>To call</span><b class="num">${adv.toCall ? fmt(adv.toCall) : '—'}</b>${adv.toCall ? `<small>${pct(adv.potOdds)}</small>` : ''}</div>
      <div class="metric"><span>Position</span><b>${esc(adv.position || '—')}</b><small>${adv.players}-handed</small></div>
      <div class="metric"><span>${adv.street === 'preflop' ? 'Stack' : 'SPR'}</span><b class="num">${adv.street === 'preflop' ? Math.round(adv.bbStack) + '<small>bb</small>' : adv.spr.toFixed(1)}</b></div>
    </div>`;
  }

  function outsCard(adv) {
    const info = adv.info;
    if (!info || !info.outs.length || adv.street === 'river') return '';
    const groups = Object.entries(info.outGroups).map(([k, cs]) =>
      `<div class="outs-group"><b>${esc(k)}</b> · ${cs.length} out${cs.length > 1 ? 's' : ''}<div class="outs-list">${cs.map((c) => cardHTML(c)).join('')}</div></div>`).join('');
    const mult = adv.street === 'flop' ? 4 : 2;
    return `<div class="cp-card"><h4>Outs · ${info.outs.length}</h4>
      <div class="cp-tip">≈ <b>${Math.min(100, info.outs.length * mult)}%</b> to improve by the river (rule of ${mult}).</div>${groups}</div>`;
  }

  function readsCard(state) {
    const view = state.view;
    if (!view) return '';
    const rows = [];
    view.seats.forEach((s, i) => {
      if (i === state.hero || !s.inHand || s.folded) return;
      const st = state.hud && state.hud[s.name];
      const prof = s.isBot && s.profile && root.PokerAI.PROFILES[s.profile];
      const style = state.showStyles && prof ? prof.label : st && st.hands >= 8 ? styleFromStats(st) : 'Unknown style';
      const hud = st && st.hands ? `VPIP ${Math.round(100 * st.vpip / st.hands)} · PFR ${Math.round(100 * st.pfr / st.hands)} · ${st.hands}h` : 'no reads yet';
      const range = state.adv && state.adv.opponents.find((o) => o.seat === i);
      rows.push(`<div class="opp-read">${avatarHTML(s.name, s.hue)}<div><b>${esc(s.name)} <small>· ${esc(style)}</small></b>
        <small>${range ? 'Range: ' + esc(range.label) : esc(hud)}</small>${range ? `<br><small class="hud-stats">${esc(hud)}</small>` : ''}</div></div>`);
    });
    if (!rows.length) return '';
    return `<div class="cp-card"><h4>Opponent reads</h4>${rows.join('')}</div>`;
  }

  function styleFromStats(st) {
    const v = st.vpip / st.hands, p = st.pfr / st.hands;
    if (v > 0.45 && p < 0.15) return 'Plays loose & passive';
    if (v > 0.45) return 'Very loose & aggressive';
    if (v < 0.16) return 'Very tight';
    if (p / Math.max(v, 0.01) > 0.6) return v > 0.28 ? 'Loose-aggressive' : 'Tight-aggressive';
    return 'Loose-passive';
  }

  function recCard(adv) {
    const r = adv.rec;
    return `<div class="cp-rec">
      <div class="rec-label">Coach recommends</div>
      <div class="rec-action t-${r.type}">${esc(r.label)}</div>
      <ul>${adv.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      ${adv.alt ? `<div class="alt">${esc(adv.alt)}</div>` : ''}
      ${adv.lesson ? `<button class="lesson-link" data-lesson="${adv.lesson}">Learn: ${esc(LESSON_NAMES[adv.lesson] || adv.lesson)} →</button>` : ''}
    </div>`;
  }

  function reviewCard(review) {
    if (!review || !review.items.length) return '';
    const score = Math.round(review.score * 100);
    return `<div class="cp-card"><h4>Hand #${review.handNo} review</h4>
      <div class="cp-score"><div class="ring" style="--p:${score}">${score}</div>
        <div class="cp-tip">${review.summary}</div></div>
      <div class="cp-review" style="margin-top:12px">${review.items.map((it) => `
        <div class="review-item"><span class="ri-street">${esc(it.street)}</span>
          <div><span class="grade ${it.grade.grade}">${esc(it.grade.label)}</span>
          <span style="margin-left:6px">You: <b>${esc(it.actual)}</b>${it.grade.grade === 'great' ? '' : ` · Coach: <b>${esc(it.rec)}</b>`}</span></div>
          <div class="ri-note">${esc(it.grade.note)}</div></div>`).join('')}</div>
      ${review.lesson ? `<button class="lesson-link" data-lesson="${review.lesson}">Study: ${esc(LESSON_NAMES[review.lesson] || review.lesson)} →</button>` : ''}
    </div>`;
  }

  function sessionCard(session) {
    if (!session || !session.decisions) return '';
    const s = Math.round(100 * session.score / session.decisions);
    return `<div class="cp-card"><h4>This session</h4><div class="cp-score"><div class="ring" style="--p:${s}">${s}</div>
      <div class="cp-tip"><b>${session.decisions}</b> decisions graded.<br>${session.mistakes ? `<b>${session.mistakes}</b> costly mistake${session.mistakes > 1 ? 's' : ''} so far.` : 'No costly mistakes yet — nice.'}</div></div></div>`;
  }

  function render(el, state) {
    const mode = state.mode;
    const sub = state.myTurn ? 'Your decision' : state.view && state.view.street === 'complete' ? 'Hand finished' : 'Watching the hand';
    let body = '';
    if (mode === 'off') {
      body = `<div class="cp-card"><div class="cp-tip">The coach is off. Turn it on for live advice, odds and a review of every hand.</div>
        <div style="margin-top:12px"><button class="btn btn-coach btn-sm" data-coach-mode="always">Turn coach on</button></div></div>`;
    } else if (state.myTurn) {
      if (!state.adv) body = `<div class="cp-card"><div class="cp-tip">Thinking <span class="thinking"><i></i><i></i><i></i></span></div></div>`;
      else {
        if (mode === 'ask' && !state.revealed) {
          body += `<div class="cp-card cp-ask"><div class="cp-tip">Make your own read first — then check it against the coach.</div>
            <button class="btn btn-coach" data-coach-reveal>Ask the coach <span style="opacity:.6;font-weight:600">(H)</span></button></div>`;
        } else body += recCard(state.adv);
        body += metrics(state.adv) + outsCard(state.adv);
      }
      body += readsCard(state);
    } else {
      if (state.review) body += reviewCard(state.review);
      const tip = TIPS[state.tipIndex % TIPS.length];
      if (!state.review || state.view.street !== 'complete') {
        const hv = state.view && state.hero != null ? state.view.seats[state.hero] : null;
        if (hv && hv.inHand && !hv.folded && hv.cards[0] >= 0 && state.view.street !== 'complete') {
          const info = root.PokerEquity.analyze(hv.cards, state.view.board);
          const cls = C.handClass(hv.cards[0], hv.cards[1]);
          body += `<div class="cp-card"><h4>Your hand</h4><div class="cards-row">${hv.cards.map((c) => cardHTML(c)).join('')}
            <div class="cp-tip" style="margin-left:6px"><b>${esc(info.relative || info.madeName)}</b><br><span style="color:var(--muted)">${cls} · top ${Math.max(1, Math.round(root.PokerEquity.classPct(cls) * 100))}% preflop</span>
            ${state.view.board.length >= 3 ? `<br><span style="color:var(--muted)">${esc(info.texture.label)}</span>` : ''}</div></div></div>`;
        }
        body += readsCard(state);
      }
      body += `<div class="cp-card"><h4>Tip · ${esc(tip[0])}</h4><div class="cp-tip">${esc(tip[1])}</div></div>`;
    }
    body += sessionCard(state.session);
    el.innerHTML = `<div class="cp-head"><span class="owl lg"></span><h3>Coach<small>${sub}</small></h3>
      <button class="icon-btn" data-action="toggle-coach" aria-label="Close coach"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div style="padding:12px 16px 0">${modeSwitch(mode)}</div>
      <div class="cp-body">${body}</div>`;
  }

  root.CoachPanel = { render, TIPS, LESSON_NAMES, styleFromStats };
})(window);
