import { SoundMixer } from '../components/SoundMixer';

export function SoundsScreen() {
  return (
    <div className="space-y-5">
      <header className="pt-2">
        <h1 className="text-3xl font-semibold">Sounds</h1>
        <p className="mt-1 text-muted">
          Gentle soundscapes, created live on your device. Mix as many as you like — they keep
          playing while you meditate or breathe.
        </p>
      </header>
      <SoundMixer />
      <p className="text-sm text-muted">
        On iPhone, sounds pause when the screen locks. Keep the app open during a session — the
        screen stays awake while a timer runs.
      </p>
    </div>
  );
}
