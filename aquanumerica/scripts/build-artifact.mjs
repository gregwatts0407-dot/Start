/**
 * Builds a static, single-page version of the app (no Next.js server) into
 * dist-artifact/: index.html + app.js + app.css + worker.js.
 * Run with: npm run build:artifact
 */
import { build } from "esbuild";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "dist-artifact");
mkdirSync(out, { recursive: true });

const common = {
  bundle: true,
  minify: true,
  target: "es2020",
  logLevel: "warning",
  alias: { "@": path.join(root, "src"), "next/link": path.join(root, "artifact/link-shim.tsx") },
  define: { "process.env.NODE_ENV": '"production"' },
  jsx: "automatic",
};

// The worker becomes its own file; point the loader at it.
const workerPlugin = {
  name: "worker-url",
  setup(b) {
    b.onLoad({ filter: /load-analysis\.ts$/ }, (args) => ({
      contents: readFileSync(args.path, "utf8").replace(
        'new Worker(new URL("./analysis.worker.ts", import.meta.url), { type: "module" })',
        'new Worker(new URL("./worker.js", document.baseURI))',
      ),
      loader: "ts",
    }));
  },
};

await build({ ...common, entryPoints: [path.join(root, "src/lib/engine/analysis.worker.ts")], outfile: path.join(out, "worker.js"), format: "iife" });
await build({ ...common, entryPoints: [path.join(root, "artifact/main.tsx")], outfile: path.join(out, "app.js"), format: "iife", plugins: [workerPlugin] });

execSync(`npx @tailwindcss/cli -i src/app/globals.css -o ${path.join(out, "app.css")} --minify`, { cwd: root, stdio: "inherit" });

writeFileSync(
  path.join(out, "index.html"),
  `<title>AquaNumerica</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,300..700,0..100&family=Geist:wght@400..700&family=Geist+Mono&display=swap">
<link rel="stylesheet" href="app.css">
<style>
  :root { --font-geist-sans: "Geist"; --font-geist-mono: "Geist Mono"; --font-fraunces: "Fraunces"; }
  html, body { height: 100%; }
  body { background: var(--background); color: var(--foreground); font-family: "Geist", ui-sans-serif, system-ui, sans-serif; }
</style>
<div id="root"></div>
<script src="app.js"></script>
`,
);
console.log("Built", out);
