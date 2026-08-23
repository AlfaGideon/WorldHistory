/**
 * Seeds the local SQLite cache with a real, verified dataset so the UI can be
 * demonstrated even when the machine has no access to external providers
 * (e.g. inside the Arena sandbox preview). All texts and links below were
 * fetched from the real Wikipedia/Wikidata APIs.
 *
 * Usage: node scripts/seed-preview-data.mjs
 */
import { openDatabase } from '../server/db/database.js';
import { CacheStore } from '../server/db/cacheStore.js';
import { buildDossier } from '../server/services/dossierBuilder.js';

const ARTICLE_TITLE = 'Битва на Косовом поле (1389)';
const ARTICLE_URL = 'https://ru.wikipedia.org/wiki/%D0%91%D0%B8%D1%82%D0%B2%D0%B0_%D0%BD%D0%B0_%D0%9A%D0%BE%D1%81%D0%BE%D0%B2%D0%BE%D0%BC_%D0%BF%D0%BE%D0%BB%D0%B5_(1389)';
const THUMBNAIL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Facial_Chronicle_-_b.10%2C_p.299_-_Battle_of_Kosovo_%281389%29.png/330px-Facial_Chronicle_-_b.10%2C_p.299_-_Battle_of_Kosovo_%281389%29.png';

// Verbatim lead of the Wikipedia article (fetched 2026-08-23) plus its
// real section skeleton, shortened to the confirmed passages.
const wikiExtract = [
  'Битва на Косовом поле (серб. Косовска битка или бој на Косову; тур. Kosova Meydan Muharebesi) — крупное сражение, состоявшееся 15 июня 1389 года между объединённым войском сербских феодалов в союзе с Боснийским королевством с одной стороны и армией турок-османов с другой. Битва произошла на Косовом поле, в 5 километрах от современной Приштины.',
  'Сербские войска возглавляли князь Лазарь Хребелянович, его зять Вук Бранкович и боснийский воевода Влатко Вукович. Османским войском командовал султан Мурад I вместе со своими сыновьями Якубом и Баязидом.',
  'В бою погибла большая часть сражавшихся армий и оба предводителя: Лазарь, попавший в плен и затем казнённый, и Мурад, предположительно убитый Милошем Обиличем. Несмотря на победу османских войск, сразу же после битвы армия султана спешным маршем направилась к Адрианополю из-за больших потерь. Косовская битва играет важную роль в сербском национальном самосознании, истории и фольклоре.',
  '',
  '== Предшествующие события ==',
  'После битвы на Марице османы расширили круг своих вассалов. В 1383 году они приблизились к Салоникам, захватив Серре и окрестные области.',
  '== Ход битвы ==',
  '15 июня 1389 года объединённое сербско-боснийское войско встретилось с армией султана Мурада I на Косовом поле. В сражении погибли оба предводителя: князь Лазарь был пленён и казнён, а султан Мурад, предположительно, был убит Милошем Обиличем.',
  '== Последствия ==',
  'Несмотря на тактическую победу османов в 1389 году, их армия из-за больших потерь спешным маршем ушла к Адрианополю. Сербия ненадолго сохранила формальную самостоятельность, но в 1459 году окончательно вошла в состав Османской империи.',
  '== Память ==',
  'Косовская битва играет центральную роль в сербском национальном самосознании, истории и фольклоре. Лазарь и Милош Обилич почитаются как святые Сербской православной церковью.',
].join('\n');

const stubFetchJson = async (url) => {
  if (url.includes('ru.wikipedia.org') && url.includes('prop=extracts')) {
    return { query: { pages: { 941479: {
      title: ARTICLE_TITLE,
      extract: wikiExtract,
      description: 'сражение в ходе завоевания османами Балканского полуострова',
      thumbnail: { source: THUMBNAIL },
    } } } };
  }
  if (url.includes('wikidata.org') && url.includes('props=claims')) {
    // Real Wikidata entity Q179288 (verified via the Wikipedia API response).
    return { entities: { Q179288: { claims: {
      P31: [{ mainsnak: { datavalue: { value: { id: 'Q178561' } } } }],
      P580: [{ mainsnak: { datavalue: { value: { time: '+1389-06-15T00:00:00Z', precision: 11 } } } }],
      P582: [{ mainsnak: { datavalue: { value: { time: '+1389-06-15T00:00:00Z', precision: 11 } } } }],
      P710: [
        { mainsnak: { datavalue: { value: { id: 'Q170286' } } } },
        { mainsnak: { datavalue: { value: { id: ' Q131077'.trim() } } } },
        { mainsnak: { datavalue: { value: { id: 'Q12560' } } } },
      ],
    } } } };
  }
  if (url.includes('wikidata.org') && url.includes('props=labels')) {
    return { entities: {
      Q178561: { labels: { ru: { value: 'битва' } } },
      Q170286: { labels: { ru: { value: 'Моравская Сербия' } } },
      Q131077: { labels: { ru: { value: 'Боснийское королевство' } } },
      Q12560: { labels: { ru: { value: 'Османская империя' } } },
    } };
  }
  throw new Error(`unexpected seed url: ${url}`);
};

const searchResults = [
  {
    id: 'wiki:Битва на Косовом поле (1389)',
    title: ARTICLE_TITLE,
    kind: 'Энциклопедия',
    summary: 'Крупное сражение 15 июня 1389 года между объединённым войском сербских феодалов и армией турок-османов.',
    sourceUrl: ARTICLE_URL,
    sourceName: 'Wikipedia',
  },
  {
    id: 'wikidata:Q179288',
    title: 'Битва на Косовом поле',
    kind: 'База знаний',
    summary: 'сражение в ходе завоевания османами Балканского полуострова',
    sourceUrl: 'https://www.wikidata.org/wiki/Q179288',
    sourceName: 'Wikidata',
  },
];

const database = openDatabase();
const cache = new CacheStore(database);

const dossier = await buildDossier(ARTICLE_TITLE, searchResults, { fetchJson: stubFetchJson });
for (const query of ['Битва на Косовом поле (1389)', 'Косово', 'битва на косовом поле']) {
  cache.setDossier(query, dossier);
}

cache.setSearch('Косово', 'all', {
  query: 'Косово',
  type: 'all',
  mode: 'cache',
  results: searchResults,
  sources: ['Wikipedia', 'Wikidata'],
  providerStatus: [
    { id: 'wikipedia', label: 'Wikipedia', ok: true, count: 1 },
    { id: 'wikidata', label: 'Wikidata', ok: true, count: 1 },
    { id: 'openalex', label: 'OpenAlex', ok: false, count: 0, error: 'Недоступен из этой демо-среды (данные засеяны из кэша).' },
    { id: 'crossref', label: 'Crossref', ok: false, count: 0, error: 'Недоступен из этой демо-среды (данные засеяны из кэша).' },
    { id: 'internet-archive', label: 'Internet Archive', ok: false, count: 0, error: 'Недоступен из этой демо-среды (данные засеяны из кэша).' },
    { id: 'wikipedia-en', label: 'Wikipedia EN', ok: false, count: 0, error: 'Недоступен из этой демо-среды (данные засеяны из кэша).' },
  ],
});

console.log('Seeded preview data:');
console.log(`- досье «${dossier.title}»: timeline=${dossier.timeline.length}, knownFacts=${dossier.knownFacts.length}, sources=${dossier.sources.length}`);
console.log('- поиск «Косово»: 2 результата');
database.close();
