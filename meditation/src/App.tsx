import { useCallback, useEffect, useRef, useState } from 'react';
import { audio } from './audio/engine';
import { TabBar, TABS, type TabId } from './components/TabBar';
import { useTheme } from './hooks/useTheme';
import { AMBIENT_IDS } from './lib/storage';
import { BreatheScreen } from './screens/BreatheScreen';
import { MeditateScreen } from './screens/MeditateScreen';
import { ProgressScreen } from './screens/ProgressScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SoundsScreen } from './screens/SoundsScreen';
import { useSettings } from './state/store';

function tabFromHash(): TabId {
  const id = location.hash.replace('#', '');
  return TABS.some((t) => t.id === id) ? (id as TabId) : 'meditate';
}

export default function App() {
  const settings = useSettings();
  const [tab, setTab] = useState<TabId>(tabFromHash);
  const [sessionActive, setSessionActive] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  useTheme(settings.theme);

  useEffect(() => {
    audio.install();
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Keep the audio engine in step with the ambient settings.
  useEffect(() => {
    for (const id of AMBIENT_IDS) {
      const layer = settings.ambient[id];
      void audio.setLayer(id, layer.on, layer.volume);
    }
  }, [settings.ambient]);

  useEffect(() => {
    void audio.setAmbientMaster(settings.ambientVolume);
  }, [settings.ambientVolume]);

  const changeTab = useCallback((next: TabId) => {
    setTab(next);
    history.replaceState(null, '', next === 'meditate' ? location.pathname : `#${next}`);
    window.scrollTo({ top: 0 });
    // Move focus to the new screen's heading for keyboard and screen-reader users.
    requestAnimationFrame(() => mainRef.current?.querySelector('h1')?.focus());
  }, []);

  const label = TABS.find((t) => t.id === tab)?.label ?? '';
  useEffect(() => {
    document.title = tab === 'meditate' ? 'Stillpoint — meditation timer' : `${label} · Stillpoint`;
  }, [tab, label]);

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      {!sessionActive && <TabBar current={tab} onChange={changeTab} />}
      <main
        id="main"
        ref={mainRef}
        key={tab}
        className="fade-in mx-auto max-w-xl px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-28 md:pt-8 md:pb-12 [&_h1]:outline-none"
      >
        <HeadingFocusable>
          {tab === 'meditate' && <MeditateScreen onActiveChange={setSessionActive} />}
          {tab === 'breathe' && <BreatheScreen onActiveChange={setSessionActive} />}
          {tab === 'sounds' && <SoundsScreen />}
          {tab === 'progress' && <ProgressScreen />}
          {tab === 'settings' && <SettingsScreen />}
        </HeadingFocusable>
      </main>
    </div>
  );
}

/** Makes the screen's h1 programmatically focusable (tabIndex -1) without each screen opting in. */
function HeadingFocusable({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector('h1')?.setAttribute('tabindex', '-1');
  });
  return <div ref={ref}>{children}</div>;
}
