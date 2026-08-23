import { describe, expect, it } from 'vitest';
import { allRecords, normalizeText } from './historyRecords';

describe('history records', () => {
  it('normalizes case, punctuation and ё', () => {
    expect(normalizeText('  Ёлка: ВОЙНА!  ')).toBe('елка война');
  });

  it('builds searchable records for every entity group', () => {
    expect(allRecords.length).toBeGreaterThan(0);
    expect(allRecords.every((record) => record.id && record.title && record.searchText)).toBe(true);
  });
});
