import { useCallback, useEffect, useState } from 'react';

/** State persisted in localStorage (works in the WebView of the mobile app). */
export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
      return raw === null ? initialValue : JSON.parse(raw);
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage may be unavailable (private mode) — state still works in memory.
    }
  }, [key, value]);

  const update = useCallback((next) => {
    setValue((current) => (typeof next === 'function' ? next(current) : next));
  }, []);

  return [value, update];
}
