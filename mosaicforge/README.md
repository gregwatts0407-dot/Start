# MosaicForge

A premium digital jigsaw puzzle app: curated high‑resolution images, 100 – 2000 truly interlocking pieces, smooth pan/zoom on desktop and tablets, and automatic multi‑puzzle progress saving — all client‑side.

Built with **Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui (Radix) · Zustand · IndexedDB · HTML5 Canvas**.

## Run it

```bash
cd mosaicforge
npm install
npm run dev          # http://localhost:3000
# or a production build
npm run build && npm start
```

No accounts, no backend: images ship in `public/images`, and progress lives in the browser's IndexedDB.

## Features

- **Gallery** — 27 images (3200 px) across Landscapes, Nature, Animals, Architecture, Art, Abstract, Travel and Space, with category filters, search, full‑resolution preview, and *use your own image* (stored locally).
- **Piece counts** — 100, 250, 500, 750, 1000, 1500, 2000. The grid is fitted to each image's aspect ratio (e.g. 54 × 37 = 1998 for a 3:2 photo); the start dialog shows grid size, piece size in source pixels, difficulty and estimated time.
- **Real jigsaw cuts** — every interior edge is a randomised Bézier tab/blank shared by both neighbours, so pieces are unique and interlock exactly; border edges are straight.
- **Board** — drag & drop, groups that move together once joined, precise snapping (piece‑to‑piece and locking onto the board), snap glow + optional sound, optional 90° rotation (tap / R / right‑click / second‑finger tap), ghost image with opacity, edge/interior filters, *Gather edges*, *Sort by colour*, *Shuffle & spread*, three start layouts, timer (auto‑pauses when hidden or idle), move counter, undo/redo, edge auto‑pan while dragging.
- **Saving** — autosave (debounced after every move, every 20 s, and when the tab is hidden or closed), manual save (button or Ctrl/⌘+S), save‑status indicator, several puzzles in progress at once, *Continue* strip on the home page, *My Puzzles* page, and restart that either overwrites the save or keeps it and starts a fresh copy.
- **Completion** — the finished image fades in seamlessly over the board; the dialog shows time and moves and lets you view the image at full resolution, download it, play again or pick another puzzle.
- Dark (default) and light themes; layouts for desktop and large tablets.

## Architecture

```
src/
  lib/puzzle/
    geometry.ts   jigsaw cut generator (shared Bézier edges) + grid fitting
    sprites.ts    texture atlas: bevelled piece sprites, ½/¼ mip levels, ¼‑res shadow silhouettes
    engine.ts     PuzzleEngine – state, rendering, input, snapping, undo, serialisation
    layout.ts     slot placement around the board (scatter / edges / colour wedges)
    rng.ts        seeded PRNG so a save only needs the cut's seed
    sound.ts      synthesised snap / completion sounds (Web Audio)
  lib/storage.ts  IndexedDB (idb-keyval) for saves and uploaded images
  store/          Zustand: persisted preferences + transient workspace UI state
  components/     gallery, start dialog, workspace (top bar, side panel, dialogs), shadcn/ui primitives
  app/            /  (gallery) · /play?id=… (workspace) · /my-puzzles
```

**State model.** Each piece belongs to a group with a rigid transform `world = R(rot)·local + (x, y)`, where `local` is the piece's position in the solved image. Two groups are correctly aligned exactly when their rotations match and their origins (nearly) coincide, so snap detection is just “for each piece in the dropped group, compare its neighbours' group origins” — O(pieces in the group), no spatial index needed. Pieces dropped on their true spot join a single locked *board* group.

**Rendering.** Pieces are pre‑rendered once into 4096 px atlas pages (with bevel and outline), plus half‑ and quarter‑resolution mip levels chosen by zoom. A frame is one `setTransform` per group and one `drawImage` per visible piece; groups and pieces are culled to the viewport and frames are drawn only when something changes. While dragging, everything except the dragged group is cached in a layer, so each drag frame is a single blit plus the moving group. Piece resolution is capped (≤ 200 px per cell, ≈ 20 M atlas pixels) so 2000‑piece boards stay within a sensible memory budget; atlas generation is time‑sliced with a progress overlay.

**Saves.** `{ seed, rows, cols, rotation }` regenerates the cut; the board is a group index per piece plus `[x, y, rot, locked]` per group in z‑order, and the camera. A 2000‑piece save is ≈ 50 KB.

Measured in headless Chromium with software rendering (no GPU — a pessimistic setup): 2000 pieces load in ≈ 2.5 s; a full redraw of the whole table costs ≈ 10 ms, a board‑level view ≈ 2–3 ms, and drag frames ≈ 0.2 ms.

## Image credits

See [`public/images/CREDITS.md`](public/images/CREDITS.md). The images come from open‑source desktop wallpaper collections (Budgie Backgrounds — CC0; elementary OS and Pop!_OS — Unsplash License / public domain / CC BY‑SA 4.0 for the Nick Nazzaro illustrations).
