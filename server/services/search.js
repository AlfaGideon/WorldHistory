import { fetchJson as defaultFetchJson } from './http.js';

/** Per-attempt timeout so one slow provider cannot stall the whole search. */
const PROVIDER_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 400;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const plain = (value) => String(value || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** Rebuilds an OpenAlex abstract from its inverted index representation. */
export function abstractFromInvertedIndex(index) {
  if (!index || typeof index !== 'object') return '';
  const slots = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) slots[position] = word;
  }
  const text = slots.filter(Boolean).join(' ');
  return text.length > 520 ? `${text.slice(0, 520).replace(/ [^ ]*$/, '')}…` : text;
}

const wikipediaRu = (fetchJson, query) =>
  fetchJson(`https://ru.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=8&format=json&origin=*`, { timeout: PROVIDER_TIMEOUT_MS })
    .then((data) => (data.query?.search || []).map((item) => ({
      id: `wiki:${item.title}`,
      title: item.title,
      kind: 'Энциклопедия',
      summary: plain(item.snippet),
      sourceUrl: `https://ru.wikipedia.org/wiki/${encodeURIComponent(item.title.replaceAll(' ', '_'))}`,
      sourceName: 'Wikipedia',
    })));

const wikipediaEn = (fetchJson, query) =>
  fetchJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=6&format=json&origin=*`, { timeout: PROVIDER_TIMEOUT_MS })
    .then((data) => (data.query?.search || []).map((item) => ({
      id: `wiki-en:${item.title}`,
      title: item.title,
      kind: 'Энциклопедия (EN)',
      summary: plain(item.snippet),
      sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replaceAll(' ', '_'))}`,
      sourceName: 'Wikipedia EN',
    })));

const wikidata = (fetchJson, query) =>
  fetchJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=ru&uselang=ru&format=json&limit=8`, { timeout: PROVIDER_TIMEOUT_MS })
    .then((data) => (data.search || []).map((item) => ({
      id: `wikidata:${item.id}`,
      title: item.label,
      kind: 'База знаний',
      summary: item.description || 'Структурированная сущность Wikidata.',
      sourceUrl: `https://www.wikidata.org/wiki/${item.id}`,
      sourceName: 'Wikidata',
    })));

const openAlex = (fetchJson, query) => {
  const mailto = process.env.OPENALEX_EMAIL ? `&mailto=${encodeURIComponent(process.env.OPENALEX_EMAIL)}` : '';
  return fetchJson(`https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=8&select=id,doi,title,authorships,primary_location,publication_year,abstract_inverted_index${mailto}`, { timeout: PROVIDER_TIMEOUT_MS })
    .then((data) => (data.results || []).map((item) => ({
      id: `openalex:${item.id}`,
      title: item.title,
      kind: 'Научная публикация',
      summary: abstractFromInvertedIndex(item.abstract_inverted_index)
        || item.authorships?.slice(0, 3).map((author) => author.author.display_name).join(', ')
        || 'Академическая публикация.',
      sourceUrl: item.doi || item.primary_location?.landing_page_url || item.id,
      sourceName: 'OpenAlex',
      year: item.publication_year || null,
    })));
};

const crossref = (fetchJson, query) =>
  fetchJson(`https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=6&select=DOI,title,author,issued,container-title,abstract`, { timeout: PROVIDER_TIMEOUT_MS })
    .then((data) => ((data.message?.items || [])).map((item) => ({
      id: `crossref:${item.DOI}`,
      title: Array.isArray(item.title) ? item.title[0] : item.title,
      kind: 'Научная публикация',
      summary: [
        item.author?.slice(0, 3).map((author) => [author.given, author.family].filter(Boolean).join(' ')).join(', '),
        item['container-title']?.[0],
        item.issued?.['date-parts']?.[0]?.[0],
      ].filter(Boolean).join(' • ') || plain(item.abstract).slice(0, 300) || 'Рецензируемая публикация.',
      sourceUrl: item.DOI ? `https://doi.org/${item.DOI}` : `https://api.crossref.org/works/${item.DOI}`,
      sourceName: 'Crossref',
      year: item.issued?.['date-parts']?.[0]?.[0] || null,
    })));

