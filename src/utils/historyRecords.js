import { conflicts, countries, eras } from '../historyData';

export const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^а-яa-z0-9\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const allRecords = [
  ...eras.map((item) => ({
    ...item,
    kind: 'Эпоха',
    text: `${item.title} ${item.period} ${item.summary} ${item.regions.join(' ')} ${item.milestones.join(' ')} ${item.aliases?.join(' ') || ''}`,
  })),
  ...countries.map((item) => ({
    ...item,
    title: item.name,
    kind: 'Страна',
    text: `${item.name} ${item.region} ${item.timeline} ${item.core} ${item.topics.join(' ')} ${item.sources.join(' ')} ${item.aliases?.join(' ') || ''}`,
  })),
  ...conflicts.map((item) => ({
    ...item,
    title: item.name,
    kind: 'Конфликт',
    text: `${item.name} ${item.years} ${item.region} ${item.parties.join(' ')} ${item.impact} ${item.learn.join(' ')} ${item.aliases?.join(' ') || ''}`,
  })),
].map((record) => ({ ...record, searchText: normalizeText(`${record.title} ${record.text}`) }));
