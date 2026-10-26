import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'wh:theme';
const THEMES = ['auto', 'dark', 'light'];

const systemPrefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches !== false;

const readStored = () => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
};

/**
 * Applies the chosen theme to <html data-theme> so CSS variables switch.
 * `auto` follows the operating system / WebView preference.
 */
export function useTheme() {
  const [theme, setTheme] = useState(readStored);

  const resolved = theme === 'auto' ? (systemPrefersDark() ? 'dark' : 'light') : theme;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore
    }
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = resolved;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', resolved === 'dark' ? '#080d1b' : '#f6f8fc');
    }
  }, [theme, resolved]);

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => setTheme((current) => (current === 'auto' ? 'auto' : current));
    media.addEventListener?.('change', listener);
    return () => media.removeEventListener?.('change', listener);
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, resolved, setTheme, toggle, options: THEMES };
}
