/**
 * Small key/value store for application settings persisted in SQLite.
 * Values are stored as JSON so callers can keep plain objects.
 */
export class SettingsStore {
  constructor(db, { now = () => Date.now() } = {}) {
    this.db = db;
    this.now = now;
    this.statements = {
      get: db.prepare('SELECT value_json FROM settings WHERE key = ?'),
      set: db.prepare(`INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at`),
    };
  }

  get(key, fallback = null) {
    const row = this.statements.get.get(key);
    if (!row) return fallback;
    try {
      return JSON.parse(row.value_json);
    } catch {
      return fallback;
    }
  }

  set(key, value) {
    this.statements.set.run(key, JSON.stringify(value), this.now());
  }
}
