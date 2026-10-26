#!/usr/bin/env node
/**
 * Builds a signed, zipaligned Android APK that bundles the web app.
 *
 *   npm run android:build
 *
 * No Android SDK and no Gradle are required: the script compiles the single
 * WebView activity with the Eclipse compiler, packages resources with aapt2,
 * converts the bytecode with d8 and signs the result with apksigner. The needed
 * tools are cached in `.cache/android-tools` (a few sparse GitHub checkouts).
 *
 * Output: WorldHistory-Atlas.apk in the repository root.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import zlib from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectFiles, readZip, writeZipAligned } from './zipkit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ANDROID_DIR = path.join(ROOT, 'android');
const DIST = path.join(ROOT, 'dist');
const CACHE = path.join(ROOT, '.cache', 'android-tools');
const WORK = path.join(ANDROID_DIR, '.work');
const OUTPUT_APK = path.join(ROOT, 'WorldHistory-Atlas.apk');

const APP_PACKAGE = 'com.worldhistory.atlas';
const MIN_API = 24;

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) {
    throw new Error(`Команда завершилась с ошибкой: ${command} ${args.join(' ')}`);
  }
};

/** Finds `java` (PATH, cached JRE or JDK), plus keytool next to it. */
function findJava() {
  const exe = (name) => (os.platform() === 'win32' ? `${name}.exe` : name);
  const wrap = (candidate) => {
    const bin = path.dirname(candidate);
    return { java: candidate, keytool: path.join(bin, exe('keytool')) };
  };

  const direct = spawnSync('java', ['-version'], { encoding: 'utf8' });
  if (!direct.error) return { java: 'java', keytool: 'keytool' };

  const candidates = [
    path.join(CACHE, 'jre', 'bin', exe('java')),
    process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, 'bin', exe('java')),
    '/usr/bin/java',
    '/usr/lib/jvm/default-java/bin/java',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return wrap(candidate);
  }

  // Последняя надежда: скачиваем портативную JRE скриптом (Linux/macOS).
  const fetcher = path.join(ROOT, 'scripts', 'fetch-android-tools.sh');
  if (os.platform() !== 'win32' && fs.existsSync(fetcher)) {
    console.log('• Java не найдена — скачиваем портативную JRE…');
    execFileSync('bash', [fetcher], { stdio: 'inherit' });
    if (fs.existsSync(candidates[0])) return wrap(candidates[0]);
  }
  throw new Error('Не найден Java. Установите JDK 17+ и повторите сборку (или запустите scripts/fetch-android-tools.sh).');
}

