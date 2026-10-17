import { useState } from 'react';
import { calculateStreak } from '../lib/stats';
import { formatDuration } from '../lib/timer';
import type { SessionType } from '../lib/types';
import { addSession, updateSession, useHistory } from '../state/store';
import { Dialog } from './Dialog';
import { LotusIcon } from './Icons';
import { Button } from './ui';

export interface FinishedSession {
  type: SessionType;
  startedAt: string;
  durationSec: number;
  completed: boolean;
  pattern?: string;
  /** Set when the session was already logged (completed sessions are saved straight away). */
  recordId?: string;
}

/** Sessions shorter than this that end early aren't offered for saving. */
export const MIN_LOGGABLE_SEC = 60;

/** Logs a finished session if it completed, returning it with its record id. */
export function logIfComplete(session: FinishedSession): FinishedSession {
  if (!session.completed) return session;
  const record = addSession({
    type: session.type,
    startedAt: session.startedAt,
    durationSec: Math.round(session.durationSec),
    completed: true,
    pattern: session.pattern,
  });
  return { ...session, recordId: record.id };
}

export function SessionSummary({
  session,
  onClose,
}: {
  session: FinishedSession | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={session !== null} onClose={onClose} labelledBy="summary-title">
      {session && <SummaryBody key={session.startedAt} session={session} onClose={onClose} />}
    </Dialog>
  );
}

function SummaryBody({ session, onClose }: { session: FinishedSession; onClose: () => void }) {
  const [note, setNote] = useState('');
  const history = useHistory();
  const streak = calculateStreak(history).current;
  const saved = session.recordId !== undefined;

  const save = () => {
    const trimmed = note.trim() || undefined;
    if (saved) {
      if (trimmed) updateSession(session.recordId!, { note: trimmed });
    } else {
      addSession({
        type: session.type,
        startedAt: session.startedAt,
        durationSec: Math.round(session.durationSec),
        completed: false,
        pattern: session.pattern,
        note: trimmed,
      });
    }
    onClose();
  };

  const what = session.type === 'meditation' ? 'meditation' : 'breathing';

  return (
    <div className="text-center">
      <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-accent">
        <LotusIcon size={30} />
      </div>
      <h2 id="summary-title" className="text-2xl font-semibold">
        {session.completed ? 'Well done' : 'Session ended'}
      </h2>
      <p className="mt-1 text-muted">
        {formatDuration(session.durationSec)} of {what}
        {saved && streak > 0 && ` · ${streak}-day streak`}
      </p>

      <label htmlFor="reflection" className="mt-6 block text-left text-sm font-medium">
        A one-line reflection <span className="font-normal text-muted">(optional)</span>
      </label>
      <input
        id="reflection"
        type="text"
        maxLength={140}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
        }}
        placeholder="How do you feel?"
        className="mt-1 min-h-12 w-full rounded-2xl bg-surface-2 px-4 text-ink placeholder:text-muted"
      />

      <div className="mt-6 flex flex-col gap-2">
        <Button variant="primary" onClick={save}>
          {saved ? 'Done' : 'Save to history'}
        </Button>
        {!saved && (
          <Button variant="ghost" onClick={onClose}>
            Don’t save
          </Button>
        )}
      </div>
    </div>
  );
}
