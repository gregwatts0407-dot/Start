'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase/env';
import type { Artwork, ScriptCue, Visibility } from '@/lib/types';
import { AmbientEngine, type AmbientKind } from './ambient';
import { ScriptedVoice } from './scripted-voice';
import { FullPlayer } from './full-player';
import { MiniPlayer } from './mini-player';
import { ReflectionDialog } from './reflection-dialog';

export interface PlayerTrack {
  meditationId: string;
  slug: string;
  title: string;
  instructorName: string;
  category: string;
  artwork: Artwork;
  coverUrl: string | null;
  durationSeconds: number;
  /** A recording (signed URL, external URL or offline blob URL). */
  src: string | null;
  /** Timed guidance spoken by the browser when there is no recording. */
  script: ScriptCue[] | null;
  programId?: string | null;
  /** Continue an unfinished play instead of starting a new one. */
  resume?: { playId: string; position: number; listened: number } | null;
  /** Start part-way through, e.g. when joining a live session late. */
  startAt?: number;
}

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended';

interface PlayerContextValue {
  track: PlayerTrack | null;
  status: PlayerStatus;
  currentTime: number;
  duration: number;
  rate: number;
  volume: number;
  ambient: AmbientKind | null;
  ambientVolume: number;
  caption: string | null;
  expanded: boolean;
  load: (track: PlayerTrack, options?: { expand?: boolean }) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (seconds: number) => void;
  skip: (delta: number) => void;
  setRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  setAmbient: (kind: AmbientKind | null) => void;
  setAmbientVolume: (volume: number) => void;
  setExpanded: (expanded: boolean) => void;
  close: () => void;
}

const PlayerContext = React.createContext<PlayerContextValue | null>(null);

export function usePlayer() {
  const ctx = React.useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside <PlayerProvider>');
  return ctx;
}

const SYNC_INTERVAL_MS = 15_000;
const SETTINGS_KEY = 'stillness:player';

interface StoredSettings {
  rate?: number;
  volume?: number;
  ambient?: AmbientKind | null;
  ambientVolume?: number;
}

function readSettings(): StoredSettings {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as StoredSettings;
  } catch {
    return {};
  }
}

/**
 * Save listening progress with `keepalive`, so the request still completes if
 * the tab is closing. Goes straight to PostgREST with the current session.
 */
