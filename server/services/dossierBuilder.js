export function buildDossier(query, results = []) {
  const lead = results[0];
  const sourceNames = [...new Set(results.map((item) => item.sourceName))];
  const offline = results.length === 0;

  const summary = lead?.summary || `Исследовательский план по теме «${query}». Внешние источники сейчас недоступны, поэтому ссылки и факты будут добавлены после восстановления соединения.`;
  const confidence = results.length >= 6 ? 'средне-высокая' : results.length > 0 ? 'предварительная' : 'низкая';

  return {
    query,
    title: lead?.title || query,
    status: offline ? 'needs-live-research' : 'live-multi-source',
    entityType: lead?.kind || 'историческая тема',
    summary,
    brief: summary,
    infobox: {
      type: lead?.kind || 'историческая тема',
      dates: 'уточняются по источникам',
      region: 'уточняется по источникам',
      participants: 'уточняются по источникам',
      outcome: 'требуется дополнительное исследование',
      confidence,
    },
    timeline: [],
    knownFacts: results.length ? [{ text: `По теме найдено материалов: ${results.length}.`, evidence: sourceNames.join(', ') }] : [],
    disputedClaims: [{ text: 'Даты, участники, причины и последствия требуют проверки по нескольким независимым источникам.' }],
    positionStatements: results.slice(0, 6).map((item) => ({ text: item.summary, source: item.sourceName })),
    myths: [],
    quickFacts: [
      { label: 'Источники', value: sourceNames.join(', ') || 'Временно недоступны' },
      { label: 'Найдено материалов', value: String(results.length) },
    ],
    researchPipeline: [
      'Сопоставить материалы разных провайдеров.',
      'Проверить даты и имена по первичным документам.',
      'Сравнить независимые историографические оценки.',
      'Отделить факт от интерпретации и позиции стороны.',
    ],
    perspectives: results.slice(0, 6).map((item) => ({
      side: item.sourceName,
      thesis: item.summary,
      caution: 'Материал требует критической проверки и сопоставления.',
    })),
    sourcePlan: results.map((item) => ({
      name: item.sourceName,
      type: item.kind,
      reliability: 'требует оценки',
      purpose: 'внешний материал по запросу',
    })),
    sourcePack: null,
    sourceUrl: lead?.sourceUrl || null,
    sources: results,
  };
}
