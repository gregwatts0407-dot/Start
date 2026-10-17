import { AMBIENT_INFO } from '../audio/ambient';
import { audio } from '../audio/engine';
import { AMBIENT_IDS } from '../lib/storage';
import type { AmbientId } from '../lib/types';
import { updateSettings, useSettings } from '../state/store';
import { Button, cx, Slider } from './ui';

/** Toggle and level for each generated soundscape, plus a master volume. */
export function SoundMixer({ compact }: { compact?: boolean }) {
  const settings = useSettings();
  const anyOn = AMBIENT_IDS.some((id) => settings.ambient[id].on);

  const setLayer = (id: AmbientId, patch: Partial<{ on: boolean; volume: number }>) => {
    audio.prime();
    updateSettings({
      ambient: { ...settings.ambient, [id]: { ...settings.ambient[id], ...patch } },
    });
  };

  const stopAll = () => {
    const ambient = { ...settings.ambient };
    for (const id of AMBIENT_IDS) ambient[id] = { ...ambient[id], on: false };
    updateSettings({ ambient });
  };

  return (
    <div className="space-y-3">
      <ul className={cx('grid gap-3', !compact && 'sm:grid-cols-2')}>
        {AMBIENT_IDS.map((id) => {
          const layer = settings.ambient[id];
          const info = AMBIENT_INFO[id];
          return (
            <li
              key={id}
              className={cx(
                'rounded-2xl p-4 ring-1 transition-colors',
                layer.on ? 'bg-accent-soft ring-accent/40' : 'bg-surface ring-line',
              )}
            >
              <button
                type="button"
                aria-pressed={layer.on}
                onClick={() => setLayer(id, { on: !layer.on })}
                className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
              >
                <span>
                  <span className="block font-semibold">{info.label}</span>
                  {!compact && <span className="block text-sm text-muted">{info.description}</span>}
                </span>
                <span
                  className={cx(
                    'rounded-full px-3 py-1 text-sm font-medium',
                    layer.on ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted',
                  )}
                >
                  {layer.on ? 'Playing' : 'Off'}
                </span>
              </button>
              {layer.on && (
                <div className="mt-1 fade-in">
                  <Slider
                    label={`${info.label} level`}
                    value={layer.volume}
                    onChange={(volume) => setLayer(id, { volume })}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <Slider
        label="Ambient volume"
        value={settings.ambientVolume}
        onChange={(ambientVolume) => updateSettings({ ambientVolume })}
      />
      {anyOn && (
        <Button variant="ghost" className="w-full" onClick={stopAll}>
          Stop all sounds
        </Button>
      )}
    </div>
  );
}