/** Downloads (once) the build tools we need: android.jar, aapt2, ecj, d8, apksigner. */
function ensureTools() {
  fs.mkdirSync(CACHE, { recursive: true });

  const jars = {
    'android.jar': { path: path.join(CACHE, 'android.jar') },
    'd8.jar': { path: path.join(CACHE, 'd8.jar') },
    'apksigner.jar': { path: path.join(CACHE, 'apksigner.jar') },
  };

  const missingJars = Object.entries(jars).filter(([, meta]) => !fs.existsSync(meta.path)).map(([name]) => name);
  const aapt2Name = os.platform() === 'win32' ? 'aapt2.exe' : 'aapt2';
  const aapt2Path = path.join(CACHE, aapt2Name);
  const needAapt2 = !fs.existsSync(aapt2Path);

  if (missingJars.length || needAapt2) {
    console.log('• Загружаем инструменты сборки Android (кэш: .cache/android-tools)…');
    const src = path.join(CACHE, 'src-h2apk');
    if (!fs.existsSync(path.join(src, 'tools', 'android.jar'))) {
      fs.mkdirSync(src, { recursive: true });
      execFileSync('git', ['clone', '--depth', '1', '--filter=blob:none', '--sparse',
        'https://github.com/HashShin/H2APK.git', src], { stdio: 'inherit' });
      execFileSync('git', ['-C', src, 'sparse-checkout', 'set', 'tools'], { stdio: 'inherit' });
    }
    for (const name of missingJars) {
      fs.copyFileSync(path.join(src, 'tools', name), jars[name].path);
    }
    if (needAapt2) {
      // aapt2 is shipped inside bundletool for every platform.
      const entry = os.platform() === 'win32' ? 'windows/aapt2.exe' : os.platform() === 'darwin' ? 'macos/aapt2' : 'linux/aapt2';
      extractFromZip(path.join(src, 'tools', 'bundletool.jar'), entry, aapt2Path);
      if (os.platform() !== 'win32') fs.chmodSync(aapt2Path, 0o755);
    }
  }

  // Eclipse compiler for Java (javac replacement that runs from a jar).
  const ecjPath = path.join(CACHE, 'ecj.jar');
  if (!fs.existsSync(ecjPath)) {
    console.log('• Загружаем Eclipse Compiler for Java…');
    const src = path.join(CACHE, 'src-tinyapk');
    if (!fs.existsSync(path.join(src, 'tools', 'windows', 'ecj-3.45.0.jar'))) {
      fs.mkdirSync(src, { recursive: true });
      execFileSync('git', ['clone', '--depth', '1', '--filter=blob:none', '--sparse',
        'https://github.com/Promastergame/tinyapk-lab.git', src], { stdio: 'inherit' });
      execFileSync('git', ['-C', src, 'sparse-checkout', 'set', '--no-cone', 'tools/windows/ecj-3.45.0.jar'], { stdio: 'inherit' });
    }
    fs.copyFileSync(path.join(src, 'tools', 'windows', 'ecj-3.45.0.jar'), ecjPath);
  }

  return {
    androidJar: jars['android.jar'].path,
    d8Jar: jars['d8.jar'].path,
    apksignerJar: jars['apksigner.jar'].path,
    aapt2: aapt2Path,
    ecj: ecjPath,
  };
}

/** Extracts a single entry from a zip using Node (no unzip dependency). */
function extractFromZip(zipPath, entryName, targetPath) {
  const entries = readZip(zipPath);
  const entry = entries.find((item) => item.name === entryName);
  if (!entry) throw new Error(`Не найден ${entryName} внутри ${path.basename(zipPath)}`);
  const data = entry.method === 8 ? inflate(entry.data) : entry.data;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, data);
}

const inflate = (buffer) => zlib.inflateRawSync(buffer);

/**
 * Signing key. By default a throw-away debug key is created in the cache;
 * for a real release point WH_KEYSTORE at your own keystore:
 *   WH_KEYSTORE=~/my.jks WH_KEY_ALIAS=worldhistory \
 *   WH_KEYSTORE_PASSWORD=*** WH_KEY_PASSWORD=*** npm run android:build
 */
function ensureKeystore(tools) {
  const envStore = process.env.WH_KEYSTORE;
  if (envStore && fs.existsSync(envStore)) {
    return {
      path: envStore,
      alias: process.env.WH_KEY_ALIAS || 'androiddebugkey',
      storePass: process.env.WH_KEYSTORE_PASSWORD || 'android',
      keyPass: process.env.WH_KEY_PASSWORD || process.env.WH_KEYSTORE_PASSWORD || 'android',
      storeType: process.env.WH_KEYSTORE_TYPE || 'PKCS12',
    };
  }
  const keystore = path.join(CACHE, 'debug.keystore');
  if (fs.existsSync(keystore)) {
    return { path: keystore, alias: 'androiddebugkey', storePass: 'android', keyPass: 'android', storeType: 'PKCS12' };
  }
  const { keytool } = findJava();
  console.log('• Создаём отладочный ключ подписи…');
  execFileSync(keytool, [
    '-genkeypair', '-v',
    '-keystore', keystore,
    '-storetype', 'PKCS12',
    '-alias', 'androiddebugkey',
    '-keyalg', 'RSA',
    '-keysize', '2048',
    '-validity', '10950',
    '-storepass', 'android',
    '-keypass', 'android',
    '-dname', 'CN=WorldHistory Debug, OU=Arena, O=WorldHistory, L=SPb, ST=SPb, C=RU',
  ], { stdio: 'pipe' });
  return { path: keystore, alias: 'androiddebugkey', storePass: 'android', keyPass: 'android', storeType: 'PKCS12' };
}

