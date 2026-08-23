import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { after, before, test } from 'node:test';
import { fetch as undiciFetch } from 'undici';
import { openDatabase } from '../db/database.js';
import { SettingsStore } from '../db/settingsStore.js';
import {
  DEFAULT_NETWORK_SETTINGS,
  NetworkSettingsError,
  buildDispatcher,
  createNetworkManager,
  describeNetworkSettings,
  detectTorProxy,
  normalizeNetworkSettings,
  testNetworkRoutes,
} from './network.js';

const servers = [];
const trackedSockets = new Set();
let db;
let settingsStore;
let targetServer;
let targetPort;
let socksServer;
let socksPort;
let lastRequestedDomain = null;

/**
 * Minimal SOCKS5 proxy (no auth): accepts CONNECT and tunnels to a fixed
 * local HTTP server, like Tor would tunnel to the real target.
 */
function startSocksMock(fixedTargetPort) {
  const server = net.createServer((socket) => {
    trackedSockets.add(socket);
    socket.on('close', () => trackedSockets.delete(socket));
    let phase = 'greet';
    socket.on('error', () => socket.destroy());
    socket.on('data', (chunk) => {
      if (phase === 'greet') {
        assert.equal(chunk[0], 0x05, 'SOCKS version');
        socket.write(Buffer.from([0x05, 0x00]));
        phase = 'req';
        return;
      }
      if (phase !== 'req') return;
      const atyp = chunk[3];
      let offset;
      if (atyp === 0x01) {
        offset = 8;
      } else if (atyp === 0x03) {
        const length = chunk[4];
        lastRequestedDomain = chunk.subarray(5, 5 + length).toString('utf8');
        offset = 5 + length;
      } else {
        offset = 20;
      }
      const port = chunk.readUInt16BE(offset);
      const upstream = net.connect({ host: '127.0.0.1', port: atyp === 0x03 ? fixedTargetPort : port });
      trackedSockets.add(upstream);
      upstream.on('close', () => trackedSockets.delete(upstream));
      upstream.on('error', () => {
        socket.end(Buffer.from([0x05, 0x01, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
      });
      upstream.on('connect', () => {
        phase = 'tunnel';
        socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
        socket.pipe(upstream);
        upstream.pipe(socket);
      });
      socket.on('error', () => upstream.destroy());
      socket.on('close', () => upstream.destroy());
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

before(async () => {
  db = openDatabase(':memory:');
  settingsStore = new SettingsStore(db);

  targetServer = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, host: req.headers.host, path: req.url }));
  });
  await new Promise((resolve) => targetServer.listen(0, '127.0.0.1', resolve));
  servers.push(targetServer);
  targetPort = targetServer.address().port;

  socksServer = await startSocksMock(targetPort);
  servers.push(socksServer);
  socksPort = socksServer.address().port;
});

after(async () => {
  for (const socket of trackedSockets) socket.destroy();
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  db.close();
});

test('normalizeNetworkSettings validates input with readable errors', () => {
  const settings = normalizeNetworkSettings({ mode: 'tor', torPort: '9150' });
  assert.equal(settings.mode, 'tor');
  assert.equal(settings.torPort, 9150);
  assert.equal(settings.timeoutMs, null);

  assert.throws(() => normalizeNetworkSettings({ mode: 'vpn' }), NetworkSettingsError);
  assert.throws(() => normalizeNetworkSettings({ torPort: 0 }), NetworkSettingsError);
  assert.throws(() => normalizeNetworkSettings({ customProtocol: 'socks4' }), NetworkSettingsError);
  assert.throws(() => normalizeNetworkSettings({ timeoutMs: 10 }), NetworkSettingsError);
});

test('describeNetworkSettings explains the active route', () => {
  assert.equal(describeNetworkSettings(normalizeNetworkSettings({})).proxyUri, null);
  const tor = describeNetworkSettings(normalizeNetworkSettings({ mode: 'tor' }));
  assert.equal(tor.proxyUri, 'socks5://127.0.0.1:9150');
  assert.equal(tor.remoteDns, true);
  assert.ok(tor.timeoutMs >= 30000, 'tor mode gets a longer timeout');
  const custom = describeNetworkSettings(normalizeNetworkSettings({ mode: 'custom', customProtocol: 'http', customHost: '10.0.0.2', customPort: 3128 }));
  assert.equal(custom.proxyUri, 'http://10.0.0.2:3128');
});

test('manager persists settings and rebuilds the dispatcher', () => {
  const manager = createNetworkManager({ settingsStore });
  assert.equal(manager.describe().mode, 'direct');
  manager.update({ mode: 'tor', torPort: 9150 });
  assert.equal(manager.describe().proxyUri, 'socks5://127.0.0.1:9150');

  const restored = createNetworkManager({ settingsStore });
  assert.equal(restored.describe().mode, 'tor');

  restored.update({ mode: 'direct' });
  assert.equal(restored.describe().proxyUri, null);
});

test('env PROXY_URL seeds defaults without stored settings', () => {
  const manager = createNetworkManager({ env: { PROXY_URL: 'socks5://192.168.1.9:1080' } });
  assert.equal(manager.describe().proxyUri, 'socks5://192.168.1.9:1080');
  const badEnv = createNetworkManager({ env: { PROXY_URL: ':::' } });
  assert.equal(badEnv.describe().mode, 'direct');
});

test('fetch works end-to-end through a SOCKS5 proxy (Tor route)', async () => {
  const dispatcher = buildDispatcher(normalizeNetworkSettings({ mode: 'custom', customProtocol: 'socks5', customHost: '127.0.0.1', customPort: socksPort }));
  assert.ok(dispatcher, 'dispatcher is built for socks5');
  const response = await undiciFetch(`http://127.0.0.1:${targetPort}/check`, { dispatcher });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  await dispatcher.close();
});

test('SOCKS route forwards the domain to the proxy instead of resolving DNS locally', async () => {
  const dispatcher = buildDispatcher(normalizeNetworkSettings({ mode: 'tor', torHost: '127.0.0.1', torPort: socksPort }));
  // Домен .test не существует: прямой fetch падает по DNS, а через SOCKS-мок проходит,
  // потому что имя уходит на прокси (как Tor резолвит домены сам).
  const response = await undiciFetch(`http://unresolvable-e2e-domain.test:${targetPort}/check`, { dispatcher });
  assert.equal(response.status, 200);
  assert.equal(lastRequestedDomain, 'unresolvable-e2e-domain.test');
  await dispatcher.close();
});

test('detectTorProxy reports closed ports as not detected', async () => {
  const result = await detectTorProxy({ ports: [socksPort], timeoutMs: 500 });
  assert.ok(result.detected, 'running SOCKS mock is detected as a Tor candidate');
  const negative = await detectTorProxy({ ports: [1], timeoutMs: 300 });
  assert.equal(negative.detected, null);
});

test('testNetworkRoutes reports working and failing routes with a recommendation', async () => {
  const testUrl = `http://unresolvable-e2e-domain.test:${targetPort}/check`;
  const report = await testNetworkRoutes({
    settings: { ...DEFAULT_NETWORK_SETTINGS },
    routes: [
      { id: 'direct', label: 'Прямое', settings: normalizeNetworkSettings({ mode: 'direct' }) },
      { id: 'tor-browser', label: 'Tor (мок)', settings: normalizeNetworkSettings({ mode: 'tor', torHost: '127.0.0.1', torPort: socksPort }) },
    ],
    testUrl,
    activeRouteId: 'direct',
  });
  assert.equal(report.results.length, 2);
  assert.equal(report.results[0].ok, false, 'direct route cannot resolve the test domain');
  assert.equal(report.results[1].ok, true, 'socks route reaches the target through the proxy');
  assert.equal(report.recommendation.routeId, 'tor-browser');
  assert.equal(report.recommendation.alreadyActive, false);
});
