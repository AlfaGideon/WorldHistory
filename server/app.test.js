import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from './app.js';

const sampleResult = {
  id: 'wiki:Франция',
  title: 'Франция',
  kind: 'Энциклопедия',
  summary: 'Государство в Западной Европе.',
  sourceUrl: 'https://ru.wikipedia.org/wiki/Франция',
  sourceName: 'Wikipedia',
};

let server;
let baseUrl;

before(async () => {
  const app = createApp({ search: async (query) => query === 'offline' ? Promise.reject(new Error('provider unavailable')) : [sampleResult] });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

test('health endpoint reports a working API', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
});

test('search returns normalized provider results', async () => {
  const response = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent('Франция')}`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.mode, 'live-multi-source');
  assert.equal(body.results[0].title, 'Франция');
});

test('dossier is still returned when every provider is unavailable', async () => {
  const response = await fetch(`${baseUrl}/api/dossier/offline`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, 'needs-live-research');
  assert.equal(body.title, 'offline');
  assert.deepEqual(body.sources, []);
  assert.equal(body.infobox.confidence, 'низкая');
  assert.ok(body.disputedClaims.length > 0);
  assert.ok(body.researchPipeline.length > 0);
});

test('source analyzer validates URL', async () => {
  const response = await fetch(`${baseUrl}/api/source/analyze?url=not-a-url`);
  assert.equal(response.status, 400);
});

test('unknown API route returns JSON 404', async () => {
  const response = await fetch(`${baseUrl}/api/unknown`);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, 'Маршрут API не найден');
});

test('search endpoint reuses a fresh cached response', async () => {
  let searchCalls = 0;
  let stored = null;
  const cache = {
    getSearch: () => stored,
    setSearch: (query, type, data) => { stored = { data, stale: false }; },
    getDossier: () => null,
    getSource: () => null,
  };
  const app = createApp({ cache, search: async () => { searchCalls += 1; return [sampleResult]; } });
  const cacheServer = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const url = `http://127.0.0.1:${cacheServer.address().port}/api/search?q=${encodeURIComponent('Франция')}`;

  try {
    assert.equal((await (await fetch(url)).json()).cacheStatus, 'miss');
    assert.equal((await (await fetch(url)).json()).cacheStatus, 'hit');
    assert.equal(searchCalls, 1);
  } finally {
    await new Promise((resolve, reject) => cacheServer.close((error) => error ? reject(error) : resolve()));
  }
});

const torDetectorStub = async () => ({
  host: '127.0.0.1',
  probes: [
    { host: '127.0.0.1', port: 9150, open: false, note: 'Tor Browser' },
    { host: '127.0.0.1', port: 9050, open: false, note: 'служба tor' },
  ],
  detected: null,
});

test('search reports the active network route and an offline hint', async () => {
  const app = createApp({ search: async () => [], torDetector: torDetectorStub });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const url = `http://127.0.0.1:${server.address().port}/api/search?q=${encodeURIComponent('война')}`;
  try {
    const body = await (await fetch(url)).json();
    assert.equal(body.mode, 'temporarily-offline');
    assert.ok(body.hint.includes('Настройки'));
    assert.equal(body.network.mode, 'direct');
    assert.equal(body.network.label, 'Прямое подключение');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('network settings endpoints return, validate and persist the route', async () => {
  const stored = new Map();
  const settingsStore = {
    get: (key) => stored.get(key),
    set: (key, value) => stored.set(key, value),
  };
  const app = createApp({ settingsStore, torDetector: torDetectorStub });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const initial = await (await fetch(`${base}/api/network/settings`)).json();
    assert.equal(initial.settings.mode, 'direct');
    assert.equal(initial.torDetection.detected, null);
    assert.ok(initial.hint.includes('Tor не запущен'));

    const bad = await fetch(`${base}/api/network/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'carrier-pigeon' }),
    });
    assert.equal(bad.status, 400);
    assert.ok((await bad.json()).error.includes('Режим подключения'));

    const good = await fetch(`${base}/api/network/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'tor', torPort: 9150 }),
    });
    const saved = await good.json();
    assert.equal(good.status, 200);
    assert.equal(saved.active.mode, 'tor');
    assert.equal(saved.active.proxyUri, 'socks5://127.0.0.1:9150');
    assert.equal(saved.active.remoteDns, true);
    assert.equal(stored.get('network').mode, 'tor');

    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.network.mode, 'tor');
    assert.equal(health.network.timeoutMs, 45000);

    const brokenJson = await fetch(`${base}/api/network/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{oops',
    });
    assert.equal(brokenJson.status, 400);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('network test endpoint returns diagnostics with a recommendation', async () => {
  const app = createApp({
    torDetector: torDetectorStub,
    networkTester: async () => ({
      testUrl: 'https://ru.wikipedia.org/w/api.php',
      results: [
        { id: 'direct', label: 'Прямое подключение', proxyUri: null, ok: false, ms: 40, error: 'ECONNRESET', active: true },
        { id: 'tor-browser', label: 'Tor Browser (127.0.0.1:9150)', proxyUri: 'socks5://127.0.0.1:9150', ok: true, ms: 900, error: null, active: false },
      ],
      recommendation: { routeId: 'tor-browser', label: 'Tor Browser (127.0.0.1:9150)', alreadyActive: false },
      checkedAt: new Date().toISOString(),
    }),
  });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    const report = await (await fetch(`http://127.0.0.1:${server.address().port}/api/network/test`, { method: 'POST' })).json();
    assert.equal(report.results.length, 2);
    assert.equal(report.recommendation.routeId, 'tor-browser');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
