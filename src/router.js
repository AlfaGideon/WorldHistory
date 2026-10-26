/**
 * Minimal history router.
 *
 * On the web it uses real paths (`/search`, `/dossier/…`) so links are
 * shareable. Inside the packaged Android app everything is served from
 * `file:///android_asset/…`, where pushState to an absolute path is not
 * allowed — there we fall back to hash routes (`#/search`).
 */

const isPackaged = () =>
  typeof window !== 'undefined'
  && (window.location.protocol === 'file:'
    || window.WH_ANDROID === true
    || typeof window.AndroidBridge !== 'undefined');

export const useHashRoutes = isPackaged();

export function currentPath() {
  if (useHashRoutes) {
    const hash = window.location.hash.replace(/^#/, '');
    return hash || '/';
  }
  return window.location.pathname || '/';
}

export function navigate(path) {
  const target = path.startsWith('/') ? path : `/${path}`;
  if (useHashRoutes) {
    if (currentPath() === target) return;
    window.location.hash = target;
    return;
  }
  if (window.location.pathname === target) return;
  window.history.pushState({}, '', target);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function onRouteChange(handler) {
  const listener = () => handler(currentPath(), window.location.search);
  window.addEventListener('popstate', listener);
  window.addEventListener('hashchange', listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener('hashchange', listener);
  };
}

/** Parses a path into a page descriptor (`?mode=` selects the dossier tab). */
export function parsePath(path, search = '') {
  const normalized = path === '' ? '/' : path;
  const [rawPath, inlineQuery] = normalized.split('?');
  const params = new URLSearchParams([search, inlineQuery].filter(Boolean).join('&'));
  if (rawPath.startsWith('/dossier/')) {
    return {
      page: 'dossier',
      dossierId: decodeURIComponent(rawPath.replace('/dossier/', '')),
      mode: params.get('mode') || 'deep',
      query: '',
    };
  }
  return { page: rawPath, dossierId: null, mode: null, query: params.get('q') || '' };
}
