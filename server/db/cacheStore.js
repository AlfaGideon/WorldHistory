// Dossiers are expensive to rebuild (multi-provider research), so they are
// kept for a year unless the user explicitly refreshes. Search results stay
// valid for a week; parsed source pages for a month.
const DEFAULT_TTL = {
  search: 7 * 24 * 60 * 60 * 1000,
  dossier: 365 * 24 * 60 * 60 * 1000,
  source: 30 * 24 * 60 * 60 * 1000,
};

const normalizeKey = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const parseRow = (row, now) => row ? { data: JSON.parse(row.payload_json), stale: row.expires_at <= now, createdAt: row.created_at } : null;

export class CacheStore {
  constructor(db, { ttl = {}, now = () => Date.now() } = {}) {
    this.db = db;
    this.ttl = { ...DEFAULT_TTL, ...ttl };
    this.now = now;
    this.statements = {
      getSearch: db.prepare('SELECT payload_json, created_at, expires_at FROM search_cache WHERE cache_key = ?'),
      setSearch: db.prepare(`INSERT INTO search_cache (cache_key, query, search_type, payload_json, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload_json=excluded.payload_json, created_at=excluded.created_at, expires_at=excluded.expires_at`),
      getDossier: db.prepare('SELECT payload_json, created_at, expires_at FROM dossiers WHERE cache_key = ?'),
      setDossier: db.prepare(`INSERT INTO dossiers (cache_key, query, payload_json, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload_json=excluded.payload_json, created_at=excluded.created_at, expires_at=excluded.expires_at`),
      getSource: db.prepare('SELECT payload_json, created_at, expires_at FROM parsed_sources WHERE url = ?'),
      setSource: db.prepare(`INSERT INTO parsed_sources (url, payload_json, created_at, expires_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(url) DO UPDATE SET payload_json=excluded.payload_json, created_at=excluded.created_at, expires_at=excluded.expires_at`),
      cleanupSearch: db.prepare('DELETE FROM search_cache WHERE expires_at < ?'),
      cleanupDossier: db.prepare('DELETE FROM dossiers WHERE expires_at < ?'),
      cleanupSources: db.prepare('DELETE FROM parsed_sources WHERE expires_at < ?'),
    };
  }

  searchKey(query, type = 'all') { return `${normalizeKey(type)}:${normalizeKey(query)}`; }
  dossierKey(query) { return normalizeKey(query); }

  getSearch(query, type = 'all') {
    return parseRow(this.statements.getSearch.get(this.searchKey(query, type)), this.now());
  }

  setSearch(query, type, data) {
    const now = this.now();
    this.statements.setSearch.run(this.searchKey(query, type), query, type, JSON.stringify(data), now, now + this.ttl.search);
  }

  getDossier(query) {
    return parseRow(this.statements.getDossier.get(this.dossierKey(query)), this.now());
  }

  setDossier(query, data) {
    const now = this.now();
    this.statements.setDossier.run(this.dossierKey(query), query, JSON.stringify(data), now, now + this.ttl.dossier);
  }

  getSource(url) {
    return parseRow(this.statements.getSource.get(url), this.now());
  }

  setSource(url, data) {
    const now = this.now();
    this.statements.setSource.run(url, JSON.stringify(data), now, now + this.ttl.source);
  }

  cleanupExpired() {
    const now = this.now();
    return this.statements.cleanupSearch.run(now).changes + this.statements.cleanupDossier.run(now).changes + this.statements.cleanupSources.run(now).changes;
  }
}
