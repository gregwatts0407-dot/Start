# AquaNumerica

A calm, digital paint-by-numbers studio that behaves like real watercolour. Pick a numbered canvas, choose a brush and paint: strokes stay inside their regions, washes bleed into each other while wet, pigment settles into the grain of cold-press paper and dries with soft, pooled edges.

Built with Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui (Radix) and Zustand. The painting surface is a set of HTML canvases driven by a custom engine; there is no server-side state.

## Running it

```bash
cd aquanumerica
npm install
npm run dev          # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build (all canvas pages are prerendered) and server |
| `npm test` | Engine unit tests (Vitest): path parsing, rasterising, region analysis, the watercolour surface, undo/redo |
| `npm run lint` / `npm run typecheck` | ESLint and TypeScript |
| `npm run canvases:export` | Regenerates the sample data in `public/canvases/` and the gallery's region counts |

## Using the studio

- **Gallery** – browse by category (landscapes, florals, animals, still life, abstract) or difficulty, search by subject or colour name, and continue paintings you have started.
- **Implements** – soft watercolour, round, flat wash, detail liner, wash fill, eyedropper and a lifting eraser. Each remembers its own size, opacity, flow and wetness; the strip above the sliders previews the mark with the real engine.
- **Palette** – numbered swatches with per-colour progress, a colour wheel and recent colours. Picking a swatch selects its number and colour.
- **Precision** – region lock (stay in the region a stroke starts in, flow into every region of the selected number, or paint freely), strict numbers, magnetic edges and guide mode.
- **Right panel** – progress ("12 of 47 regions complete", accuracy score, per-colour bars), layers (varnish, underdrawing, paint, paper grain, plus granulation, cockling and drying speed), history (jump to any step), and export.
- **Finish & Reveal** – hides the numbers, softens the pencil lines and presents the finished painting with PNG and PDF downloads.

Shortcuts: `B R F L G I E` tools · `1`–`9`, `0` colours · `[` `]` size · `⌘Z` / `⇧⌘Z` undo/redo · `N` numbers · `O` outlines · `Q` guide · `D` dry the paper · `+` `-` zoom · `⌘0` fit · hold `Space` to pan · `Alt`-click to sample a colour · `?` tutorial. Pinch to zoom and use two fingers to pan on touch screens.

## How it works

### Canvases and regions (`src/lib/canvases`, `src/lib/engine/regions.ts`)

Each canvas is authored procedurally from vector primitives (smooth blobs, ridges, petals, leaves, Voronoi cells…) as SVG paths in painter's order, each tagged with a palette number. When a canvas opens, a Web Worker:

1. rasterises every path with a custom scanline filler (Canvas 2D always anti-aliases, which makes exact region IDs impossible to read back);
2. splits the result into 4-connected regions and merges specks and slivers too small to paint into their longest-bordering neighbour;
3. runs a chamfer distance transform, used for soft anti-aliased region masks, magnetic edges and placing each number at the region's most interior point;
4. traces the region borders along pixel cracks into smoothed vector outlines, so the underdrawing stays crisp at any zoom.

### Watercolour (`src/lib/engine/watercolor.ts`, `renderer.ts`, `paper.ts`)

Paint is stored as optical density (Beer–Lambert) in a wet and a dry layer plus a water amount per pixel, so glazes multiply exactly as transparent pigment does. Brush dabs deposit pigment: on damp paper they mix into the wash (wet-in-wet), on dry paper they glaze. Wet pigment diffuses between neighbouring wet pixels but never across region borders. Water evaporates and pigment settles into the dry layer, and at the end of a stroke pigment migrates to its edges and to region borders, giving darker pooled rims. The renderer adds granulation (pigment collecting in the valleys of a procedural cold-press paper), paper cockling where the sheet is wet or heavily painted, and a varnish vignette and soft-focus glow.

### History, saving and export

- Undo/redo snapshots 64×64 tiles copy-on-write (quantised to 16 bits), keeping up to 120 steps.
- Paintings save automatically to IndexedDB (gzip-compressed), with an immediate write when the tab is hidden. Gallery progress and preferences live in localStorage.
- PNG export renders at 1× or 2× (up to 3200 px) on paper, as a transparent wash or as a printable template. PDF export uses a small built-in writer that embeds the JPEG on an A4 page.

### Sample data

`public/canvases/` contains a numbered SVG line-art template and a colour reference SVG for every canvas, plus `catalog.json` with metadata, palettes and region counts.
