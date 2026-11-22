# Felt Hold'em

No-Limit Texas Hold'em for the browser, with computer opponents that have real personalities, a live coach that explains every decision, and an academy that teaches the game from the first hand to tournament strategy. Plain HTML, CSS and JavaScript: no build step and no dependencies.

## Play

- **Single player, pass & play, academy:** open `poker/index.html` in a browser, or serve the folder (`python3 -m http.server`).
- **Online with friends:** run the bundled server (Node.js 18+, nothing to install):

  ```sh
  cd poker
  node server.js          # or: npm start
  ```

  Open <http://localhost:8080>, choose **Play Online**, create a room and share the 5-letter code or link. Friends on your network join at your machine's address (for example `http://192.168.1.20:8080`). Set `PORT` to change the port.

## Modes

| Mode | What it is |
|------|------------|
| Quick Play / Cash Game | 1–8 bots, easy / medium / hard tables. Rebuy whenever you bust; busted bots are replaced by new players. |
| Sit & Go | Rising blinds (and antes), standard / turbo / deep structures. Play until one player has every chip. |
| Pass & Play | 2–9 people on one device, with optional bots. A privacy screen hides each player's cards until they tap to reveal them. |
| Play Online | Private rooms for up to 9, cash or Sit & Go, a turn timer, chat and emotes, and bots to fill empty seats. The server deals and hides every hand; each browser only ever receives its own cards. |

## The coach

On your turn the coach (the owl) recommends an action, marks it on the buttons as **Coach pick**, and explains why:

- equity against each opponent's *estimated range* (narrowed by what they did preflop and on each street), compared with the pot odds you're getting
- position-based preflop ranges, push/fold advice when you're short-stacked, 3-bet and 4-bet ranges
- outs and draws (rule of 2 and 4), board texture, stack-to-pot ratio
- opponent reads from session HUD stats (VPIP, PFR, AF). Tap any player to see them.

After each hand it grades your decisions (*Great* to *Blunder*), estimates how many chips a mistake cost, and links the lesson that helps most. It can warn you before a costly error. Modes: **Always on**, **On request** (press **H** for a hint) or **Off**.

## The academy

- **14 lessons** in three tracks (Foundations, Core Strategy, Advanced Play), each with interactive widgets (hand-ranking ladder, opening-range chart by seat, pot-odds calculator, outs explorer, bluff break-even slider) and a quiz.
- **Practice Gym:** endless drills for "who wins?", naming hands, counting outs, pot odds, call-or-fold decisions, preflop open-or-fold, and equity estimation, with streaks and accuracy tracking.
- XP and ranks, a glossary, and lifetime stats including a results chart and coach-grade breakdown.

## Keyboard

`F` fold · `C` check/call · `R`/`Enter` bet/raise · `A` set raise to all-in · `↑`/`↓` change size · `H` coach · `L` hand history · `Space` deal next hand (when auto-deal is off).

## Code

| File | Purpose |
|------|---------|
| `js/cards.js` | Cards, seeded RNG, fast 5–7 card hand evaluator, starting-hand classes |
| `js/engine.js` | Rules engine: blinds and antes, heads-up order, min-raise and incomplete all-in rules, uncalled bets, side pots, split pots, tournaments. Shared by browser and server. |
| `js/equity.js` | Monte Carlo equity against weighted ranges, exact heads-up enumeration, outs, draws, board texture |
| `js/preflop-data.js` | Generated equities for all 169 starting hands (`node tools/gen-preflop.js`) |
| `js/ai.js` | Bot personalities (Rock, TAG, LAG, Calling Station, Maniac, Shark, Novice) and range estimation |
| `js/coach.js` | Advice, explanations, grading and mistake warnings |
| `js/table.js`, `js/controller.js`, `js/coach-panel.js` | Table rendering and animation, action dock, coach panel, local game loop |
| `js/academy*.js` | Lesson content, widgets, quizzes and drills |
| `js/net.js`, `server.js` | Online lobby and the zero-dependency multiplayer server (Server-Sent Events + JSON) |

Run the tests with `npm test` (or `node --test test/*.test.js`). They cover the hand evaluator, betting rules, side pots, tournaments, a fuzz test of thousands of bot hands that checks chip conservation and legal actions, equity and outs, and coach output. `node tools/bot-stats.js` prints each bot personality's VPIP, PFR and win rate from simulated games.
