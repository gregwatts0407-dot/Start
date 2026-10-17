/**
 * Browsers — iOS Safari most strictly — only let an AudioContext produce
 * sound once it has been created or resumed inside a user gesture. This
 * module owns that dance:
 *
 *  - the context is created lazily, on the first gesture, never on load;
 *  - every gesture resumes it until it reports "running", then the
 *    listeners remove themselves;
 *  - a one-sample silent buffer is played inside the gesture, which is what
 *    actually "warms up" output on older iOS versions;
 *  - on iOS 17+, navigator.audioSession is set to "playback" so bells are
 *    heard even when the ring/silent switch is on silent;
 *  - when the page becomes visible again (after a phone call, Siri or the
 *    lock screen, which leave the context "interrupted"), it is resumed.
 */

export type ContextFactory = () => AudioContext;

const GESTURE_EVENTS = ['pointerdown', 'touchend', 'keydown', 'click'] as const;

interface AudioSessionNavigator {
  audioSession?: { type: string };
}

export class AudioUnlocker {
  private ctx: AudioContext | null = null;
  private listening = false;
  private readonly onGesture = () => {
    void this.unlock();
  };
  private readonly onVisible = () => {
    if (document.visibilityState === 'visible' && this.ctx && this.ctx.state !== 'running') {
      void this.ctx.resume().catch(() => undefined);
    }
  };

  constructor(
    private readonly createContext: ContextFactory,
    private readonly target: Pick<Document, 'addEventListener' | 'removeEventListener'> = document,
  ) {}

  /** The context, if a gesture has created it yet. */
  get context(): AudioContext | null {
    return this.ctx;
  }

  get isRunning(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Starts waiting for the first gesture. Safe to call more than once. */
  install(): void {
    if (this.listening) return;
    this.listening = true;
    for (const type of GESTURE_EVENTS) {
      this.target.addEventListener(type, this.onGesture, { capture: true, passive: true });
    }
    this.target.addEventListener('visibilitychange', this.onVisible);
  }

  private removeGestureListeners(): void {
    for (const type of GESTURE_EVENTS) {
      this.target.removeEventListener(type, this.onGesture, { capture: true });
    }
  }

  /**
   * Creates/resumes the context. Must be called synchronously from a user
   * gesture handler the first time; later calls are harmless.
   */
  async unlock(): Promise<AudioContext | null> {
    try {
      if (!this.ctx) {
        setPlaybackSession();
        this.ctx = this.createContext();
      }
      const ctx = this.ctx;
      if (ctx.state !== 'running') {
        playSilentBuffer(ctx);
        await ctx.resume();
      }
      if (ctx.state === 'running') this.removeGestureListeners();
      return ctx;
    } catch {
      return this.ctx;
    }
  }
}

function setPlaybackSession(): void {
  const nav = navigator as Navigator & AudioSessionNavigator;
  try {
    if (nav.audioSession) nav.audioSession.type = 'playback';
  } catch {
    // Not supported — the silent switch will mute sounds on iOS.
  }
}

function playSilentBuffer(ctx: AudioContext): void {
  try {
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    // Some test environments lack these nodes.
  }
}

export function defaultContextFactory(): AudioContext {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error('Web Audio is not supported in this browser.');
  return new Ctor({ latencyHint: 'playback' });
}
