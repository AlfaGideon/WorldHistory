import { createApp } from './app.js';
import { CacheStore } from './db/cacheStore.js';
import { openDatabase } from './db/database.js';

const PORT = Number(process.env.PORT) || 3001;
const API_HOST = process.env.API_HOST || '127.0.0.1';
const database = openDatabase();
const cache = new CacheStore(database);
const app = createApp({ cache });
const server = app.listen(PORT, API_HOST, () => {
  console.log(`WorldHistory API listening on http://${API_HOST}:${PORT}`);
});

const cleanupTimer = setInterval(() => cache.cleanupExpired(), 60 * 60 * 1000);
cleanupTimer.unref();

function shutdown() {
  clearInterval(cleanupTimer);
  server.close(() => {
    database.close();
    process.exit(0);
  });
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
