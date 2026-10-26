/**
 * Turns raw Wikipedia article extracts and Wikidata entities into structured
 * dossier fields. The pure parsing helpers live in `shared/enrichers.js` so the
 * browser (in-app research service) and this backend share exactly the same
 * logic and the same unit tests.
 */
import { fetchJson as defaultFetchJson } from './http.js';
import {
  ITEM_CLAIMS,
  extractKnownFacts,
  extractTimeline,
  findDateLabel,
  formatWikibaseTime,
  infoboxFromEntity,
  referencedEntityIds,
  splitExtractSections,
} from '../../shared/enrichers.js';

export {
  ITEM_CLAIMS,
  extractKnownFacts,
  extractTimeline,
  findDateLabel,
  formatWikibaseTime,
  infoboxFromEntity,
  referencedEntityIds,
  splitExtractSections,
};

/**
 * Fetches the full plain-text extract, thumbnail and short description of a
 * Wikipedia article in a single API call.
 */
export async function fetchArticleDetails(fetchJson, title) {
  const url = `https://ru.wikipedia.org/w/api.php?action=query&format=json&redirects=1`
    + `&prop=extracts|pageimages|description&explaintext=1&exsectionformat=wiki`
    + `&piprop=thumbnail&pithumbsize=480&redirects=1&titles=${encodeURIComponent(title)}`;
  const data = await fetchJson(url, { timeout: 20_000 });
  const pages = data?.query?.pages || {};
  const page = Object.values(pages)[0];
  if (!page || page.missing !== undefined || !page.extract) return null;
  return {
    title: page.title,
    extract: page.extract,
    description: page.description || null,
    thumbnail: page.thumbnail?.source || null,
    url: `https://ru.wikipedia.org/wiki/${encodeURIComponent(String(page.title).replaceAll(' ', '_'))}`,
  };
}

/** Fetches the Wikidata entity bound to a ru.wiki article plus label lookup. */
export async function fetchWikidataEntity(fetchJson, wikiTitle) {
  const entityData = await fetchJson(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&sites=ruwiki&titles=${encodeURIComponent(wikiTitle)}&props=claims`,
    { timeout: 15_000 },
  );
  const entities = entityData?.entities || {};
  const entry = Object.entries(entities).find(([, value]) => value && value.claims && !value.missing);
  if (!entry) return null;
  const [id, entity] = entry;

  const referenced = referencedEntityIds(entity);
  const labels = new Map();
  if (referenced.length) {
    try {
      const labelData = await fetchJson(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=${encodeURIComponent(referenced.join('|'))}&props=labels&languages=ru|en`,
        { timeout: 15_000 },
      );
      for (const [qid, value] of Object.entries(labelData?.entities || {})) {
        const label = value?.labels?.ru?.value || value?.labels?.en?.value;
        if (label) labels.set(qid, label);
      }
    } catch {
      // Labels are a nice-to-have; keep Q-ids when the lookup fails.
    }
  }

  return {
    id,
    infobox: infoboxFromEntity(entity, (qid) => labels.get(qid) || qid),
    url: `https://www.wikidata.org/wiki/${id}`,
  };
}

/** Convenience: resolve a title through the default HTTP client. */
export const fetchArticle = (title) => fetchArticleDetails(defaultFetchJson, title);
