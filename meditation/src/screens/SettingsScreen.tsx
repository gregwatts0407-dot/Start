import { useState } from 'react';
import { audio } from '../audio/engine';
import { ConfirmDialog } from '../components/Dialog';
import { ShareButton } from '../components/ShareButton';
import { Button, Card, ChoiceChips, SectionTitle, Select, Slider, Toggle } from '../components/ui';
import type { ThemePreference } from '../lib/types';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { resetAll, updateSettings, useSettings } from '../state/store';
import { PRESET_MINUTES, TimerOptions } from './MeditateScreen';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Match device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function SettingsScreen() {
  const settings = useSettings();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const { canInstall, install } = useInstallPrompt();

  const durationOptions = [...new Set([...PRESET_MINUTES, settings.meditationMinutes])]
    .sort((a, b) => a - b)
    .map((m) => ({ value: m, label: `${m} min` }));

  return (
    <div className="space-y-5">
      <header className="pt-2">
        <h1 className="text-3xl font-semibold">Settings</h1>
      </header>

      <Card>
        <SectionTitle>Appearance</SectionTitle>
        <ChoiceChips
          label="Theme"
          hideLabel
          value={settings.theme}
          options={THEME_OPTIONS}
          onChange={(theme) => updateSettings({ theme })}
        />
      </Card>

      <Card className="space-y-2">
        <SectionTitle>Meditation timer</SectionTitle>
        <Select
          label="Default length"
          value={settings.meditationMinutes}
          options={durationOptions}
          onChange={(meditationMinutes) => updateSettings({ meditationMinutes })}
        />
        <TimerOptions />
      </Card>

      <Card className="space-y-2">
        <SectionTitle>Sound and touch</SectionTitle>
        <Slider
          label="Bell and cue volume"
          value={settings.bellVolume}
          onChange={(bellVolume) => updateSettings({ bellVolume })}
        />
        <Button className="w-full" onClick={() => void audio.playBell(settings.startBell, settings.bellVolume)}>
          Test bell
        </Button>
        <Toggle
          label="Vibration"
          description="Gentle haptics on bells and breathing phases (where supported)"
          checked={settings.haptics}
          onChange={(haptics) => {
            updateSettings({ haptics });
            if (haptics && 'vibrate' in navigator) navigator.vibrate(40);
          }}
        />
      </Card>

      <Card>
        <SectionTitle>Share</SectionTitle>
        <p className="mb-4 text-sm text-muted">
          Know someone who could use a calm moment? Send them the link. To install, use your
          browser’s “Add to Home Screen” option.
        </p>
        {canInstall && (
          <Button className="mb-3 w-full" onClick={() => void install()}>
            Install on this device
          </Button>
        )}
        <ShareButton />
      </Card>

      <Card>
        <SectionTitle>Your data</SectionTitle>
        <p className="mb-4 text-sm text-muted">
          Stillpoint has no accounts and no tracking. Everything stays in this browser on this
          device.
        </p>
        <Button variant="danger" className="w-full" onClick={() => setConfirmReset(true)}>
          Reset all data
        </Button>
        <p role="status" aria-live="polite" className="mt-2 min-h-5 text-center text-sm text-muted">
          {resetDone ? 'All data has been cleared.' : ''}
        </p>
      </Card>

      <p className="pb-2 text-center text-xs text-muted">
        Stillpoint · all sounds are generated on your device
      </p>

      <ConfirmDialog
        open={confirmReset}
        title="Reset all data?"
        message="This permanently deletes your session history, reflections and settings on this device. Export a backup first if you want to keep them."
        confirmLabel="Delete everything"
        danger
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          audio.stopAllAmbient();
          resetAll();
          setConfirmReset(false);
          setResetDone(true);
        }}
      />
    </div>
  );
}
