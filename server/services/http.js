const DEFAULT_TIMEOUT_MS = 12_000;

export async function fetchJson(url, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'WorldHistoryAtlas/1.0 (educational research)' },
    signal: AbortSignal.timeout(timeout),
  });

  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}
