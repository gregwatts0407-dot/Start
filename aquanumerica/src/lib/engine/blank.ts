/**
 * A single-region analysis for small offscreen surfaces such as the brush
 * preview strip. Mirrors the shape of a real RegionAnalysis.
 */
import { TILE_SIZE, type RegionAnalysis } from "./regions";

export function blankAnalysis(width: number, height: number, number = 1): RegionAnalysis {
  const N = width * height;
  const tilesX = Math.ceil(width / TILE_SIZE), tilesY = Math.ceil(height / TILE_SIZE);
  const pixelIndices = new Int32Array(N);
  for (let i = 0; i < N; i++) pixelIndices[i] = i;
  return {
    width,
    height,
    scale: 1,
    regionMap: new Uint16Array(N),
    edgeDist: new Uint8Array(N).fill(255),
    regions: [{ id: 0, number, area: N, bbox: [0, 0, width, height], labelX: width / 2, labelY: height / 2, labelRadius: height / 2 }],
    pixelOffsets: Int32Array.from([0, N]),
    pixelIndices,
    numberRegions: new Map([[number, [0]]]),
    outlines: [],
    tilesX,
    tilesY,
    tileRegions: Array.from({ length: tilesX * tilesY }, () => Uint16Array.from([0])),
    regionTiles: [Int32Array.from({ length: tilesX * tilesY }, (_, t) => t)],
  };
}