const internetArchive = (fetchJson, query) =>
  fetchJson(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&fl%5B%5D=year&rows=6&page=1&output=json`, { timeout: PROVIDER_TIMEOUT_MS })
    .then((data) => ((data.response?.docs || [])).map((item) => ({
      id: `archive:${item.identifier}`,
      title: Array.isArray(item.title) ? item.title[0] : item.title,
      kind: 'Книга / архив',
      summary: [Array.isArray(item.creator) ? item.creator.join(', ') : item.creator, item.year].filter(Boolean).join(' • ') || 'Оцифрованный материал Internet Archive.',
      sourceUrl: `https://archive.org/details/${item.identifier}`,
      sourceName: 'Internet Archive',
      year: item.year || null,
    })));

const europeana = (fetchJson, query, apiKey) =>
  fetchJson(`https://api.europeana.eu/record/v2/search.json?wskey=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(query)}&rows=8`, { timeout: PROVIDER_TIMEOUT_MS })
    .then((data) => (data.items || []).map((item) => ({
      id: `europeana:${item.id}`,
      title: item.title?.[0] || 'Материал Europeana',
      kind: 'Архивный материал',
      summary: item.dcDescription?.[0] || 'Цифровой материал европейского культурного наследия.',
      sourceUrl: item.guid || `https://www.europeana.eu/item${item.id}`,
      sourceName: 'Europeana',
    })));

function buildProviders(options = {}) {
  return [
    ['wikipedia', 'Wikipedia', wikipediaRu],
    ['wikidata', 'Wikidata', wikidata],
    ['openalex', 'OpenAlex', openAlex],
    ['crossref', 'Crossref', crossref],
    ['internet-archive', 'Internet Archive', internetArchive],
    ['wikipedia-en', 'Wikipedia EN', wikipediaEn],
    ...(options.europeanaKey ? [['europeana', 'Europeana', (fetchJson, query) => europeana(fetchJson, query, options.europeanaKey)]] : []),
  ];
}

/** Round-robin across providers so one source cannot flood the first screen. */
export function interleaveResults(groups) {
  const queues = groups.filter((group) => group?.length);
  const merged = [];
  for (let index = 0; queues.some((queue) => queue.length > 0); index += 1) {
    for (const queue of queues) {
      const item = queue.shift();
      if (item) merged.push(item);
    }
    if (index > 200) break;
  }
  const seen = new Map();
  for (const item of merged) {
    const key = item.title?.toLowerCase() || `id:${item.id}`;
    if (!seen.has(key)) seen.set(key, item);
  }
  return [...seen.values()];
}

/**
 * Queries every provider through the injected HTTP client (which honors the
 * network settings: direct / Tor / custom proxy). Each provider gets one
 * retry. Returns results, per-provider statuses and failures so the UI can
 * explain *why* a source is missing.
 */
export async function liveSearchDetailed(query, { fetchJson = defaultFetchJson } = {}) {
  const providers = buildProviders({ europeanaKey: process.env.EUROPEANA_KEY });

  const settled = await Promise.all(providers.map(async ([id, label, provider]) => {
    try {
      const results = await provider(fetchJson, query);
      return { id, label, results, error: null };
    } catch {
      try {
        await delay(RETRY_DELAY_MS);
        const results = await provider(fetchJson, query);
        return { id, label, results, error: null };
      } catch (retryError) {
        return { id, label, results: [], error: String(retryError.reason?.message || retryError.message || retryError) };
      }
    }
  }));

  const providerStatus = settled.map((item) => ({
    id: item.id,
    label: item.label,
    ok: !item.error,
    count: item.results.length,
    ...(item.error ? { error: item.error } : {}),
  }));

  return {
    // interleaveResults consumes the arrays it is given, so pass copies.
    results: interleaveResults(settled.map((item) => [...item.results])).filter((item) => item?.title),
    errors: settled.filter((item) => item.error).map((item) => ({ source: item.label, message: item.error })),
    providerStatus,
  };
}

export async function liveSearch(query, options = {}) {
  return (await liveSearchDetailed(query, options)).results;
}
