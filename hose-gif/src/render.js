// Renders the animation frames with headless Chromium and writes PNGs.
// usage: node render.js <outDir> [--caption "text"] [--only 0,10,20] [--ss 2]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const args = process.argv.slice(2);
  const out = args[0];
  const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const caption = opt('--caption') || '';
  const only = opt('--only') ? opt('--only').split(',').map(Number) : null;
  const ss = Number(opt('--ss') || 2);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', m => console.log('page:', m.text()));
  page.on('pageerror', e => { console.error('PAGE ERROR', e); process.exit(1); });
  await page.goto('file://' + path.join(__dirname, 'index.html'));
  await page.evaluate(() => document.fonts.load('800 25px Inter'));
  const { N } = await page.evaluate(o => HOSE.init(o), { ss, caption });
  // two warm-up loops so the hose and water settle into a seamless cycle
  await page.evaluate(N => { for (let i = 0; i < 2 * N; i++) HOSE.frame(i, false); }, N);
  for (let i = 0; i < N; i++) {
    const draw = !only || only.includes(i);
    const url = await page.evaluate(([fi, d]) => HOSE.frame(fi, d), [2 * N + i, draw]);
    if (url) fs.writeFileSync(path.join(out, `f${String(i).padStart(3, '0')}.png`), Buffer.from(url.split(',')[1], 'base64'));
  }
  await browser.close();
  console.log('frames', N);
})();
