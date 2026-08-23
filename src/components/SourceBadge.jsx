/**
 * Small clickable brand logos for external sources. Rendered as inline SVG
 * (no external assets — they must load even when only one provider is
 * reachable) and wrapped in a link with the source URL.
 */

const WIKIPEDIA_MARK = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="11.2" fill="#101418" stroke="#9aa8c2" strokeWidth="1" />
    <text x="12" y="16.6" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" fontSize="12.5" fill="#ffffff">W</text>
  </svg>
);

const WIKIDATA_MARK = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="11.2" fill="#0c1116" stroke="#9aa8c2" strokeWidth="1" />
    <rect x="5.2" y="9" width="2.6" height="9" rx="1.2" fill="#e05252" />
    <rect x="10.7" y="5.6" width="2.6" height="12.4" rx="1.2" fill="#5b8ff0" />
    <rect x="16.2" y="8" width="2.6" height="10" rx="1.2" fill="#4fc98a" />
  </svg>
);

const OPENALEX_MARK = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="11.2" fill="#0c1116" stroke="#9aa8c2" strokeWidth="1" />
    <circle cx="10.6" cy="13.4" r="5.2" fill="none" stroke="#9db4ff" strokeWidth="2.1" />
    <circle cx="16.8" cy="7.6" r="2.3" fill="#9db4ff" />
  </svg>
);

const CROSSREF_MARK = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="11.2" fill="#0c1116" stroke="#9aa8c2" strokeWidth="1" />
    <path d="M7 15.4c1.6 1.5 4.4 1.2 5.6-.8l3.9-6.4" fill="none" stroke="#ffb066" strokeWidth="2.1" strokeLinecap="round" />
    <path d="M7 8.6c1.6-1.5 4.4-1.2 5.6.8l3.9 6.4" fill="none" stroke="#ff8484" strokeWidth="2.1" strokeLinecap="round" />
  </svg>
);

const ARCHIVE_MARK = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="11.2" fill="#0c1116" stroke="#9aa8c2" strokeWidth="1" />
    <path d="M5.8 8.4 12 5l6.2 3.4z" fill="#e8d9a8" />
    <rect x="6.6" y="9.4" width="2" height="6.4" fill="#e8d9a8" />
    <rect x="11" y="9.4" width="2" height="6.4" fill="#e8d9a8" />
    <rect x="15.4" y="9.4" width="2" height="6.4" fill="#e8d9a8" />
    <rect x="5.8" y="16.6" width="12.4" height="1.8" rx="0.8" fill="#e8d9a8" />
  </svg>
);

const EUROPEANA_MARK = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="11.2" fill="#0c1116" stroke="#9aa8c2" strokeWidth="1" />
    <text x="12" y="16.4" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="12" fill="#ff6a7f">e</text>
  </svg>
);

const FALLBACK_MARK = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="11.2" fill="#0c1116" stroke="#9aa8c2" strokeWidth="1" />
    <circle cx="12" cy="12" r="4.6" fill="none" stroke="#a9c6ff" strokeWidth="1.7" />
    <ellipse cx="12" cy="12" rx="8.4" ry="3.6" fill="none" stroke="#a9c6ff" strokeWidth="1.4" />
  </svg>
);

const MARKS = {
  wikipedia: WIKIPEDIA_MARK,
  'wikipedia-en': (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11.2" fill="#101418" stroke="#9aa8c2" strokeWidth="1" />
      <text x="12" y="16.2" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" fontSize="10.5" fill="#ffffff">W</text>
      <circle cx="18.2" cy="17.4" r="3.1" fill="#4f79d6" />
      <text x="18.2" y="18.7" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="3.9" fill="#fff">EN</text>
    </svg>
  ),
  wikidata: WIKIDATA_MARK,
  openalex: OPENALEX_MARK,
  crossref: CROSSREF_MARK,
  'internet-archive': ARCHIVE_MARK,
  archive: ARCHIVE_MARK,
  europeana: EUROPEANA_MARK,
};

const normalizeSourceKey = (name) => String(name || '')
  .toLowerCase()
  .replace(/\s+/g, '-')
  .replace(/^wikipedia-en$/, 'wikipedia-en');

export function SourceBadge({ name, size = 18 }) {
  const key = normalizeSourceKey(name);
  const mark = MARKS[key] || FALLBACK_MARK;
  return <span className="source-badge-icon" style={{ width: size, height: size }}>{mark}</span>;
}

/** Small clickable logo with the source URL embedded, plus a tooltip. */
export function SourceBadgeLink({ record, size = 22 }) {
  if (!record?.sourceUrl) return null;
  return (
    <a
      className="source-badge"
      href={record.sourceUrl}
      target="_blank"
      rel="noreferrer"
      title={`Открыть источник: ${record.sourceName || 'внешний источник'}`}
      aria-label={`Открыть источник: ${record.sourceName || 'внешний источник'}`}
    >
      <SourceBadge name={record.sourceName} size={size} />
    </a>
  );
}
