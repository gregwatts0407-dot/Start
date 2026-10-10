/**
 * Tile-based undo/redo.
 *
 * The surface is split into 64×64 tiles. When an action (stroke, fill, reset…)
 * first writes to a tile, the tile's previous state is snapshotted
 * (copy-on-write). Simulation writes that happen after a stroke – diffusion,
 * drying – are attributed to that same action, so undo restores the exact
 * state from before it began. Snapshots are quantised to 16 bits and wet data
 * is only stored when present, keeping 50+ steps within a modest budget.
 */

export interface TileSnapshot {
  tile: number;
  /** dry(3) [+ wet(3) + water(1)] per pixel, quantised. */
  data: Uint16Array;
  hasWet: boolean;
}

export interface TileStore {
  captureTile(tile: number): TileSnapshot;
  restoreTile(snap: TileSnapshot): void;
}

export type HistoryKind = "stroke" | "fill" | "erase" | "reset" | "clear" | "load";

export interface HistoryEntry {
  id: number;
  kind: HistoryKind;
  label: string;
  color?: string;
  number?: number;
  before: Map<number, TileSnapshot>;
  after: Map<number, TileSnapshot> | null;
  bytes: number;
  time: number;
}

export interface HistorySummary {
  id: number;
  kind: HistoryKind;
  label: string;
  color?: string;
  number?: number;
  time: number;
}

export class History {
  private entries: HistoryEntry[] = [];
  /** Number of entries currently applied (entries[index-1] is the latest). */
  private index = 0;
  /** Entry receiving copy-on-write snapshots, or null when none is open. */
  private current: HistoryEntry | null = null;
  private nextId = 1;
  private totalBytes = 0;

  constructor(
    private store: TileStore,
    private readonly maxEntries = 120,
    private readonly maxBytes = 192 * 1024 * 1024,
  ) {}

  begin(kind: HistoryKind, label: string, meta: { color?: string; number?: number } = {}) {
    // Starting a new action discards the redo branch.
    for (let k = this.index; k < this.entries.length; k++) this.totalBytes -= this.entries[k].bytes;
    this.entries.length = this.index;
    const entry: HistoryEntry = {
      id: this.nextId++,
      kind,
      label,
      color: meta.color,
      number: meta.number,
      before: new Map(),
      after: null,
      bytes: 0,
      time: Date.now(),
    };
    this.entries.push(entry);
    this.index = this.entries.length;
    this.current = entry;
    this.trim();
  }

  /** Must be called before the first write to a tile. Cheap when already captured. */
  touch(tile: number) {
    const cur = this.current;
    if (!cur || cur.before.has(tile)) return;
    const snap = this.store.captureTile(tile);
    cur.before.set(tile, snap);
    const b = snap.data.byteLength + 48;
    cur.bytes += b;
    this.totalBytes += b;
  }

  /** Drop entries beyond the current position (used when a stroke is cancelled). */
  discardRedo() {
    for (let k = this.index; k < this.entries.length; k++) this.totalBytes -= this.entries[k].bytes;
    this.entries.length = this.index;
  }

  /** Stop attributing writes to the latest entry (e.g. after undo/redo). */
  close() {
    this.current = null;
  }

  get canUndo() {
    return this.index > 0;
  }

  get canRedo() {
    return this.index < this.entries.length;
  }

  get position() {
    return this.index;
  }

  undo(): boolean {
    if (!this.canUndo) return false;
    const entry = this.entries[this.index - 1];
    this.current = null;
    if (!entry.after) {
      entry.after = new Map();
      entry.before.forEach((_, t) => {
        const snap = this.store.captureTile(t);
        entry.after!.set(t, snap);
        entry.bytes += snap.data.byteLength + 48;
        this.totalBytes += snap.data.byteLength + 48;
      });
    }
    entry.before.forEach((snap) => this.store.restoreTile(snap));
    this.index--;
    return true;
  }

  redo(): boolean {
    if (!this.canRedo) return false;
    const entry = this.entries[this.index];
    this.current = null;
    entry.after?.forEach((snap) => this.store.restoreTile(snap));
    this.index++;
    return true;
  }

  /** Tiles affected by the entry that would be undone/redone next. */
  pendingTiles(direction: "undo" | "redo"): number[] {
    const entry = direction === "undo" ? this.entries[this.index - 1] : this.entries[this.index];
    return entry ? Array.from(entry.before.keys()) : [];
  }

  summaries(): HistorySummary[] {
    return this.entries.map(({ id, kind, label, color, number, time }) => ({ id, kind, label, color, number, time }));
  }

  clear() {
    this.entries = [];
    this.index = 0;
    this.current = null;
    this.totalBytes = 0;
  }

  get bytes() {
    return this.totalBytes;
  }

  private trim() {
    // Always keep the newest entry; drop the oldest beyond limits.
    while (
      this.entries.length > 1 &&
      (this.entries.length > this.maxEntries || this.totalBytes > this.maxBytes)
    ) {
      const dropped = this.entries.shift()!;
      this.totalBytes -= dropped.bytes;
      this.index--;
    }
  }
}
