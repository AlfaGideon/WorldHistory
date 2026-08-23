import assert from 'node:assert/strict';
import { test } from 'node:test';
import { liveSearchDetailed } from './search.js';

/**
 * Simulates the reported real-world case: Wikipedia answers while OpenAlex,
 * Wikidata and friends are unreachable. The search must still return what it
 * can and report per-provider statuses instead of silently losing sources.
 */
function createRouteStub() {
  const calls = [];
  const fetchJson = async (url) => {
    calls.push(url);
    if (url.includes('ru.wikipedia.org')) {
      return { query: { search: [{ title: 'Косово', snippet: 'регион на Балканах' }] } };
    }
    throw new Error('соединение сброшено');
  };
  return { fetchJson, calls };
}

test('liveSearchDetailed survives partial provider outages and reports statuses', async () => {
  const { fetchJson, calls } = createRouteStub();
  const { results, errors, providerStatus } = await liveSearchDetailed('Косово', { fetchJson });

  assert.equal(results.length, 1);
  assert.equal(results[0].title, 'Косово');
  assert.equal(results[0].sourceName, 'Wikipedia');

  const wikipedia = providerStatus.find((provider) => provider.id === 'wikipedia');
  assert.equal(wikipedia.ok, true);
  assert.equal(wikipedia.count, 1);

  const openalex = providerStatus.find((provider) => provider.id === 'openalex');
  assert.equal(openalex.ok, false);
  assert.ok(openalex.error.length > 0);
  assert.ok(errors.some((error) => error.source === 'OpenAlex'));

  // Each failing provider gets exactly one retry.
  const openalexCalls = calls.filter((url) => url.includes('api.openalex.org'));
  assert.equal(openalexCalls.length, 2);
});

test('liveSearchDetailed interleaves providers round-robin', async () => {
  const fetchJson = async (url) => {
    if (url.includes('ru.wikipedia.org')) {
      return { query: { search: [{ title: 'А', snippet: 'a' }, { title: 'Б', snippet: 'б' }] } };
    }
    if (url.includes('api.crossref.org')) {
      return { message: { items: [{ DOI: '10.1/x', title: ['Study A'] }] } };
    }
    throw new Error('offline');
  };
  const { results } = await liveSearchDetailed('тест', { fetchJson });
  const titles = results.map((item) => item.title);
  assert.deepEqual(titles.slice(0, 2), ['А', 'Study A']);
  assert.ok(titles.includes('Б'));
});
