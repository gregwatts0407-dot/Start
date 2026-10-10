/**
 * Builds a standalone, single-page version of MosaicForge for publishing as a
 * claude.ai Artifact (no Next.js server available there).
 *
 *   node scripts/build-artifact.mjs <outDir>
 *
 * Produces <outDir>/mosaicforge.html (inline JS + CSS) and copies the images
 * to <outDir>/images. Next-specific modules are swapped for shims in artifact/.
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const out = path.resolve(process.argv[2] ?? path.join(root, "artifact-dist"));
const A = (p) => path.join(root, "artifact", p);

const swaps = {
  "next/link": A("shims/link.tsx"),
  "next/navigation": A("shims/navigation.ts"),
  "@/lib/env": A("env.ts"),
  "@/lib/platform": A("platform.ts"),
  "@/lib/storage": A("storage.ts"),
  "@/components/providers": A("providers.tsx"),
};

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// 1) JavaScript
const js = await build({
  entryPoints: [A("main.tsx")],
  bundle: true,
  write: false,
  format: "iife",
  target: "es2020",
  minify: true,
  jsx: "automatic",
  legalComments: "none",
  define: { "process.env.NODE_ENV": '"production"' },
  tsconfig: path.join(root, "tsconfig.json"),
  plugins: [
    {
      name: "artifact-swaps",
      setup(b) {
        const filter = new RegExp(`^(${Object.keys(swaps).map((k) => k.replace(/[/.@]/g, "\\$&")).join("|")})$`);
        b.onResolve({ filter }, (args) => ({ path: swaps[args.path] }));
      },
    },
  ],
});
let script = js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

// 2) CSS (Tailwind v4 scans src/ and artifact/)
const cssOut = path.join(out, ".tmp.css");
execFileSync("npx", ["@tailwindcss/cli", "-i", "src/app/globals.css", "-o", cssOut, "--minify"], { cwd: root, stdio: "inherit" });
const css = readFileSync(cssOut, "utf8");
rmSync(cssOut);

// The Artifact skeleton adds unlayered resets (14px system body font,
// img max-width) that would beat Tailwind's layered styles; restore ours.
const overrides = `body{font-family:var(--font-sans);font-size:16px;line-height:1.5;background:var(--background);color:var(--foreground)}img.max-w-none{max-width:none}`;

// 3) Page
const html = `<title>MosaicForge</title>
<meta name="description" content="Premium jigsaw puzzles from 100 to 2000 pieces, with automatic progress saving.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&family=Inter:wght@400..700&display=swap">
<style>${css}
${overrides}</style>
<div id="root"></div>
<script>${script}</script>
`;
writeFileSync(path.join(out, "mosaicforge.html"), html);
cpSync(path.join(root, "public/images"), path.join(out, "images"), { recursive: true });
console.log(`Built ${path.join(out, "mosaicforge.html")} (${(html.length / 1024).toFixed(0)} KB)`);
