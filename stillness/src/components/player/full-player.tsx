'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  ChevronDown,
  Gauge,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Subtitles,
  Volume1,
  Volume2,
  VolumeX,
  Waves,
} from 'lucide-react';
import * as React from 'react';
import { Artwork } from '@/components/brand/artwork';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Slider } from '@/components/ui/slider';
import { PLAYBACK_RATES } from '@/lib/constants';
import { cn, formatClock, spokenDuration } from '@/lib/utils';
import { AMBIENT_SOUNDS, type AmbientKind } from './ambient';
import { usePlayer } from './player-provider';

export function FullPlayer() {
  const player = usePlayer();
  const {
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
    setExpanded,
    toggle,
    play,
    seek,
    skip,
    setRate,
    setVolume,
    setAmbient,
    setAmbientVolume,
  } = player;

  const [scrubbing, setScrubbing] = React.useState<number | null>(null);
  const [showCaptions, setShowCaptions] = React.useState(true);

  if (!track) return null;

  const shownTime = scrubbing ?? currentTime;
  const remaining = Math.max(0, duration - shownTime);
  const ended = status === 'ended';
  const playing = status === 'playing';
  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  const onKeyDown = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest('[role="slider"], [role="menu"], input, textarea')) return;
    if (event.key === ' ' || event.key === 'k') {
      event.preventDefault();
      if (ended) play();
      else toggle();
    } else if (event.key === 'ArrowLeft' || event.key === 'j') {
      event.preventDefault();
      skip(-15);
    } else if (event.key === 'ArrowRight' || event.key === 'l') {
      event.preventDefault();
      skip(15);
    }
  };

  return (
    <DialogPrimitive.Root open={expanded} onOpenChange={setExpanded}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          onKeyDown={onKeyDown}
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-navy-deep text-white outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-8 data-[state=closed]:slide-out-to-bottom-8 duration-500"
        >
          {/* Soft colour wash from the session's artwork */}
          <Artwork palette={track.artwork} seed={track.slug} className="pointer-events-none fixed inset-0 scale-125 opacity-25 blur-3xl" />
          <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-navy-deep/40 via-navy-deep/70 to-navy-deep" />

          <div className="relative mx-auto flex w-full max-w-xl flex-1 flex-col px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
            <header className="flex items-center justify-between">
              <DialogPrimitive.Close asChild>
                <Button size="icon" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" aria-label="Minimise player">
                  <ChevronDown />
                </Button>
              </DialogPrimitive.Close>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/60">Now playing</p>
              {track.script ? (
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn('hover:bg-white/10 hover:text-white', showCaptions ? 'text-white' : 'text-white/40')}
                  onClick={() => setShowCaptions((v) => !v)}
                  aria-pressed={showCaptions}
                  aria-label="Show spoken guidance as captions"
                >
                  <Subtitles />
                </Button>
              ) : (
                <span className="size-10" aria-hidden />
              )}
            </header>

            <div className="flex flex-1 flex-col items-center justify-center py-4 sm:py-8">
              <div className="relative flex aspect-square w-full max-w-[min(18rem,30dvh)] items-center justify-center sm:max-w-[min(20rem,32dvh)]">
                <div
                  className={cn(
                    'absolute inset-0 rounded-full bg-white/5 transition-opacity duration-1000',
                    playing ? 'animate-breathe opacity-100' : 'opacity-40',
                  )}
                  aria-hidden
                />
                <Artwork
                  palette={track.artwork}
                  seed={track.slug}
                  coverUrl={track.coverUrl}
                  className={cn(
                    'size-[82%] rounded-full shadow-2xl shadow-black/40 transition-transform duration-1000',
                    playing ? 'scale-100' : 'scale-95',
                  )}
                />
              </div>
              {playing && (
                <p className="mt-4 text-xs uppercase tracking-[0.25em] text-white/40" aria-hidden>
                  Breathe with the circle
                </p>
              )}
            </div>

            <div className="space-y-5">
              <div className="text-center">
                <DialogPrimitive.Title className="font-display text-2xl font-semibold leading-tight text-balance">
                  {track.title}
                </DialogPrimitive.Title>
                <p className="mt-1 text-sm text-white/60">{track.instructorName}</p>
              </div>

              <div
                className={cn(
                  'flex min-h-[3.5rem] items-center justify-center text-center text-[15px] leading-relaxed text-white/80 transition-opacity duration-700',
                  track.script && showCaptions && caption ? 'opacity-100' : 'opacity-0',
                )}
                aria-live="polite"
              >
                {track.script && showCaptions ? caption : null}
              </div>

              <div>
                <Slider
                  tone="light"
                  min={0}
                  max={Math.max(1, Math.floor(duration))}
                  step={1}
                  value={[Math.floor(shownTime)]}
                  onValueChange={([value]) => setScrubbing(value ?? 0)}
                  onValueCommit={([value]) => {
                    seek(value ?? 0);
                    setScrubbing(null);
                  }}
                  thumbLabel="Seek"
                  thumbValueText={`${spokenDuration(shownTime)} of ${spokenDuration(duration)}`}
                />
                <div className="mt-1 flex justify-between text-xs tabular-nums text-white/60">
                  <span>{formatClock(shownTime)}</span>
                  <span aria-label={`${spokenDuration(remaining)} remaining`}>-{formatClock(remaining)}</span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-6">
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-12 text-white hover:bg-white/10 hover:text-white [&_svg]:size-6"
                  onClick={() => skip(-15)}
                  aria-label="Back 15 seconds"
                >
                  <RotateCcw />
                </Button>
                <Button
                  className="size-20 rounded-full bg-white text-navy shadow-lg hover:bg-white/90 [&_svg]:size-8"
                  onClick={ended ? play : toggle}
                  aria-label={ended ? 'Play again' : playing ? 'Pause' : 'Play'}
                >
                  {status === 'loading' ? (
                    <Loader2 className="animate-spin" />
                  ) : ended ? (
                    <RotateCcw />
                  ) : playing ? (
                    <Pause className="fill-current" />
                  ) : (
                    <Play className="translate-x-0.5 fill-current" />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-12 text-white hover:bg-white/10 hover:text-white [&_svg]:size-6"
                  onClick={() => skip(15)}
                  aria-label="Forward 15 seconds"
                >
                  <RotateCw />
                </Button>
              </div>

              <div className="grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <VolumeIcon className="size-4 shrink-0 text-white/70" aria-hidden />
                  <span className="w-16 shrink-0 text-xs text-white/70">Voice</span>
                  <Slider
                    tone="light"
                    min={0}
                    max={100}
                    step={1}
                    value={[Math.round(volume * 100)]}
                    onValueChange={([v]) => setVolume((v ?? 0) / 100)}
                    thumbLabel="Voice volume"
                    thumbValueText={`${Math.round(volume * 100)} percent`}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Waves className="size-4 shrink-0 text-white/70" aria-hidden />
                  <AmbientPicker value={ambient} onChange={setAmbient} />
                  <Slider
                    tone="light"
                    min={0}
                    max={100}
                    step={1}
                    disabled={!ambient}
                    value={[Math.round(ambientVolume * 100)]}
                    onValueChange={([v]) => setAmbientVolume((v ?? 0) / 100)}
                    thumbLabel="Ambient sound volume"
                    thumbValueText={`${Math.round(ambientVolume * 100)} percent`}
                    className={cn(!ambient && 'opacity-40')}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Gauge className="size-4 shrink-0 text-white/70" aria-hidden />
                  <span className="w-16 shrink-0 text-xs text-white/70">Speed</span>
                  <div className="flex flex-1 flex-wrap gap-1.5" role="radiogroup" aria-label="Playback speed">
                    {PLAYBACK_RATES.map((r) => (
                      <button
                        key={r}
                        type="button"
                        role="radio"
                        aria-checked={rate === r}
                        onClick={() => setRate(r)}
                        className={cn(
                          'rounded-full px-3 py-1 text-xs tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
                          rate === r ? 'bg-white text-navy' : 'bg-white/10 text-white/80 hover:bg-white/20',
                        )}
                      >
                        {r}×
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-center text-[11px] text-white/40">
                Space to play or pause · ← → to skip 15 seconds
              </p>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function AmbientPicker({ value, onChange }: { value: AmbientKind | null; onChange: (kind: AmbientKind | null) => void }) {
  const label = AMBIENT_SOUNDS.find((s) => s.id === value)?.label ?? 'No ambience';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="w-24 shrink-0 truncate rounded-full bg-white/10 px-3 py-1 text-left text-xs text-white/90 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          aria-label={`Ambient sound: ${label}`}
        >
          {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Ambient sound</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value ?? 'none'} onValueChange={(v) => onChange(v === 'none' ? null : (v as AmbientKind))}>
          <DropdownMenuRadioItem value="none">None</DropdownMenuRadioItem>
          {AMBIENT_SOUNDS.map((sound) => (
            <DropdownMenuRadioItem key={sound.id} value={sound.id}>
              {sound.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
