export type CanvasCategory = "landscape" | "floral" | "animal" | "still-life" | "abstract";
export type CanvasDifficulty = "easy" | "medium" | "hard";

export interface PaletteColor {
  /** 1-based paint number printed in the regions. */
  number: number;
  /** Pigment-style display name, e.g. "Cerulean Mist". */
  name: string;
  /** Target colour as #rrggbb. */
  hex: string;
}

/** A filled vector shape. Shapes are stacked in order (painter's algorithm). */
export interface CanvasShape {
  /** SVG path data in canvas units. */
  d: string;
  /** Palette number this shape should be painted with. */
  n: number;
  /** Fill rule for self-intersecting / holed paths. */
  rule?: "nonzero" | "evenodd";
}

export interface CanvasMeta {
  id: string;
  title: string;
  description: string;
  category: CanvasCategory;
  difficulty: CanvasDifficulty;
  width: number;
  height: number;
  tags: string[];
  palette: PaletteColor[];
}

export interface CanvasDefinition extends CanvasMeta {
  shapes: CanvasShape[];
}

export const CATEGORY_LABELS: Record<CanvasCategory, string> = {
  landscape: "Landscapes",
  floral: "Florals",
  animal: "Animals",
  "still-life": "Still Life",
  abstract: "Abstract",
};

export const DIFFICULTY_LABELS: Record<CanvasDifficulty, string> = {
  easy: "Gentle",
  medium: "Considered",
  hard: "Intricate",
};
