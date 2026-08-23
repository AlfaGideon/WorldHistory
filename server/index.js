import { createApp } from './app.js';
import { CacheStore } from './db/cacheStore.js';
import { SettingsStore } from './db/settingsStore.js';
import { openDatabase } from './db/database.js';
import { createNetworkManager } from './services/network.js';

const PORT = Number(process.env.PORT) || 3001;
const API_HOST = process.env.API_HOST || '127.0.0.1';
const database = openDatabase();
const cache = new CacheStore(database);
const settingsStore = new SettingsStore(database);
const network = createNetworkManager({ settingsStore });
const app = createApp({ cache, settingsStore, network });
const server = app.listen(PORT, API_HOST, () => {
  const route = network.describe();
  console.log(`WorldHistory API listening on http://${API_HOST}:${PORT}`);
  console.log(`Network route: ${route.label}${route.proxyUri ? '' : ' (внешние запросы идут из этой машины)'}`);
});

const cleanupTimer = setInterval(() => cache.cleanupExpired(), 60 * 60 * 1000);
cleanupTimer.unref();

function shutdown() {
  clearInterval(cleanupTimer);
  network.close();
  server.close(() => {
    database.close();
    process.exit(0);
  });
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
