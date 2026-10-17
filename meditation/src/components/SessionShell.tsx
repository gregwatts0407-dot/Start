import { useEffect, useState, type ReactNode } from 'react';
import { AMBIENT_IDS } from '../lib/storage';
import { useSettings } from '../state/store';
import { ConfirmDialog, Dialog } from './Dialog';
import { CloseIcon, PauseIcon, PlayIcon, SpeakerIcon, StopIcon } from './Icons';
import { SoundMixer } from './SoundMixer';
import { Button, cx } from './ui';

/**
 * The full-screen, distraction-free view used while a session runs.
 * Space pauses/resumes and Esc asks to end.
 */
export function SessionShell({
  title,
  paused,
  onTogglePause,
  onEnd,
  children,
}: {
  title: string;
  paused: boolean;
  onTogglePause: () => void;
  onEnd: () => void;
  children: ReactNode;
}) {
  const settings = useSettings();
  const [confirming, setConfirming] = useState(false);
  const [soundsOpen, setSoundsOpen] = useState(false);
  const soundsOn = AMBIENT_IDS.some((id) => settings.ambient[id].on);

  const requestEnd = () => {
    if (settings.confirmEnd) setConfirming(true);
    else onEnd();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirming || soundsOpen) return;
      const target = e.target as HTMLElement;
      if (e.key === ' ' && !['BUTTON', 'INPUT', 'SELECT', 'A'].includes(target.tagName)) {
        e.preventDefault();
        onTogglePause();
      } else if (e.key === 'Escape') {
        // Without this, the browser treats the same key press as a "close
        // request" and instantly cancels the dialog we're about to open.
        e.preventDefault();
        requestEnd();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="fade-in fixed inset-0 z-30 flex flex-col bg-bg pt-[env(safe-area-inset-top)] pb-[max(env(safe-area-inset-bottom),1rem)]">
      <header className="flex items-center justify-between px-4 pt-3">
        <h1 className="text-lg font-medium text-muted">{title}</h1>
        <button
          type="button"
          onClick={() => setSoundsOpen(true)}
          className={cx(
            'flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium',
            soundsOn ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-ink',
          )}
        >
          <SpeakerIcon size={20} />
          {soundsOn ? 'Sounds on' : 'Sounds'}
        </button>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4">{children}</main>

      <div className="flex items-center justify-center gap-6 px-4 pb-4">
        <button
          type="button"
          onClick={requestEnd}
          aria-label="End session"
          className="grid h-14 w-14 place-items-center rounded-full bg-surface-2 text-ink"
        >
          <StopIcon size={22} />
        </button>
        <button
          type="button"
          onClick={onTogglePause}
          aria-label={paused ? 'Resume' : 'Pause'}
          className="grid h-20 w-20 place-items-center rounded-full bg-accent text-accent-ink shadow-md transition active:scale-95"
        >
          {paused ? <PlayIcon size={32} /> : <PauseIcon size={32} />}
        </button>
        <div className="h-14 w-14" aria-hidden="true" />
      </div>

      <ConfirmDialog
        open={confirming}
        title="End this session?"
        message="You can save the time you’ve practised so far."
        confirmLabel="End session"
        cancelLabel="Keep going"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          onEnd();
        }}
      />

      <Dialog open={soundsOpen} onClose={() => setSoundsOpen(false)} labelledBy="sounds-sheet-title">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="sounds-sheet-title" className="text-xl font-semibold">
            Ambient sounds
          </h2>
          <Button variant="ghost" className="!min-h-11 !px-3" onClick={() => setSoundsOpen(false)} aria-label="Close">
            <CloseIcon size={20} />
          </Button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          <SoundMixer compact />
        </div>
      </Dialog>
    </div>
  );
}
