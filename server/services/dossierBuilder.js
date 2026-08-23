import { fetchJson as defaultFetchJson } from './http.js';
import {
  extractKnownFacts,
  extractTimeline,
  fetchArticleDetails,
  fetchWikidataEntity,
  splitExtractSections,
} from './dossierEnricher.js';

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

export function buildDossier(query, results = [], { fetchJson = defaultFetchJson, now = () => new Date() } = {}) {
  const offline = results.length === 0;
  if (offline) return buildOfflineDossier(query, now);

  const lead = results.find((item) => item.sourceName === 'Wikipedia') || results[0];
  const sourceNames = [...new Set(results.map((item) => item.sourceName))];
  const enrich = async (task) => {
    try {
      return await task();
    } catch {
      return null; // Enrichment is best-effort: search results already carry value.
    }
  };

  return (async () => {
    const wikiTitle = lead?.sourceName === 'Wikipedia' ? lead.title : lead?.title;
    const [article, wikidata] = wikiTitle
      ? await Promise.all([
        enrich(() => fetchArticleDetails(fetchJson, wikiTitle)),
        enrich(() => fetchWikidataEntity(fetchJson, wikiTitle)),
      ])
      : [null, null];

    const parsed = article ? splitExtractSections(article.extract) : null;
    const leadBrief = parsed ? trimTo(parsed.lead.slice(0, 2).join(' '), 700) : null;
    const summary = leadBrief || lead?.summary || `Материалы по теме «${query}».`;
    const confidence = results.length >= 6 && article ? 'средне-высокая' : results.length > 0 ? 'предварительная' : 'низкая';

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
        { label: 'Источники', value: sourceNames.join(', ') },
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
      fetchedAt: now().toISOString(),
    };
  })();
}

/** Deterministic offline plan used when no provider returned anything. */
export function buildOfflineDossier(query, now = () => new Date()) {
  const summary = `Исследовательский план по теме «${query}». Внешние источники сейчас недоступны, поэтому ссылки и факты будут добавлены после восстановления соединения.`;
  return Promise.resolve({
    query,
    title: query,
    status: 'needs-live-research',
    entityType: 'историческая тема',
    summary,
    brief: summary,
    infobox: {
      type: 'историческая тема',
      dates: 'уточняются по источникам',
      region: 'уточняется по источникам',
      participants: 'уточняются по источникам',
      outcome: 'требуется дополнительное исследование',
      confidence: 'низкая',
    },
    timeline: [],
    knownFacts: [],
    disputedClaims: [{ text: 'Даты, участники, причины и последствия требуют проверки по нескольким независимым источникам.' }],
    positionStatements: [],
    myths: [],
    quickFacts: [{ label: 'Источники', value: 'Временно недоступны' }],
    researchPipeline: [
      'Сопоставить материалы разных провайдеров.',
      'Проверить даты и имена по первичным документам.',
      'Сравнить независимые историографические оценки.',
      'Отделить факт от интерпретации и позиции стороны.',
    ],
    perspectives: [],
    sourcePlan: [],
    sourceUrl: null,
    sources: [],
    fetchedAt: now().toISOString(),
  });
}
