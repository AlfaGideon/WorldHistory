import express from 'express';
import cors from 'cors';
import { liveSearch } from './services/search.js';
import { buildDossier } from './services/dossierBuilder.js';
import { analyzeSource, SourceUrlError } from './services/sourceAnalyzer.js';

async function safeSearch(search, query, label) {
  try {
    return await search(query);
  } catch (error) {
    console.error(`${label}:`, error.message);
    return [];
  }
}

export function createApp({ search = liveSearch, sourceAnalyzer = analyzeSource, cache = null } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json());

  app.get('/', (req, res) => {
    res.type('html').send(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WorldHistory API</title></head><body><main><h1>WorldHistory API работает</h1><p><a href="/api/health">Проверить API</a></p></main></body></html>`);
  });

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: 'WorldHistory API', version: '0.2.0', database: cache ? 'connected' : 'disabled' });
  });

  app.get('/api/search', async (req, res) => {
    const query = String(req.query.q || '').trim();
    const type = String(req.query.type || 'all');
    if (!query) return res.json({ query, type, results: [], mode: 'live-multi-source', cacheStatus: 'skip' });

    const cached = cache?.getSearch(query, type);
    if (cached && !cached.stale) return res.json({ ...cached.data, mode: 'cache', cacheStatus: 'hit' });

    const liveResults = await safeSearch(search, query, 'Live search failed');
    if (liveResults.length) {
      const payload = { query, type, mode: 'live-multi-source', results: liveResults, sources: [...new Set(liveResults.map((item) => item.sourceName))] };
      cache?.setSearch(query, type, payload);
      return res.json({ ...payload, cacheStatus: 'miss' });
    }
    if (cached) return res.json({ ...cached.data, mode: 'stale-cache', cacheStatus: 'stale' });

    return res.json({ query, type, mode: 'temporarily-offline', results: [], sources: [], cacheStatus: 'miss' });
  });

  app.get('/api/dossier/:query', async (req, res) => {
    const query = String(req.params.query || '').trim();
    if (!query) return res.status(400).json({ error: 'Тема досье не указана' });

    const cached = cache?.getDossier(query);
    if (cached && !cached.stale) return res.json({ ...cached.data, cacheStatus: 'hit' });

    const results = await safeSearch(search, query, 'Dossier search failed');
    if (!results.length && cached) return res.json({ ...cached.data, cacheStatus: 'stale' });

    const dossier = buildDossier(query, results);
    if (results.length) cache?.setDossier(query, dossier);
    return res.json({ ...dossier, cacheStatus: 'miss' });
  });

  app.get('/api/source/analyze', async (req, res) => {
    const url = String(req.query.url || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: 'Передайте URL в query-параметре ?url=https://...' });
    }

    const cached = cache?.getSource(url);
    if (cached && !cached.stale) return res.json({ ...cached.data, cacheStatus: 'hit' });

    try {
      const analysis = await sourceAnalyzer(url);
      cache?.setSource(url, analysis);
      return res.json({ ...analysis, cacheStatus: 'miss' });
    } catch (error) {
      if (error instanceof SourceUrlError) return res.status(400).json({ error: error.message });
      if (cached) return res.json({ ...cached.data, cacheStatus: 'stale' });
      return res.status(502).json({ error: 'Не удалось загрузить источник', details: error.message });
    }
  });

  app.use((req, res) => res.status(404).json({ error: 'Маршрут API не найден' }));
  return app;
}
