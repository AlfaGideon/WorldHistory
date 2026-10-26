#!/usr/bin/env node
/**
 * Smoke test for the packaged Android app.
 *
 *   npm run android:smoke
 *
 * Распаковывает `assets/www` из готового APK во временный каталог и открывает
 * `index.html` в jsdom ровно так, как это делает WebView на устройстве:
 *   • базовый URL — file:///android_asset/www/index.html
 *   • объявлен window.AndroidBridge (нативный мост)
 * Если страница не загружается или приложение падает — тест завершается с
 * ошибкой, и сломанный APK не уезжает к пользователю.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import jsdomPackage from 'jsdom';
import { readZip } from './zipkit.mjs';

const { JSDOM, VirtualConsole } = jsdomPackage;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APK = path.join(ROOT, 'WorldHistory-Atlas.apk');
const START_URL = 'file:///android_asset/www/index.html';

const IGNORED_ERROR = /googleapis|gstatic|ERR_|NetworkError|Failed to fetch|fetch failed|Not implemented/i;

if (!fs.existsSync(APK)) {
  console.error('✗ APK не найден. Сначала выполните: npm run android:build');
  process.exit(1);
}

const zip = readZip(APK);
const webEntries = zip.filter((entry) => entry.name.startsWith('assets/www/'));
if (!webEntries.length) {
  console.error('✗ В APK нет папки assets/www — WebView не сможет открыть приложение.');
  process.exit(1);
}

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wh-android-smoke-'));
for (const entry of webEntries) {
  const relative = entry.name.slice('assets/www/'.length);
  const target = path.join(workDir, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const payload = entry.method === 8 ? zlib.inflateRawSync(entry.data) : entry.data;
  fs.writeFileSync(target, payload);
}

// Главная причина «белого экрана»: файл лежит в APK не там, где его ищет WebView.
// Проверяем, что каждая локальная ссылка из index.html резолвится в assets/www.
const html = fs.readFileSync(path.join(workDir, 'index.html'), 'utf8');
const references = [...html.matchAll(/(?:src|href)="(\.\/)?([^"#:?]+\.[a-z0-9]+)"/gi)]
  .map((match) => match[2])
  .filter((ref) => !/^(https?:)?\/\//i.test(ref));
const apkNames = new Set(webEntries.map((entry) => entry.name));
const unresolved = [...new Set(references)].filter((ref) => !apkNames.has(`assets/www/${ref}`));
if (unresolved.length) {
  console.error(`✗ В APK нет файлов, на которые ссылается index.html: ${unresolved.join(', ')}`);
  process.exit(1);
}
console.log(`• APK: ${webEntries.length} файлов в assets/www, ссылок из index.html: ${new Set(references).size} (все найдены)`);
console.log(`• WebView открывает: ${START_URL}`);

const problems = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => {
  if (!IGNORED_ERROR.test(error.message)) problems.push(`jsdomError: ${error.message}`);
});
virtualConsole.on('error', (message) => {
  if (!IGNORED_ERROR.test(String(message))) problems.push(`console.error: ${message}`);
});

// jsdom резолвит `file://` относительно корня файловой системы, поэтому путь
// android_asset подменяем распакованной копией. Само соответствие
// `assets/www/… ↔ file:///android_asset/www/…` проверяется ниже по содержимому APK.
const dom = await JSDOM.fromFile(path.join(workDir, 'index.html'), {
  url: `file://${path.join(workDir, 'index.html')}`,
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  virtualConsole,
});

// Нативный мост, как в MainActivity.
Object.defineProperty(dom.window, 'AndroidBridge', {
  value: {
    isNativeApp: () => true,
    isOnline: () => true,
    share: () => {},
    openExternal: () => {},
    saveFile: () => {},
    printPage: () => {},
    reload: () => {},
  },
  configurable: true,
});

await new Promise((resolve) => {
  if (dom.window.document.readyState === 'complete') resolve();
  else dom.window.addEventListener('load', resolve, { once: true });
  setTimeout(resolve, 8000);
});
await new Promise((resolve) => setTimeout(resolve, 1500));

const { document } = dom.window;
const checks = [];
const check = (label, condition, detail = '') => {
  checks.push({ label, ok: Boolean(condition), detail });
};

const root = document.getElementById('root');
check('приложение смонтировалось в #root', root && root.children.length > 0,
  root ? `дочерних элементов: ${root.children.length}` : '#root не найден');

const title = document.title;
check('заголовок страницы', title.includes('WorldHistory'), title);

const navButtons = document.querySelectorAll('nav button');
check('нижняя навигация отрисована', navButtons.length >= 4, `кнопок: ${navButtons.length}`);

const text = document.body.textContent || '';
check('есть контент на русском', /[А-Яа-яЁё]{4,}/.test(text), `${text.trim().slice(0, 60)}…`);

const theme = document.documentElement.dataset.theme;
check('тема применена', theme === 'dark' || theme === 'light', String(theme));

const inlineStyles = document.querySelectorAll('style, link[rel="stylesheet"]').length;
check('стили подключены', inlineStyles > 0, `элементов: ${inlineStyles}`);

// В packaged-режиме роутер обязан работать через hash: pushState на file://
// запрещён. Переходим навигацией и проверяем, что URL и страница сменились.
const navButton = [...document.querySelectorAll('nav button, .bottom-nav button')]
  .find((button) => (button.textContent || '').includes('Поиск'));
if (navButton) {
  navButton.click();
  await new Promise((resolve) => setTimeout(resolve, 600));
}
const hash = dom.window.location.hash;
check('навигация использует hash-роуты', hash.startsWith('#/'), `${hash || '(пусто)'} / protocol=${dom.window.location.protocol}`);
check('переход на страницу поиска отработал',
  hash.startsWith('#/search') && /Поиск|исследован/i.test(document.body.textContent || ''),
  hash);

console.log('Проверка APK в окружении WebView:');
for (const item of checks) {
  console.log(`  ${item.ok ? '✓' : '✗'} ${item.label}${item.detail ? ` — ${item.detail}` : ''}`);
}
if (problems.length) {
  console.log('  ! Ошибки страницы:');
  for (const problem of problems.slice(0, 10)) console.log(`    - ${problem}`);
}

const failed = checks.filter((item) => !item.ok);
dom.window.close();
fs.rmSync(workDir, { recursive: true, force: true });

if (failed.length || problems.length) {
  console.error(`\n✗ Smoke test не пройден: ${failed.length} проверок, ${problems.length} ошибок.`);
  process.exit(1);
}
console.log('\n✓ APK открывается и работает: приложение стартует из assets/www.');
process.exit(0);
