/**
 * Research orchestration.
 *
 * Every page talks to this service instead of calling the API directly, so the
 * app degrades gracefully:
 *
 *   1. curated local dossiers   — always available, even offline;
 *   2. backend API (`/api/...`) — when the Express server is running (it can
 *                                 route through Tor or a custom proxy);
 *   3. browser providers        — when there is no backend but the internet is
 *                                 reachable (packaged app, static hosting);
 *   4. honest research plan     — when nothing is reachable: structure without
 *                                 invented facts.
 */
import { getDossier as apiGetDossier, searchHistory as apiSearch, getHealth } from '../api/client';
import { allRecords, normalizeText } from '../data';
import { buildLiveDossier } from './liveDossier';
import { liveSearchDetailed } from './liveProviders';
import { readCache, writeCache } from './offlineCache';

const OFFLINE_HINT = 'Внешние источники недоступны. Откройте раздел «Настройки» и подключитесь напрямую, через Tor Browser или свой прокси.';

/** Backend availability is probed once and cached for the session. */
let backendState = { checked: false, available: false, promise: null };

export function resetBackendProbe() {
  backendState = { checked: false, available: false, promise: null };
}

function probeBackend() {
  if (backendState.promise) return backendState.promise;
  backendState.promise = getHealth()
    .then((health) => {
      backendState = { checked: true, available: true, promise: backendState.promise, network: health?.network || null };
      return true;
    })
    .catch(() => {
      backendState = { checked: true, available: false, promise: backendState.promise };
      return false;
    });
  return backendState.promise;
}

export const backendAvailable = () => (backendState.checked ? Promise.resolve(backendState.available) : probeBackend());
export const activeNetwork = () => backendState.network || null;

/** Curated local records matching a query, scored by relevance. */
export function localSearch(query, type = 'all', limit = 24) {
  const needle = normalizeText(query);
  if (!needle) return [];
  const terms = needle.split(' ').filter((term) => term.length > 1);
  const scored = [];
  for (const record of allRecords) {
    if (type !== 'all' && record.kind !== type) continue;
    const title = normalizeText(record.title || '');
    const haystack = record.searchText || '';
    let relevance = 0;
    if (title === needle) relevance += 120;
    else if (title.startsWith(needle)) relevance += 80;
    else if (title.includes(needle)) relevance += 55;
    if (normalizeText((record.aliases || []).join(' ')).includes(needle)) relevance += 45;
    for (const term of terms) {
      if (title.includes(term)) relevance += 12;
      if (haystack.includes(term)) relevance += 5;
    }
    // Deep-content bonuses only amplify a real match, never create one.
    if (relevance <= 0) continue;
    if (record.keyMoments?.length) relevance += 10;
    if (record.sourcePack?.sources?.length) relevance += 6;
    if (record.quiz?.length) relevance += 3;
    scored.push({ record, score: relevance });
  }
  scored.sort((a, b) => b.score - a.score || String(a.record.title).localeCompare(String(b.record.title), 'ru'));
  return scored.slice(0, limit).map((item) => item.record);
}

const toCardShape = (record) => ({
  ...record,
  id: record.id,
  title: record.title || record.name,
  kind: record.kind,
  summary: record.summary || record.core || record.impact || record.snippet,
  period: record.period || record.years || record.timeline,
  local: true,
});

const dedupe = (items) => {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = normalizeText(item.title || item.id);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
};

/**
 * Unified search. Curated dossiers come first (they are verified and readable
 * offline), then live provider results.
 */
