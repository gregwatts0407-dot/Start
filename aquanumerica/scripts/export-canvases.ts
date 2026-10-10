/**
 * Exports the procedural canvas library as static sample data:
 *   public/canvases/<id>.svg          numbered line-art template
 *   public/canvases/<id>-colour.svg   colour reference (target palette)
 *   public/canvases/catalog.json      metadata, palettes and region counts
 *   src/lib/canvases/stats.generated.json  region counts used by the gallery
 *
 * Run with: npm run canvases:export
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { CANVAS_ENTRIES, getCanvas } from "../src/lib/canvases";
import { analyzeCanvas } from "../src/lib/engine/regions";

const outDir = "public/canvases";
mkdirSync(outDir, { recursive: true });
const catalog: unknown[] = [];
const stats: Record<string, { regions: number }> = {};

for (const entry of CANVAS_ENTRIES) {
  const def = getCanvas(entry.meta.id)!;
  // Same resolution the studio uses, so region counts match exactly.
  const a = analyzeCanvas(def, { longSide: 1600 });
  const k = 1 / a.scale;
  const W = def.width, H = def.height;
  const pal = new Map(def.palette.map((p) => [p.number, p.hex]));

  const lines = a.outlines
    .map((l) => {
      let d = "";
      for (let i = 0; i < l.length; i += 2) d += (i ? "L" : "M") + (l[i] * k).toFixed(1) + " " + (l[i + 1] * k).toFixed(1);
      return d;
    })
    .join("");
  const labels = a.regions
    .map((r) => {
      const fs = Math.min(22, r.labelRadius * k * 0.95);
      if (fs < 3.5) return "";
      return `<text x="${(r.labelX * k).toFixed(1)}" y="${(r.labelY * k).toFixed(1)}" font-size="${fs.toFixed(1)}">${r.number}</text>`;
    })
    .join("");
  const legend = def.palette
    .map((p, i) => {
      const x = 16 + (i % 7) * 168, y = H + 28 + Math.floor(i / 7) * 34;
      return `<rect x="${x}" y="${y - 14}" width="22" height="22" rx="4" fill="${p.hex}" stroke="#999" stroke-width="0.5"/><text x="${x + 30}" y="${y + 2}" font-size="13" text-anchor="start">${p.number} · ${p.name}</text>`;
    })
    .join("");
  const legendH = 24 + Math.ceil(def.palette.length / 7) * 34;
  writeFileSync(
    `${outDir}/${def.id}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H + legendH}" width="${W}" height="${H + legendH}">
<title>${def.title} – AquaNumerica template</title>
<rect width="${W}" height="${H + legendH}" fill="#fff"/>
<path d="${lines}" fill="none" stroke="#4a4c55" stroke-width="1" stroke-linejoin="round"/>
<g font-family="Helvetica, Arial, sans-serif" fill="#55575f" text-anchor="middle" dominant-baseline="central">${labels}</g>
<g font-family="Helvetica, Arial, sans-serif" fill="#333">${legend}</g>
</svg>
`,
  );
  writeFileSync(
    `${outDir}/${def.id}-colour.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<title>${def.title} – colour reference</title>
${def.shapes.map((s) => `<path d="${s.d}" fill="${pal.get(s.n)}"${s.rule === "evenodd" ? ' fill-rule="evenodd"' : ""}/>`).join("\n")}
</svg>
`,
  );
  stats[def.id] = { regions: a.regions.length };
  catalog.push({
    id: def.id,
    title: def.title,
    description: def.description,
    category: def.category,
    difficulty: def.difficulty,
    width: W,
    height: H,
    regions: a.regions.length,
    palette: def.palette,
    template: `/canvases/${def.id}.svg`,
    colour: `/canvases/${def.id}-colour.svg`,
  });
  console.log(`${def.id.padEnd(20)} ${String(a.regions.length).padStart(4)} regions`);
}
writeFileSync(`${outDir}/catalog.json`, JSON.stringify(catalog, null, 2) + "\n");
writeFileSync("src/lib/canvases/stats.generated.json", JSON.stringify(stats, null, 2) + "\n");
