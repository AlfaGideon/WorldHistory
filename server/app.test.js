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
