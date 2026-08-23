const request = async (path, options = {}) => {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Ошибка API: ${response.status}`);
  return data;
};

export const searchHistory = (query, type = 'all') =>
  request(`/api/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(type)}`);

export const getDossier = (query) => request(`/api/dossier/${encodeURIComponent(query)}`);

/**
 * Keeps the dossier useful when the optional API is not running (for example,
 * when the static frontend is opened by itself). It deliberately contains no
 * unverified historical facts: the user receives a research structure and can
 * return to it once sources become available.
 */
export function createDossierFallback(query) {
  const title = String(query || '').trim() || 'Историческая тема';
  return {
    query: title,
    title,
    status: 'local-research-plan',
    entityType: 'историческая тема',
    brief: `Досье по теме «${title}» открыто в автономном режиме. Для точных дат, участников и оценок подключите источники или повторите попытку позже.`,
    infobox: {
      type: 'историческая тема',
      dates: 'требуют проверки по источникам',
      region: 'требует уточнения',
      participants: 'требуют уточнения',
      outcome: 'требует исследования',
      confidence: 'не установлена без источников',
    },
    timeline: [],
    perspectives: [],
    knownFacts: [],
    disputedClaims: [{ text: 'Без подключённых источников нельзя подтверждать даты, причины, участников и последствия.' }],
    positionStatements: [],
    myths: [],
    sources: [],
    researchPipeline: [
      'Сформулировать, какие границы темы и период нужно исследовать.',
      'Найти не менее двух независимых академических или первичных источников.',
      'Сверить даты, имена и ключевые события между источниками.',
      'Отделить установленные факты от интерпретаций и спорных оценок.',
    ],
  };
}

export const analyzeSource = (url) =>
  request(`/api/source/analyze?url=${encodeURIComponent(url)}`);