/**
 * Проверяет готовый APK «глазами Android»: файлы, которые WebView реально
 * откроет по `file:///android_asset/…`, должны лежать в папке `assets/`.
 * Если чего-то нет — сборка падает, а не отдаёт пользователю белый экран.
 */
function verifyApk(apkPath) {
  const zip = readZip(apkPath);
  // readZip отдаёт полезную нагрузку «как в архиве», поэтому сжатые записи
  // нужно развернуть, иначе проверка будет читать бинарный мусор.
  const content = (entry) => (entry.method === 8 ? zlib.inflateRawSync(entry.data) : entry.data);
  const byName = new Map(zip.map((entry) => [entry.name, entry]));

  const required = [
    'AndroidManifest.xml',
    'classes.dex',
    'resources.arsc',
    'assets/www/index.html',
  ];
  const missing = required.filter((name) => !byName.has(name));
  if (missing.length) {
    throw new Error(`В APK отсутствуют обязательные файлы: ${missing.join(', ')}`);
  }

  const html = content(byName.get('assets/www/index.html')).toString('utf8');
  const references = [...html.matchAll(/(?:src|href)="(\.\/)?([^"#:?]+\.[a-z0-9]+)"/gi)]
    .map((match) => match[2])
    .filter((ref) => !/^(https?:)?\/\//i.test(ref));

  const brokenRefs = [...new Set(references)].filter((ref) => !byName.has(`assets/www/${ref}`));
  if (brokenRefs.length) {
    throw new Error(`index.html ссылается на файлы, которых нет в APK: ${brokenRefs.join(', ')}`);
  }

  // Каждый файл веб-сборки должен попасть в APK именно по тому пути, по которому
  // его запросит WebView (`file:///android_asset/www/…`).
  const missingFromApk = [];
  const walk = (dir, relative = '') => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = relative ? `${relative}/${item.name}` : item.name;
      const full = path.join(dir, item.name);
      if (item.isDirectory()) walk(full, rel);
      else if (!byName.has(`assets/www/${rel}`)) missingFromApk.push(rel);
    }
  };
  walk(DIST);
  if (missingFromApk.length) {
    throw new Error(`Файлы сборки не попали в APK (assets/www): ${missingFromApk.join(', ')}`);
  }

  const webFiles = zip.filter((entry) => entry.name.startsWith('assets/www/'));
  const bundleSize = webFiles.reduce((sum, entry) => sum + entry.data.length, 0);
  const dexSize = byName.get('classes.dex').data.length;
  const icons = zip.filter((entry) => /^res\/mipmap-/.test(entry.name)).length;

  console.log('  проверка APK:');
  console.log(`    assets/www: ${webFiles.length} файлов, ${(bundleSize / 1024).toFixed(0)} КБ`);
  console.log(`    ссылки из index.html: ${new Set(references).size} (все найдены)`);
  console.log(`    classes.dex: ${(dexSize / 1024).toFixed(0)} КБ, иконок: ${icons}`);
  return true;
}

function main() {
  console.log('1/6 — собираем веб-приложение (режим Android: обычный script, относительные пути)…');
  run('npx', ['vite', 'build', '--mode', 'android'], { cwd: ROOT });
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('Сборка не создала dist/index.html');

  const tools = ensureTools();
  const { java } = findJava();
  const keystore = ensureKeystore(tools);

  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(path.join(WORK, 'compiled'), { recursive: true });
  fs.mkdirSync(path.join(WORK, 'gen'), { recursive: true });
  fs.mkdirSync(path.join(WORK, 'classes'), { recursive: true });
  fs.mkdirSync(path.join(WORK, 'dex'), { recursive: true });

  console.log('2/6 — компилируем ресурсы (aapt2)…');
  const resDir = path.join(ANDROID_DIR, 'res');
  run(tools.aapt2, ['compile', '--dir', resDir, '-o', path.join(WORK, 'compiled')]);
  const flats = fs.readdirSync(path.join(WORK, 'compiled')).filter((file) => file.endsWith('.flat'));
  if (!flats.length) throw new Error('aapt2 не создал скомпилированных ресурсов');

  console.log('3/6 — связываем ресурсы и манифест…');
  const linkedApk = path.join(WORK, 'linked.apk');
  const linkArgs = [
    'link',
    '-I', tools.androidJar,
    '--manifest', path.join(ANDROID_DIR, 'AndroidManifest.xml'),
    '-o', linkedApk,
    '--java', path.join(WORK, 'gen'),
    '--min-sdk-version', String(MIN_API),
    '--target-sdk-version', '33',
    '--auto-add-overlay',
    '-v',
  ];
  for (const flat of flats) linkArgs.push('-R', path.join(WORK, 'compiled', flat));
  run(tools.aapt2, linkArgs);

  console.log('4/6 — компилируем Java (ecj)…');
  const sources = [
    ...listFiles(path.join(ANDROID_DIR, 'java'), '.java'),
    ...listFiles(path.join(WORK, 'gen'), '.java'),
  ];
  if (!sources.length) throw new Error('Не найдены исходники Java');
  run(java, [
    '-jar', tools.ecj,
    '-source', '1.8', '-target', '1.8',
    '-nowarn',
    '-bootclasspath', tools.androidJar,
    '-classpath', tools.androidJar,
    '-d', path.join(WORK, 'classes'),
    ...sources,
  ]);

  console.log('5/6 — преобразуем байт-код в DEX (d8)…');
  const classFiles = listFiles(path.join(WORK, 'classes'), '.class');
  run(java, [
    '-cp', tools.d8Jar, 'com.android.tools.r8.D8',
    '--lib', tools.androidJar,
    '--min-api', String(MIN_API),
    '--output', path.join(WORK, 'dex'),
    ...classFiles,
  ]);
  const dexPath = path.join(WORK, 'dex', 'classes.dex');
  if (!fs.existsSync(dexPath)) throw new Error('d8 не создал classes.dex');

  console.log('6/6 — собираем, выравниваем и подписываем APK…');
  const entries = readZip(linkedApk);
  entries.push({
    name: 'classes.dex',
    data: fs.readFileSync(dexPath),
    compress: true,
  });
  // ВАЖНО: `file:///android_asset/` указывает на папку `assets/` внутри APK,
  // поэтому веб-сборка должна лежать по пути `assets/www/…`.
  collectFiles(entries, DIST, 'assets/www');

  const aligned = path.join(WORK, 'aligned.apk');
  writeZipAligned(aligned, entries, 4);

  run(java, [
    '-jar', tools.apksignerJar, 'sign',
    '--ks', keystore.path,
    '--ks-type', keystore.storeType,
    '--ks-key-alias', keystore.alias,
    '--ks-pass', `pass:${keystore.storePass}`,
    '--key-pass', `pass:${keystore.keyPass}`,
    '--out', OUTPUT_APK,
    '--v1-signing-enabled', 'true',
    '--v2-signing-enabled', 'true',
    '--v3-signing-enabled', 'true',
    aligned,
  ]);

  verifyApk(OUTPUT_APK);

  const size = (fs.statSync(OUTPUT_APK).size / 1024 / 1024).toFixed(2);
  console.log(`\n✓ APK готов: ${path.relative(ROOT, OUTPUT_APK)} (${size} МБ)`);
  console.log('  Установите на телефон: adb install -r WorldHistory-Atlas.apk');
  console.log(`  Или просто отправьте файл на устройство и откройте его (${APP_PACKAGE}).`);
}

function listFiles(dir, extension) {
  const out = [];
  const walk = (current) => {
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, item.name);
      if (item.isDirectory()) walk(full);
      else if (!extension || full.endsWith(extension)) out.push(full);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

main();