async function saveProgress(playId: string, listened: number, position: number) {
  const {
    data: { session },
  } = await createClient().auth.getSession();
  if (!session) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/plays?id=eq.${playId}&select=completed`, {
      method: 'PATCH',
      keepalive: true,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ listened_seconds: listened, position_seconds: position }),
    });
    if (!response.ok) return null;
    const rows = (await response.json()) as { completed: boolean }[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

interface PlayerProviderProps {
  children: React.ReactNode;
  defaultAmbient: AmbientKind | null;
  defaultVisibility: Visibility;
}

export function PlayerProvider({ children, defaultAmbient, defaultVisibility }: PlayerProviderProps) {
  const router = useRouter();
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const voiceRef = React.useRef<ScriptedVoice | null>(null);
  const ambientRef = React.useRef<AmbientEngine | null>(null);
  const trackRef = React.useRef<PlayerTrack | null>(null);

  // Listening bookkeeping, kept in refs so timers always see current values.
  const listenedRef = React.useRef(0);
  const lastTimeRef = React.useRef(0);
  const playIdRef = React.useRef<string | null>(null);
  const creatingRef = React.useRef<Promise<string | null> | null>(null);
  const lastSyncRef = React.useRef(0);
  const syncedListenedRef = React.useRef(-1);
  const completedRef = React.useRef(false);
  const statusRef = React.useRef<PlayerStatus>('idle');

  const [track, setTrack] = React.useState<PlayerTrack | null>(null);
  const [status, setStatusState] = React.useState<PlayerStatus>('idle');
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [rate, setRateState] = React.useState(1);
  const [volume, setVolumeState] = React.useState(1);
  const [ambient, setAmbientState] = React.useState<AmbientKind | null>(defaultAmbient);
  const [ambientVolume, setAmbientVolumeState] = React.useState(0.4);
  const [caption, setCaption] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(false);
  const [reflection, setReflection] = React.useState<{ track: PlayerTrack; playId: string | null } | null>(null);

  const setStatus = React.useCallback((next: PlayerStatus) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);

  const ambientEngine = React.useCallback(() => {
    ambientRef.current ??= new AmbientEngine();
    return ambientRef.current;
  }, []);

  // Restore remembered player settings.
  React.useEffect(() => {
    const saved = readSettings();
    if (saved.rate) setRateState(saved.rate);
    if (typeof saved.volume === 'number') setVolumeState(saved.volume);
    if (saved.ambient !== undefined) setAmbientState(saved.ambient);
    if (typeof saved.ambientVolume === 'number') setAmbientVolumeState(saved.ambientVolume);
  }, []);

  React.useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ rate, volume, ambient, ambientVolume } satisfies StoredSettings));
    } catch {
      // storage unavailable (private mode); settings just won't persist
    }
  }, [rate, volume, ambient, ambientVolume]);

  const engineTime = React.useCallback(() => {
    if (voiceRef.current) return voiceRef.current.currentTime;
    return audioRef.current?.currentTime ?? 0;
  }, []);

  // --- Progress sync ---------------------------------------------------------

  const ensurePlay = React.useCallback(async () => {
    if (playIdRef.current) return playIdRef.current;
    const current = trackRef.current;
    if (!current) return null;
    creatingRef.current ??= (async () => {
      const { data, error } = await createClient()
        .from('plays')
        .insert({ meditation_id: current.meditationId, program_id: current.programId ?? null })
        .select('id')
        .single();
      if (error) {
        console.warn('Could not record play', error.message);
        return null;
      }
      // Only keep the id if the same track is still loaded.
      if (trackRef.current?.meditationId === current.meditationId) playIdRef.current = data.id as string;
      return data.id as string;
    })();
    const id = await creatingRef.current;
    creatingRef.current = null;
    return id;
  }, []);

  const sync = React.useCallback(
    async (force = false) => {
      const current = trackRef.current;
      if (!current) return;
      const listened = Math.floor(listenedRef.current);
      if (!force && listened === syncedListenedRef.current) return;
      const playId = await ensurePlay();
      if (!playId) return;
      syncedListenedRef.current = listened;
      lastSyncRef.current = Date.now();
      const data = await saveProgress(playId, listened, Math.floor(engineTime()));
      if (data?.completed && !completedRef.current) {
        completedRef.current = true;
      }
    },
    [engineTime, ensurePlay],
  );

  // --- Playback lifecycle ----------------------------------------------------

  const handleEnded = React.useCallback(() => {
    const current = trackRef.current;
    if (!current || statusRef.current === 'ended') return;
    setStatus('ended');
    ambientRef.current?.setActive(false);
    if (voiceRef.current) {
      voiceRef.current.pause();
      ambientRef.current?.chime(volume);
    }
    setCaption(null);
    void sync(true).then(() => {
      setReflection({ track: current, playId: playIdRef.current });
    });
  }, [setStatus, sync, volume]);

  const onPlaying = React.useCallback(() => {
    setStatus('playing');
    ambientEngine().setActive(true);
    void ensurePlay();
  }, [ambientEngine, ensurePlay, setStatus]);

  const teardown = React.useCallback(() => {
    voiceRef.current?.destroy();
    voiceRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
  }, []);

  const load = React.useCallback(
    (next: PlayerTrack, options: { expand?: boolean } = {}) => {
      const engine = ambientEngine();
      engine.unlock();

      const previous = trackRef.current;
      if (previous && previous.meditationId === next.meditationId && statusRef.current !== 'ended' && next.startAt === undefined) {
        // Same session: just resume it.
        if (voiceRef.current) {
          voiceRef.current.play();
          onPlaying();
        } else {
          void audioRef.current?.play().catch(() => setStatus('paused'));
        }
        if (options.expand ?? true) setExpanded(true);
        return;
      }

      if (previous) void sync(true);
      teardown();

      trackRef.current = next;
      playIdRef.current = next.resume?.playId ?? null;
      creatingRef.current = null;
      listenedRef.current = next.resume?.listened ?? 0;
      syncedListenedRef.current = Math.floor(listenedRef.current);
      completedRef.current = false;
      lastSyncRef.current = Date.now();

      let start = next.startAt ?? next.resume?.position ?? 0;
      if (start > next.durationSeconds - 15) start = 0;
      lastTimeRef.current = start;

      setTrack(next);
      setDuration(next.durationSeconds);
      setCurrentTime(start);
      setCaption(null);
      setReflection(null);
      setExpanded(options.expand ?? true);
      engine.setKind(ambient);
      engine.setVolume(ambientVolume);

      if (next.src) {
        const audio = audioRef.current!;
        setStatus('loading');
        audio.src = next.src;
        audio.playbackRate = rate;
        audio.volume = volume;
        if (start > 0) {
          audio.addEventListener('loadedmetadata', () => (audio.currentTime = start), { once: true });
        }
        // play() must be called synchronously inside the user's tap for iOS.
        audio.play().catch((error: unknown) => {
          if ((error as DOMException)?.name !== 'AbortError') setStatus('paused');
        });
      } else if (next.script) {
        const voice = new ScriptedVoice(next.script, next.durationSeconds, setCaption);
        voice.setRate(rate);
        voice.setVolume(volume);
        voice.seek(start);
        voiceRef.current = voice;
        if (start < 1) engine.chime(volume);
        voice.play();
        onPlaying();
      } else {
        setStatus('idle');
        toast.error('This session has no audio yet.');
      }
    },
    [ambient, ambientEngine, ambientVolume, onPlaying, rate, setStatus, sync, teardown, volume],
  );

  const play = React.useCallback(() => {
    const current = trackRef.current;
    if (!current) return;
    ambientEngine().unlock();
    if (statusRef.current === 'ended') {
      load({ ...current, resume: null, startAt: 0 }, { expand: expanded });
      return;
    }
    if (voiceRef.current) {
      voiceRef.current.play();
      onPlaying();
    } else {
      void audioRef.current?.play().catch(() => setStatus('paused'));
    }
  }, [ambientEngine, expanded, load, onPlaying, setStatus]);

  const pause = React.useCallback(() => {
    if (voiceRef.current) {
      voiceRef.current.pause();
      setStatus('paused');
      ambientRef.current?.setActive(false);
    } else {
      audioRef.current?.pause();
    }
    void sync();
  }, [setStatus, sync]);

  const toggle = React.useCallback(() => {
    if (statusRef.current === 'playing' || statusRef.current === 'loading') pause();
    else play();
  }, [pause, play]);

  const seek = React.useCallback(
    (seconds: number) => {
      const current = trackRef.current;
      if (!current) return;
      const target = Math.max(0, Math.min(seconds, duration || current.durationSeconds));
      if (voiceRef.current) voiceRef.current.seek(target);
      else if (audioRef.current) audioRef.current.currentTime = target;
      lastTimeRef.current = target;
      setCurrentTime(target);
      if (statusRef.current === 'ended' && target < (duration || current.durationSeconds)) setStatus('paused');
    },
    [duration, setStatus],
  );

  const skip = React.useCallback((delta: number) => seek(engineTime() + delta), [engineTime, seek]);

  const setRate = React.useCallback((next: number) => {
    setRateState(next);
    voiceRef.current?.setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }, []);

  const setVolume = React.useCallback((next: number) => {
    setVolumeState(next);
    voiceRef.current?.setVolume(next);
    if (audioRef.current) audioRef.current.volume = next;
  }, []);

  const setAmbient = React.useCallback(
    (kind: AmbientKind | null) => {
      setAmbientState(kind);
      const engine = ambientEngine();
      engine.unlock();
      engine.setKind(kind);
      engine.setActive(statusRef.current === 'playing');
    },
    [ambientEngine],
  );

  const setAmbientVolume = React.useCallback(
    (next: number) => {
      setAmbientVolumeState(next);
      ambientEngine().setVolume(next);
    },
    [ambientEngine],
  );

  const close = React.useCallback(() => {
    void sync(true);
    teardown();
    ambientRef.current?.setActive(false);
    trackRef.current = null;
    playIdRef.current = null;
    setTrack(null);
    setStatus('idle');
    setExpanded(false);
    setCaption(null);
  }, [setStatus, sync, teardown]);

  // --- Audio element events --------------------------------------------------

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPause = () => {
      if (voiceRef.current || statusRef.current === 'ended' || !trackRef.current) return;
      setStatus('paused');
      ambientRef.current?.setActive(false);
    };
    const onWaiting = () => {
      if (!voiceRef.current && trackRef.current) setStatus('loading');
    };
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
    };
    const onEnded = () => {
      if (!voiceRef.current) handleEnded();
    };
    const onError = () => {
      if (!trackRef.current || voiceRef.current || !audio.getAttribute('src')) return;
      setStatus('paused');
      toast.error('We couldn’t load this recording. Check your connection and try again.');
    };
    const onPlayingEvent = () => {
      if (!voiceRef.current) onPlaying();
    };
    audio.addEventListener('playing', onPlayingEvent);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('playing', onPlayingEvent);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [handleEnded, onPlaying, setStatus]);

  // --- Clock -----------------------------------------------------------------

  React.useEffect(() => {
    if (status !== 'playing') return;
    const id = window.setInterval(() => {
      const t = voiceRef.current ? voiceRef.current.tick() : (audioRef.current?.currentTime ?? 0);
      const delta = t - lastTimeRef.current;
      // Count real listening only: ignore seeks and big jumps.
      if (delta > 0 && delta < 3) listenedRef.current += delta;
      lastTimeRef.current = t;
      setCurrentTime(t);

      const current = trackRef.current;
      if (voiceRef.current && current && t >= current.durationSeconds - 0.05) handleEnded();
      if (Date.now() - lastSyncRef.current > SYNC_INTERVAL_MS) void sync();
    }, 250);
    return () => window.clearInterval(id);
  }, [handleEnded, status, sync]);

  // Fade captions after they've had time to be read.
  React.useEffect(() => {
    if (!caption) return;
    const id = window.setTimeout(() => setCaption(null), Math.max(6000, caption.length * 90));
    return () => window.clearTimeout(id);
  }, [caption]);

  // Save progress if the tab is hidden or closed mid-session.
  React.useEffect(() => {
    const flush = () => {
      if (trackRef.current && statusRef.current !== 'idle') void sync(true);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [sync]);

  React.useEffect(() => () => ambientRef.current?.dispose(), []);

  // --- Lock screen / media keys ---------------------------------------------

  React.useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    if (!track) {
      session.metadata = null;
      return;
    }
    session.metadata = new MediaMetadata({
      title: track.title,
      artist: track.instructorName,
      album: 'Stillness',
      artwork: [{ src: track.coverUrl ?? '/icon.svg', sizes: '512x512', type: track.coverUrl ? 'image/jpeg' : 'image/svg+xml' }],
    });
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => play()],
      ['pause', () => pause()],
      ['seekbackward', (d) => skip(-(d.seekOffset ?? 15))],
      ['seekforward', (d) => skip(d.seekOffset ?? 15)],
      ['seekto', (d) => d.seekTime !== undefined && seek(d.seekTime)],
      ['stop', () => close()],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // action not supported in this browser
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // ignore
        }
      }
    };
  }, [close, pause, play, seek, skip, track]);

  React.useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = status === 'playing' ? 'playing' : status === 'idle' ? 'none' : 'paused';
  }, [status]);

  React.useEffect(() => {
    if (!('mediaSession' in navigator) || !track || !duration) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: rate,
        position: Math.min(duration, Math.max(0, Math.floor(currentTime))),
      });
    } catch {
      // ignore invalid state during transitions
    }
    // Updating every second is plenty for the lock screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(currentTime), duration, rate, track]);

  const value = React.useMemo<PlayerContextValue>(
    () => ({
      track,
      status,
      currentTime,
      duration,
      rate,
      volume,
      ambient,
      ambientVolume,
      caption,
      expanded,
      load,
      play,
      pause,
      toggle,
      seek,
      skip,
      setRate,
      setVolume,
      setAmbient,
      setAmbientVolume,
      setExpanded,
      close,
    }),
    [
      track,
      status,
      currentTime,
      duration,
      rate,
      volume,
      ambient,
      ambientVolume,
      caption,
      expanded,
      load,
      play,
      pause,
      toggle,
      seek,
      skip,
      setRate,
      setVolume,
      setAmbient,
      setAmbientVolume,
      close,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {/* One persistent element, so playback continues across navigation. */}
      <audio ref={audioRef} preload="auto" playsInline className="hidden" />
      <MiniPlayer />
      <FullPlayer />
      <ReflectionDialog
        key={reflection?.playId ?? reflection?.track.meditationId ?? 'none'}
        open={Boolean(reflection)}
        track={reflection?.track ?? null}
        playId={reflection?.playId ?? null}
        defaultVisibility={defaultVisibility}
        onClose={() => {
          setReflection(null);
          router.refresh();
        }}
      />
    </PlayerContext.Provider>
  );
}
