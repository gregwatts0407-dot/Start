/// <reference lib="webworker" />
/**
 * Runs the heavy, one-off work for opening a canvas off the main thread:
 * rasterising the vector shapes into regions and generating the paper.
 */
import { getCanvas } from "../canvases";
import { generatePaper, PAPER_SEED, PAPER_SIZE } from "./paper";
import { analyzeCanvas } from "./regions";

self.onmessage = (e: MessageEvent<{ id: string; longSide: number; wantPaper: boolean }>) => {
  const { id, longSide, wantPaper } = e.data;
  try {
    const def = getCanvas(id);
    if (!def) throw new Error(`Unknown canvas ${id}`);
    const analysis = analyzeCanvas(def, { longSide });
    const transfer: Transferable[] = [
      analysis.regionMap.buffer,
      analysis.edgeDist.buffer,
      analysis.pixelOffsets.buffer,
      analysis.pixelIndices.buffer,
      ...analysis.outlines.map((o) => o.buffer),
      ...analysis.tileRegions.map((t) => t.buffer),
      ...analysis.regionTiles.map((t) => t.buffer),
    ];
    const paper = wantPaper ? generatePaper(PAPER_SIZE, PAPER_SEED) : null;
    if (paper) transfer.push(paper.height.buffer, paper.shade.buffer, paper.fine.buffer, paper.cockle.buffer);
    (self as unknown as Worker).postMessage({ ok: true, analysis, paper }, transfer);
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: String(err) });
  }
};
