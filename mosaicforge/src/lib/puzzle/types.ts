/**
 * Shared puzzle types. The persisted shapes (PuzzleConfig / SerializedState)
 * are deliberately compact so a 2000-piece save stays a few tens of KB.
 */

export type StartMode = "scatter" | "edges" | "colour";
export type PieceFilter = "all" | "edges" | "interior";
export type OrganizeMode = "scatter" | "edges" | "colour";

/** Everything needed to deterministically re-create a puzzle's pieces. */
export interface PuzzleConfig {
  /** Gallery image id, or `custom:<uuid>` for user uploads. */
  imageId: string;
  title: string;
  rows: number;
  cols: number;
  /** Seed for the piece-cut geometry (tabs/blanks). */
  seed: number;
  /** Whether pieces start rotated and can be rotated in 90° steps. */
  rotation: boolean;
  startMode: StartMode;
}

/** Camera stored resolution-independently: world point at the view centre + zoom. */
export interface SavedCamera {
  cx: number;
  cy: number;
  zoom: number;
}

/**
 * Compact board state.
 * - `pieceGroup[i]` is the index (into the group list) of piece i's group.
 * - `groups` is a flat array of [x, y, rot, locked] per group, in z-order
 *   (bottom → top). x/y are the world position of the group's puzzle origin.
 */
export interface SerializedState {
  v: 1;
  pieceGroup: number[];
  groups: number[];
  camera?: SavedCamera;
}

export interface SaveRecord {
  id: string;
  config: PuzzleConfig;
  createdAt: number;
  updatedAt: number;
  elapsedMs: number;
  moves: number;
  /** 0..1 — fraction of correct piece-to-piece connections made. */
  progress: number;
  completed: boolean;
  completedAt?: number;
  state?: SerializedState;
  /** Small JPEG data-URL snapshot of the board for the "Continue" cards. */
  thumb?: string;
}

export interface EngineStats {
  progress: number;
  joined: number;
  totalJoins: number;
  placed: number;
  moves: number;
  canUndo: boolean;
  canRedo: boolean;
  completed: boolean;
  zoom: number;
}

export interface EngineSettings {
  ghost: boolean;
  ghostOpacity: number;
  filter: PieceFilter;
  snapToBoard: boolean;
  sound: boolean;
  /** Theme-dependent colours for the board. */
  theme: "light" | "dark";
}
