import express from 'express';
import cors from 'cors';
import { liveSearchDetailed } from './services/search.js';
import { buildDossier } from './services/dossierBuilder.js';
import { analyzeSource, SourceUrlError } from './services/sourceAnalyzer.js';
import { createHttpClient } from './services/http.js';
import {
  NetworkSettingsError,
  checkTorExit,
  createNetworkManager,
  detectTorProxy,
  testNetworkRoutes,
} from './services/network.js';

const OFFLINE_HINT = 'Внешние источники недоступны. Откройте раздел «Настройки» и подключитесь напрямую, через Tor Browser или свой прокси.';

async function safeSearch(search, query, label) {
  try {
    return await search(query);
  } catch (error) {
    console.error(`${label}:`, error.message);
    return { results: [], errors: [{ source: label, message: error.message }], providerStatus: [] };
  }
}

export function createApp({
  search = null,
  sourceAnalyzer = null,
  cache = null,
  settingsStore = null,
  network = null,
  networkTester = null,
  torDetector = detectTorProxy,
  dossierBuilder = null,
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '32kb' }));

  const activeNetwork = network || createNetworkManager({ settingsStore });
  const http = createHttpClient(activeNetwork);
  const runSearch = search
    ? async (query) => ({ results: await search(query), errors: [], providerStatus: [] })
    : (query) => liveSearchDetailed(query, { fetchJson: http.fetchJson });
  const runDossierBuilder = dossierBuilder
    || ((query, results) => buildDossier(query, results, { fetchJson: http.fetchJson }));
  const runSourceAnalyzer = sourceAnalyzer || ((url) => analyzeSource(url, {
    rawFetch: http.rawFetch,
    remoteDns: activeNetwork.describe().remoteDns,
  }));
  const runNetworkTest = networkTester || ((context) => testNetworkRoutes(context));

  app.get('/', (req, res) => {
    res.type('html').send(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WorldHistory API</title></head><body><main><h1>WorldHistory API работает</h1><p><a href="/api/health">Проверить API</a></p></main></body></html>`);
  });

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: 'WorldHistory API', version: '0.3.0', database: cache ? 'connected' : 'disabled', network: activeNetwork.describe() });
  });

  app.get('/api/search', async (req, res) => {
    const query = String(req.query.q || '').trim();
    const type = String(req.query.type || 'all');
    if (!query) return res.json({ query, type, results: [], mode: 'live-multi-source', cacheStatus: 'skip', network: activeNetwork.describe() });

    const cached = cache?.getSearch(query, type);
    if (cached && !cached.stale) return res.json({ ...cached.data, mode: 'cache', cacheStatus: 'hit', network: activeNetwork.describe() });

    const { results: liveResults, errors, providerStatus } = await safeSearch(runSearch, query, 'Live search failed');
    if (liveResults.length) {
      const payload = {
        query,
        type,
        mode: 'live-multi-source',
        results: liveResults,
        sources: [...new Set(liveResults.map((item) => item.sourceName))],
        providerErrors: errors.length ? errors : undefined,
        providerStatus: providerStatus || [],
        network: activeNetwork.describe(),
      };
      cache?.setSearch(query, type, payload);
      return res.json({ ...payload, cacheStatus: 'miss' });
    }
    if (cached) return res.json({ ...cached.data, mode: 'stale-cache', cacheStatus: 'stale', providerErrors: errors, hint: OFFLINE_HINT, network: activeNetwork.describe() });

    return res.json({
      query,
      type,
      mode: 'temporarily-offline',
      results: [],
      sources: [],
      providerErrors: errors,
      providerStatus: providerStatus || [],
      hint: OFFLINE_HINT,
      network: activeNetwork.describe(),
      cacheStatus: 'miss',
    });
  });

  app.get('/api/dossier/:query', async (req, res) => {
    const query = String(req.params.query || '').trim();
    if (!query) return res.status(400).json({ error: 'Тема досье не указана' });

    // ?refresh=1 skips the saved copy: the user explicitly asked to re-download.
    const refresh = ['1', 'true', 'yes'].includes(String(req.query.refresh || '').toLowerCase());
    const cached = refresh ? null : cache?.getDossier(query);
    if (cached && !cached.stale) {
      return res.json({ ...cached.data, cacheStatus: 'hit', cachedAt: cached.createdAt, network: activeNetwork.describe() });
    }

    const { results, errors, providerStatus } = await safeSearch(runSearch, query, 'Dossier search failed');
    if (!results.length && cached) {
      return res.json({ ...cached.data, cacheStatus: 'stale', cachedAt: cached.createdAt, hint: OFFLINE_HINT, network: activeNetwork.describe() });
    }

    const dossier = await runDossierBuilder(query, results);
    if (results.length) cache?.setDossier(query, dossier);
    return res.json({
      ...dossier,
      cacheStatus: 'miss',
      cachedAt: Date.now(),
      providerErrors: errors.length ? errors : undefined,
      providerStatus: providerStatus || [],
      network: activeNetwork.describe(),
    });
  });

  app.get('/api/source/analyze', async (req, res) => {
    const url = String(req.query.url || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: 'Передайте URL в query-параметре ?url=https://...' });
    }

    const cached = cache?.getSource(url);
    if (cached && !cached.stale) return res.json({ ...cached.data, cacheStatus: 'hit' });

    try {
      const analysis = await runSourceAnalyzer(url);
      cache?.setSource(url, analysis);
      return res.json({ ...analysis, cacheStatus: 'miss' });
    } catch (error) {
      if (error instanceof SourceUrlError) return res.status(400).json({ error: error.message });
      if (cached) return res.json({ ...cached.data, cacheStatus: 'stale' });
      return res.status(502).json({ error: 'Не удалось загрузить источник', details: error.message });
    }
  });

  app.get('/api/network/settings', async (req, res) => {
    const tor = await torDetector();
    res.json({
      settings: activeNetwork.settings,
      active: activeNetwork.describe(),
      torDetection: tor,
      hint: tor.detected
        ? `Обнаружен ${tor.detected.note} на порту ${tor.detected.port}.`
        : 'Tor не запущен. Запустите Tor Browser — соединение появится автоматически.',
    });
  });

  const updateSettings = async (req, res) => {
    try {
      const active = activeNetwork.update(req.body || {});
      res.json({ settings: activeNetwork.settings, active, torDetection: await torDetector() });
    } catch (error) {
      if (error instanceof NetworkSettingsError) return res.status(400).json({ error: error.message });
      console.error('Failed to update network settings:', error);
      return res.status(500).json({ error: 'Не удалось сохранить настройки' });
    }
  };
  app.put('/api/network/settings', updateSettings);
  app.post('/api/network/settings', updateSettings);

  app.post('/api/network/test', async (req, res) => {
    try {
      const active = activeNetwork.describe();
      const report = await runNetworkTest({
        settings: activeNetwork.settings,
        activeRouteId: active.mode === 'direct' ? 'direct' : active.mode === 'tor' ? (activeNetwork.settings.torPort === 9150 ? 'tor-browser' : activeNetwork.settings.torPort === 9050 ? 'tor-service' : null) : 'custom',
      });
      if (active.proxyUri && report.results.find((result) => result.active && result.ok)) {
        const dispatcher = activeNetwork.dispatcherFor(activeNetwork.settings);
        try {
          report.torExit = await checkTorExit({ dispatcher });
        } catch {
          // Exit check is informational only.
        } finally {
          try {
            await dispatcher?.close();
          } catch {
            // Closing is best effort.
          }
        }
      }
      res.json(report);
    } catch (error) {
      console.error('Network test failed:', error);
      res.status(500).json({ error: 'Не удалось выполнить проверку соединения', details: error.message });
    }
  });

  app.use((req, res) => res.status(404).json({ error: 'Маршрут API не найден' }));
  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    if (error?.type === 'entity.parse.failed' || error instanceof SyntaxError) {
      return res.status(400).json({ error: 'Некорректный JSON в теле запроса' });
    }
    console.error('API error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  });
  return app;
}
