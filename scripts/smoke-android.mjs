/**
 * Дымовой тест упакованного приложения: загружает dist/index.html так,
 * как его открывает WebView внутри APK (file:///android_asset/www/index.html),
 * и проверяет, что интерфейс действительно отрисовался.
 *
 * Запуск:  npm run android:smoke   (после npm run build:android)
 */
import path from 'node:path';
import { JSDOM } from 'jsdom';

// jsdom читает ресурсы с диска, поэтому URL должен указывать на реальный dist,
// а протокол file: эмулирует WebView внутри APK (роутер переходит на hash-режим).
const distIndex = path.resolve('dist', 'index.html');

const errors = [];

const dom = await JSDOM.fromFile('dist/index.html', {
  runScripts: 'dangerously',
  resources: 'usable',
  url: `file://${distIndex}`,
  pretendToBeVisual: true,
  beforeParse(window) {
    window.AndroidBridge = {
      isNativeApp: () => true,
      isOnline: () => true,
      share: () => {},
      openExternal: () => {},
      saveFile: () => true,
      printPage: () => {},
      reload: () => {},
    };
    window.matchMedia = () => ({
      matches: false, media: '', onchange: null,
      addEventListener() {}, removeEventListener() {},
      addListener() {}, removeListener() {}, dispatchEvent: () => false,
    });
    window.addEventListener('error', (event) => errors.push(String(event.message)));
  },
});

await new Promise((resolve) => setTimeout(resolve, 2500));

const doc = dom.window.document;
const heading = doc.querySelector('h1');
const logo = doc.querySelector('.brand-logo') || doc.querySelector('.topbar-logo');
const navButtons = doc.querySelectorAll('.bottom-nav button').length;

console.log('заголовок:      ', heading ? heading.textContent.trim().slice(0, 60) : 'НЕ НАЙДЕН');
console.log('логотип:        ', logo ? logo.getAttribute('src') : 'НЕ НАЙДЕН');
console.log('нижняя навигация:', navButtons, 'кнопок');
console.log('ошибки скриптов: ', errors.length, errors.slice(0, 3));

const ok = Boolean(heading) && navButtons >= 4 && errors.length === 0;
console.log(ok ? '\n✓ Приложение стартует внутри APK-обёртки' : '\n✗ Проблема при старте внутри APK-обёртки');
process.exit(ok ? 0 : 1);
