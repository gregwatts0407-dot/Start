/*
 * academy-content.js — lessons, quizzes and glossary.
 * Tokens inside lesson bodies:
 *   {{c:As Kd}}                inline cards
 *   {{ex:Label|As Kd;Board|..}} a felt "example" box with labelled card groups
 *   {{w:name}}                 an interactive widget (see academy.js)
 */
(function (root) {
  'use strict';

  const TRACKS = [
    { id: 'foundations', title: 'Foundations', blurb: 'The rules, the hands and the flow of the game.' },
    { id: 'strategy', title: 'Core Strategy', blurb: 'The ideas that separate winning players from the rest.' },
    { id: 'advanced', title: 'Advanced Play', blurb: 'Bluffing, tournaments, reading opponents and your mental game.' },
  ];

  const L = [];

  // ------------------------------------------------------------------ 1
  L.push({
    id: 'how-to-play', track: 'foundations', title: 'How a hand of Hold\'em works', minutes: 5,
    summary: 'Blinds, the deal, four betting rounds and the showdown.',
    body: `
<p>Texas Hold'em is played with a standard 52-card deck and 2 to 10 players. Every hand follows the same rhythm, and once you know it the game becomes simple to follow.</p>
<h2>1. The button and the blinds</h2>
<p>A round disc called the <strong>dealer button</strong> marks a nominal dealer and moves one seat clockwise after each hand. The two players to its left post forced bets called <strong>blinds</strong>: the <strong>small blind</strong> (usually half a big blind) and the <strong>big blind</strong>. The blinds guarantee there is always something to win.</p>
<div class="callout"><b>Heads-up exception</b>With only two players, the button posts the small blind and acts first before the flop, but last on every later street.</div>
<h2>2. The deal and preflop betting</h2>
<p>Each player receives two face-down cards, their <strong>hole cards</strong>. The first betting round, <strong>preflop</strong>, starts with the player to the left of the big blind (called "under the gun"). Each player must <strong>fold</strong>, <strong>call</strong> the big blind, or <strong>raise</strong>.</p>
{{ex:Your hole cards|Ah Kh}}
<h2>3. The flop, turn and river</h2>
<p>Next come the shared <strong>community cards</strong>, dealt face up in the middle. Everyone uses them.</p>
<ul>
<li><strong>The flop</strong>: three cards, then a betting round.</li>
<li><strong>The turn</strong>: a fourth card, then a betting round.</li>
<li><strong>The river</strong>: a fifth and final card, then a last betting round.</li>
</ul>
<p>After the flop, betting starts with the first active player to the left of the button. With no bet in front of you, you may <strong>check</strong> (pass) or <strong>bet</strong>.</p>
{{ex:Flop|Kd 7h 2h;Turn|9c;River|Qh}}
<h2>4. The showdown</h2>
<p>If two or more players are left after the river, they reveal their cards. Each player makes the best possible <strong>five-card hand</strong> from their two hole cards plus the five community cards, using any combination: both hole cards, one, or even none.</p>
<p>In the example above, a player holding {{c:Ah Kh}} would have an ace-high <strong>flush</strong> using five hearts: A♥ K♥ Q♥ 7♥ 2♥.</p>
<div class="callout gold"><b>Two ways to win</b>Show down the best hand, or make a bet nobody calls. Most pots are won without a showdown, which is why betting skill matters as much as the cards.</div>
<h2>Try it</h2>
<p>Play a few hands with the coach on. Every time it is your turn, the coach explains what it would do and why.</p>`,
    quiz: [
      { q: 'Who acts first before the flop at a full table?', o: ['The small blind', 'The player left of the big blind', 'The dealer button', 'The big blind'], a: 1, e: 'Preflop, the action starts with the player directly left of the big blind ("under the gun"). The blinds act last because they already put chips in.' },
      { q: 'How many community cards are there by the river?', o: ['3', '4', '5', '7'], a: 2, e: 'Flop (3) + turn (1) + river (1) = 5 community cards.' },
      { q: 'At showdown you must use both of your hole cards.', o: ['True', 'False'], a: 1, e: 'False. You make the best five-card hand from any of the seven cards: both hole cards, one, or none ("playing the board").' },
    ],
  });

  // ------------------------------------------------------------------ 2
  L.push({
    id: 'hand-rankings', track: 'foundations', title: 'Hand rankings', minutes: 6,
    summary: 'Which hands beat which, kickers, and how ties are broken.',
    body: `
<p>Every poker hand is exactly five cards. Hands are ranked by how rare they are; the rarer the hand, the higher it ranks. Learn this ladder by heart.</p>
{{w:ladder}}
<h2>Kickers and ties</h2>
<p>When two players have the same type of hand, the higher cards decide. For a pair, compare the pairs first, then the remaining three cards, the <strong>kickers</strong>, one by one.</p>
{{ex:Board|Kc 9d 6s 3h 2c;Player A|Ks Qd;Player B|Kh Jc}}
<p>Both players have a pair of kings, but A's queen kicker beats B's jack. A wins.</p>
<p>If the best five cards are identical, the pot is <strong>split</strong>. Suits never break ties in Hold'em.</p>
<h2>Common confusions</h2>
<ul>
<li><strong>Flush beats straight.</strong> A flush is rarer.</li>
<li><strong>Only five cards count.</strong> With two pair on board and a pair in your hand you may hold "three pair", but only the best two pairs plus a kicker play.</li>
<li><strong>The ace plays high or low</strong> in a straight: A-2-3-4-5 (the "wheel") is the lowest straight and 10-J-Q-K-A the highest. It cannot wrap around (Q-K-A-2-3 is not a straight).</li>
<li><strong>Playing the board:</strong> if the five community cards are better than anything you can make, everyone remaining splits.</li>
</ul>
<div class="callout"><b>Practice</b>The "Who wins?" and "Name that hand" drills in the Practice Gym will make this automatic within a few minutes.</div>`,
    quiz: [
      { q: 'Which hand is stronger?', o: ['A straight', 'A flush', 'They are equal'], a: 1, e: 'A flush (five cards of one suit) beats a straight (five in a row).' },
      { q: 'Board: {{c:Ah Ad 8c 8s 3d}}. You hold {{c:Kc 2c}}, your opponent holds {{c:Qh Jh}}. Who wins?', o: ['You', 'Your opponent', 'Split pot'], a: 0, e: 'Both of you play aces and eights (two pair) from the board. The fifth card decides: your king beats their queen.' },
      { q: 'Is Q-K-A-2-3 a straight?', o: ['Yes', 'No'], a: 1, e: 'No. The ace can be high (10-J-Q-K-A) or low (A-2-3-4-5) but a straight cannot wrap around the corner.' },
      { q: 'Board: {{c:Td Jd Qd Kd 9c}}. You hold {{c:Ad 2s}}. What do you have?', o: ['A straight', 'A flush', 'A royal flush', 'A straight flush, king high'], a: 2, e: 'A♦ with T♦ J♦ Q♦ K♦ makes 10-J-Q-K-A all in diamonds: a royal flush.' },
    ],
  });

  // ------------------------------------------------------------------ 3
  L.push({
    id: 'betting', track: 'foundations', title: 'Betting and No-Limit rules', minutes: 6,
    summary: 'Check, bet, call, raise, the minimum raise, all-ins and side pots.',
    body: `
<h2>Your options</h2>
<table><tr><th>Action</th><th>When</th><th>What it means</th></tr>
<tr><td><b>Check</b></td><td>No bet to you</td><td>Pass without putting chips in.</td></tr>
<tr><td><b>Bet</b></td><td>No bet to you</td><td>Put chips in that others must match.</td></tr>
<tr><td><b>Call</b></td><td>Facing a bet</td><td>Match the current bet.</td></tr>
<tr><td><b>Raise</b></td><td>Facing a bet</td><td>Increase the bet; others must match the new amount.</td></tr>
<tr><td><b>Fold</b></td><td>Facing a bet</td><td>Give up the hand and any chips already in the pot.</td></tr></table>
<h2>No-Limit means any size, with a minimum</h2>
<p>In No-Limit Hold'em you can bet any amount up to your whole stack at any time. There are minimums:</p>
<ul>
<li>The smallest <strong>bet</strong> is one big blind.</li>
<li>A <strong>raise</strong> must be at least as large as the previous bet or raise on that street. If someone bets 20 and another player raises to 60 (a raise of 40), the next raise must be to at least 100.</li>
</ul>
<p>In this game the bet slider always shows the total you are raising <em>to</em>.</p>
<h2>All-in and side pots</h2>
<p>You can never be forced out of a hand for lack of chips. If you cannot match a bet you can go <strong>all-in</strong> for what you have. You can only win from each opponent as much as you put in yourself; anything beyond that goes into a <strong>side pot</strong> contested by the players who still have chips.</p>
<div class="callout"><b>Example</b>You go all-in for 100. Two opponents each put in 300. The main pot is 300 (100 from each of you), which you can win. The extra 400 forms a side pot only the two opponents can win.</div>
<p>If an all-in is a raise smaller than a full minimum raise, it does <em>not</em> re-open the betting for players who have already acted: they may only call or fold.</p>
<h2>The order of showing</h2>
<p>At showdown, the last player to bet or raise on the river shows first. Here, all remaining hands are revealed automatically so you can learn from every showdown.</p>`,
    quiz: [
      { q: 'Blinds 5/10. A player bets 30 on the flop. What is the minimum legal raise?', o: ['Raise to 40', 'Raise to 60', 'Raise to 45', 'Raise to 90'], a: 1, e: 'The raise must be at least the size of the bet (30), so the minimum is 30 + 30 = 60.' },
      { q: 'You go all-in for 200. One opponent calls with 1,000 behind. How much can you win from them?', o: ['200', '1,000', '1,200', 'Nothing'], a: 0, e: 'You can only win from each opponent as much as you put in: 200 (plus any dead money already in the pot).' },
      { q: 'When can you check?', o: ['Any time', 'Only when nobody has bet in the current round', 'Only on the river', 'Only in the big blind'], a: 1, e: 'You can check only if no bet has been made on the current street (or, preflop, if you are the big blind and nobody raised).' },
    ],
  });

  // ------------------------------------------------------------------ 4
  L.push({
    id: 'position', track: 'foundations', title: 'Position: the hidden advantage', minutes: 6,
    summary: 'Why acting last wins more money, and how to use it.',
    body: `
<p>Position is where you sit relative to the dealer button, and it decides the order of action after the flop. The later you act, the more information you have.</p>
{{w:position}}
<h2>Why acting last is so valuable</h2>
<ul>
<li><strong>Information:</strong> you see whether your opponents check or bet before you decide.</li>
<li><strong>Control:</strong> you can check behind to get a free card, or bet when they show weakness.</li>
<li><strong>Pot size:</strong> you decide whether the pot grows or stays small on each street.</li>
<li><strong>Bluffing:</strong> when opponents check to you, a bet often wins the pot immediately.</li>
</ul>
<h2>The positions</h2>
<table><tr><th>Group</th><th>Seats</th><th>How to play</th></tr>
<tr><td><b>Early</b></td><td>UTG, UTG+1</td><td>Tight. Many players still act behind you.</td></tr>
<tr><td><b>Middle</b></td><td>MP, LJ, HJ</td><td>Moderately tight; widen as you get closer to the button.</td></tr>
<tr><td><b>Late</b></td><td>CO, BTN</td><td>Widest ranges. The button is the best seat at the table.</td></tr>
<tr><td><b>Blinds</b></td><td>SB, BB</td><td>Already invested but out of position after the flop. Defend selectively.</td></tr></table>
<div class="callout gold"><b>Rule of thumb</b>The same hand can be a fold under the gun and a raise on the button. K♠ 9♦ is a fold from early position but a standard open from the button.</div>
<p>The coach always shows your position and adjusts its advice. Watch how the recommended ranges widen as you move toward the button.</p>`,
    quiz: [
      { q: 'Which seat acts last after the flop?', o: ['Big blind', 'Under the gun', 'The button', 'Small blind'], a: 2, e: 'The button acts last on the flop, turn and river, which is why it is the most profitable seat.' },
      { q: 'You hold {{c:Kc 9d}}. In which position is opening with a raise most reasonable?', o: ['Under the gun', 'Middle position', 'The button'], a: 2, e: 'K9 offsuit is too weak to open from early or middle position, but on the button only the blinds are left to act.' },
      { q: 'Why is the small blind a difficult seat?', o: ['It has to act first after the flop', 'It cannot raise', 'It pays the most', 'It acts last preflop'], a: 0, e: 'The small blind is out of position against everyone for the rest of the hand.' },
    ],
  });

  // ------------------------------------------------------------------ 5
  L.push({
    id: 'starting-hands', track: 'strategy', title: 'Starting hands and ranges', minutes: 8,
    summary: 'Which hands to play from each seat, and how to read a range chart.',
    body: `
<p>The most important decision you make is whether to play at all. Good players fold most of their hands preflop, roughly 75–85% of them at a full table.</p>
<h2>The 169 starting hands</h2>
<p>There are 1,326 possible two-card combinations, but only 169 distinct starting hands once you ignore exact suits: 13 pocket pairs, 78 suited hands and 78 offsuit hands. Suited hands appear less often (4 combos each) than offsuit hands (12 combos each); pairs have 6 combos each.</p>
<h2>Thinking in ranges</h2>
<p>A <strong>range</strong> is the set of hands you would play a certain way. Instead of asking "should I play A♣ 9♦?", strong players ask "which hands do I open from this seat?" The chart below shows a solid opening range for each position. Pick a seat to see it change.</p>
{{w:range}}
<h2>Hand categories</h2>
<ul>
<li><strong>Premium</strong> ({{c:As Ad}} {{c:Ks Kd}} {{c:Qs Qd}} {{c:Ah Kh}}): raise and re-raise from any position.</li>
<li><strong>Strong</strong> (JJ–TT, AQ, AJs, KQs): open from most positions; proceed with care against heavy action.</li>
<li><strong>Speculative</strong> (small pairs, suited connectors like {{c:8h 7h}}, suited aces): best in position and in multiway pots, because they can make big hands.</li>
<li><strong>Trouble hands</strong> (KJo, QTo, A9o): look pretty but often lose to better versions of themselves ("domination").</li>
</ul>
<div class="callout"><b>Domination</b>A♠ 9♦ against A♥ K♣ wins only about 26% of the time: when you both hit an ace, the better kicker usually wins. Hands that share a card with a stronger hand are "dominated".</div>
<h2>Suited isn't magic</h2>
<p>Being suited adds only about 2–3% equity. J♥ 4♥ is still a weak hand. Connectedness and high cards matter more.</p>
<h2>Facing a raise</h2>
<p>You need a stronger hand to call a raise than to open yourself (this is the "gap concept"). The raiser is showing strength, and you no longer have the chance to win the blinds uncontested. Re-raise (3-bet) your best hands and fold most of the rest.</p>`,
    quiz: [
      { q: 'How many distinct starting hands are there in Hold\'em?', o: ['52', '169', '1,326', '2,652'], a: 1, e: '169 distinct hands (13 pairs, 78 suited, 78 offsuit), made up of 1,326 exact two-card combinations.' },
      { q: 'How much equity does being suited add, roughly?', o: ['About 2–3%', 'About 10%', 'About 20%', 'It doubles your chances'], a: 0, e: 'Only about 2–3%. Suitedness helps, but it does not turn a weak hand into a good one.' },
      { q: 'You hold {{c:As 9d}}. A tight player raises from early position. What is usually right?', o: ['Re-raise', 'Call', 'Fold'], a: 2, e: 'A9 offsuit is dominated by most hands in a tight early-position range (AJ, AQ, AK). Fold.' },
    ],
  });

  // ------------------------------------------------------------------ 6
  L.push({
    id: 'pot-odds', track: 'strategy', title: 'Pot odds and equity', minutes: 8,
    summary: 'The one formula that tells you whether a call makes money.',
    body: `
<p>Every time you face a bet, you are being offered a price. <strong>Pot odds</strong> tell you what that price is, and <strong>equity</strong> tells you whether it is worth paying.</p>
<h2>Equity</h2>
<p>Your equity is your share of the pot, on average, if the hand were played out many times. A flush draw on the flop against one pair has about 35% equity: it wins about 35 times in 100.</p>
<h2>Pot odds</h2>
<p>Compare what you must call with what you can win:</p>
<div class="formula">Equity needed = call ÷ (pot after your call)</div>
<div class="callout"><b>Example</b>The pot is 100. Your opponent bets 50, making it 150. You must call 50 to win 150. After your call the pot is 200, so you need 50 ÷ 200 = <strong>25%</strong> equity. These are 3-to-1 pot odds.</div>
<p>If your equity is higher than what you need, calling is profitable in the long run, even though you will lose most individual times.</p>
<h2>Bet sizes you will see all the time</h2>
<table><tr><th>Opponent bets</th><th>You need</th></tr>
<tr><td>¼ pot</td><td>16.7%</td></tr>
<tr><td>⅓ pot</td><td>20%</td></tr>
<tr><td>½ pot</td><td>25%</td></tr>
<tr><td>⅔ pot</td><td>28.6%</td></tr>
<tr><td>¾ pot</td><td>30%</td></tr>
<tr><td>Pot</td><td>33.3%</td></tr>
<tr><td>2× pot</td><td>40%</td></tr></table>
{{w:potodds}}
<h2>Implied odds</h2>
<p>Pot odds only count the money already in the pot. When you hit your draw you often win <em>more</em> on later streets. These <strong>implied odds</strong> let you call slightly more than raw pot odds justify, especially with deep stacks and well-hidden draws. The reverse also exists: <strong>reverse implied odds</strong>, when hitting your hand still loses you a big pot (for example, making a small flush against a bigger one).</p>
<div class="callout gold"><b>In the game</b>The coach panel shows your equity against your opponents' likely ranges with a white break-even line. Green bar past the line: the call is profitable. Red: it isn't.</div>`,
    quiz: [
      { q: 'The pot is 60. Your opponent bets 30. What equity do you need to call?', o: ['20%', '25%', '33%', '50%'], a: 1, e: 'You call 30 to win 90 (60 + 30). After your call the pot is 120: 30 ÷ 120 = 25%.' },
      { q: 'Your opponent makes a pot-sized bet. What equity do you need?', o: ['25%', '33%', '50%', '66%'], a: 1, e: 'You call 1 pot to win 2 pots; after calling the pot is 3 pots: 1 ÷ 3 ≈ 33%.' },
      { q: 'You need 25% equity and have 35%. Calling is…', o: ['Profitable in the long run', 'A mistake', 'Exactly break-even'], a: 0, e: 'Your equity exceeds the price, so the call earns money over time even though you lose about 65% of the time.' },
    ],
  });

  // ------------------------------------------------------------------ 7
  L.push({
    id: 'outs', track: 'strategy', title: 'Outs and the rule of 2 and 4', minutes: 7,
    summary: 'Count the cards that win, and turn them into a percentage in seconds.',
    body: `
<p>An <strong>out</strong> is an unseen card that improves your hand to one you expect to win. Counting outs is the fastest way to estimate equity at the table.</p>
{{ex:Your hand|Ah Kh;Flop|Qh 7h 2c}}
<p>You have a flush draw. There are 13 hearts and you can see 4 of them, so <strong>9 hearts</strong> remain: 9 outs.</p>
<h2>Common draws</h2>
<table><tr><th>Draw</th><th>Outs</th><th>Flop → river</th><th>Turn → river</th></tr>
<tr><td>Flush draw</td><td>9</td><td>35%</td><td>19.6%</td></tr>
<tr><td>Open-ended straight draw</td><td>8</td><td>31.5%</td><td>17.4%</td></tr>
<tr><td>Gutshot straight draw</td><td>4</td><td>16.5%</td><td>8.7%</td></tr>
<tr><td>Two overcards</td><td>6</td><td>24.1%</td><td>13%</td></tr>
<tr><td>Flush draw + open-ender</td><td>15</td><td>54.1%</td><td>32.6%</td></tr>
<tr><td>Pocket pair to a set</td><td>2</td><td>8.4%</td><td>4.3%</td></tr></table>
<h2>The rule of 4 and 2</h2>
<div class="formula">On the flop (two cards to come): outs × 4 ≈ %<br>On the turn (one card to come): outs × 2 ≈ %</div>
<p>9 outs on the flop: 9 × 4 = 36% (true value 35%). On the turn: 9 × 2 = 18% (true value 19.6%). The rule overestimates big draws a little: with more than 8 outs on the flop, subtract (outs − 8). For 15 outs: 60 − 7 = 53%.</p>
<div class="callout"><b>Careful with "×4"</b>The flop figure assumes you will see both the turn and the river, i.e. you are all-in or expect no more betting. If you face a bet on the flop and more bets are coming on the turn, think one card at a time (×2).</div>
<h2>Dirty outs</h2>
<p>Not every out is clean. If the card that completes your straight also puts a third heart on the board, an opponent may make a flush. Discount outs that could give someone a better hand.</p>
{{w:outs}}
<h2>Putting it together</h2>
<p>Turn: the pot is 100 and your opponent bets 50. You need 25%. With a flush draw you have about 19.6%. Without implied odds this is a fold, but with deep stacks and a strong chance of being paid, a call becomes close.</p>`,
    quiz: [
      { q: 'You hold {{c:9s 8s}} on a flop of {{c:7d 6c 2h}}. How many outs do you have to a straight?', o: ['4', '6', '8', '9'], a: 2, e: 'Any 10 or 5 completes the straight: 4 + 4 = 8 outs (an open-ended straight draw).' },
      { q: 'Using the rule of 2, roughly how likely is a 9-out draw to hit on the river?', o: ['9%', '18%', '27%', '36%'], a: 1, e: '9 × 2 = 18% (the exact figure is 19.6%).' },
      { q: 'You hold {{c:Jc Tc}} on {{c:Qc 9d 4c}}. Roughly what is your equity to make a straight or flush by the river?', o: ['About 30%', 'About 45%', 'About 54%', 'About 70%'], a: 2, e: 'Flush draw (9) + open-ended straight draw (K or 8, minus the K♣ and 8♣ already counted = 6) = 15 outs ≈ 54%.' },
    ],
  });

  // ------------------------------------------------------------------ 8
  L.push({
    id: 'aggression', track: 'strategy', title: 'Aggression and the initiative', minutes: 7,
    summary: 'Why betting and raising beat checking and calling.',
    body: `
<p>Winning players bet and raise much more often than they call. The reason is simple: <strong>a bet can win in two ways, a call in only one.</strong></p>
<ul><li>When you bet, you win if everyone folds <em>or</em> if you have the best hand at showdown.</li>
<li>When you call, you can only win by having the best hand.</li></ul>
<p>The extra chance to win from folds is called <strong>fold equity</strong>.</p>
<h2>Raise, don't limp</h2>
<p>Limping means just calling the big blind preflop. It invites everyone in and gives up the initiative. Opening with a raise (2.5–3 big blinds) wins the blinds outright some of the time, thins the field and lets you keep betting after the flop.</p>
<h2>The continuation bet</h2>
<p>If you raised before the flop, your opponent expects strong hands from you. Betting the flop again, a <strong>c-bet</strong>, wins often even when you missed, because most flops miss most hands: an unpaired hand misses the flop about two-thirds of the time.</p>
<div class="callout"><b>Small on dry boards</b>On a dry flop like {{c:Kd 7c 2s}} a bet of about a third of the pot works as well as a large one. On wet boards like {{c:9h 8h 6c}} bet bigger, or check more often, because your opponent connects more.</div>
<h2>The 3-bet</h2>
<p>A re-raise before the flop is a <strong>3-bet</strong> (the blind is the first bet, the open the second). 3-bet your best hands for value. Strong players also 3-bet some hands that play well but are not quite good enough to call, such as suited aces, so their range is not just premium pairs.</p>
<h2>Semi-bluffs</h2>
<p>A <strong>semi-bluff</strong> is a bet with a hand that is probably behind now but has good outs, like a flush draw. You may win immediately, and if called you can still make the best hand. Semi-bluffs are the most profitable bluffs in poker.</p>
<div class="callout gold"><b>But not against everyone</b>Fold equity needs opponents who fold. Against a calling station, cut the bluffs and bet your real hands bigger.</div>`,
    quiz: [
      { q: 'What is fold equity?', o: ['The chips you save by folding', 'The extra value a bet gains from opponents folding', 'Your equity after folding', 'A side pot'], a: 1, e: 'Fold equity is the value of making opponents fold hands that might have won.' },
      { q: 'Which is a semi-bluff?', o: ['Betting the nuts', 'Betting a flush draw on the flop', 'Betting the river with nothing', 'Calling with a gutshot'], a: 1, e: 'A semi-bluff is a bet with a hand that is behind but can improve, such as a flush draw.' },
      { q: 'Against an opponent who almost never folds, you should…', o: ['Bluff more', 'Bluff less and value-bet more', 'Only check', 'Always go all-in'], a: 1, e: 'Bluffs need folds. Against calling stations, bet your good hands for value and give up your bluffs.' },
    ],
  });

  // ------------------------------------------------------------------ 9
  L.push({
    id: 'value-betting', track: 'strategy', title: 'Value betting and bet sizing', minutes: 7,
    summary: 'Get paid with your good hands and choose the right size.',
    body: `
<p>Most of your profit comes from strong hands. The question is how to get the most from them.</p>
<h2>What is a value bet?</h2>
<p>A <strong>value bet</strong> is a bet you make because worse hands will call. Before betting, ask: <em>"if I bet, which worse hands call me?"</em> If you can name several, bet. If only better hands call (and worse ones fold), checking is often better.</p>
{{ex:Your hand|Ks Qd;Board|Kh 8c 4d 2s}}
<p>Top pair, good kicker. Worse kings, eights and draws will call a bet. Bet for value.</p>
<h2>Thin value</h2>
<p>Beginners only bet very strong hands. Good players also bet hands like second pair or top pair with a weak kicker on safe boards, when they expect calls from worse. That is <strong>thin value</strong>, and it adds up.</p>
<h2>Choosing a size</h2>
<table><tr><th>Size</th><th>Use it when</th></tr>
<tr><td>⅓ pot</td><td>Dry boards, c-bets, thin value, when you want calls from many weak hands.</td></tr>
<tr><td>½–⅔ pot</td><td>Your everyday size for value and protection.</td></tr>
<tr><td>¾ pot – pot</td><td>Wet boards with many draws, or very strong hands against players who call a lot.</td></tr>
<tr><td>Overbet</td><td>Advanced: when your range is much stronger than theirs.</td></tr></table>
<h2>Protection</h2>
<p>On a wet board such as {{c:Jh Th 4c}} with an overpair, bet larger. Draws are calling, and you want them to pay the wrong price.</p>
<h2>Pot control</h2>
<p>With medium-strength hands (middle pair, weak top pair) you often prefer a smaller pot. Checking behind or betting small keeps the pot manageable when you are unsure.</p>
<div class="callout gold"><b>Don't telegraph</b>If you always bet big with monsters and small with bluffs, observant players will notice. Pick sizes based on the board and your range, not just your current hand.</div>`,
    quiz: [
      { q: 'A value bet is profitable when…', o: ['Better hands fold', 'Worse hands call', 'Everyone folds', 'You have the nuts only'], a: 1, e: 'A value bet makes money when worse hands call it.' },
      { q: 'On a very wet board with a strong hand, you should generally bet…', o: ['Smaller', 'Larger', 'Nothing — check'], a: 1, e: 'Bigger bets charge draws more and protect your hand.' },
      { q: 'You have middle pair on a scary board. A common approach is…', o: ['Pot control: check or bet small', 'Always shove', 'Always fold'], a: 0, e: 'Medium hands play well in small pots. Keep the pot manageable.' },
    ],
  });

  // ------------------------------------------------------------------ 10
  L.push({
    id: 'board-texture', track: 'strategy', title: 'Board texture and reading ranges', minutes: 7,
    summary: 'Dry vs wet boards, range advantage and putting opponents on hands.',
    body: `
<p>The same hand can be strong on one flop and weak on another. Reading the board, its <strong>texture</strong>, is the first step after the flop.</p>
<h2>Dry boards</h2>
{{ex:Dry|Kd 7c 2s}}
<p>Disconnected, different suits, few draws. Whoever has the best hand now usually still has it on the river. Small bets work well and bluffs succeed often.</p>
<h2>Wet boards</h2>
{{ex:Wet|9h 8h 6c}}
<p>Connected and two-toned: many straight and flush draws, and the best hand can change on every card. Bet bigger for protection, and be careful with one-pair hands.</p>
<h2>Other features</h2>
<ul><li><strong>Paired boards</strong> ({{c:Qs Qd 5c}}): fewer strong hands are possible; bluffs and small bets work.</li>
<li><strong>Monotone boards</strong> ({{c:Ah 8h 3h}}): anyone with one heart has a draw; a made flush is possible already.</li>
<li><strong>High-card boards</strong> favour the preflop raiser, who has more big cards in their range.</li></ul>
<h2>Thinking in ranges</h2>
<p>Instead of guessing one exact hand, list everything your opponent could hold given their actions:</p>
<ol><li>What did they do preflop? A tight early-position raise means big pairs and big aces.</li>
<li>How does the flop hit that range?</li>
<li>Which hands would bet, call or check-raise like this?</li></ol>
<div class="callout"><b>Range advantage</b>On {{c:As Kd 4c}} the preflop raiser has many more strong hands (AA, KK, AK) than the big blind who called. The raiser can bet often. On {{c:7h 6h 5c}}, the caller's range hits much harder.</div>
<p>The coach estimates every opponent's range from their actions and shows it in the panel, for example "opening range, then bet". Compare your own read with it.</p>`,
    quiz: [
      { q: 'Which flop is the wettest?', o: ['{{c:Kd 7c 2s}}', '{{c:Jh Th 9c}}', '{{c:As As 4d}}'], a: 1, e: 'J-T-9 with two hearts is connected and two-tone: straight and flush draws everywhere.' },
      { q: 'On a dry, high-card flop, who usually has the range advantage?', o: ['The preflop raiser', 'The big blind caller', 'Neither'], a: 0, e: 'The raiser has more big pairs and big aces, which connect with high-card boards.' },
      { q: 'What is the first step in putting an opponent on a range?', o: ['Their bet size on the river', 'Their preflop action', 'Their chip stack colour'], a: 1, e: 'Start from what they did preflop, then narrow the range street by street.' },
    ],
  });

  // ------------------------------------------------------------------ 11
  L.push({
    id: 'bluffing', track: 'advanced', title: 'Bluffing well', minutes: 8,
    summary: 'The maths of bluffs, picking good spots and telling a believable story.',
    body: `
<p>A bluff is a bet with a hand that will almost never win at showdown. It only works if your opponent folds, so choose your spots carefully.</p>
<h2>The maths</h2>
<div class="formula">A bluff breaks even if it works: bet ÷ (pot + bet) of the time</div>
<p>Bet half the pot and you need folds 33% of the time. A pot-sized bet needs 50%.</p>
{{w:bluff}}
<h2>Good bluffing spots</h2>
<ul><li><strong>Your story makes sense.</strong> Your actions on earlier streets should be consistent with the strong hand you represent.</li>
<li><strong>Scare cards.</strong> An ace or a flush-completing card on the turn or river is a good card to bet if your range has more of those hands than theirs.</li>
<li><strong>Weak-looking opponents.</strong> If they checked twice, they often have little.</li>
<li><strong>Few opponents.</strong> Bluffing one player is far easier than bluffing three.</li>
<li><strong>Blockers.</strong> Holding the A♥ on a three-heart board means your opponent cannot have the nut flush, which makes a bluff more credible.</li></ul>
<h2>Bad bluffing spots</h2>
<ul><li>Against calling stations (they call anyway).</li>
<li>When your story doesn't add up.</li>
<li>Multiway pots.</li>
<li>When your hand has decent showdown value: just check it down.</li></ul>
<div class="callout gold"><b>Bluff with draws first</b>Semi-bluffs on the flop and turn are the safest bluffs because you can still win when called. Pure river bluffs are higher risk and should be chosen carefully.</div>`,
    quiz: [
      { q: 'You bluff with a pot-sized bet. How often must it work to break even?', o: ['25%', '33%', '50%', '66%'], a: 2, e: 'You risk 1 pot to win 1 pot: it must succeed 1 ÷ 2 = 50% of the time.' },
      { q: 'Which opponent is the worst to bluff?', o: ['A tight Rock', 'A Calling Station', 'A tight-aggressive regular'], a: 1, e: 'Calling stations call far too much, so bluffs lose money against them.' },
      { q: 'What is a blocker?', o: ['A card in your hand that makes certain opponent hands impossible', 'A big bet', 'A player in the blinds'], a: 0, e: 'Holding a card your opponent would need (like the A♥ for the nut flush) reduces the strong hands they can have.' },
    ],
  });

  // ------------------------------------------------------------------ 12
  L.push({
    id: 'tournament', track: 'advanced', title: 'Tournament strategy', minutes: 8,
    summary: 'Stack sizes, rising blinds, push/fold and the bubble.',
    body: `
<p>In a tournament everyone starts with the same chips, the blinds keep rising, and you cannot rebuy. Your stack size measured in <strong>big blinds</strong> drives almost every decision.</p>
<h2>Stack-size zones</h2>
<table><tr><th>Stack</th><th>Approach</th></tr>
<tr><td>40+ bb</td><td>Deep: play normal poker. Speculative hands gain value.</td></tr>
<tr><td>20–40 bb</td><td>Medium: open-raise and 3-bet, fewer speculative calls.</td></tr>
<tr><td>12–20 bb</td><td>Short: re-shoving all-in over opens is a strong weapon.</td></tr>
<tr><td>Under 12 bb</td><td>Push or fold: either go all-in or fold. Small raises waste chips.</td></tr></table>
<h2>Push or fold</h2>
<p>With 10 big blinds, raising to 2.5bb and folding to a shove loses a quarter of your stack. Moving all-in instead puts maximum pressure on opponents and uses fold equity. The shorter your stack and the later your position, the wider you can shove.</p>
<div class="callout"><b>The coach knows</b>When you are short, the coach switches to push/fold advice and tells you roughly which part of the range you can shove from your seat.</div>
<h2>Antes</h2>
<p>As antes kick in, the pot before the flop gets bigger, so stealing the blinds becomes more valuable. Open wider from late position.</p>
<h2>The bubble and ICM</h2>
<p>Prizes are usually paid to the top few finishers. Near the money (the <strong>bubble</strong>), the chips you could lose are worth more than the chips you could win, because busting means winning nothing. This is the core idea behind the <strong>Independent Chip Model (ICM)</strong>:</p>
<ul><li>Medium stacks should avoid big confrontations with big stacks.</li>
<li>Big stacks can attack medium stacks relentlessly.</li>
<li>Short stacks must still shove, or the blinds will eat them.</li></ul>
<h2>Late stages</h2>
<p>With fewer players, hand values go up: when four-handed, the button is effectively a late position with only three players to get through. Widen your ranges as the table shrinks.</p>`,
    quiz: [
      { q: 'With 8 big blinds in the cutoff and everyone folding to you with {{c:Ah 9c}}, the standard play is…', o: ['Fold', 'Min-raise', 'All-in', 'Limp'], a: 2, e: 'Under ~12bb, push or fold. A9o is a clear shove from the cutoff with 8 big blinds.' },
      { q: 'On the bubble, chips you might lose are worth…', o: ['Less than chips you might win', 'More than chips you might win', 'Exactly the same'], a: 1, e: 'Busting wins nothing, so losing chips hurts more than winning them helps. That is the key idea of ICM.' },
      { q: 'As the table gets shorter, your opening ranges should…', o: ['Get wider', 'Get tighter', 'Stay the same'], a: 0, e: 'Fewer opponents means less chance someone has a big hand, and the blinds come round faster.' },
    ],
  });

  // ------------------------------------------------------------------ 13
  L.push({
    id: 'opponents', track: 'advanced', title: 'Reading opponents and player types', minutes: 7,
    summary: 'VPIP, PFR and the five player types you will meet at every table.',
    body: `
<p>You will rarely see your opponents' cards, but you can always see how they play. Two numbers describe most players.</p>
<ul><li><strong>VPIP</strong> (voluntarily put money in pot): how often they play a hand preflop.</li>
<li><strong>PFR</strong> (preflop raise): how often they raise preflop.</li></ul>
<p>Tap any player at the table to see these stats for your session.</p>
<h2>The player types</h2>
<table><tr><th>Type</th><th>VPIP / PFR</th><th>How to beat them</th></tr>
<tr><td><b>Rock</b></td><td>10 / 7</td><td>Steal their blinds constantly; fold to their big bets.</td></tr>
<tr><td><b>Tight-aggressive</b></td><td>20 / 16</td><td>A solid winner. Avoid marginal fights; pick on weaker players instead.</td></tr>
<tr><td><b>Loose-aggressive</b></td><td>32 / 26</td><td>Call down lighter, trap with strong hands, 3-bet them for value.</td></tr>
<tr><td><b>Calling Station</b></td><td>50 / 10</td><td>Never bluff. Value-bet thinner and bigger.</td></tr>
<tr><td><b>Maniac</b></td><td>60 / 50</td><td>Tighten up, let them bluff, and call with strong hands.</td></tr></table>
<div class="callout"><b>Meet the bots</b>Every computer opponent in this game is one of these types (plus the strong "Shark" and the "Novice"). Turn on <em>Reveal bot personalities</em> in Settings to practise exploiting each one, or turn it off and work them out from the stats.</div>
<h2>Bet-sizing and timing tells</h2>
<ul><li>Many weaker players bet big with strong hands and small with draws or bluffs.</li>
<li>A sudden large raise from a passive player is almost always strength.</li>
<li>Patterns over many hands matter more than any single hand.</li></ul>
<h2>Aggression factor</h2>
<p><strong>AF</strong> = (bets + raises) ÷ calls after the flop. Above 3 is very aggressive; below 1 is passive. Passive players' bets deserve more respect.</p>`,
    quiz: [
      { q: 'A player has VPIP 55% and PFR 8%. They are most likely…', o: ['A Rock', 'A Calling Station', 'A Maniac', 'A tight-aggressive regular'], a: 1, e: 'Plays lots of hands but rarely raises: loose-passive, a calling station.' },
      { q: 'Against a Maniac, a good adjustment is…', o: ['Bluff them often', 'Tighten up and call down with strong hands', 'Fold everything'], a: 1, e: 'Maniacs bet with weak hands. Let them bluff into your strong hands.' },
      { q: 'A very passive player suddenly raises big on the river. This usually means…', o: ['A bluff', 'A very strong hand', 'Nothing'], a: 1, e: 'Passive players rarely raise without a strong hand.' },
    ],
  });

  // ------------------------------------------------------------------ 14
  L.push({
    id: 'mental-game', track: 'advanced', title: 'Mental game and bankroll', minutes: 6,
    summary: 'Variance, tilt, results-oriented thinking and protecting your bankroll.',
    body: `
<h2>Variance is normal</h2>
<p>Poker mixes skill with a lot of short-term luck. A winning player can lose for thousands of hands; a losing player can win a tournament. Judge yourself on <strong>decisions</strong>, not results.</p>
<div class="callout"><b>Results-oriented thinking</b>Calling all-in with A♠ A♥ against K♣ K♦ and losing was still a great decision: you were about 82% to win. The coach's hand reviews grade decisions, not outcomes, for exactly this reason.</div>
<h2>Tilt</h2>
<p><strong>Tilt</strong> is when emotion takes over your decisions, usually after a bad beat. Signs: playing too many hands, chasing losses, making hero calls you know are bad.</p>
<ul><li>Notice it early: a tight jaw or racing thoughts are your warning signs.</li>
<li>Take a break. A five-minute walk saves stacks.</li>
<li>Set stop-loss limits before you play.</li>
<li>Remember: the cards have no memory.</li></ul>
<h2>Bankroll management</h2>
<p>Your bankroll is money set aside only for poker. Keep enough buy-ins to survive normal downswings:</p>
<table><tr><th>Format</th><th>Suggested buy-ins</th></tr>
<tr><td>Cash games</td><td>20–40 buy-ins for your stake</td></tr>
<tr><td>Sit &amp; Go tournaments</td><td>50–100 buy-ins</td></tr>
<tr><td>Large tournaments</td><td>100+ buy-ins</td></tr></table>
<p>Move down in stakes when your bankroll shrinks. It isn't failure; it is how good players stay in the game.</p>
<h2>Keep improving</h2>
<ul><li>Review your biggest hands after each session (the coach's review card helps).</li>
<li>Focus on one leak at a time.</li>
<li>Use the Practice Gym to drill the maths until it is instant.</li></ul>`,
    quiz: [
      { q: 'You get all-in with the best hand and lose. Was it a mistake?', o: ['Yes, the result proves it', 'No, decisions matter, not single results', 'Only if it was a big pot'], a: 1, e: 'Getting your money in as the favourite is correct. Over time, good decisions win.' },
      { q: 'A reasonable bankroll for cash games is…', o: ['2 buy-ins', '5 buy-ins', '20–40 buy-ins', 'All your savings'], a: 2, e: '20–40 buy-ins helps you survive normal swings without going broke.' },
      { q: 'The best response to tilt is…', o: ['Play more hands to win it back', 'Take a break', 'Move up in stakes'], a: 1, e: 'Step away, reset, and come back when you can make clear decisions.' },
    ],
  });

  const GLOSSARY = [
    ['3-bet', 'The first re-raise before the flop (the big blind counts as the first bet, the open as the second).'],
    ['All-in', 'Betting all your remaining chips.'],
    ['Big blind (BB)', 'The larger forced bet, posted two seats left of the button. Also the unit stacks are measured in ("50bb").'],
    ['Blocker', 'A card you hold that reduces the combinations of a hand your opponent can have.'],
    ['Board', 'The community cards.'],
    ['Button (BTN)', 'The dealer position; acts last after the flop.'],
    ['C-bet', 'Continuation bet: betting the flop after raising preflop.'],
    ['Calling station', 'A player who calls too often and rarely folds or raises.'],
    ['Check-raise', 'Checking, then raising after an opponent bets.'],
    ['Cutoff (CO)', 'The seat to the right of the button.'],
    ['Domination', 'When your hand shares a card with a stronger hand (A9 vs AK) and rarely wins.'],
    ['Draw', 'A hand that needs more cards to become strong, such as a flush or straight draw.'],
    ['Effective stack', 'The smaller of the two stacks in a confrontation: the most that can be won or lost.'],
    ['Equity', 'Your share of the pot on average: your chance to win, counting ties.'],
    ['Fold equity', 'The value a bet gains from making opponents fold.'],
    ['Gutshot', 'A straight draw needing one specific rank (4 outs).'],
    ['ICM', 'Independent Chip Model: converts tournament chips into prize-money value.'],
    ['Implied odds', 'Extra money you expect to win on later streets if you hit.'],
    ['Kicker', 'An unpaired side card used to break ties.'],
    ['Limp', 'Just calling the big blind preflop instead of raising.'],
    ['Nuts', 'The best possible hand given the board.'],
    ['Open-ended straight draw', 'Four in a row needing a card at either end (8 outs).'],
    ['Outs', 'Unseen cards that improve your hand to a likely winner.'],
    ['Overpair', 'A pocket pair higher than every card on the board.'],
    ['Pot odds', 'The price of a call relative to the pot, expressed as the equity you need.'],
    ['PFR', 'Preflop raise %: how often a player raises before the flop.'],
    ['Range', 'All the hands a player could have in a given situation.'],
    ['Semi-bluff', 'A bet with a drawing hand that can win by folds or by improving.'],
    ['Set', 'Three of a kind made with a pocket pair.'],
    ['Side pot', 'A separate pot for chips an all-in player cannot match.'],
    ['SPR', 'Stack-to-pot ratio: effective stack ÷ pot. Low SPR makes it easier to commit.'],
    ['Tilt', 'Playing emotionally after bad luck or frustration.'],
    ['UTG', '"Under the gun": first to act preflop.'],
    ['Value bet', 'A bet made to be called by worse hands.'],
    ['VPIP', 'How often a player voluntarily puts money in the pot preflop.'],
    ['Wet board', 'A coordinated board with many draws.'],
  ];

  const DRILLS = [
    { id: 'showdown', icon: '🃏', title: 'Who wins?', blurb: 'Read two hands on a full board and pick the winner.' },
    { id: 'name', icon: '🏷️', title: 'Name that hand', blurb: 'Find the best five-card hand from seven cards.' },
    { id: 'outs', icon: '🎯', title: 'Count the outs', blurb: 'How many cards complete your straight or flush?' },
    { id: 'potodds', icon: '⚖️', title: 'Pot odds', blurb: 'What equity do you need to call this bet?' },
    { id: 'callfold', icon: '🤔', title: 'Call or fold?', blurb: 'Combine outs and pot odds into a decision.' },
    { id: 'preflop', icon: '🪑', title: 'Open or fold?', blurb: 'Pick the right preflop play from every seat.' },
    { id: 'equity', icon: '📊', title: 'Equity estimator', blurb: 'Guess how often your hand wins against theirs.' },
  ];

  root.AcademyContent = { TRACKS, lessons: L, GLOSSARY, DRILLS };
})(window);
