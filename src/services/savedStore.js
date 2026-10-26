/**
 * «Сохранённое» (bookmarks / offline reading list).
 *
 * Module-level store so every component sees the same list without prop
 * drilling. Persisted in localStorage, which also works inside the packaged
 * Android app's WebView.
 */
const KEY = 'wh:saved:v1';

const listeners = new Set();
let items = [];

const read = () => {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

let loaded = false;
const ensure = () => {
  if (!loaded) {
    items = read();
    loaded = true;
  }
  return items;
};

const persist = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
  for (const listener of listeners) listener(items);
};

export const getSaved = () => [...ensure()];

export const isSaved = (id) => ensure().some((item) => item.id === id);

export function save(entry) {
  ensure();
  if (!entry?.id || items.some((item) => item.id === entry.id)) return items;
  items = [{ ...entry, savedAt: Date.now() }, ...items];
  persist();
  return items;
}

export function unsave(id) {
  ensure();
  items = items.filter((item) => item.id !== id);
  persist();
  return items;
}

export function toggleSaved(entry) {
  ensure();
  if (items.some((item) => item.id === entry.id)) return unsave(entry.id);
  return save(entry);
}

export function clearSaved() {
  ensure();
  items = [];
  persist();
  return items;
}

export function subscribe(listener) {
  listeners.add(listener);
  ensure();
  return () => listeners.delete(listener);
}
