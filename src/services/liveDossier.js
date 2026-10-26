/**
 * Client-side dossier builder. Produces the same dossier shape as the backend
 * (`server/services/dossierBuilder.js`) but runs entirely in the browser, so
 * the packaged mobile app can research a topic without a server.
 *
 * Rule of the whole product: never invent facts. Everything below comes from
 * the article text or from structured Wikidata statements; anything unknown is
 * explicitly marked as "requires verification".
 */
import {
  extractKnownFacts,
  extractTimeline,
  infoboxFromEntity,
  referencedEntityIds,
  splitExtractSections,
} from '../../shared/enrichers.js';
import { fetchJsonPublic } from './liveProviders';

const SOURCE_RELIABILITY = {
  Wikipedia: 'энциклопедия — хорошая отправная точка',
  'Wikipedia EN': 'энциклопедия — хорошая отправная точка',
  Wikidata: 'структурированные данные Wikidata',
  OpenAlex: 'научная публикация (рецензируется)',
  Crossref: 'научная публикация (рецензируется)',
  'Internet Archive': 'оцифрованный архивный материал',
  Europeana: 'материал культурного наследия',
};

const trimTo = (text, limit) => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > limit ? `${clean.slice(0, limit).replace(/ [^ ]*$/, '')}…` : clean;
};

const settle = async (task) => {
  try {
    return await task();
  } catch {
    return null;
  }
};

export async function fetchArticleDetailsBrowser(title) {
  const url = 'https://ru.wikipedia.org/w/api.php?action=query&format=json&redirects=1'
    + '&prop=extracts|pageimages|description&explaintext=1&exsectionformat=wiki'
    + `&piprop=thumbnail&pithumbsize=480&titles=${encodeURIComponent(title)}&origin=*`;
  const data = await fetchJsonPublic(url);
  const page = Object.values(data?.query?.pages || {})[0];
  if (!page || page.missing !== undefined || !page.extract) return null;
  return {
    title: page.title,
    extract: page.extract,
    description: page.description || null,
    thumbnail: page.thumbnail?.source || null,
    url: `https://ru.wikipedia.org/wiki/${encodeURIComponent(String(page.title).replaceAll(' ', '_'))}`,
  };
}

export async function fetchWikidataEntityBrowser(wikiTitle) {
  const data = await fetchJsonPublic(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&sites=ruwiki&titles=${encodeURIComponent(wikiTitle)}&props=claims&origin=*`,
  );
  const entity = Object.values(data?.entities || {}).find((item) => item?.claims && !item.missing);
  if (!entity) return null;
  const id = Object.entries(data.entities).find(([, value]) => value === entity)?.[0];
  if (!id) return null;

  const referenced = referencedEntityIds(entity);
  const labels = new Map();
  if (referenced.length) {
    const labelData = await settle(() => fetchJsonPublic(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=${encodeURIComponent(referenced.join('|'))}&props=labels&languages=ru|en&origin=*`,
    ));
    for (const [qid, value] of Object.entries(labelData?.entities || {})) {
      const label = value?.labels?.ru?.value || value?.labels?.en?.value;
      if (label) labels.set(qid, label);
    }
  }

  return {
    id,
    infobox: infoboxFromEntity(entity, (qid) => labels.get(qid) || qid),
    url: `https://www.wikidata.org/wiki/${id}`,
  };
}

/** Builds a dossier in the browser from live search results. */
export async function buildLiveDossier(query, results = []) {
  const sourceNames = [...new Set(results.map((item) => item.sourceName))].filter(Boolean);
  const lead = results.find((item) => item.sourceName === 'Wikipedia') || results[0] || null;

  const [article, wikidata] = lead?.title
    ? await Promise.all([
      settle(() => fetchArticleDetailsBrowser(lead.title)),
      settle(() => fetchWikidataEntityBrowser(lead.title)),
    ])
    : [null, null];

  const parsed = article ? splitExtractSections(article.extract) : null;
  const leadBrief = parsed ? trimTo(parsed.lead.slice(0, 2).join(' '), 700) : null;
  const summary = leadBrief || lead?.summary || `Материалы по теме «${query}».`;
  const confidence = results.length >= 6 && article ? 'средне-высокая' : results.length ? 'предварительная' : 'низкая';

  const infobox = {
    type: wikidata?.infobox?.type || article?.description || lead?.kind || 'историческая тема',
    dates: wikidata?.infobox?.dates || 'уточняются по источникам',
    region: wikidata?.infobox?.region || 'уточняется по источникам',
    participants: wikidata?.infobox?.participants || 'уточняются по источникам',
    outcome: parsed ? trimTo(parsed.lead[parsed.lead.length - 1], 320) : 'требуется дополнительное исследование',
    confidence,
    ...(wikidata?.infobox?.partOf ? { partOf: wikidata.infobox.partOf } : {}),
  };

  const timeline = parsed ? extractTimeline(parsed.sections) : [];
  const knownFacts = parsed
    ? extractKnownFacts(parsed.lead, { evidence: 'Wikipedia' })
    : [{ text: `По теме найдено материалов: ${results.length}.`, evidence: sourceNames.join(', ') }];

  const academic = results.filter((item) => ['OpenAlex', 'Crossref'].includes(item.sourceName));
  const perspectives = [
    article && {
      side: 'Энциклопедический обзор',
      thesis: trimTo(leadBrief || summary, 420),
      caution: 'Энциклопедия даёт консенсусную картину; спорные оценки сверьте по научным работам.',
    },
    ...academic.slice(0, 4).map((item) => ({
      side: `${item.sourceName}${item.year ? `, ${item.year}` : ''}`,
      thesis: trimTo(item.summary, 420),
      caution: 'Научная публикация отражает позицию авторов и требует сопоставления с другими работами.',
    })),
  ].filter(Boolean);

  return {
    query,
    title: article?.title || lead?.title || query,
    status: 'live-multi-source',
    source: 'browser',
    entityType: infobox.type,
    summary,
    brief: summary,
    description: article?.description || null,
    thumbnail: article?.thumbnail || null,
    articleUrl: article?.url || lead?.sourceUrl || null,
    infobox,
    timeline,
    knownFacts,
    disputedClaims: [{ text: 'Даты, участники, причины и последствия требуют проверки по нескольким независимым источникам.' }],
    positionStatements: results.slice(0, 6).map((item) => ({ text: trimTo(item.summary, 300), source: item.sourceName })),
    myths: [],
    quickFacts: [
      { label: 'Источники', value: sourceNames.join(', ') || 'нет данных' },
      { label: 'Найдено материалов', value: String(results.length) },
      ...(article ? [{ label: 'Объём статьи', value: `${article.extract.length.toLocaleString('ru-RU')} знаков` }] : []),
      ...(wikidata ? [{ label: 'Сущность Wikidata', value: wikidata.id }] : []),
    ],
    researchPipeline: [
      'Сопоставить материалы разных провайдеров.',
      'Проверить даты и имена по первичным документам.',
      'Сравнить независимые историографические оценки.',
      'Отделить факт от интерпретации и позиции стороны.',
    ],
    perspectives,
    sourcePlan: sourceNames.map((name) => ({ name, reliability: SOURCE_RELIABILITY[name] || 'требует оценки' })),
    sourceUrl: lead?.sourceUrl || null,
    sources: results.map((item) => ({ ...item, reliability: SOURCE_RELIABILITY[item.sourceName] })),
    wikidataUrl: wikidata?.url || null,
    fetchedAt: new Date().toISOString(),
  };
}

export { SOURCE_RELIABILITY };
