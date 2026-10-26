// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  delete window.WH_ANDROID;
  delete window.AndroidBridge;
  window.location.hash = '';
  vi.resetModules();
});

describe('router', () => {
  it('parses dossier routes and decodes the topic name', async () => {
    const { parsePath } = await import('./router');
    expect(parsePath('/dossier/%D0%9A%D0%BE%D1%81%D0%BE%D0%B2%D0%BE')).toMatchObject({
      page: 'dossier',
      dossierId: 'Косово',
    });
    expect(parsePath('/search', '?q=Рим')).toMatchObject({ page: '/search', query: 'Рим' });
  });

  it('uses hash routes inside the packaged Android app', async () => {
    window.AndroidBridge = { isNativeApp: () => true };
    const router = await import('./router');
    expect(router.useHashRoutes).toBe(true);
    router.navigate('/countries');
    expect(window.location.hash).toBe('#/countries');
    expect(router.currentPath()).toBe('/countries');
  });

  it('prefers real paths on the web', async () => {
    const router = await import('./router');
    expect(router.useHashRoutes).toBe(false);
    expect(router.currentPath()).toBe(window.location.pathname);
  });
});
