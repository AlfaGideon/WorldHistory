import { fetch as undiciFetch } from 'undici';
import { createNetworkManager } from './network.js';

export const DEFAULT_USER_AGENT = 'WorldHistoryAtlas/1.0 (educational research)';

const shortHost = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return String(url);
  }
};

/** Converts low-level fetch errors into readable Russian messages for the UI. */
export function describeFetchError(error, url = '') {
  if (!error) return 'Неизвестная ошибка сети';
  if (error.name === 'TimeoutError' || error.name === 'AbortError') {
    return `Превышено время ожидания ответа от ${shortHost(url)}. Через Tor соединение устанавливается дольше — попробуйте увеличить таймаут в настройках.`;
  }
  const cause = error.cause;
  if (error.message === 'fetch failed' && cause) {
    const code = cause.code || cause.message || 'network error';
    const known = {
      ECONNREFUSED: 'прокси не запущен или отклонил соединение',
      ECONNRESET: 'соединение сброшено (сеть или провайдер блокирует адрес)',
      ENOTFOUND: 'адрес не найден (DNS)',
      ETIMEDOUT: 'таймаут соединения',
      UND_ERR_CONNECT_TIMEOUT: 'таймаут подключения к прокси',
      ERR_TLS_CERT_ALTNAME_INVALID: 'ошибка сертификата TLS',
    };
    return `Не удалось подключиться к ${shortHost(url)}: ${known[code] || code}`;
  }
  return error.message || String(error);
}

/**
 * HTTP client bound to a network manager: every request goes through the
 * configured route (direct / Tor / custom proxy) with the configured timeout.
 */
export function createHttpClient(network) {
  async function rawFetch(url, { timeout, headers = {}, ...rest } = {}) {
    const { dispatcher, timeoutMs } = network.fetchOptions();
    const effectiveTimeout = timeout ?? timeoutMs;
    const controller = new AbortController();
    const timer = effectiveTimeout ? setTimeout(() => controller.abort(), effectiveTimeout) : null;
    try {
      return await undiciFetch(url, {
        ...rest,
        headers: { 'user-agent': DEFAULT_USER_AGENT, ...headers },
        ...(dispatcher ? { dispatcher } : {}),
        signal: controller.signal,
      });
    } catch (error) {
      const aborted = error.name === 'AbortError' && timer;
      if (aborted) {
        throw new Error(`Превышено время ожидания ответа от ${shortHost(url)} (${Math.round(effectiveTimeout / 1000)} с). Через Tor соединение устанавливается дольше — попробуйте увеличить таймаут в настройках.`, { cause: error });
      }
      throw new Error(describeFetchError(error, url), { cause: error });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    network,
    rawFetch,
    async fetchJson(url, options = {}) {
      const response = await rawFetch(url, options);
      if (!response.ok) throw new Error(`Источник ${shortHost(url)} вернул HTTP ${response.status}`);
      try {
        return await response.json();
      } catch (error) {
        throw new Error(`Не удалось разобрать JSON от ${shortHost(url)}: ${error.message}`, { cause: error });
      }
    },
    async fetchText(url, options = {}) {
      const response = await rawFetch(url, options);
      if (!response.ok) throw new Error(`Источник ${shortHost(url)} вернул HTTP ${response.status}`);
      return response.text();
    },
  };
}

/** Default direct client for standalone usage (tests, scripts). */
const defaultNetwork = createNetworkManager({ env: {} });
const defaultClient = createHttpClient(defaultNetwork);
export const fetchJson = defaultClient.fetchJson;
export const fetchText = defaultClient.fetchText;
