// Run with: node blackjack/tests/engine.test.js
'use strict';
const assert = require('assert');
const BJ = require('../js/engine.js');

const R = BJ.DEFAULT_RULES;
const c = s => {
  // "AS" "10H" "KD" → card
  const suit = s.slice(-1);
  return { rank: s.slice(0, -1), suit };
};
const hand = (...xs) => xs.map(c);
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (e) { console.error('FAIL', name, '\n ', e.message); process.exitCode = 1; }
}

test('evaluate soft and hard totals', () => {
  assert.deepStrictEqual(BJ.evaluate(hand('AS', '6H')), { total: 17, soft: true, bust: false });
  assert.deepStrictEqual(BJ.evaluate(hand('AS', '6H', 'KD')), { total: 17, soft: false, bust: false });
  assert.deepStrictEqual(BJ.evaluate(hand('AS', 'AH', '9D')), { total: 21, soft: true, bust: false });
  assert.strictEqual(BJ.evaluate(hand('KS', 'QH', '2D')).bust, true);
  assert.strictEqual(BJ.isNatural(hand('AS', 'KH')), true);
  assert.strictEqual(BJ.isNatural(hand('AS', 'KH'), true), false);
});

test('dealer rules', () => {
  assert.strictEqual(BJ.dealerShouldHit(hand('AS', '6H'), { h17: false }), false);
  assert.strictEqual(BJ.dealerShouldHit(hand('AS', '6H'), { h17: true }), true);
  assert.strictEqual(BJ.dealerShouldHit(hand('10S', '6H'), { h17: false }), true);
  assert.strictEqual(BJ.dealerShouldHit(hand('10S', '7H'), { h17: true }), false);
});

test('basic strategy spot checks (S17, DAS, surrender)', () => {
  const s = (cards, up, o) => BJ.basicStrategy(hand(...cards), c(up), R, o);
  assert.strictEqual(s(['10S', '6H'], '10D'), 'R');
  assert.strictEqual(s(['10S', '6H'], '10D', { canSurrender: false }), 'H');
  assert.strictEqual(s(['10S', '2H'], '4D'), 'S');
  assert.strictEqual(s(['10S', '2H'], '3D'), 'H');
  assert.strictEqual(s(['6S', '5H'], 'AD'), 'H');
  assert.strictEqual(s(['6S', '5H'], '10D'), 'D');
  assert.strictEqual(s(['AS', '7H'], '2D'), 'S');
  assert.strictEqual(s(['AS', '7H'], '6D'), 'D');
  assert.strictEqual(s(['AS', '7H'], '9D'), 'H');
  assert.strictEqual(s(['AS', '7H'], '5D', { canDouble: false }), 'S');
  assert.strictEqual(s(['8S', '8H'], 'AD'), 'P');
  assert.strictEqual(s(['9S', '9H'], '7D'), 'S');
  assert.strictEqual(s(['9S', '9H'], '8D'), 'P');
  assert.strictEqual(s(['AS', 'AH'], '10D'), 'P');
  assert.strictEqual(s(['KS', 'QH'], '6D'), 'S');
  assert.strictEqual(s(['4S', '4H'], '5D'), 'P');
  assert.strictEqual(BJ.basicStrategy(hand('4S', '4H'), c('5D'), Object.assign({}, R, { das: false })), 'H');
  assert.strictEqual(s(['5S', '5H'], '9D'), 'D');
});

test('basic strategy H17 adjustments', () => {
  const H = Object.assign({}, R, { h17: true });
  assert.strictEqual(BJ.basicStrategy(hand('6S', '5H'), c('AD'), H), 'D');
  assert.strictEqual(BJ.basicStrategy(hand('8S', '8H'), c('AD'), H), 'R');
  assert.strictEqual(BJ.basicStrategy(hand('10S', '7H'), c('AD'), H), 'R');
  assert.strictEqual(BJ.basicStrategy(hand('AS', '8H'), c('6D'), H), 'D');
});

