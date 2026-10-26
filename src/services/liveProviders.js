/**
 * Browser-side live providers.
 *
 * The app normally talks to the Express backend (`/api/...`), which can route
 * traffic through Tor or a custom proxy. When there is no backend — a static
 * build, an offline preview, or the packaged Android app — these providers
 * query the same public APIs straight from the browser. All of them send
 * permissive CORS headers, so this works from a WebView too.
 */

const PROVIDER_TIMEOUT_MS = 12_000;

const fetchJson = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
};

const plain = (value) =>
  String(value || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

const RETRY_DELAY_MS = 400;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const wikipediaRu = (query) =>
  fetchJson(`https://ru.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=8&format=json&origin=*`)
    .then((data) => (data.query?.search || []).map((item) => ({
      id: `wiki:${item.title}`,
      title: item.title,
      kind: 'Энциклопедия',
      summary: plain(item.snippet),
      sourceUrl: `https://ru.wikipedia.org/wiki/${encodeURIComponent(item.title.replaceAll(' ', '_'))}`,
      sourceName: 'Wikipedia',
    })));

const wikipediaEn = (query) =>
  fetchJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=6&format=json&origin=*`)
    .then((data) => (data.query?.search || []).map((item) => ({
      id: `wiki-en:${item.title}`,
      title: item.title,
      kind: 'Энциклопедия (EN)',
      summary: plain(item.snippet),
      sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replaceAll(' ', '_'))}`,
      sourceName: 'Wikipedia EN',
    })));

const wikidata = (query) =>
  fetchJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=ru&uselang=ru&format=json&limit=8&origin=*`)
    .then((data) => (data.search || []).map((item) => ({
      id: `wikidata:${item.id}`,
      title: item.label,
      kind: 'База знаний',
      summary: item.description || 'Структурированная сущность Wikidata.',
      sourceUrl: `https://www.wikidata.org/wiki/${item.id}`,
      sourceName: 'Wikidata',
    })));

const abstractFromInvertedIndex = (index) => {
  if (!index || typeof index !== 'object') return '';
  const slots = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) slots[position] = word;
  }
  const text = slots.filter(Boolean).join(' ');
  return text.length > 520 ? `${text.slice(0, 520).replace(/ [^ ]*$/, '')}…` : text;
};

const openAlex = (query) =>
  fetchJson(`https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=8&select=id,doi,title,authorships,primary_location,publication_year,abstract_inverted_index`)
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

const crossref = (query) =>
  fetchJson(`https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=6&select=DOI,title,author,issued,container-title,abstract`)
    .then((data) => (data.message?.items || []).map((item) => ({
      id: `crossref:${item.DOI}`,
      title: Array.isArray(item.title) ? item.title[0] : item.title,
      kind: 'Научная публикация',
      summary: [
        item.author?.slice(0, 3).map((author) => [author.given, author.family].filter(Boolean).join(' ')).join(', '),
        item['container-title']?.[0],
        item.issued?.['date-parts']?.[0]?.[0],
      ].filter(Boolean).join(' • ') || plain(item.abstract).slice(0, 300) || 'Рецензируемая публикация.',
      sourceUrl: item.DOI ? `https://doi.org/${item.DOI}` : 'https://www.crossref.org/',
      sourceName: 'Crossref',
      year: item.issued?.['date-parts']?.[0]?.[0] || null,
    })));

const internetArchive = (query) =>
  fetchJson(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&fl%5B%5D=year&rows=6&page=1&output=json`)
    .then((data) => (data.response?.docs || []).map((item) => ({
      id: `archive:${item.identifier}`,
      title: Array.isArray(item.title) ? item.title[0] : item.title,
      kind: 'Книга / архив',
      summary: [Array.isArray(item.creator) ? item.creator.join(', ') : item.creator, item.year].filter(Boolean).join(' • ') || 'Оцифрованный материал Internet Archive.',
      sourceUrl: `https://archive.org/details/${item.identifier}`,
      sourceName: 'Internet Archive',
      year: item.year || null,
    })));

const PROVIDERS = [
  ['wikipedia', 'Wikipedia', wikipediaRu],
  ['wikidata', 'Wikidata', wikidata],
  ['openalex', 'OpenAlex', openAlex],
  ['crossref', 'Crossref', crossref],
  ['internet-archive', 'Internet Archive', internetArchive],
  ['wikipedia-en', 'Wikipedia EN', wikipediaEn],
];

/** Round-robin across providers so no single source floods the first screen. */
export function interleaveResults(groups) {
  const queues = groups.filter((group) => group?.length).map((group) => [...group]);
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

const readableError = (error) =>
  error?.name === 'AbortError' ? 'превышен таймаут запроса' : String(error?.message || error);

/**
 * Queries every provider with one retry each and returns results, per-provider
 * statuses and failures so the UI can explain why a source is missing.
 */
export async function liveSearchDetailed(query) {
  const settled = await Promise.all(PROVIDERS.map(async ([id, label, provider]) => {
    try {
      return { id, label, results: await provider(query), error: null };
    } catch {
      try {
        await delay(RETRY_DELAY_MS);
        return { id, label, results: await provider(query), error: null };
      } catch (retryError) {
        return { id, label, results: [], error: readableError(retryError) };
      }
    }
  }));

  return {
    results: interleaveResults(settled.map((item) => item.results)).filter((item) => item?.title),
    errors: settled.filter((item) => item.error).map((item) => ({ source: item.label, message: item.error })),
    providerStatus: settled.map((item) => ({
      id: item.id,
      label: item.label,
      ok: !item.error,
      count: item.results.length,
      ...(item.error ? { error: item.error } : {}),
    })),
  };
}

export const liveSearch = async (query) => (await liveSearchDetailed(query)).results;

export const fetchJsonPublic = fetchJson;
