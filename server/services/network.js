import net from 'node:net';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

export const TOR_BROWSER_SOCKS_PORT = 9150;
export const TOR_SERVICE_SOCKS_PORT = 9050;

/** Default network settings. Stored overrides win over process env, env wins over defaults. */
export const DEFAULT_NETWORK_SETTINGS = Object.freeze({
  mode: 'direct', // 'direct' | 'tor' | 'custom'
  torHost: '127.0.0.1',
  torPort: TOR_BROWSER_SOCKS_PORT,
  customProtocol: 'socks5', // 'socks5' | 'http' | 'https'
  customHost: '127.0.0.1',
  customPort: TOR_SERVICE_SOCKS_PORT,
  timeoutMs: null, // null => auto by mode
});

const MODE_TIMEOUT_MS = { direct: 12_000, tor: 45_000, custom: 25_000 };
const MODE_LABELS = {
  direct: 'Прямое подключение',
  tor: 'Tor',
  custom: 'Свой прокси',
};
const PROTOCOLS = ['socks5', 'http', 'https'];

export class NetworkSettingsError extends Error {}

const toInt = (value, { min, max, name }) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new NetworkSettingsError(`${name} должен быть целым числом от ${min} до ${max}`);
  }
  return parsed;
};

const isHostLike = (value) => typeof value === 'string' && value.trim().length > 0 &&
  value.trim().length <= 253 && /^[\w.[\]-]+$/.test(value.trim());

/** Validates and normalizes a settings patch on top of the defaults. */
export function normalizeNetworkSettings(input = {}) {
  const patch = input && typeof input === 'object' ? input : {};
  const mode = patch.mode ?? DEFAULT_NETWORK_SETTINGS.mode;
  if (!['direct', 'tor', 'custom'].includes(mode)) {
    throw new NetworkSettingsError('Режим подключения должен быть direct (напрямую), tor или custom (свой прокси)');
  }

  const torHost = patch.torHost ?? DEFAULT_NETWORK_SETTINGS.torHost;
  const customHost = patch.customHost ?? DEFAULT_NETWORK_SETTINGS.customHost;
  if (typeof torHost !== 'string' || !isHostLike(torHost)) throw new NetworkSettingsError('Некорректный адрес SOCKS-прокси Tor');
  if (typeof customHost !== 'string' || !isHostLike(customHost)) throw new NetworkSettingsError('Некорректный адрес прокси-сервера');

  const customProtocol = patch.customProtocol ?? DEFAULT_NETWORK_SETTINGS.customProtocol;
  if (!PROTOCOLS.includes(customProtocol)) {
    throw new NetworkSettingsError(`Протокол прокси должен быть одним из: ${PROTOCOLS.join(', ')}`);
  }

  let timeoutMs = null;
  if (patch.timeoutMs !== undefined && patch.timeoutMs !== null && patch.timeoutMs !== '') {
    timeoutMs = toInt(patch.timeoutMs, { min: 2000, max: 120_000, name: 'Таймаут запроса' });
  }

  return {
    mode,
    torHost: torHost.trim(),
    torPort: toInt(patch.torPort ?? DEFAULT_NETWORK_SETTINGS.torPort, { min: 1, max: 65_535, name: 'Порт Tor' }),
    customProtocol,
    customHost: customHost.trim(),
    customPort: toInt(patch.customPort ?? DEFAULT_NETWORK_SETTINGS.customPort, { min: 1, max: 65_535, name: 'Порт прокси' }),
    timeoutMs,
  };
}

function applyEnv(settings, env = process.env) {
  const merged = { ...settings };
  if (env.REQUEST_TIMEOUT_MS) merged.timeoutMs = toInt(env.REQUEST_TIMEOUT_MS, { min: 2000, max: 120_000, name: 'REQUEST_TIMEOUT_MS' });
  if (env.TOR_SOCKS_HOST) merged.torHost = env.TOR_SOCKS_HOST;
  if (env.TOR_SOCKS_PORT) merged.torPort = toInt(env.TOR_SOCKS_PORT, { min: 1, max: 65_535, name: 'TOR_SOCKS_PORT' });
  if (env.PROXY_MODE && ['direct', 'tor', 'custom'].includes(env.PROXY_MODE)) merged.mode = env.PROXY_MODE;
  if (env.PROXY_URL) {
    try {
      const url = new URL(env.PROXY_URL);
      const protocol = url.protocol.replace(':', '');
      if (protocol === 'socks5' || protocol === 'http' || protocol === 'https') {
        merged.mode = 'custom';
        merged.customProtocol = protocol;
        merged.customHost = url.hostname.replace(/^\[|\]$/g, '');
        merged.customPort = Number(url.port) || (protocol === 'https' ? 443 : 1080);
      }
    } catch {
      // Ignore malformed PROXY_URL, keep other settings.
    }
  }
  return normalizeNetworkSettings(merged);
}

