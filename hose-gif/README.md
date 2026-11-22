# "I've got this under control" — fire-hose GIF

- `hose.gif` — 640×420, 6 s seamless loop, 25 fps
- `hose-caption.gif` — same, with the caption "Me: I've got this under control."

The story: a smug office worker peers into a hose that has stopped dripping, gets blasted
in the face, loses the fight, is flown around like a flag (losing a shoe), hovers, looks at
the camera, drops, gets bonked by the returning shoe, shakes off — and is smug again.

## Rebuild

Needs Node with Playwright (Chromium) and ffmpeg.

```
cd src && ./build.sh
```

`src/anim.js` holds everything: keyframed timeline (`TR`, `EXT`), the flight path (`AIRK`),
verlet-rope hose physics, particle water, and the canvas drawing. `src/render.js` steps it in
headless Chromium (two warm-up loops so the loop is seamless) and saves PNG frames.
