/**
 * Piece-count options and difficulty estimates.
 */
import { gridFor } from "./puzzle/geometry";

export const PIECE_COUNTS = [100, 250, 500, 750, 1000, 1500, 2000] as const;
export type PieceCount = (typeof PIECE_COUNTS)[number];

const LEVELS: Record<PieceCount, { label: string; minutes: number }> = {
  100: { label: "Relaxed", minutes: 15 },
  250: { label: "Easy", minutes: 40 },
  500: { label: "Moderate", minutes: 90 },
  750: { label: "Challenging", minutes: 150 },
  1000: { label: "Hard", minutes: 240 },
  1500: { label: "Expert", minutes: 400 },
  2000: { label: "Master", minutes: 600 },
};

export interface PieceOption {
  target: PieceCount;
  rows: number;
  cols: number;
  actual: number;
  /** Approximate piece size in source-image pixels. */
  piecePx: number;
  label: string;
  /** Estimated time to solve, formatted. */
  estimate: string;
  /** 1..7 difficulty pips. */
  pips: number;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `~${Math.round(minutes / 5) * 5 || 5} min`;
  const h = minutes / 60;
  return `~${h < 10 ? Math.round(h * 2) / 2 : Math.round(h)} h`;
}

export function pieceOptions(width: number, height: number, rotation: boolean): PieceOption[] {
  return PIECE_COUNTS.map((target, i) => {
    const { rows, cols } = gridFor(target, width / height);
    const lvl = LEVELS[target];
    return {
      target,
      rows,
      cols,
      actual: rows * cols,
      piecePx: Math.round(Math.max(width / cols, height / rows)),
      label: lvl.label,
      estimate: formatDuration(lvl.minutes * (rotation ? 1.6 : 1)),
      pips: i + 1,
    };
  });
}
