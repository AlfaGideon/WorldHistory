import { fetchJson as defaultFetchJson } from './http.js';

const wikipedia = (fetchJson, query) =>
  fetchJson(`https://ru.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=8&format=json&origin=*`)
    .then((data) => (data.query?.search || []).map((item) => ({
      id: `wiki:${item.title}`,
      title: item.title,
      kind: 'Энциклопедия',
      summary: item.snippet.replace(/<[^>]+>/g, ''),
      sourceUrl: `https://ru.wikipedia.org/wiki/${encodeURIComponent(item.title.replaceAll(' ', '_'))}`,
      sourceName: 'Wikipedia',
    })));

const wikidata = (fetchJson, query) =>
  fetchJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=ru&uselang=ru&format=json&limit=8`)
    .then((data) => (data.search || []).map((item) => ({
      id: `wikidata:${item.id}`,
      title: item.label,
      kind: 'База знаний',
      summary: item.description || 'Структурированная сущность Wikidata.',
      sourceUrl: `https://www.wikidata.org/wiki/${item.id}`,
      sourceName: 'Wikidata',
    })));

const openAlex = (fetchJson, query) =>
  fetchJson(`https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=8`)
    .then((data) => (data.results || []).map((item) => ({
      id: `openalex:${item.id}`,
      title: item.title,
      kind: 'Научная публикация',
      summary: item.authorships?.slice(0, 3).map((author) => author.author.display_name).join(', ') || 'Академическая публикация.',
      sourceUrl: item.doi || item.primary_location?.landing_page_url || item.id,
      sourceName: 'OpenAlex',
    })));

const europeana = (fetchJson, query, apiKey) =>
  fetchJson(`https://api.europeana.eu/record/v2/search.json?wskey=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(query)}&rows=8`)
    .then((data) => (data.items || []).map((item) => ({
      id: `europeana:${item.id}`,
      title: item.title?.[0] || 'Материал Europeana',
      kind: 'Архивный материал',
      summary: item.dcDescription?.[0] || 'Цифровой материал европейского культурного наследия.',
      sourceUrl: item.guid || `https://www.europeana.eu/item${item.id}`,
      sourceName: 'Europeana',
    })));

/**
 * Queries every provider through the injected HTTP client (which honors the
 * network settings: direct / Tor / custom proxy). Returns results plus
 * per-provider failures so the UI can explain *why* data is missing.
 */
export async function liveSearchDetailed(query, { fetchJson = defaultFetchJson } = {}) {
  const providers = [
    ['Wikipedia', wikipedia(fetchJson, query)],
    ['Wikidata', wikidata(fetchJson, query)],
    ['OpenAlex', openAlex(fetchJson, query)],
  ];
  if (process.env.EUROPEANA_KEY) providers.push(['Europeana', europeana(fetchJson, query, process.env.EUROPEANA_KEY)]);

  const settled = await Promise.allSettled(providers.map(([, request]) => request));
  const results = settled
    .flatMap((item) => item.status === 'fulfilled' ? item.value : [])
    .filter((item) => item?.title);
  const errors = settled
    .map((item, index) => item.status === 'rejected' ? { source: providers[index][0], message: String(item.reason?.message || item.reason) } : null)
    .filter(Boolean);

  return {
    results: [...new Map(results.map((item) => [item.title.toLowerCase(), item])).values()],
    errors,
  };
}

export async function liveSearch(query, options = {}) {
  return (await liveSearchDetailed(query, options)).results;
}
