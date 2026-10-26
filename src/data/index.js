/**
 * Unified data layer.
 *
 * The app works with three layers of content:
 *  1. `historyData` — the broad base catalogue (200+ countries, all eras/conflicts);
 *  2. `src/data/curated*` — deep, source-grounded dossiers for the most
 *     important themes (causes, outcomes, key moments, historiographic
 *     schools, myth-busting fact checks, curated sources, quizzes);
 *  3. live providers (backend API or the in-browser providers) at request time.
 *
 * `allRecords` merges 1 and 2 into a single searchable, uniform record list so
 * every page (search, dossier, quiz, countries) can rely on the same shape.
 */
import { conflicts, countries, eras, glossary, sourceGroups, studyPaths } from '../historyData';
import { curatedEras } from './curatedEras';
import { curatedConflicts } from './curatedConflicts';
import { curatedCountries } from './curatedCountries';
import { curatedCountriesMore } from './curatedCountriesMore';
import { curatedSources, allCuratedSources } from './sources';

export const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^а-яa-z0-9\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const mergeCurated = (baseList, curatedList) => {
  const curatedById = new Map(curatedList.map((item) => [item.id, item]));
  const seen = new Set();
  const merged = [];
  for (const base of baseList) {
    const extra = curatedById.get(base.id);
    if (extra) {
      seen.add(base.id);
      merged.push({ ...base, ...extra });
    } else {
      merged.push({ ...base });
    }
  }
  // Curated records that are not in the base catalogue still belong to the app.
  for (const item of curatedList) {
    if (!seen.has(item.id)) merged.push({ ...item });
  }
  return merged;
};

/** Eras with deep dossiers merged over the base list. */
export const erasWithDossiers = mergeCurated(
  eras.map((era) => ({ ...era, kind: 'Эпоха', title: era.title })),
  curatedEras,
);

/** Conflicts — base list already carries deep dossiers for some topics. */
export const conflictsWithDossiers = mergeCurated(
  conflicts.map((conflict) => ({ ...conflict, kind: 'Конфликт', title: conflict.name })),
  curatedConflicts,
);

/** Countries — deep dossiers for the most studied states, base for the rest. */
export const countriesWithDossiers = mergeCurated(
  countries.map((country) => ({ ...country, kind: 'Страна', title: country.name })),
  [...curatedCountries, ...curatedCountriesMore],
);

/** Texts used for fast local search over curated content. */
const searchableText = (record) => {
  const chunks = [
    record.title,
    record.name,
    record.summary,
    record.core,
    record.period,
    record.years,
    record.timeline,
    record.region,
    (record.aliases || []).join(' '),
    (record.topics || []).join(' '),
    (record.regions || []).join(' '),
    (record.milestones || []).join(' '),
    (record.parties || []).join(' '),
    (record.causes || []).map((item) => `${item.kind} ${item.text}`).join(' '),
    (record.outcomes || []).map((item) => `${item.kind} ${item.text}`).join(' '),
    (record.keyMoments || []).map((item) => `${item.date} ${item.title} ${item.text}`).join(' '),
    (record.perspectives || []).map((item) => `${item.side} ${item.thesis}`).join(' '),
    (record.factCheck || []).map((item) => `${item.claim} ${item.assessment}`).join(' '),
    (record.learn || []).join(' '),
  ];
  return normalizeText(chunks.filter(Boolean).join(' '));
};

export const allRecords = [
  ...erasWithDossiers.map((record) => ({ ...record, searchText: searchableText(record) })),
  ...countriesWithDossiers.map((record) => ({ ...record, searchText: searchableText(record) })),
  ...conflictsWithDossiers.map((record) => ({ ...record, searchText: searchableText(record) })),
];;

/**
 * Local search over the curated corpus. Returns records scored by match
 * quality, so the UI can show meaningful results before (or instead of)
 * calling the live providers.
 */
export function searchLocal(query, { type = 'all', limit = 40 } = {}) {
  const needle = normalizeText(query);
  if (!needle) return [];
  const terms = needle.split(' ').filter((term) => term.length > 1);
  const kindFilter = type === 'all' ? null : type;

  const scored = [];
  for (const record of allRecords) {
    if (kindFilter && record.kind !== kindFilter) continue;
    const haystack = record.searchText;
    const title = normalizeText(record.title || '');
    let relevance = 0;
    if (title === needle) relevance += 120;
    else if (title.startsWith(needle)) relevance += 80;
    else if (title.includes(needle)) relevance += 55;
    if (normalizeText(record.aliases?.join(' '))?.includes(needle)) relevance += 45;
    for (const term of terms) {
      if (title.includes(term)) relevance += 12;
      if (haystack.includes(term)) relevance += 5;
    }
    // Prefer records with deep content, but never invent a match.
    if (relevance <= 0) return;
    if (record.keyMoments?.length) relevance += 10;
    if (record.sourcePack?.sources?.length) relevance += 6;
    if (record.quiz?.length) relevance += 3;
    scored.push({ record, score: relevance });
  }

  scored.sort((a, b) => b.score - a.score || String(a.record.title).localeCompare(String(b.record.title), 'ru'));
  return scored.slice(0, limit).map((item) => item.record);
}

/** Countries that have a full curated dossier (shown as "deep dossiers"). */
export const featuredTopics = [
  ...curatedEras.map((era) => ({ id: era.id, kind: 'Эпоха', title: era.title, blurb: era.period })),
  ...curatedConflicts.map((item) => ({ id: item.id, kind: 'Конфликт', title: item.name, blurb: item.years })),
  ...[...curatedCountries, ...curatedCountriesMore].slice(0, 12).map((item) => ({
    id: item.id, kind: 'Страна', title: item.name, blurb: item.timeline, flag: item.flag,
  })),
];

export {
  glossary,
  studyPaths,
  sourceGroups,
  curatedSources,
  allCuratedSources,
  curatedEras,
  curatedConflicts,
  curatedCountries,
  curatedCountriesMore,
};
