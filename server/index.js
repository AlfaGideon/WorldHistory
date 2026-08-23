import express from 'express';
import cors from 'cors';
app.get('/', (req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>WorldHistory API</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, sans-serif; background: #080d1b; color: #eff5ff; }
      main { max-width: 720px; padding: 32px; border: 1px solid rgba(255,255,255,.14); border-radius: 24px; background: rgba(255,255,255,.08); }
      code { color: #80d8ff; }
      a { color: #ffc857; }
    </style>
  </head>
  <body>
    <main>
      <h1>WorldHistory API работает</h1>
      <p>Это backend-порт. Интерфейс приложения открывается на frontend-порте Vite: <code>5173</code>.</p>
      <p>Проверка API: <a href="/api/health">/api/health</a></p>
      <p>Пример поиска: <a href="/api/search?q=Франция">/api/search?q=Франция</a></p>
    </main>
  </body>
</html>`);
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'WorldHistory API', version: '0.1.0' });
});

async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'WorldHistoryAtlas/1.0 (educational research)' }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function liveSearch(query) {
  const requests = [
    fetchJson(`https://ru.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=8&format=json&origin=*`).then((data) => (data.query?.search || []).map((item) => ({ id: `wiki:${item.title}`, title: item.title, kind: 'Энциклопедия', summary: item.snippet.replace(/<[^>]+>/g, ''), sourceUrl: `https://ru.wikipedia.org/wiki/${encodeURIComponent(item.title.replaceAll(' ', '_'))}`, sourceName: 'Wikipedia' }))),
    fetchJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=ru&uselang=ru&format=json&limit=8`).then((data) => (data.search || []).map((item) => ({ id: `wikidata:${item.id}`, title: item.label, kind: 'База знаний', summary: item.description || 'Структурированная сущность Wikidata.', sourceUrl: `https://www.wikidata.org/wiki/${item.id}`, sourceName: 'Wikidata' }))),
    fetchJson(`https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=8`).then((data) => (data.results || []).map((item) => ({ id: `openalex:${item.id}`, title: item.title, kind: 'Научная публикация', summary: item.authorships?.slice(0, 3).map((author) => author.author.display_name).join(', ') || 'Академическая публикация.', sourceUrl: item.doi || item.primary_location?.landing_page_url || item.id, sourceName: 'OpenAlex' }))),
    fetchJson(`https://api.europeana.eu/record/v2/search.json?wskey=${process.env.EUROPEANA_KEY || 'โชว์'}&query=${encodeURIComponent(query)}&rows=8`).then((data) => (data.items || []).map((item) => ({ id: `europeana:${item.id}`, title: item.title?.[0] || 'Материал Europeana', kind: 'Архивный материал', summary: item.dcDescription?.[0] || 'Цифровой материал европейского культурного наследия.', sourceUrl: item.guid || `https://www.europeana.eu/item${item.id}`, sourceName: 'Europeana' }))),
  ];
  const settled = await Promise.allSettled(requests);
  const results = settled.flatMap((item) => item.status === 'fulfilled' ? item.value : []);
  if (!results.length) throw new Error('Все внешние поисковые провайдеры недоступны');
  return [...new Map(results.map((item) => [item.title.toLowerCase(), item])).values()];
}

app.get('/api/search', async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (!query) return res.json({ query, results: [], mode: 'live-multi-source' });
  try {
    const results = await liveSearch(query);
    res.json({ query, type: req.query.type || 'all', mode: 'live-multi-source', results, sources: [...new Set(results.map((item) => item.sourceName))] });
  } catch (error) {
    res.status(502).json({ error: 'Внешний поиск временно недоступен', details: error.message });
  }
});

app.get('/api/dossier/:query', async (req, res) => {
  const query = decodeURIComponent(req.params.query);
  try {
    const results = await liveSearch(query);
    const lead = results[0];
    res.json({ query, title: lead?.title || query, status: 'live-multi-source', entityType: lead?.kind || 'историческая тема', summary: lead?.summary || 'Описание будет собрано из внешних источников.', quickFacts: [{ label: 'Источники', value: [...new Set(results.map((item) => item.sourceName))].join(', ') }, { label: 'Найдено материалов', value: String(results.length) }], researchPipeline: ['Сопоставить материалы разных провайдеров.', 'Проверить даты и имена по первичным документам.', 'Сравнить независимые историографические оценки.', 'Отделить факт от интерпретации и позиции стороны.'], perspectives: results.slice(0, 6).map((item) => ({ side: item.sourceName, thesis: item.summary, caution: 'Материал требует критической проверки и сопоставления.' })), sourcePlan: results.map((item) => ({ name: item.sourceName, type: item.kind, reliability: 'требует оценки', purpose: 'внешний материал по запросу' })), sourcePack: null, sourceUrl: lead?.sourceUrl || null, sources: results });
  } catch (error) {
    res.status(502).json({ error: 'Не удалось получить досье из внешних источников', details: error.message });
  }
});

app.get('/api/source/analyze', async (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    res.status(400).json({ error: 'Передайте URL в query-параметре ?url=https://...' });
    return;
  }

  try {
    const response = await fetch(url, {
      headers: { 'user-agent': 'WorldHistoryResearchBot/0.1 educational prototype' },
      signal: AbortSignal.timeout(10000),
    });
    const html = await response.text();
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || url;
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    res.json({
      url,
      title,
      status: response.status,
      characters: text.length,
      preview: text.slice(0, 1200),
      reliabilityHint: 'Черновая оценка. Нужны профиль домена, автор, дата, ссылки, методология и независимые подтверждения.',
    });
  } catch (error) {
    res.status(502).json({ error: 'Не удалось загрузить источник', details: error.message });
  }
});

const API_HOST = process.env.API_HOST || '127.0.0.1';

app.listen(PORT, API_HOST, () => {
  console.log(`WorldHistory API listening on http://${API_HOST}:${PORT}`);
});
