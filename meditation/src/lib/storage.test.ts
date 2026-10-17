import { describe, expect, it } from 'vitest';
import { buildExport, DEFAULT_SETTINGS, mergeHistory, parseImport, sanitiseSettings } from './storage';
import type { SessionRecord } from './types';

const s = (id: string, startedAt: string): SessionRecord => ({
  id,
  type: 'meditation',
  startedAt,
  durationSec: 600,
  completed: true,
});

describe('export / import', () => {
  it('round-trips an export file', () => {
    const history = [s('a', '2026-10-01T08:00:00.000Z')];
    expect(parseImport(JSON.stringify(buildExport(history)))).toEqual(history);
  });

  it('accepts a bare array and drops malformed entries', () => {
    const text = JSON.stringify([s('a', '2026-10-01T08:00:00.000Z'), { id: 'bad' }]);
    expect(parseImport(text).map((x) => x.id)).toEqual(['a']);
  });

  it('gives friendly errors', () => {
    expect(() => parseImport('not json')).toThrow(/valid JSON/);
    expect(() => parseImport('{"foo":1}')).toThrow(/No sessions/);
    expect(() => parseImport('[{"id":1}]')).toThrow(/couldn’t be read/);
  });

  it('merges without duplicating and keeps chronological order', () => {
    const existing = [s('a', '2026-10-02T08:00:00.000Z')];
    const incoming = [s('a', '2026-10-02T08:00:00.000Z'), s('b', '2026-10-01T08:00:00.000Z')];
    const { history, added } = mergeHistory(existing, incoming);
    expect(added).toBe(1);
    expect(history.map((x) => x.id)).toEqual(['b', 'a']);
  });
});

describe('sanitiseSettings', () => {
  it('falls back to defaults for junk', () => {
    expect(sanitiseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitiseSettings({ theme: 42, haptics: 'yes' })).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values', () => {
    const out = sanitiseSettings({ theme: 'dark', meditationMinutes: 25 });
    expect(out.theme).toBe('dark');
    expect(out.meditationMinutes).toBe(25);
  });
});