export async function runSearch(query, type = 'all', { useCache = true } = {}) {
  const trimmed = String(query || '').trim();
  const cacheKey = `${trimmed}::${type}`;
  const local = dedupe(localSearch(trimmed, type).map(toCardShape));

  if (!trimmed) {
    return { query: trimmed, type, mode: 'local', results: local, providerStatus: [], localCount: local.length, network: activeNetwork() };
  }

  const cached = useCache ? readCache('search', cacheKey) : null;
  const backend = await backendAvailable();

  if (backend) {
    try {
      const data = await apiSearch(trimmed, type);
      const results = [...local, ...dedupe((data.results || []).filter((item) => !item.local))];
      const payload = {
        query: trimmed,
        type,
        mode: data.mode === 'temporarily-offline' ? 'local' : 'live-multi-source',
        results,
        providerStatus: data.providerStatus || [],
        providerErrors: data.providerErrors,
        localCount: local.length,
        network: data.network || activeNetwork(),
        cacheStatus: 'miss',
        hint: data.hint,
      };
      if (results.length) writeCache('search', cacheKey, payload);
      return payload;
    } catch {
      // fall through to the browser providers
    }
  }

  if (cached && !cached.stale) {
    const cachedLive = (cached.data.results || []).filter((item) => !item.local);
    return { ...cached.data, cacheStatus: 'hit', results: [...local, ...cachedLive] };
  }

  try {
    const live = await liveSearchDetailed(trimmed);
    if (!live.results.length) throw new Error('no live results');
    const results = [...local, ...dedupe(live.results)];
    const payload = {
      query: trimmed,
      type,
      mode: results.length ? 'live-multi-source' : 'temporarily-offline',
      source: 'browser',
      results,
      providerStatus: live.providerStatus,
      providerErrors: live.errors.length ? live.errors : undefined,
      localCount: local.length,
      network: null,
      cacheStatus: 'miss',
      hint: results.length ? undefined : OFFLINE_HINT,
    };
    if (results.length) writeCache('search', cacheKey, payload);
    return payload;
  } catch {
    if (cached) return { ...cached.data, cacheStatus: 'stale', hint: OFFLINE_HINT };
    return {
      query: trimmed,
      type,
      mode: 'local',
      results: local,
      providerStatus: [],
      localCount: local.length,
      network: null,
      cacheStatus: 'miss',
      hint: OFFLINE_HINT,
    };
  }
}

/** Finds a curated record by id, title or alias. */
export function findRecord(query) {
  const needle = normalizeText(query);
  if (!needle) return null;
  return allRecords.find((record) => normalizeText(record.id) === needle)
    || allRecords.find((record) => normalizeText(record.title) === needle)
    || allRecords.find((record) => (record.aliases || []).some((alias) => normalizeText(alias) === needle))
    || null;
}

/**
 * Builds a full dossier view from a curated record: infobox, known facts,
 * disputed claims, myths, positions, sources and quiz.
 */
export function dossierFromRecord(record) {
  const factChecks = record.factCheck || [];
  const isMyth = (fact) => /миф|упрощение|опровергн/i.test(String(fact.assessment).toLowerCase());
  const isSolid = (fact) => /высок|подтверждено/i.test(String(fact.assessment).toLowerCase()) && !isMyth(fact);
  const knownFacts = factChecks.filter(isSolid);
  const myths = factChecks.filter(isMyth);
  const disputedClaims = factChecks.filter((fact) => !knownFacts.includes(fact) && !myths.includes(fact));

  const summary = record.summary || record.sourcePack?.summary || record.impact || record.core;
  const hasDeepContent = Boolean(record.causes || record.outcomes);

  return {
    query: record.title,
    title: record.title,
    status: 'curated-dossier',
    source: 'local',
    entityType: record.type || record.kind,
    summary,
    brief: summary,
    thumbnail: null,
    articleUrl: record.sourceUrl || null,
    infobox: {
      type: record.type || record.kind,
      dates: record.period || record.years || record.timeline || 'уточняются',
      region: record.region || (record.regions || []).join(', ') || 'уточняется',
      participants: (record.parties || []).join(', ') || 'не указаны',
      outcome: record.impact || record.core || 'требует дополнительного исследования',
      confidence: record.sourcePack?.sources?.length ? 'средне-высокая' : 'предварительная',
    },
    causes: record.causes || [],
    outcomes: record.outcomes || [],
    timeline: record.keyMoments || [],
    perspectives: record.perspectives || [],
    knownFacts,
    disputedClaims,
    myths,
    positionStatements: (record.perspectives || []).map((viewpoint) => ({
      claim: viewpoint.thesis,
      assessment: 'позиция стороны',
      explanation: viewpoint.side,
    })),
    sources: record.sourcePack?.sources || [],
    sourcePack: record.sourcePack || null,
    researchPipeline: record.learn || [],
    quiz: record.quiz || [],
    topics: record.topics || [],
    aliases: record.aliases || [],
    milestones: record.milestones || [],
    hasDeepContent,
    fetchedAt: new Date().toISOString(),
  };
}

