// Builds a single, self-contained page for publishing as a claude.ai artifact:
// no service worker, all JS and CSS inlined. Output: dist-artifact/stillpoint.html
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

execSync('vite build', { stdio: 'inherit', env: { ...process.env, VITE_ARTIFACT: '1' } });

const dir = new URL('../dist-artifact/', import.meta.url);
const html = readFileSync(new URL('index.html', dir), 'utf8');
const asset = (path) => readFileSync(new URL(path.replace(/^\.\//, ''), dir), 'utf8');

const css = [...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => asset(m[1])).join('\n');
const js = [...html.matchAll(/<script type="module"[^>]*src="([^"]+)"/g)].map((m) => asset(m[1])).join('\n');
const themeScript = html.match(/<script>\s*\/\/ Apply the saved theme[\s\S]*?<\/script>/)?.[0] ?? '';

// The artifact host supplies the document skeleton, so emit page content only.
const page = `<title>Stillpoint</title>
<meta name="description" content="A calm meditation timer, breathing guide and ambient soundscapes.">
<style>${css}</style>
${themeScript}
<div id="root"></div>
<script type="module">${js.replaceAll('</script', '<\\/script')}</script>
`;
writeFileSync(new URL('stillpoint.html', dir), page);
console.log(`wrote dist-artifact/stillpoint.html (${(page.length / 1024).toFixed(0)} KB)`);