export function effectiveTimeoutMs(settings) {
  return settings.timeoutMs ?? MODE_TIMEOUT_MS[settings.mode] ?? MODE_TIMEOUT_MS.direct;
}

/** Public description of the active route used by /api/health and the settings UI. */
export function describeNetworkSettings(settings) {
  if (settings.mode === 'direct') {
    return {
      mode: 'direct',
      label: MODE_LABELS.direct,
      shortLabel: 'напрямую',
      proxyUri: null,
      timeoutMs: effectiveTimeoutMs(settings),
      remoteDns: false,
    };
  }
  const isTor = settings.mode === 'tor';
  const protocol = isTor ? 'socks5' : settings.customProtocol;
  const host = isTor ? settings.torHost : settings.customHost;
  const port = isTor ? settings.torPort : settings.customPort;
  const proxyUri = `${protocol}://${host}:${port}`;
  return {
    mode: settings.mode,
    label: isTor ? `Tor (${proxyUri})` : `Прокси ${proxyUri}`,
    shortLabel: isTor ? 'Tor' : 'прокси',
    proxyUri,
    timeoutMs: effectiveTimeoutMs(settings),
    remoteDns: true,
  };
}

/**
 * Builds an undici dispatcher for the given settings (null = direct fetch).
 * undici's ProxyAgent natively speaks socks5:// (Tor Browser) and http(s):// proxies;
 * hostnames are forwarded to the proxy, so DNS is resolved on the Tor side.
 * Note: proxyTls must stay empty — undici treats a SOCKS proxy as HTTPS when
 * proxyTls is set (see Socks5ProxyAgent constructor).
 */
export function buildDispatcher(settings) {
  const { proxyUri } = describeNetworkSettings(settings);
  if (!proxyUri) return null;
  return new ProxyAgent({ uri: proxyUri });
}

/** Quick TCP probe used to detect a locally running Tor Browser / tor daemon. */
export function probeTcpPort(host, port, { timeoutMs = 900 } = {}) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const socket = net.connect({ host, port });
    const done = (error) => {
      socket.destroy();
      if (error) reject(error);
      else resolve(Date.now() - started);
    };
    socket.setTimeout(timeoutMs, () => done(new Error('таймаут')));
    socket.once('connect', () => done());
    socket.once('error', (error) => done(error));
  });
}

/** Checks the standard SOCKS ports used by Tor Browser (9150) and the tor daemon (9050). */
export async function detectTorProxy({ host = '127.0.0.1', ports = [TOR_BROWSER_SOCKS_PORT, TOR_SERVICE_SOCKS_PORT], timeoutMs = 700 } = {}) {
  const probes = await Promise.all(ports.map(async (port) => {
    try {
      return { host, port, open: true, ms: await probeTcpPort(host, port, { timeoutMs }), note: port === TOR_BROWSER_SOCKS_PORT ? 'Tor Browser' : 'служба tor' };
    } catch {
      return { host, port, open: false, note: port === TOR_BROWSER_SOCKS_PORT ? 'Tor Browser' : 'служба tor' };
    }
  }));
  return { host, probes, detected: probes.find((probe) => probe.open) || null };
}

export const NETWORK_TEST_URL = 'https://ru.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json';
const TOR_CHECK_URL = 'https://check.torproject.org/api/ip';
const TEST_TIMEOUT_MS = 12_000;
const USER_AGENT = 'WorldHistoryAtlas/1.0 (educational research)';

/**
 * fetch с явным AbortController: таймер снимается сразу после завершения
 * запроса, поэтому поздний abort не падает на уже освобождённых внутренних
 * структурах undici (AbortSignal.timeout этому подвержен).
 */
