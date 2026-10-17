import { DEFAULT_CUSTOM_PATTERN, isValidPattern, type BreathPattern } from './breathing';
import type { AmbientId, SessionRecord, Settings } from './types';

const SETTINGS_KEY = 'stillpoint:v1:settings';
const HISTORY_KEY = 'stillpoint:v1:history';

export const AMBIENT_IDS: AmbientId[] = ['rain', 'ocean', 'brown', 'pink', 'drone'];

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  meditationMinutes: 10,
  prepSeconds: 10,
  startBell: 'bowl',
  intervalBell: 'chime',
  intervalMinutes: 0,
  endBell: 'bowl',
  bellVolume: 0.8,
  confirmEnd: true,
  haptics: true,
  breathPatternId: 'box',
  customPattern: DEFAULT_CUSTOM_PATTERN,
  breathCue: 'tone',
  breathMinutes: 3,
  ambientVolume: 0.6,
  ambient: {
    rain: { on: false, volume: 0.7 },
    ocean: { on: false, volume: 0.7 },
    brown: { on: false, volume: 0.6 },
    pink: { on: false, volume: 0.5 },
    drone: { on: false, volume: 0.5 },
  },
};

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked (private mode) — the app still works for this visit.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Merges stored settings over defaults, ignoring anything of the wrong type. */
export function sanitiseSettings(input: unknown): Settings {
  const base = structuredClone(DEFAULT_SETTINGS);
  if (!isRecord(input)) return base;

  const out = base as unknown as Record<string, unknown>;
  for (const [key, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
    const value = input[key];
    if (key === 'ambient' || key === 'customPattern') continue;
    if (typeof value === typeof defaultValue) out[key] = value;
  }

  if (isRecord(input.ambient)) {
    for (const id of AMBIENT_IDS) {
      const layer = input.ambient[id];
      if (isRecord(layer) && typeof layer.on === 'boolean' && typeof layer.volume === 'number') {
        base.ambient[id] = { on: layer.on, volume: Math.min(1, Math.max(0, layer.volume)) };
      }
    }
  }

  if (isRecord(input.customPattern)) {
    const candidate = { ...DEFAULT_CUSTOM_PATTERN, ...input.customPattern } as BreathPattern;
    if (isValidPattern(candidate)) base.customPattern = { ...candidate, id: DEFAULT_CUSTOM_PATTERN.id };
  }

  return base;
}

export function loadSettings(): Settings {
  const settings = sanitiseSettings(readJson(SETTINGS_KEY));
  // Sounds never resume by themselves on a fresh visit — browsers block it anyway.
  for (const id of AMBIENT_IDS) settings.ambient[id].on = false;
  return settings;
}

export function saveSettings(settings: Settings): void {
  writeJson(SETTINGS_KEY, settings);
}

export function isSessionRecord(value: unknown): value is SessionRecord {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    (value.type === 'meditation' || value.type === 'breathing') &&
    typeof value.startedAt === 'string' &&
    !Number.isNaN(Date.parse(value.startedAt)) &&
    typeof value.durationSec === 'number' &&
    value.durationSec >= 0 &&
    typeof value.completed === 'boolean' &&
    (value.note === undefined || typeof value.note === 'string') &&
    (value.pattern === undefined || typeof value.pattern === 'string')
  );
}

export function loadHistory(): SessionRecord[] {
  const raw = readJson(HISTORY_KEY);
  return Array.isArray(raw) ? raw.filter(isSessionRecord) : [];
}

export function saveHistory(history: SessionRecord[]): void {
  writeJson(HISTORY_KEY, history);
}

export function clearAllData(): void {
  try {
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // Nothing to clear.
  }
}

export interface ExportFile {
  app: 'stillpoint';
  version: 1;
  exportedAt: string;
  sessions: SessionRecord[];
}

export function buildExport(history: SessionRecord[]): ExportFile {
  return { app: 'stillpoint', version: 1, exportedAt: new Date().toISOString(), sessions: history };
}

/**
 * Parses a backup file. Accepts our export format or a bare array of
 * sessions. Throws a friendly error when nothing usable is found.
 */
export function parseImport(text: string): SessionRecord[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t valid JSON.');
  }
  const list = Array.isArray(data) ? data : isRecord(data) ? data.sessions : null;
  if (!Array.isArray(list)) throw new Error('No sessions were found in that file.');
  const sessions = list.filter(isSessionRecord);
  if (list.length > 0 && sessions.length === 0) {
    throw new Error('The sessions in that file couldn’t be read.');
  }
  return sessions;
}

/** Merges imported sessions into history, skipping ids already present. */
export function mergeHistory(
  existing: SessionRecord[],
  incoming: SessionRecord[],
): { history: SessionRecord[]; added: number } {
  const ids = new Set(existing.map((s) => s.id));
  const fresh = incoming.filter((s) => !ids.has(s.id));
  const history = [...existing, ...fresh].sort(
    (a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt),
  );
  return { history, added: fresh.length };
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
