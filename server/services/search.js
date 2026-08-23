import { fetchJson } from './http.js';

const wikipedia = (query) =>
  fetchJson(`https://ru.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=8&format=json&origin=*`)
    .then((data) => (data.query?.search || []).map((item) => ({
      id: `wiki:${item.title}`,
      title: item.title,
      kind: 'Энциклопедия',
      summary: item.snippet.replace(/<[^>]+>/g, ''),
      sourceUrl: `https://ru.wikipedia.org/wiki/${encodeURIComponent(item.title.replaceAll(' ', '_'))}`,
      sourceName: 'Wikipedia',
    })));

const wikidata = (query) =>
  fetchJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=ru&uselang=ru&format=json&limit=8`)
    .then((data) => (data.search || []).map((item) => ({
      id: `wikidata:${item.id}`,
      title: item.label,
      kind: 'База знаний',
      summary: item.description || 'Структурированная сущность Wikidata.',
      sourceUrl: `https://www.wikidata.org/wiki/${item.id}`,
      sourceName: 'Wikidata',
    })));

const openAlex = (query) =>
  fetchJson(`https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=8`)
    .then((data) => (data.results || []).map((item) => ({
      id: `openalex:${item.id}`,
      title: item.title,
      kind: 'Научная публикация',
      summary: item.authorships?.slice(0, 3).map((author) => author.author.display_name).join(', ') || 'Академическая публикация.',
      sourceUrl: item.doi || item.primary_location?.landing_page_url || item.id,
      sourceName: 'OpenAlex',
    })));

const europeana = (query, apiKey) =>
  fetchJson(`https://api.europeana.eu/record/v2/search.json?wskey=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(query)}&rows=8`)
    .then((data) => (data.items || []).map((item) => ({
      id: `europeana:${item.id}`,
      title: item.title?.[0] || 'Материал Europeana',
      kind: 'Архивный материал',
      summary: item.dcDescription?.[0] || 'Цифровой материал европейского культурного наследия.',
      sourceUrl: item.guid || `https://www.europeana.eu/item${item.id}`,
      sourceName: 'Europeana',
    })));

export async function liveSearch(query) {
  const requests = [wikipedia(query), wikidata(query), openAlex(query)];
  if (process.env.EUROPEANA_KEY) requests.push(europeana(query, process.env.EUROPEANA_KEY));

  const settled = await Promise.allSettled(requests);
  const results = settled
    .flatMap((item) => item.status === 'fulfilled' ? item.value : [])
    .filter((item) => item?.title);

  return [...new Map(results.map((item) => [item.title.toLowerCase(), item])).values()];
}
