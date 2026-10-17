import { useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '../components/Dialog';
import { copyText } from '../components/ShareButton';
import { IS_ARTIFACT } from '../lib/env';
import { FlameIcon } from '../components/Icons';
import { Button, Card, SectionTitle } from '../components/ui';
import { WeeklyChart } from '../components/WeeklyChart';
import { calculateStreak, lastSevenDays, totalMinutes } from '../lib/stats';
import { buildExport, parseImport } from '../lib/storage';
import { formatDuration } from '../lib/timer';
import type { SessionRecord } from '../lib/types';
import { deleteSession, importSessions, useHistory } from '../state/store';

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-surface-2/60 p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

function sessionTitle(s: SessionRecord): string {
  if (s.type === 'breathing') return s.pattern ? `${s.pattern} breathing` : 'Breathing';
  return 'Meditation';
}

export function ProgressScreen() {
  const history = useHistory();
  const streak = useMemo(() => calculateStreak(history), [history]);
  const week = useMemo(() => lastSevenDays(history), [history]);
  const minutes = useMemo(() => totalMinutes(history), [history]);
  const recent = useMemo(() => [...history].reverse().slice(0, 30), [history]);
  const [message, setMessage] = useState('');
  const [toDelete, setToDelete] = useState<SessionRecord | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportHistory = async () => {
    const json = JSON.stringify(buildExport(history), null, 2);
    if (IS_ARTIFACT) {
      // Downloads are blocked here, so hand over the backup via the clipboard.
      const copied = await copyText(json);
      setMessage(
        copied
          ? `Copied ${history.length} sessions to your clipboard. Paste into a note or file to keep them.`
          : 'Couldn’t copy the backup. Your browser blocked clipboard access.',
      );
      return;
    }
    const blob = new Blob([json], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stillpoint-history-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(`Exported ${history.length} session${history.length === 1 ? '' : 's'}.`);
  };

  const importHistory = async (file: File) => {
    try {
      const sessions = parseImport(await file.text());
      const added = importSessions(sessions);
      setMessage(
        added === 0
          ? 'Nothing new to import — those sessions are already here.'
          : `Imported ${added} session${added === 1 ? '' : 's'}.`,
      );
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <header className="pt-2">
        <h1 className="text-3xl font-semibold">Progress</h1>
        <p className="mt-1 text-muted">Your practice, kept privately on this device.</p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 flex items-center gap-4 rounded-3xl bg-accent-soft p-5">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-surface text-accent">
            <FlameIcon size={26} />
          </span>
          <div>
            <div className="text-3xl font-semibold tabular-nums">
              {streak.current} {streak.current === 1 ? 'day' : 'days'}
            </div>
            <div className="text-sm text-muted">
              Current streak{streak.longest > 0 && ` · best ${streak.longest}`}
            </div>
          </div>
        </div>
        <Stat label="Total time" value={`${minutes}`} sub="minutes" />
        <Stat label="Sessions" value={`${history.length}`} sub="saved" />
      </div>

      <Card>
        <WeeklyChart days={week} />
      </Card>

      <Card>
        <SectionTitle>Recent sessions</SectionTitle>
        {recent.length === 0 ? (
          <p className="text-muted">
            Nothing here yet. Finish a meditation or breathing session and it’ll appear here.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {recent.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="font-medium">
                    {sessionTitle(s)} · {formatDuration(s.durationSec)}
                  </div>
                  <div className="text-sm text-muted">
                    {new Date(s.startedAt).toLocaleString('en-AU', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                    {!s.completed && ' · ended early'}
                  </div>
                  {s.note && <p className="mt-1 text-sm break-words italic">“{s.note}”</p>}
                </div>
                <button
                  type="button"
                  onClick={() => setToDelete(s)}
                  className="min-h-11 shrink-0 rounded-full px-3 text-sm text-muted hover:bg-surface-2"
                  aria-label={`Delete ${sessionTitle(s)} session`}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionTitle>Back up or move devices</SectionTitle>
        <p className="mb-4 text-sm text-muted">
          Save your history as a file, then import it on another phone or browser. Imports are
          merged — nothing is overwritten.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => void exportHistory()} disabled={history.length === 0}>
            {IS_ARTIFACT ? 'Copy backup' : 'Export'}
          </Button>
          <Button onClick={() => fileRef.current?.click()}>Import</Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importHistory(file);
            e.target.value = '';
          }}
        />
        <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-muted">
          {message}
        </p>
      </Card>

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this session?"
        message="It will be removed from your history and stats."
        confirmLabel="Delete"
        danger
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) deleteSession(toDelete.id);
          setToDelete(null);
        }}
      />
    </div>
  );
}