test('side bets', () => {
  assert.strictEqual(BJ.perfectPairs(c('7S'), c('7S')).pays, 25);
  assert.strictEqual(BJ.perfectPairs(c('7S'), c('7C')).pays, 12);
  assert.strictEqual(BJ.perfectPairs(c('7S'), c('7H')).pays, 6);
  assert.strictEqual(BJ.perfectPairs(c('7S'), c('8S')), null);
  assert.strictEqual(BJ.twentyOnePlusThree(c('QS'), c('KS'), c('AS')).pays, 40);
  assert.strictEqual(BJ.twentyOnePlusThree(c('AS'), c('2H'), c('3D')).pays, 10);
  assert.strictEqual(BJ.twentyOnePlusThree(c('KS'), c('AH'), c('2D')), null);
  assert.strictEqual(BJ.twentyOnePlusThree(c('9S'), c('9S'), c('9S')).pays, 100);
  assert.strictEqual(BJ.twentyOnePlusThree(c('9S'), c('9H'), c('9S')).pays, 30);
  assert.strictEqual(BJ.twentyOnePlusThree(c('2S'), c('9S'), c('KS')).pays, 5);
});

test('settlement', () => {
  const d = cards => hand(...cards);
  assert.deepStrictEqual(BJ.settle({ cards: d(['AS', 'KH']), bet: 10 }, d(['10S', '9H']), R), { result: 'blackjack', returned: 25 });
  assert.deepStrictEqual(BJ.settle({ cards: d(['AS', 'KH']), bet: 10 }, d(['10S', '9H']), Object.assign({}, R, { bjPayout: 1.2 })), { result: 'blackjack', returned: 22 });
  assert.deepStrictEqual(BJ.settle({ cards: d(['AS', 'KH']), bet: 10 }, d(['AD', 'QH']), R), { result: 'push', returned: 10 });
  assert.deepStrictEqual(BJ.settle({ cards: d(['AS', 'KH']), bet: 10, fromSplit: true }, d(['10S', '10H']), R), { result: 'win', returned: 20 });
  assert.deepStrictEqual(BJ.settle({ cards: d(['10S', '6H']), bet: 10, surrendered: true }, d(['10S', '10H']), R), { result: 'surrender', returned: 5 });
  assert.deepStrictEqual(BJ.settle({ cards: d(['10S', '6H', '9C']), bet: 10 }, d(['10S', '10H', '5D']), R), { result: 'bust', returned: 0 });
  assert.deepStrictEqual(BJ.settle({ cards: d(['10S', '6H']), bet: 10 }, d(['10S', '6D', '8C']), R), { result: 'win', returned: 20 });
  assert.deepStrictEqual(BJ.settle({ cards: d(['10S', '7H']), bet: 10 }, d(['10S', '7D']), R), { result: 'push', returned: 10 });
  assert.deepStrictEqual(BJ.settle({ cards: d(['10S', '7H', '4H']), bet: 10 }, d(['AS', 'QD']), R), { result: 'lose', returned: 0 });
});

test('shoe deals every card and flags the cut card', () => {
  const shoe = new BJ.Shoe(2, 0.75);
  assert.strictEqual(shoe.remaining, 104);
  const seen = new Set();
  for (let i = 0; i < 104; i++) {
    const card = shoe.draw();
    seen.add(card.id);
    if (i + 1 < shoe.cutAt) assert.strictEqual(shoe.needsShuffle, false);
  }
  assert.strictEqual(seen.size, 104);
  assert.strictEqual(shoe.needsShuffle, true);
  shoe.discards.push({ id: 'x', rank: '5', suit: 'S' });
  assert.strictEqual(shoe.draw().id, 'x');
});

test('strategy chart cells', () => {
  assert.strictEqual(BJ.chartCell('soft', 18, '3', R), 'Ds');
  assert.strictEqual(BJ.chartCell('hard', 11, '5', R), 'Dh');
  assert.strictEqual(BJ.chartCell('hard', 16, '10', R), 'Rh');
  assert.strictEqual(BJ.chartCell('pair', 8, '6', R), 'P');
  assert.strictEqual(BJ.chartCell('hard', 12, '2', R), 'H');
});

console.log(`${passed} test groups passed`);
