/**
 * Turns raw Wikipedia article extracts and Wikidata entities into structured
 * dossier fields. All parsing helpers are pure so they can be unit-tested
 * without network access.
 */

const YEAR_PATTERN = /(?:\b[1-9]\d{3}\b|\b[1-9]\d{2}\b(?=\s*год))/u;
const CENTURY_PATTERN = /\b(?:X{0,2}(?:IX|IV|V?I{0,3}))\s*(?:век\p{L}*|столети\p{L}*)/ui;
const BC_PATTERN = /до\s*н\.?\s*э\.?/ui;
const RANGE_PATTERN = /\b([1-9]\d{3})\s*[—–-]\s*([1-9]\d{3})\b/u;

const splitIntoSentences = (text) =>
  String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…])\s+(?=[A-ZА-ЯЁ«"(]|\d)/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 25);

export function findDateLabel(sentence) {
  const range = sentence.match(RANGE_PATTERN);
  if (range) return `${range[1]}—${range[2]}`;
  const bc = sentence.match(BC_PATTERN);
  const year = sentence.match(YEAR_PATTERN);
  if (year) return bc ? `${year[0]} до н. э.` : year[0];
  const century = sentence.match(CENTURY_PATTERN);
  if (century) return century[0].replace(/\s+/g, ' ').trim();
  return null;
}

/** Splits a plain-text extract (with ==headings==) into lead + sections. */
export function splitExtractSections(extract) {
  const lines = String(extract || '').split('\n').map((line) => line.trim());
  const lead = [];
  const sections = [];
  let current = null;
  for (const line of lines) {
    const heading = line.match(/^(={2,})\s*(.+?)\s*\1$/);
    if (heading) {
      if (current) sections.push(current);
      current = { level: heading[1].length, title: heading[2], paragraphs: [] };
      continue;
    }
    if (!line) continue;
    if (current) current.paragraphs.push(line);
    else lead.push(line);
  }
  if (current) sections.push(current);
  return {
    lead,
    sections: sections
      .filter((section) => section.paragraphs.length)
      .map((section) => ({ level: section.level, title: section.title, text: section.paragraphs.join(' ') })),
  };
}

/** Sentences from the lead that mention dates — treated as quick known facts. */
export function extractKnownFacts(lead, { evidence = 'Wikipedia', limit = 5 } = {}) {
  const sentences = splitIntoSentences(lead.join(' '));
  const facts = sentences
    .map((sentence) => (findDateLabel(sentence) ? { text: sentence, evidence } : null))
    .filter(Boolean);
  return facts.slice(0, limit);
}

/** Builds a timeline from dated sentences across article sections. */
export function extractTimeline(sections, { limit = 12, status = 'по данным Wikipedia' } = {}) {
  const timeline = [];
  const seen = new Set();
  for (const section of sections) {
    if (/^(см\.? также|примечания|ссылки|литература|комментарии)/i.test(section.title)) continue;
    const sentences = splitIntoSentences(section.text);
    const dated = sentences.find((sentence) => findDateLabel(sentence));
    if (!dated) continue;
    const date = findDateLabel(dated);
    const key = `${date}|${section.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const text = dated.length > 340 ? `${dated.slice(0, 340).replace(/ [^ ]*$/, '')}…` : dated;
    timeline.push({ date, title: section.title, text, status });
  }
  return timeline.slice(0, limit);
}

const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_RU_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

/** Formats a Wikibase time value honoring its precision (year=9, month=10, day=11). */
export function formatWikibaseTime(value) {
  if (!value?.time) return null;
  const match = value.time.match(/^([+-])(\d{4})-(\d{2})-(\d{2})T/);
  if (!match) return null;
  const [, sign, year, month, day] = match;
  const era = sign === '-' ? ' до н. э.' : '';
  const cleanYear = String(Number(year));
  const monthIndex = Number(month) - 1;
  const precision = Number(value.precision || 9);
  if (precision <= 9) return `${cleanYear}${era}`;
  if (precision === 10) return `${MONTHS_RU_NOM[monthIndex] ?? month} ${cleanYear}${era}`;
  return `${Number(day)} ${MONTHS_RU[monthIndex] ?? month} ${cleanYear}${era}`;
}

const ITEM_CLAIMS = {
  type: 'P31',
  inception: 'P571',
  start: 'P580',
  end: 'P582',
  dissolution: 'P576',
  pointInTime: 'P585',
  country: 'P17',
  participants: 'P710',
  partOf: 'P361',
};

function claimValues(entity, property) {
  return entity?.claims?.[property] || [];
}

/** Extracts the Wikidata entity id referenced by the first statement. */
const mainItemIds = (entity, property, limit = 4) =>
  claimValues(entity, property)
    .map((statement) => statement.mainsnak?.datavalue?.value?.id)
    .filter(Boolean)
    .slice(0, limit);

/**
 * Maps a Wikidata entity into dossier infobox fields. `labelOf` resolves
 * Q-ids into Russian labels (fetched separately by the caller).
 */
export function infoboxFromEntity(entity, labelOf = (id) => id) {
  if (!entity) return null;
  const withEra = (property) => {
    const value = claimValues(entity, property)[0]?.mainsnak?.datavalue?.value;
    return formatWikibaseTime(value) || null;
  };

  const typeLabels = mainItemIds(entity, ITEM_CLAIMS.type, 2).map(labelOf).filter(Boolean);
  const countryLabels = mainItemIds(entity, ITEM_CLAIMS.country, 3).map(labelOf).filter(Boolean);
  const participantLabels = mainItemIds(entity, ITEM_CLAIMS.participants, 6).map(labelOf).filter(Boolean);
  const partOfLabels = mainItemIds(entity, ITEM_CLAIMS.partOf, 2).map(labelOf).filter(Boolean);

  const start = withEra(ITEM_CLAIMS.start) || withEra(ITEM_CLAIMS.inception) || withEra(ITEM_CLAIMS.pointInTime);
  const end = withEra(ITEM_CLAIMS.end) || withEra(ITEM_CLAIMS.dissolution);
  const dates = start && end ? (start === end ? start : `${start} — ${end}`) : start || null;

  const infobox = {};
  if (typeLabels.length) infobox.type = typeLabels.join(', ');
  if (dates) infobox.dates = dates;
  if (countryLabels.length) infobox.region = countryLabels.join(', ');
  if (participantLabels.length) infobox.participants = participantLabels.join(', ');
  if (partOfLabels.length) infobox.partOf = partOfLabels.join(', ');
  return Object.keys(infobox).length ? infobox : null;
}

/** Collects every Q-id referenced by the claims we care about. */
export function referencedEntityIds(entity) {
  if (!entity?.claims) return [];
  const ids = new Set();
  for (const property of Object.values(ITEM_CLAIMS)) {
    for (const id of mainItemIds(entity, property, 8)) ids.add(id);
  }
  return [...ids].slice(0, 40);
}

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