export async function fetchWithTimeout(url, { dispatcher = null, timeoutMs = 12_000, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await undiciFetch(url, {
      ...(dispatcher ? { dispatcher } : {}),
      headers: { 'user-agent': USER_AGENT, ...headers },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export function defaultTestRoutes(settings = DEFAULT_NETWORK_SETTINGS) {
  const routes = [
    { id: 'direct', label: 'Прямое подключение', settings: { ...DEFAULT_NETWORK_SETTINGS, mode: 'direct' } },
    { id: 'tor-browser', label: `Tor Browser (${settings.torHost}:${TOR_BROWSER_SOCKS_PORT})`, settings: { ...settings, mode: 'tor', torPort: TOR_BROWSER_SOCKS_PORT } },
    { id: 'tor-service', label: `Служба tor (${settings.torHost}:${TOR_SERVICE_SOCKS_PORT})`, settings: { ...settings, mode: 'tor', torPort: TOR_SERVICE_SOCKS_PORT } },
  ];
  const customConfigured = settings.customProtocol !== DEFAULT_NETWORK_SETTINGS.customProtocol ||
    settings.customHost !== DEFAULT_NETWORK_SETTINGS.customHost ||
    settings.customPort !== DEFAULT_NETWORK_SETTINGS.customPort;
  if (customConfigured) {
    routes.push({ id: 'custom', label: `Свой прокси (${describeNetworkSettings({ ...settings, mode: 'custom' }).proxyUri})`, settings: { ...settings, mode: 'custom' } });
  }
  return routes;
}

/** Runs connectivity diagnostics for every candidate route in parallel. */
export async function testNetworkRoutes({ routes = null, settings = DEFAULT_NETWORK_SETTINGS, activeRouteId = null, testUrl = NETWORK_TEST_URL } = {}) {
  const candidates = routes || defaultTestRoutes(settings);
  const results = await Promise.all(candidates.map(async (route) => {
    const started = Date.now();
    let dispatcher = null;
    try {
      dispatcher = buildDispatcher(route.settings);
      const response = await fetchWithTimeout(testUrl, { dispatcher, timeoutMs: TEST_TIMEOUT_MS });
      try {
        await response.body?.cancel();
      } catch {
        // Body disposal is best effort.
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { id: route.id, label: route.label, proxyUri: describeNetworkSettings(route.settings).proxyUri, ok: true, ms: Date.now() - started, error: null, active: route.id === activeRouteId };
    } catch (error) {
      const code = error.cause?.code || '';
      const known = {
        ECONNREFUSED: 'прокси не запущен (порт закрыт)',
        ECONNRESET: 'соединение сброшено — адрес заблокирован сетью',
        ENOTFOUND: 'адрес не найден (DNS)',
        ETIMEDOUT: 'таймаут соединения',
        UND_ERR_CONNECT_TIMEOUT: 'таймаут подключения к прокси',
        UND_ERR_SOCKET: 'прокси закрыл соединение',
      };
      const reason = error.name === 'TimeoutError' || error.name === 'AbortError'
        ? 'таймаут соединения'
        : String(known[code] || error.cause?.message || error.message);
      return { id: route.id, label: route.label, proxyUri: describeNetworkSettings(route.settings).proxyUri, ok: false, ms: Date.now() - started, error: reason, active: route.id === activeRouteId };
    } finally {
      if (dispatcher) {
        try {
          await dispatcher.close();
        } catch {
          // Closing is best effort.
        }
      }
    }
  }));

  const preference = ['direct', 'tor-browser', 'tor-service', 'custom'];
  const activeRoute = results.find((result) => result.id === activeRouteId);
  const working = results.filter((result) => result.ok).sort((a, b) => preference.indexOf(a.id) - preference.indexOf(b.id));
  const recommendation = activeRoute?.ok
    ? { routeId: activeRoute.id, label: activeRoute.label, alreadyActive: true }
    : working.length
      ? { routeId: working[0].id, label: working[0].label, alreadyActive: false }
      : null;
  return { testUrl, results, recommendation, checkedAt: new Date().toISOString() };
}

/** Checks the public exit address and whether traffic really goes through Tor. */
export async function checkTorExit({ dispatcher } = {}) {
  const response = await fetchWithTimeout(TOR_CHECK_URL, { dispatcher, timeoutMs: 8000 });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return { exitIp: data.IP || null, isTor: Boolean(data.IsTor) };
}

/**
 * Mutable per-app network state: settings + cached dispatcher.
 * SettingsStore (SQLite) is optional so tests and static deployments work too.
 */
export function createNetworkManager({ settingsStore = null, env = process.env } = {}) {
  let settings = applyEnv(normalizeNetworkSettings({}), env);
  if (settingsStore) {
    const stored = settingsStore.get('network');
    if (stored) {
      try {
        settings = normalizeNetworkSettings({ ...settings, ...stored });
      } catch {
        // Corrupt stored settings fall back to env/defaults.
      }
    }
  }
  let dispatcher = null;
  let dispatcherKey = null;

  const syncDispatcher = () => {
    const key = describeNetworkSettings(settings).proxyUri || 'direct';
    if (key === dispatcherKey) return;
    if (dispatcher) {
      try {
        dispatcher.close();
      } catch {
        // Closing is best effort.
      }
    }
    dispatcher = buildDispatcher(settings);
    dispatcherKey = key;
  };

  return {
    get settings() { return { ...settings }; },
    describe() { return describeNetworkSettings(settings); },
    update(patch = {}) {
      const next = normalizeNetworkSettings({ ...settings, ...patch });
      if (settingsStore) settingsStore.set('network', next);
      settings = next;
      syncDispatcher();
      return describeNetworkSettings(next);
    },
    reset() {
      return this.update({ ...DEFAULT_NETWORK_SETTINGS });
    },
    fetchOptions() {
      syncDispatcher();
      return { dispatcher: dispatcher || undefined, timeoutMs: effectiveTimeoutMs(settings) };
    },
    dispatcherFor(settingsOverride) {
      return buildDispatcher(settingsOverride);
    },
    close() {
      if (dispatcher) {
        try {
          dispatcher.close();
        } catch {
          // Closing is best effort.
        }
      }
      dispatcher = null;
      dispatcherKey = null;
    },
  };
}
