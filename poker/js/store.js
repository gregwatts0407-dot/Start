/* store.js — settings, profile, lifetime stats and academy progress (localStorage). */
(function (root) {
  'use strict';
  const KEY = 'felt-holdem-v1';
  const memory = {};

  const DEFAULTS = {
    profile: { name: 'You', hue: 42 },
    settings: {
      sound: true, volume: 0.6, speed: 'normal', fourColor: false, felt: 'green', back: 'red',
      coachMode: 'always', coachWarn: true, showStyles: true, autoDeal: true, handStrength: true, keyboard: true,
    },
    stats: {
      hands: 0, won: 0, vpip: 0, pfr: 0, sawFlop: 0, showdowns: 0, showdownsWon: 0, netBB: 0,
      biggestPot: 0, biggestPotBB: 0, bestHand: 0, bestHandName: '',
      tournaments: 0, tournamentWins: 0, itm: 0, places: [],
      coachDecisions: 0, coachScore: 0, grades: {}, history: [], lastPlayed: 0,
    },
    academy: { done: {}, quiz: {}, drills: {}, xp: 0, lastLesson: null },
  };

  let data;
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { raw = memory[KEY] || null; }
    let parsed = {};
    try { parsed = raw ? JSON.parse(raw) : {}; } catch (e) { parsed = {}; }
    data = {};
    for (const k of Object.keys(DEFAULTS)) data[k] = Object.assign(JSON.parse(JSON.stringify(DEFAULTS[k])), parsed[k] || {});
  }
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const s = JSON.stringify(data);
      try { localStorage.setItem(KEY, s); } catch (e) { memory[KEY] = s; }
    }, 150);
  }
  load();

  const RANKS = [
    [0, 'Rookie'], [150, 'Card Sharp'], [400, 'Grinder'], [800, 'Regular'], [1300, 'Shark'], [2000, 'High Roller'], [3000, 'Legend'],
  ];
  function rankFor(xp) {
    let cur = RANKS[0], next = null;
    for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i][0]) { cur = RANKS[i]; next = RANKS[i + 1] || null; }
    return { name: cur[1], min: cur[0], next: next ? next[0] : null, nextName: next ? next[1] : null, progress: next ? (xp - cur[0]) / (next[0] - cur[0]) : 1 };
  }

  root.Store = {
    get data() { return data; },
    get profile() { return data.profile; },
    get settings() { return data.settings; },
    get stats() { return data.stats; },
    get academy() { return data.academy; },
    save,
    setSetting(k, v) { data.settings[k] = v; save(); },
    addXP(n) { data.academy.xp += n; save(); },
    rank() { return rankFor(data.academy.xp); },
    resetStats() { data.stats = JSON.parse(JSON.stringify(DEFAULTS.stats)); save(); },
    RANKS,
  };
})(window);
