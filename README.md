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

## AquaNumerica

The `aquanumerica/` folder holds a separate Next.js app: a watercolour paint-by-numbers studio with 15 numbered canvases, seven painting implements, strict region locking and a pigment simulation (wet-in-wet bleeding, granulation, pooled edges, textured paper). Progress saves in the browser, and finished paintings export as PNG or PDF. See [`aquanumerica/README.md`](aquanumerica/README.md) to run it.
