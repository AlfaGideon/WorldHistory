export function buildDossier(query, results = []) {
  const lead = results[0];
  const sourceNames = [...new Set(results.map((item) => item.sourceName))];
  const offline = results.length === 0;

  return {
    query,
    title: lead?.title || query,
    status: offline ? 'needs-live-research' : 'live-multi-source',
    entityType: lead?.kind || 'историческая тема',
    summary: lead?.summary || `Исследовательский план по теме «${query}». Внешние источники сейчас недоступны, поэтому ссылки и факты будут добавлены после восстановления соединения.`,
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
