/**
 * Tiny localStorage-backed cache for the browser research service.
 *
 * The Express backend already caches results in SQLite; when the app runs
 * without a backend (static build, packaged Android app) this is what makes
 * previously opened dossiers available offline.
 */

const PREFIX = 'wh:cache:v1:';
const DAY = 24 * 60 * 60 * 1000;
export const TTL = { search: 7 * DAY, dossier: 90 * DAY };

const memory = new Map();

const safeStorage = () => {
  try {
    if (typeof localStorage === 'undefined') return null;
    const probe = `${PREFIX}__probe__`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
};

const store = safeStorage();

export const normalizeKey = (value) => String(value || '').trim().toLowerCase();

export function readCache(kind, key) {
  const cacheKey = `${PREFIX}${kind}:${normalizeKey(key)}`;
  try {
    const raw = memory.get(cacheKey) ?? store?.getItem(cacheKey);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || typeof entry !== 'object') return null;
    const age = Date.now() - Number(entry.createdAt || 0);
    return { data: entry.data, createdAt: entry.createdAt, stale: age > (TTL[kind] ?? DAY) };
  } catch {
    return null;
  }
}

export function writeCache(kind, key, data) {
  const cacheKey = `${PREFIX}${kind}:${normalizeKey(key)}`;
  const entry = JSON.stringify({ createdAt: Date.now(), data });
  memory.set(cacheKey, entry);
  try {
    store?.setItem(cacheKey, entry);
  } catch {
    // Quota exceeded or storage disabled: the in-memory copy still works.
  }
}

export function clearCache() {
  memory.clear();
  try {
    if (!store) return;
    const doomed = [];
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (key?.startsWith(PREFIX)) doomed.push(key);
    }
    for (const key of doomed) store.removeItem(key);
  } catch {
    // ignore
  }
}
