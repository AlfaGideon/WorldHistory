import express from 'express';
import cors from 'cors';
import { liveSearch } from './services/search.js';
import { buildDossier } from './services/dossierBuilder.js';
import { analyzeSource } from './services/sourceAnalyzer.js';

async function safeSearch(search, query, label) {
  try {
    return await search(query);
  } catch (error) {
    console.error(`${label}:`, error.message);
    return [];
  }
}

export function createApp({ search = liveSearch, sourceAnalyzer = analyzeSource } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json());

  app.get('/', (req, res) => {
    res.type('html').send(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WorldHistory API</title></head><body><main><h1>WorldHistory API работает</h1><p><a href="/api/health">Проверить API</a></p></main></body></html>`);
  });

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: 'WorldHistory API', version: '0.1.0' });
  });

  app.get('/api/search', async (req, res) => {
    const query = String(req.query.q || '').trim();
    if (!query) return res.json({ query, results: [], mode: 'live-multi-source' });

    const results = await safeSearch(search, query, 'Live search failed');
    return res.json({
      query,
      type: req.query.type || 'all',
      mode: results.length ? 'live-multi-source' : 'temporarily-offline',
      results,
      sources: [...new Set(results.map((item) => item.sourceName))],
    });
  });

  app.get('/api/dossier/:query', async (req, res) => {
    const query = String(req.params.query || '').trim();
    if (!query) return res.status(400).json({ error: 'Тема досье не указана' });

    const results = await safeSearch(search, query, 'Dossier search failed');
    return res.json(buildDossier(query, results));
  });

  app.get('/api/source/analyze', async (req, res) => {
    const url = String(req.query.url || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: 'Передайте URL в query-параметре ?url=https://...' });
    }

    try {
      return res.json(await sourceAnalyzer(url));
    } catch (error) {
      return res.status(502).json({ error: 'Не удалось загрузить источник', details: error.message });
    }
  });

  app.use((req, res) => res.status(404).json({ error: 'Маршрут API не найден' }));
  return app;
}
