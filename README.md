# Tower Defense

A browser tower-defense game. It uses plain HTML, CSS and JavaScript, so there is no build step and nothing to install.

## Play

Open `index.html` in a browser, or serve the folder (for example `python3 -m http.server`) and visit it.

- Pick a tower in the side panel (or press `1`–`4`), then click a grass tile to build it.
- Click a placed tower to upgrade its **damage** or **fire rate** (3 levels each), or sell it for 70% of what you spent.
- Press **Start Wave** (or `Space`) to send the next wave. Each kill earns gold, and clearing a wave adds a bonus.
- Creeps that reach the exit cost lives (tanks cost 2, bosses 5). Survive all 15 waves to win.
- `P` pauses, the speed button cycles between 1x, 2x and 3x, and `Esc` or right-click cancels a selection.

## Towers

| Tower  | Cost | Range | Notes                          |
|--------|------|-------|--------------------------------|
| Arrow  | 50   | 110   | Cheap, fast single-target      |
| Cannon | 100  | 90    | Slow, deals splash damage      |
| Frost  | 80   | 95    | Slows creeps by 50%            |
| Sniper | 150  | 230   | Long range, heavy hits         |

# Platformer

A side-scrolling platformer in `platformer/`, also plain HTML, CSS and JavaScript. Open `platformer/index.html` to play.

- Move with the arrow keys or `A`/`D`. Jump with `Space`, `↑`, `W` or `Z`; hold it to jump higher.
- Collect coins, stomp enemies by landing on them, and avoid spikes and pits. Reach the flag to finish the level.
- You have 3 lives across all 3 levels. Losing a life restarts the current level.
- `P` pauses and `R` restarts the level. On touch screens, buttons below the game handle movement and jumping.

Levels are drawn as text maps at the top of `platformer/game.js`, so you can edit them or add new ones there:

| Char | Meaning          | Char | Meaning        |
|------|------------------|------|----------------|
| `#`  | Ground           | `o`  | Coin           |
| `X`  | Stone block      | `e`  | Walking enemy  |
| `-`  | One-way platform | `P`  | Player start   |
| `^`  | Spikes           | `F`  | Goal flag      |

# Stillness

A full-stack guided meditation platform (Next.js + Supabase) in `stillness/`. See [`stillness/README.md`](stillness/README.md) for setup, demo accounts and deployment.

# Blackjack

A casino blackjack table for one to five players in `blackjack/`, written in plain HTML, CSS and JavaScript with no build step. Open `blackjack/index.html` to play.

- **Players:** up to five seats. Each seat is a human (hot-seat on one device) or a computer player. "Pro" bots play perfect basic strategy and "casual" bots make the odd mistake. Seats are dealt right to left, like a real table.
- **Full rules:** hit, stand, double, split (up to four hands), late surrender, insurance and even money. The dealer checks for Blackjack when showing an Ace or a 10, and naturals are paid straight away.
- **Side bets:** Perfect Pairs and 21+3.
- **Configurable table:** 1–8 decks, dealer hits or stands on soft 17, 3:2 or 6:5 Blackjack, double restrictions, double after split, re-splitting and hitting split aces, cut-card position, and four table limits.
- **Learning tools:** a hint button, an optional coach that flags plays that differ from basic strategy, a strategy chart generated for the current rules, and a Hi-Lo counting trainer.
- **Statistics:** per-player win rate, net result, Blackjacks, streaks, strategy accuracy and a bankroll chart.
- **Presentation:** cards, chips and the table are drawn in CSS/SVG and animated, and sound effects are synthesised with Web Audio. You can choose the felt colour, card backs and a four-colour deck. It works on desktop, tablet and phone, in portrait or landscape.
- Progress and settings are saved in the browser.

Keyboard: `1`–`6` add chips, `Space` deals (or repeats your last bet), `H` `S` `D` `P` `R` hit, stand, double, split and surrender, `G` shows a hint, `Y`/`N` answer insurance, and `M` mutes.

Run the rules-engine tests with `node blackjack/tests/engine.test.js`.
