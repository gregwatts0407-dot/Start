import type { OrganizeMode, PieceFilter } from "@/lib/puzzle/types";

/** Commands the workspace chrome can issue (implemented in Workspace). */
export interface WorkspaceActions {
  undo(): void;
  redo(): void;
  save(): void;
  setGhost(on: boolean): void;
  setGhostOpacity(v: number): void;
  setFilter(f: PieceFilter): void;
  organize(mode: OrganizeMode): void;
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
  focusBoard(): void;
  zoomActual(): void;
  restart(): void;
  openViewer(): void;
  openShortcuts(): void;
  togglePanel(): void;
}
