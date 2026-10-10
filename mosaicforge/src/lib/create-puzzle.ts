import type { GalleryImage } from "./images";
import type { PieceOption } from "./difficulty";
import type { PuzzleConfig, SaveRecord, StartMode } from "./puzzle/types";
import { randomSeed } from "./puzzle/rng";
import { newId, putSave, requestPersistence } from "./storage";

/** Create a new (empty) save; the workspace lays out pieces on first load. */
export async function createPuzzle(
  image: GalleryImage,
  option: Pick<PieceOption, "rows" | "cols">,
  rotation: boolean,
  startMode: StartMode,
): Promise<string> {
  const config: PuzzleConfig = {
    imageId: image.id,
    title: image.title,
    rows: option.rows,
    cols: option.cols,
    seed: randomSeed(),
    rotation,
    startMode,
  };
  return createFromConfig(config);
}

export async function createFromConfig(config: PuzzleConfig): Promise<string> {
  const now = Date.now();
  const rec: SaveRecord = {
    id: newId(),
    config,
    createdAt: now,
    updatedAt: now,
    elapsedMs: 0,
    moves: 0,
    progress: 0,
    completed: false,
  };
  await putSave(rec);
  void requestPersistence();
  return rec.id;
}

/** Restart a save in place: same cut, pieces re-scattered, timer reset. */
export async function restartOverwrite(save: SaveRecord): Promise<void> {
  await putSave({
    ...save,
    state: undefined,
    elapsedMs: 0,
    moves: 0,
    progress: 0,
    completed: false,
    completedAt: undefined,
    thumb: undefined,
    updatedAt: Date.now(),
  });
}

/** Keep the existing save and start a new copy with a fresh cut. */
export async function restartAsCopy(save: SaveRecord): Promise<string> {
  return createFromConfig({ ...save.config, seed: randomSeed() });
}
