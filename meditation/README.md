# Stillpoint

A calm meditation web app you can share with a link. It has a meditation timer, guided breathing and ambient soundscapes that are generated on the device. It installs to the home screen and works offline.

- **No backend, no accounts, no tracking.** Everything is kept in the browser's `localStorage` on the device.
- **No audio files.** Bells, breathing cues, rain, ocean, noise and the drone are all synthesised with the Web Audio API.
- **Static site.** It deploys free to GitHub Pages, Netlify or Vercel.

## Features

| Tab | What it does |
|---|---|
| Meditate | Presets of 3, 5, 10, 15, 20 and 30 minutes, or a custom length (1–180). Optional 0–30 s preparation countdown. Start, interval and end bells with four bell tones. Large progress ring, pause/resume, confirm-to-end. The screen stays awake while the timer runs. |
| Breathe | Box (4-4-4-4), 4-7-8, Coherent (5.5/5.5) and a custom pattern. An animated circle with "Breathe in / Hold / Breathe out" cues, an optional soft tone or tick on each phase, and optional vibration. Sessions finish at the end of a full breath, so a timed session can run slightly past its length. |
| Sounds | Rain, ocean swell, brown noise, pink noise and a soft drone. Each layer has its own level, plus a master volume. Layers can be mixed and keep playing during sessions; the session screen has a Sounds button. |
| Progress | Current and best streak, total minutes, a 7-day bar chart, and recent sessions with optional one-line reflections. JSON export and import (imports merge and skip duplicates). |
| Settings | Light, dark or match-device theme. Default length, bells, bell volume, vibration, Share and Install buttons, and "Reset all data". |

Completed sessions are logged automatically. A session ended early (after at least a minute) can be saved from the summary.

Keyboard: `Space` pauses or resumes a session, and `Esc` asks to end it.

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Vitest unit tests
npm run build    # type-check + production build into dist/
npm run preview  # serve the production build (service worker included)
npm run icons    # regenerate icons/OG image from scripts/generate-icons.mjs
```

Stack: Vite, React, TypeScript, Tailwind CSS v4, vite-plugin-pwa.

```
src/
  lib/        pure logic: timer.ts, breathing.ts, stats.ts, storage.ts (+ tests)
  audio/      unlock.ts (iOS-safe unlock), engine.ts, bells.ts, ambient.ts
  state/      tiny persisted stores for settings and history
  hooks/      session clock, wake lock, theme, reduced motion, install prompt
  components/ UI pieces (dialogs, ring, mixer, chart, tab bar…)
  screens/    one file per tab
```

## Deploying

The build uses relative paths (`base: './'`), so the same `dist/` works at a domain root or in a sub-folder.

- **GitHub Pages:** `.github/workflows/deploy-meditation.yml` (at the repo root) builds and publishes on every push to `main` that touches `meditation/`. Turn it on once under *Settings → Pages → Source: GitHub Actions*.
- **Netlify:** set the base directory to `meditation`. `netlify.toml` does the rest.
- **Vercel:** set the root directory to `meditation`. `vercel.json` does the rest.

For full link previews (Open Graph image), set `SITE_URL` to the public address at build time, e.g. `SITE_URL=https://you.github.io/repo/ npm run build`. The GitHub workflow does this automatically.

## Audio on iPhone and iPad

Safari only allows sound after a tap, so `src/audio/unlock.ts`:

- creates the `AudioContext` on the first tap or key press, never on page load;
- resumes it and plays a silent one-sample buffer inside that gesture;
- sets `navigator.audioSession.type = 'playback'` (iOS 17+) so bells play even with the silent switch on;
- resumes the context when the page becomes visible again (after a call, Siri or the lock screen).

`src/audio/unlock.test.ts` covers this behaviour with a fake context that acts like Safari's. iOS stops web audio when the phone locks, so the timer keeps the screen awake with the Wake Lock API.

## Privacy

There are no analytics, cookies, fonts or requests to third parties. After the first visit the app is fully cached by its service worker. "Reset all data" in Settings deletes everything stored on the device.
