import dns from 'node:dns/promises';
import { isIP } from 'node:net';
import * as cheerio from 'cheerio';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const USER_AGENT = 'WorldHistoryResearchBot/0.2 educational prototype';

export class SourceUrlError extends Error {}

function isPrivateIpv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0) || a >= 224;
}

function isPrivateAddress(address) {
  if (isIP(address) === 4) return isPrivateIpv4(address);
  if (isIP(address) !== 6) return true;
  const normalized = address.toLowerCase();
  return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') ||
    normalized.startsWith('fd') || /^fe[89abcdef]/.test(normalized) || normalized.startsWith('ff') ||
    normalized.startsWith('2001:db8:') || normalized.startsWith('::ffff:');
}

export async function assertPublicUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new SourceUrlError('Некорректный URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new SourceUrlError('Поддерживаются только HTTP и HTTPS');
  if (url.username || url.password) throw new SourceUrlError('URL с логином или паролем не поддерживается');

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) throw new SourceUrlError('Локальные адреса запрещены');
  const addresses = isIP(hostname) ? [{ address: hostname }] : await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new SourceUrlError('Локальные и служебные сетевые адреса запрещены');
  }
  return url;
}

async function fetchWithSafeRedirects(input) {
  let current = await assertPublicUrl(input);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetch(current, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(10_000),
      redirect: 'manual',
    });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      if (redirect === MAX_REDIRECTS) throw new Error('Слишком много перенаправлений');
      current = await assertPublicUrl(new URL(response.headers.get('location'), current).href);
      continue;
    }
    return { response, finalUrl: current.href };
  }
  throw new Error('Не удалось загрузить источник');
}

async function readLimitedText(response) {
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > MAX_BYTES) throw new Error('Страница слишком большая для анализа');
  if (!response.body) return '';

  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > MAX_BYTES) throw new Error('Страница превышает лимит 2 МБ');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

const firstValue = ($, selectors) => {
  for (const selector of selectors) {
    const element = $(selector).first();
    const value = element.attr('content') || element.attr('datetime') || element.text();
    if (value?.trim()) return value.trim().slice(0, 500);
  }
  return null;
};

export function parseSourceHtml(html, sourceUrl, status = 200, contentType = 'text/html') {
  const $ = cheerio.load(html);
  const title = firstValue($, ['meta[property="og:title"]', 'meta[name="twitter:title"]', 'title', 'h1']) || sourceUrl;
  const author = firstValue($, ['meta[name="author"]', 'meta[property="article:author"]', '[rel="author"]', '.byline', '[class*="author"]']);
  const publishedAt = firstValue($, ['meta[property="article:published_time"]', 'meta[name="date"]', 'meta[name="pubdate"]', 'time[datetime]']);
  const description = firstValue($, ['meta[name="description"]', 'meta[property="og:description"]']);
  const language = $('html').attr('lang') || null;
  const canonical = $('link[rel="canonical"]').attr('href');

  $('script, style, noscript, iframe, nav, footer, header, aside, form, dialog, [role="navigation"], [aria-hidden="true"], .advertisement, .ads, .cookie, .sidebar, .menu').remove();
  const main = $('article, main, [role="main"], .article-body, .post-content, .entry-content').first();
  const root = main.length ? main : $('body');
  const text = root.text().replace(/\s+/g, ' ').trim();
  const headings = root.find('h1, h2, h3').map((_, element) => $(element).text().replace(/\s+/g, ' ').trim()).get().filter(Boolean).slice(0, 30);
  const links = root.find('a[href]').map((_, element) => {
    try {
      const href = new URL($(element).attr('href'), sourceUrl).href;
      return { text: $(element).text().replace(/\s+/g, ' ').trim().slice(0, 160), url: href };
    } catch {
      return null;
    }
  }).get().filter((link) => link && /^https?:\/\//.test(link.url)).slice(0, 50);
  const dates = [...new Set(text.match(/\b(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4})\b/g) || [])].slice(0, 30);

  return {
    url: sourceUrl,
    canonicalUrl: canonical ? new URL(canonical, sourceUrl).href : sourceUrl,
    title,
    author,
    publishedAt,
    description,
    language,
    contentType,
    status,
    characters: text.length,
    preview: text.slice(0, 1200),
    headings,
    links,
    dates,
    reliabilityHint: 'Черновая оценка. Проверьте автора, дату, организацию, методологию и независимые подтверждения.',
  };
}

export async function analyzeSource(url) {
  const { response, finalUrl } = await fetchWithSafeRedirects(url);
  if (!response.ok) throw new Error(`Источник вернул HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    throw new Error(`Неподдерживаемый тип содержимого: ${contentType || 'не указан'}`);
  }
  const html = await readLimitedText(response);
  return parseSourceHtml(html, finalUrl, response.status, contentType);
}
