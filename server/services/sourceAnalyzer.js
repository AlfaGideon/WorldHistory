export async function analyzeSource(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'WorldHistoryResearchBot/0.1 educational prototype' },
    signal: AbortSignal.timeout(10_000),
  });
  const html = await response.text();
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || url;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    url,
    title,
    status: response.status,
    characters: text.length,
    preview: text.slice(0, 1200),
    reliabilityHint: 'Черновая оценка. Нужны профиль домена, автор, дата, ссылки, методология и независимые подтверждения.',
  };
}
