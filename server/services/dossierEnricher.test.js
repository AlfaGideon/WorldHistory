import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractKnownFacts,
  extractTimeline,
  findDateLabel,
  formatWikibaseTime,
  infoboxFromEntity,
  referencedEntityIds,
  splitExtractSections,
} from './dossierEnricher.js';
import { abstractFromInvertedIndex, interleaveResults } from './search.js';

const extract = [
  'Косовская война — вооружённый конфликт на Балканах.',
  'Бои начались в 1389 году и стали поворотным моментом средневековой Сербии.',
  'В историографии итоги войны оцениваются по-разному.',
  '== Ход войны ==',
  'В июне 1389 года армия встретила противника на Косовом поле. Сражение длилась один день.',
  '== Последствия ==',
  'В 1459 году территория окончательно перешла под управление. Сербия стала вассалом.',
  '== Примечания ==',
  'Список источников и литературы.',
].join('\n');

test('findDateLabel detects years, ranges, centuries and BC notation', () => {
  assert.equal(findDateLabel('Война шла в 1389—1453 годах.'), '1389—1453');
  assert.equal(findDateLabel('Сражение произошло в 1703 году.'), '1703');
  assert.equal(findDateLabel('События XIII века изменили регион.'), 'XIII века');
  assert.equal(findDateLabel('Государство возникло в 3500 году до н. э.'), '3500 до н. э.');
});

test('splitExtractSections separates lead from headings', () => {
  const parsed = splitExtractSections(extract);
  assert.equal(parsed.lead.length, 3);
  assert.deepEqual(parsed.sections.map((section) => section.title), ['Ход войны', 'Последствия', 'Примечания']);
});

test('extractTimeline builds dated entries and skips reference sections', () => {
  const parsed = splitExtractSections(extract);
  const timeline = extractTimeline(parsed.sections);
  assert.equal(timeline.length, 2);
  assert.equal(timeline[0].title, 'Ход войны');
  assert.equal(timeline[0].date, '1389');
  assert.equal(timeline[1].title, 'Последствия');
  assert.ok(timeline[1].text.includes('1459'));
});

test('extractKnownFacts keeps only dated lead sentences', () => {
  const parsed = splitExtractSections(extract);
  const facts = extractKnownFacts(parsed.lead);
  assert.equal(facts.length, 1);
  assert.ok(facts[0].text.includes('1389'));
  assert.equal(facts[0].evidence, 'Wikipedia');
});

test('formatWikibaseTime respects precision and era', () => {
  assert.equal(formatWikibaseTime({ time: '+1389-06-15T00:00:00Z', precision: 11 }), '15 июня 1389');
  assert.equal(formatWikibaseTime({ time: '+1389-06-15T00:00:00Z', precision: 10 }), 'июнь 1389');
  assert.equal(formatWikibaseTime({ time: '+1389-06-15T00:00:00Z', precision: 9 }), '1389');
  assert.equal(formatWikibaseTime({ time: '-0350-01-01T00:00:00Z', precision: 9 }), '350 до н. э.');
  assert.equal(formatWikibaseTime({ time: 'garbage' }), null);
});

test('infoboxFromEntity maps claims into dossier fields via labels', () => {
  const entity = {
    claims: {
      P31: [{ mainsnak: { datavalue: { value: { id: 'Q198' } } } }],
      P580: [{ mainsnak: { datavalue: { value: { time: '+1389-06-15T00:00:00Z', precision: 11 } } } }],
      P582: [{ mainsnak: { datavalue: { value: { time: '+1459-06-15T00:00:00Z', precision: 9 } } } }],
      P17: [{ mainsnak: { datavalue: { value: { id: 'Q404' } } } }],
      P710: [{ mainsnak: { datavalue: { value: { id: 'Q1' } } } }, { mainsnak: { datavalue: { value: { id: 'Q2' } } } }],
    },
  };
  const labels = { Q198: 'сражение', Q404: 'Сербия', Q1: 'Османская империя', Q2: 'Сербское деспотство' };
  const infobox = infoboxFromEntity(entity, (id) => labels[id] || id);
  assert.equal(infobox.type, 'сражение');
  assert.equal(infobox.dates, '15 июня 1389 — 1459');
  assert.equal(infobox.region, 'Сербия');
  assert.equal(infobox.participants, 'Османская империя, Сербское деспотство');
  assert.deepEqual(referencedEntityIds(entity).sort(), ['Q1', 'Q198', 'Q2', 'Q404'].sort());
  assert.equal(infoboxFromEntity({ claims: {} }), null);
});

test('abstractFromInvertedIndex rebuilds OpenAlex abstracts', () => {
  const text = abstractFromInvertedIndex({ Косовская: [0], война: [1], началась: [2], в: [3], 1389: [4], году: [5] });
  assert.equal(text, 'Косовская война началась в 1389 году');
  assert.equal(abstractFromInvertedIndex(null), '');
});

test('interleaveResults round-robins provider groups and dedups titles', () => {
  const merged = interleaveResults([
    [{ title: 'Война', sourceName: 'Wikipedia' }, { title: 'Сербия', sourceName: 'Wikipedia' }],
    [{ title: 'War study', sourceName: 'OpenAlex' }],
    [],
  ]);
  assert.deepEqual(merged.map((item) => item.title), ['Война', 'War study', 'Сербия']);

  const deduped = interleaveResults([
    [{ title: 'война', sourceName: 'Wikipedia' }],
    [{ title: 'Война', sourceName: 'OpenAlex' }],
  ]);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].sourceName, 'Wikipedia');
});
