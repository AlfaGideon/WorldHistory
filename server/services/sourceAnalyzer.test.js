import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertPublicUrl, parseSourceHtml, SourceUrlError } from './sourceAnalyzer.js';

test('source parser extracts metadata and removes navigation noise', () => {
  const html = `<!doctype html><html lang="ru"><head>
    <title>Обычный заголовок</title>
    <meta property="og:title" content="История города">
    <meta name="author" content="Иван Историк">
    <meta property="article:published_time" content="2024-05-10">
    <meta name="description" content="Описание исторического материала">
    <link rel="canonical" href="/history/city">
  </head><body><nav>Меню и реклама</nav><article>
    <h1>История города</h1><h2>Основание</h2>
    <p>Город основан в 1703 году. Подробное описание события.</p>
    <a href="/archive/document">Архивный документ</a>
  </article><footer>Служебный футер</footer></body></html>`;

  const result = parseSourceHtml(html, 'https://example.org/article');
  assert.equal(result.title, 'История города');
  assert.equal(result.author, 'Иван Историк');
  assert.equal(result.publishedAt, '2024-05-10');
  assert.equal(result.language, 'ru');
  assert.equal(result.canonicalUrl, 'https://example.org/history/city');
  assert.ok(result.preview.includes('1703'));
  assert.ok(!result.preview.includes('Меню и реклама'));
  assert.deepEqual(result.dates, ['1703']);
  assert.equal(result.links[0].url, 'https://example.org/archive/document');
});

test('source analyzer rejects local and private network targets', async () => {
  await assert.rejects(() => assertPublicUrl('http://127.0.0.1/private'), SourceUrlError);
  await assert.rejects(() => assertPublicUrl('http://localhost/admin'), SourceUrlError);
  await assert.rejects(() => assertPublicUrl('http://192.168.1.10/'), SourceUrlError);
});
