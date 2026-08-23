import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { CacheStore } from './cacheStore.js';
import { openDatabase } from './database.js';

let db;
let cache;
let now = 1_000;

before(() => {
  db = openDatabase(':memory:');
  cache = new CacheStore(db, { ttl: { search: 100, dossier: 200, source: 300 }, now: () => now });
});

after(() => db.close());

test('database migrations create the research schema', () => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
  for (const table of ['entities', 'sources', 'claims', 'dossiers', 'parsed_sources', 'search_cache', 'settings', 'schema_migrations']) {
    assert.ok(tables.includes(table), `missing table ${table}`);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, 2);
});

test('search cache normalizes keys and reports expiration', () => {
  cache.setSearch('  Франция ', 'ALL', { results: [{ title: 'Франция' }] });
  assert.equal(cache.getSearch('франция', 'all').data.results[0].title, 'Франция');
  assert.equal(cache.getSearch('ФРАНЦИЯ', 'all').stale, false);
  now += 101;
  assert.equal(cache.getSearch('франция', 'all').stale, true);
});

test('dossiers and parsed sources are persisted as JSON', () => {
  cache.setDossier('Рим', { title: 'Рим', timeline: [] });
  cache.setSource('https://example.org/history', { title: 'Источник', author: 'Автор' });
  assert.equal(cache.getDossier('рим').data.title, 'Рим');
  assert.equal(cache.getSource('https://example.org/history').data.author, 'Автор');
});

test('expired cache cleanup removes old entries', () => {
  now += 1_000;
  assert.ok(cache.cleanupExpired() >= 3);
  assert.equal(cache.getSearch('франция', 'all'), null);
  assert.equal(cache.getDossier('рим'), null);
  assert.equal(cache.getSource('https://example.org/history'), null);
});
