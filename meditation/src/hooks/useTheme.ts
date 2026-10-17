import { useEffect, useState } from 'react';
import type { ThemePreference } from '../lib/types';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Applies the theme to <html> and the browser chrome colour. */
export function useTheme(preference: ThemePreference): void {
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(DARK_QUERY).matches);

  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  // When embedded, the host may set data-theme="light|dark" on <html>.
  const [hostTheme, setHostTheme] = useState(() => document.documentElement.dataset.theme);
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setHostTheme(root.dataset.theme));
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const followDark = hostTheme === 'dark' || (hostTheme !== 'light' && systemDark);
  const dark = preference === 'dark' || (preference === 'system' && followDark);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
    document
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      .forEach((meta) => meta.setAttribute('content', dark ? '#16191b' : '#f5f2ec'));
  }, [dark]);
}
