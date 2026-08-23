import express from 'express';
import cors from 'cors';
import { conflicts, countries, eras, sourceGroups } from '../src/historyData.js';

const PORT = process.env.PORT || 3001;
const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^а-яa-z0-9\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const localRecords = [
  ...eras.map((item) => ({
    id: item.id,
    type: 'era',
    kind: 'Эпоха',
    title: item.title,
    summary: item.summary,
    dates: item.period,
    source: item,
  })),
  ...countries.map((item) => ({
    id: item.id,
    type: 'country',
    kind: 'Страна',
    title: item.name,
    summary: item.core,
    dates: item.timeline,
    region: item.region,
    source: item,
  })),
  ...conflicts.map((item) => ({
    id: item.id,
    type: 'conflict',
    kind: 'Конфликт',
    title: item.name,
    summary: item.impact,
    dates: item.years,
    region: item.region,
    parties: item.parties,
    source: item,
  })),
].map((record) => ({
  ...record,
  searchText: normalizeText([
    record.title,
    record.summary,
    record.dates,
    record.region,
    record.parties?.join(' '),
    record.source?.aliases?.join(' '),
    record.source?.topics?.join(' '),
    record.source?.learn?.join(' '),
  ].filter(Boolean).join(' ')),
}));

const trustedSourcePlan = [
  {
    name: 'Wikidata',
    type: 'структурированная база знаний',
    reliability: 'средне-высокая',
    purpose: 'алиасы, даты, связи между государствами, событиями и персонами',
  },
  {
    name: 'Britannica',
    type: 'энциклопедия',
    reliability: 'средне-высокая',
    purpose: 'быстрый проверенный обзор и первичная ориентация',
  },
  {
    name: 'Library of Congress / National Archives / Europeana',
    type: 'архивы',
    reliability: 'высокая',
    purpose: 'документы, карты, фотографии и первичные материалы',
  },
  {
    name: 'CORE / Semantic Scholar / университетские публикации',
    type: 'академические источники',
    reliability: 'высокая',
    purpose: 'историография, методология и научные споры',
  },
  {
    name: 'UN / OSCE / HRW / Amnesty / ICG',
    type: 'международные и правозащитные отчёты',
    reliability: 'средне-высокая / высокая',
    purpose: 'современные конфликты, гражданские жертвы, нарушения и правовая оценка',
  },
  {
    name: 'Официальные государственные источники сторон',
    type: 'позиция стороны',
    reliability: 'контекстная',
    purpose: 'понимание аргументации стороны; не использовать как нейтральную истину без проверки',
  },
];

function buildUniversalDossier(query, matchedRecord = null) {
  const title = matchedRecord?.title || query;
  const source = matchedRecord?.source;
  return {
    query,
    title,
    status: matchedRecord ? 'local-seed' : 'needs-live-research',
    entityType: matchedRecord?.kind || 'не определено автоматически',
    summary:
      matchedRecord?.summary ||
      `Для темы «${query}» будет строиться универсальное историческое досье: определение сущности, даты, участники, ключевые события, спорные утверждения и источники.`,
    quickFacts: [
      { label: 'Тип', value: matchedRecord?.kind || 'будет определён поисковым классификатором' },
      { label: 'Даты', value: matchedRecord?.dates || 'будут извлечены из источников' },
      { label: 'Регион', value: matchedRecord?.region || source?.region || 'будет извлечён из источников' },
      { label: 'Участники', value: matchedRecord?.parties?.join(' vs ') || source?.parties?.join(' vs ') || 'будут извлечены из источников' },
    ],
    researchPipeline: [
      'Определить тип запроса: государство, конфликт, событие, эпоха, персона или процесс.',
      'Найти алиасы на русском, английском и локальных языках.',
      'Собрать обзорные, академические, архивные, правозащитные и государственные источники.',
      'Извлечь даты, места, участников, причины, последствия и ключевые цитаты.',
      'Разделить подтверждённые факты, позиции сторон, спорные версии и недоказанные утверждения.',
      'Выдать досье с уровнем достоверности по каждому блоку.',
    ],
    perspectives: source?.perspectives || [
      { side: 'Официальная / государственная позиция', thesis: 'Будет извлечена из документов и заявлений соответствующих государств.', caution: 'Помечается как позиция стороны, а не как нейтральная истина.' },
      { side: 'Академическая историография', thesis: 'Будет строиться по исследованиям, монографиям и университетским материалам.', caution: 'Внутри академической среды тоже могут быть школы и споры.' },
      { side: 'Независимые / международные оценки', thesis: 'Для конфликтов будут учитываться международные организации, суды, правозащитные отчёты и архивы.', caution: 'Важно проверять методику, дату и контекст каждого отчёта.' },
    ],
    sourcePlan: trustedSourcePlan,
    localSourceGroups: sourceGroups,
    sourcePack: source?.sourcePack || null,
  };
}

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

app.get('/api/search', (req, res) => {
  const query = String(req.query.q || '').trim();
  const type = String(req.query.type || 'all');
  const normalized = normalizeText(query);
  const terms = normalized.split(' ').filter(Boolean);

  const results = localRecords.filter((record) => {
    const typeMatches = type === 'all' || record.type === type || record.kind === type;
    const queryMatches = !normalized || record.searchText.includes(normalized) || terms.some((term) => record.searchText.includes(term));
    return typeMatches && queryMatches;
  });

  res.json({
    query,
    mode: 'local-plus-universal-plan',
    results,
    canBuildUniversalDossier: Boolean(query),
    universalDossierUrl: query ? `/api/dossier/${encodeURIComponent(query)}` : null,
    note: 'Пока это API-каркас. Следующий этап — подключить live web search, парсинг HTML/PDF и кэширование.',
  });
});

app.get('/api/dossier/:query', (req, res) => {
  const query = decodeURIComponent(req.params.query);
  const normalized = normalizeText(query);
  const matchedRecord = localRecords.find((record) => record.id === query || record.searchText.includes(normalized));
  res.json(buildUniversalDossier(query, matchedRecord));
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