function researchPlan(query, reason) {
  const summary = `Досье по теме «${query}» открыто в автономном режиме: сейчас нет доступа к внешним источникам. ${reason || ''}`.trim();
  return {
    query,
    title: query,
    status: 'local-research-plan',
    source: 'offline',
    entityType: 'историческая тема',
    summary,
    brief: summary,
    infobox: {
      type: 'историческая тема',
      dates: 'требуют проверки по источникам',
      region: 'требует уточнения',
      participants: 'требуют уточнения',
      outcome: 'требует исследования',
      confidence: 'не установлена без источников',
    },
    causes: [],
    outcomes: [],
    timeline: [],
    perspectives: [],
    knownFacts: [],
    disputedClaims: [{ text: 'Без подключённых источников нельзя подтверждать даты, причины, участников и последствия.' }],
    positionStatements: [],
    myths: [],
    sources: [],
    quiz: [],
    researchPipeline: [
      'Сформулировать, какие границы темы и период нужно исследовать.',
      'Найти не менее двух независимых академических или первичных источников.',
      'Сверить даты, имена и ключевые события между источниками.',
      'Отделить установленные факты от интерпретаций и спорных оценок.',
    ],
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Unified dossier resolution: curated → backend → browser providers → plan.
 */
export async function resolveDossier(rawQuery, { refresh = false, preferLive = false } = {}) {
  const query = String(rawQuery || '').trim();
  if (!query) return researchPlan(rawQuery);

  const record = findRecord(query);
  const localDossier = record ? dossierFromRecord(record) : null;

  // Curated dossiers are already verified — show them immediately, offline.
  if (localDossier && !preferLive) {
    const cachedEnriched = !refresh ? readCache('dossier', `live:${query}`) : null;
    if (cachedEnriched && !cachedEnriched.stale) {
      return {
        ...localDossier,
        live: cachedEnriched.data,
        cacheStatus: 'hit',
        cachedAt: cachedEnriched.createdAt,
        fromCache: true,
      };
    }
    return { ...localDossier, cacheStatus: localDossier.sources.length ? 'curated' : 'miss' };
  }

  const cached = !refresh ? readCache('dossier', query) : null;
  if (cached && !cached.stale) {
    if (localDossier) {
      return { ...localDossier, live: cached.data, cacheStatus: 'hit', cachedAt: cached.createdAt, fromCache: true };
    }
    return { ...cached.data, cacheStatus: 'hit', cachedAt: cached.createdAt, fromCache: true };
  }

  const backend = await backendAvailable();
  if (backend) {
    try {
      const data = await apiGetDossier(query, { refresh });
      writeCache('dossier', query, data);
      if (localDossier) return { ...localDossier, live: data, cacheStatus: 'miss', cachedAt: Date.now() };
      return { ...data, cacheStatus: 'miss', cachedAt: Date.now() };
    } catch {
      // fall through
    }
  }

  try {
    const live = await liveSearchDetailed(query);
    if (!live.results.length) throw new Error('no live results');
    const dossier = await buildLiveDossier(query, live.results);
    writeCache('dossier', `live:${query}`, dossier);
    writeCache('dossier', query, dossier);
    if (localDossier) return { ...localDossier, live: dossier, cacheStatus: 'miss', cachedAt: Date.now() };
    return { ...dossier, cacheStatus: 'miss', cachedAt: Date.now(), providerStatus: live.providerStatus };
  } catch {
    if (cached) {
      return { ...cached.data, cacheStatus: 'stale', cachedAt: cached.createdAt, fromCache: true, hint: OFFLINE_HINT };
    }
    if (localDossier) return { ...localDossier, hint: OFFLINE_HINT };
    return { ...researchPlan(query, 'Подключите маршрут (напрямую, Tor Browser или прокси) в настройках и обновите страницу.'), hint: OFFLINE_HINT };
  }
}

/**
 * Enriches a curated dossier with live material (used by the «Обновить данные»
 * button). Falls back to the curated dossier when the network is unavailable.
 */
export async function refreshDossier(rawQuery) {
  const query = String(rawQuery || '').trim();
  const record = findRecord(query);
  const localDossier = record ? dossierFromRecord(record) : null;
  try {
    const live = await liveSearchDetailed(query);
    if (!live.results.length) throw new Error('no live results');
    const dossier = await buildLiveDossier(query, live.results);
    writeCache('dossier', `live:${query}`, dossier);
    if (localDossier) return { ...localDossier, live: dossier, cacheStatus: 'miss', cachedAt: Date.now() };
    return { ...dossier, cacheStatus: 'miss', cachedAt: Date.now() };
  } catch {
    if (localDossier) return { ...localDossier, cacheStatus: 'curated', hint: OFFLINE_HINT };
    return { ...researchPlan(query), hint: OFFLINE_HINT };
  }
}

export const HINTS = { OFFLINE_HINT };
