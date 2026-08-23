import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDossier } from './dossierBuilder.js';

const searchResults = [
  {
    id: 'wiki:Косовская битва',
    title: 'Косовская битва',
    kind: 'Энциклопедия',
    summary: 'Сражение на Косовом поле.',
    sourceUrl: 'https://ru.wikipedia.org/wiki/Косовская_битва',
    sourceName: 'Wikipedia',
  },
  {
    id: 'openalex:W123',
    title: 'The Battle of Kosovo revisited',
    kind: 'Научная публикация',
    summary: 'A reassessment of the 1389 battle sources.',
    sourceUrl: 'https://doi.org/10.1000/x',
    sourceName: 'OpenAlex',
    year: 2019,
  },
];

const wikiExtract = [
  'Косовская битва — сражение между сербскими и османскими войсками.',
  'Битва произошла 15 июня 1389 года на Косовом поле.',
  '',
  '== Ход битвы ==',
  'В 1389 году армии встретились на поле. Бой начался утром.',
  '== Последствия ==',
  'После битвы в 1389 году Сербия попала в вассальную зависимость.',
].join('\n');

/** Stands in for the Wikipedia/Wikidata HTTP APIs without network access. */
function createStubFetch({ failWikidata = false } = {}) {
  const calls = [];
  const fetchJson = async (url) => {
    calls.push(url);
    if (url.includes('ru.wikipedia.org') && url.includes('prop=extracts')) {
      return { query: { pages: { '1': { title: 'Косовская битва', extract: wikiExtract, description: 'сражение 1389 года', thumbnail: { source: 'https://upload.example/kosovo.jpg' } } } } };
    }
    if (url.includes('wikidata.org') && url.includes('props=claims')) {
      if (failWikidata) throw new Error('соединение сброшено');
      return { entities: { Q15082: { claims: {
        P31: [{ mainsnak: { datavalue: { value: { id: 'Q178561' } } } }],
        P580: [{ mainsnak: { datavalue: { value: { time: '+1389-06-15T00:00:00Z', precision: 11 } } } }],
        P17: [{ mainsnak: { datavalue: { value: { id: 'Q404' } } } }],
      } } } };
    }
    if (url.includes('wikidata.org') && url.includes('props=labels')) {
      return { entities: {
        Q178561: { labels: { ru: { value: 'сражение' } } },
        Q404: { labels: { ru: { value: 'Сербия' } } },
      } };
    }
    throw new Error(`unexpected url ${url}`);
  };
  return { fetchJson, calls };
}

test('buildDossier fills the dossier from the Wikipedia article and Wikidata', async () => {
  const { fetchJson } = createStubFetch();
  const dossier = await buildDossier('Косовская битва', searchResults, { fetchJson });

  assert.equal(dossier.status, 'live-multi-source');
  assert.equal(dossier.title, 'Косовская битва');
  assert.ok(dossier.brief.includes('сражение между сербскими'));
  assert.equal(dossier.entityType, 'сражение');
  assert.equal(dossier.infobox.dates, '15 июня 1389');
  assert.equal(dossier.infobox.region, 'Сербия');
  assert.equal(dossier.thumbnail, 'https://upload.example/kosovo.jpg');
  assert.ok(dossier.timeline.length >= 2);
  assert.equal(dossier.timeline[0].date, '1389');
  assert.ok(dossier.knownFacts.length >= 1);
  assert.ok(dossier.perspectives.some((view) => view.side.includes('OpenAlex')));
  assert.ok(dossier.sources.every((source) => source.reliability));
  assert.equal(dossier.wikidataUrl, 'https://www.wikidata.org/wiki/Q15082');
  assert.ok(dossier.fetchedAt);
});

test('buildDossier survives a Wikidata outage and still fills the article data', async () => {
  const { fetchJson } = createStubFetch({ failWikidata: true });
  const dossier = await buildDossier('Косовская битва', searchResults, { fetchJson });

  assert.equal(dossier.status, 'live-multi-source');
  assert.equal(dossier.infobox.dates, 'уточняются по источникам');
  assert.equal(dossier.timeline.length, 2);
  assert.ok(dossier.brief.length > 0);
  assert.equal(dossier.wikidataUrl, null);
});

test('buildDossier keeps the offline plan deterministic without providers', async () => {
  let called = 0;
  const dossier = await buildDossier('оффлайн', [], { fetchJson: async () => { called += 1; return {}; } });
  assert.equal(called, 0, 'offline dossiers must not touch the network');
  assert.equal(dossier.status, 'needs-live-research');
  assert.equal(dossier.infobox.confidence, 'низкая');
  assert.deepEqual(dossier.sources, []);
  assert.ok(dossier.disputedClaims.length > 0);
  assert.ok(dossier.researchPipeline.length > 0);
});
