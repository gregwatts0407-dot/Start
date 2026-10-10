# Cottage Garden Jigsaw

A browser jigsaw puzzle of a cottage garden in late spring. Like the tower-defense game, it is plain HTML, CSS and JavaScript with no build step and nothing to install.

## Play

Open `jigsaw/index.html` in a browser, or serve the repository (for example `python3 -m http.server`) and visit `/jigsaw/`.

Choose a size and a play mode, then press **Start**.

| Size  | Pieces | Grid    | Finished size |
|-------|--------|---------|---------------|
| 2000  | 2,000  | 50 × 40 | 98 × 78 cm    |
| 1000  | 1,008  | 36 × 28 | 70 × 55 cm    |
| 500   | 500    | 25 × 20 | 60 × 48 cm    |
| 250   | 252    | 18 × 14 | 47 × 36 cm    |
| 100   | 99     | 11 × 9  | 40 × 32 cm    |
| 48    | 48     | 8 × 6   | 36 × 27 cm    |

The 1000, 250 and 100 sizes use the nearest grid that keeps the pieces roughly square, as printed puzzles do.

### Play modes

- **Assisted**: tap or click a piece and it glides into its place on the board. You can still drag pieces yourself, a dashed outline shows where a dragged piece belongs, and **Ghost** shows a faint copy of the picture on the board.
- **Unassisted**: no help. Drag pieces next to their neighbours and they lock together when they fit; drop a group close to its spot on the board and it locks in place.

You can switch modes at any time from the top bar.

### Controls

- Drag a piece to move it (joined pieces move together). Drag the empty table to pan.
- Scroll the mouse wheel or pinch to zoom. `+`, `−` and `0` (fit) work too, and arrow keys pan.
- **Box lid** (`B`) shows the picture. **Edges** (`E`) hides everything but edge pieces. **Tidy** (`T`) lines loose pieces up round the board with edge pieces on the inside. **Ghost** (`G`, assisted only) shows the picture faintly on the board.
- While dragging near the edge of the screen, the table scrolls.

### Saving

Progress saves automatically a moment after every move, every 15 seconds while you play, and whenever the tab is hidden or closed. Each puzzle size has its own save, so you can have a 2000-piece puzzle on the go and still do a quick 100. Saves live in the browser's `localStorage`, which survives closing the browser. Private or incognito windows usually clear it when they close.

When the page runs as a claude.ai artifact, progress is also saved to the signed-in viewer's private storage, and whichever copy is newer is used.

Finished times are kept per size and mode, and the menu shows your best.

## How it works

- `scene.js` paints the picture procedurally onto a 2400 × 1920 canvas from a fixed seed, so every load paints the same image and the game ships no image files.
- `puzzle.js` cuts the picture with Bezier tab curves (after Draradech's jigsaw generator), pre-renders the pieces into sprite sheets with half- and quarter-size copies for zoomed-out views, and paints pieces directly from the picture when zoomed in close.
- A group of joined pieces is stored as a single offset from the pieces' home positions. Two groups fit when their offsets match, and a group is placed when its offset is zero. A save is just the piece-cutting seed plus those offsets, about 30 KB for 2,000 pieces.
