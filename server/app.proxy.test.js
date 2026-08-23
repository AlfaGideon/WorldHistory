import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { after, before, test } from 'node:test';
import { createApp } from './app.js';
import { openDatabase } from './db/database.js';
import { SettingsStore } from './db/settingsStore.js';

/**
 * End-to-end: the app must honour network settings saved through the API.
 * A local SOCKS5 mock stands in for Tor Browser; a domain that does not
 * resolve locally can only be reached through it (remote DNS), exactly
 * like blocked resources that require Tor.
 */
const servers = [];
const sockets = new Set();
let db;
let app;
let server;
let base;
let mockPort;
let targetPort;
let proxiedDomain = null;

before(async () => {
  db = openDatabase(':memory:');

  const target = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<html lang="ru"><head><title>Исторический документ</title><meta name="author" content="Архив"></head><body><article>Материал первичного источника.</article></body></html>');
  });
  await new Promise((resolve) => target.listen(0, '127.0.0.1', resolve));
  servers.push(target);
  targetPort = target.address().port;

  const socks = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    let phase = 'greet';
    socket.on('error', () => socket.destroy());
    socket.on('data', (chunk) => {
      if (phase === 'greet') {
        socket.write(Buffer.from([0x05, 0x00]));
        phase = 'req';
        return;
      }
      if (phase !== 'req') return;
      const atyp = chunk[3];
      let offset;
      if (atyp === 0x01) offset = 8;
      else if (atyp === 0x03) {
        const length = chunk[4];
        proxiedDomain = chunk.subarray(5, 5 + length).toString('utf8');
        offset = 5 + length;
      } else offset = 20;
      const port = chunk.readUInt16BE(offset);
      const upstream = net.connect({ host: '127.0.0.1', port: atyp === 0x03 ? targetPort : port });
      sockets.add(upstream);
      upstream.on('close', () => sockets.delete(upstream));
      upstream.on('error', () => socket.end(Buffer.from([0x05, 0x01, 0x00, 0x01, 0, 0, 0, 0, 0, 0])));
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
  await new Promise((resolve) => socks.listen(0, '127.0.0.1', resolve));
  servers.push(socks);
  mockPort = socks.address().port;

  app = createApp({ settingsStore: new SettingsStore(db) });
  server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  for (const socket of sockets) socket.destroy();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await Promise.all(servers.map((item) => new Promise((resolve) => item.close(resolve))));
  db.close();
});

test('source analyzer only reaches the blocked domain after switching to the Tor route', async () => {
  const blockedUrl = `http://blocked-archive-e2e.test:${targetPort}/doc`;

  const direct = await (await fetch(`${base}/api/source/analyze?url=${encodeURIComponent(blockedUrl)}`)).json();
  assert.equal(direct.error, 'Не удалось загрузить источник');
  assert.ok(direct.details.includes('ENOTFOUND') || direct.details.includes('не найден'), `details: ${direct.details}`);

  const saved = await (
    await fetch(`${base}/api/network/settings`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'tor', torPort: mockPort }),
    })
  ).json();
  assert.equal(saved.active.mode, 'tor');

  const throughTor = await (await fetch(`${base}/api/source/analyze?url=${encodeURIComponent(blockedUrl)}`)).json();
  assert.equal(throughTor.title, 'Исторический документ');
  assert.equal(throughTor.author, 'Архив');
  assert.equal(proxiedDomain, 'blocked-archive-e2e.test', 'request went through the SOCKS proxy with remote DNS');

  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.network.proxyUri, `socks5://127.0.0.1:${mockPort}`);
});
