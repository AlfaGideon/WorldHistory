import { useEffect, useState } from 'react';
import {
  CheckCircle2, Database, Globe2, Loader2, Moon, PlugZap, RefreshCw, Save,
  Settings as SettingsIcon, ShieldCheck, Sun, Trash2, Wifi, WifiOff, XCircle,
} from 'lucide-react';
import { getNetworkSettings, runNetworkTest, saveNetworkSettings } from '../api/client';
import PageTitle from '../components/PageTitle';
import { useTheme } from '../hooks/useTheme';
import { useSaved } from '../hooks/useSaved';
import { clearCache } from '../services/offlineCache';
import { backendAvailable, resetBackendProbe } from '../services/research';

const MODES = [
  { id: 'direct', title: 'Напрямую', icon: Globe2, text: 'Обычное подключение без прокси. Подходит, если внешние сайты открываются в вашем браузере.' },
  { id: 'tor', title: 'Tor Browser', icon: ShieldCheck, text: 'Когда Tor Browser запущен, запросы идут через его SOCKS5-прокси на 127.0.0.1:9150.' },
  { id: 'custom', title: 'Свой прокси', icon: PlugZap, text: 'HTTP, HTTPS или SOCKS5-прокси: укажите адрес и порт вручную.' },
];

const TOR_PORTS = [
  { port: 9150, label: '9150 — Tor Browser' },
  { port: 9050, label: '9050 — служба tor' },
];

const THEME_OPTIONS = [
  { id: 'auto', label: 'Как в системе', icon: SettingsIcon },
  { id: 'dark', label: 'Тёмная', icon: Moon },
  { id: 'light', label: 'Светлая', icon: Sun },
];

const timeoutSeconds = (value) => {
  if (value === null || value === undefined || value === '') return '';
  return String(Math.round(value / 1000));
};

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="settings-block glass">
      <h3><Sun size={20} /> Оформление</h3>
      <p className="settings-hint">Тема сохраняется на устройстве и применяется сразу, в том числе в мобильном приложении.</p>
      <div className="theme-cards">
        {THEME_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.id}
              className={`mode-card compact ${theme === option.id ? 'active' : ''}`}
              onClick={() => setTheme(option.id)}
            >
              <Icon size={18} />
              <b>{option.label}</b>
              {theme === option.id && <span className="mode-check"><CheckCircle2 size={16} /></span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DataSection() {
  const { items } = useSaved();
  const [cleared, setCleared] = useState(false);

  return (
    <div className="settings-block glass">
      <h3><Database size={20} /> Данные и офлайн-режим</h3>
      <p className="settings-hint">
        Открытые досье кэшируются на устройстве: они открываются без сети. Сохранённые исследования хранятся отдельно и не удаляются при очистке кэша.
      </p>
      <div className="data-rows">
        <div><span>Сохранённых досье</span><b>{items.length}</b></div>
      </div>
      <div className="settings-actions">
        <button
          className="secondary"
          onClick={() => { clearCache(); setCleared(true); setTimeout(() => setCleared(false), 2500); }}
        >
          <Trash2 size={18} /> Очистить кэш материалов
        </button>
        {cleared && <span className="save-notice inline">Кэш очищен</span>}
      </div>
    </div>
  );
}

function ConnectionSection() {
  const [loaded, setLoaded] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [form, setForm] = useState(null);
  const [active, setActive] = useState(null);
  const [torDetection, setTorDetection] = useState(null);
  const [hint, setHint] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState('');
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [testing, setTesting] = useState(false);
  const [testReport, setTestReport] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const ok = await backendAvailable();
      if (!alive) return;
      if (!ok) {
        setUnavailable(true);
        return;
      }
      try {
        const data = await getNetworkSettings();
        if (!alive) return;
        setForm(data.settings);
        setActive(data.active);
        setTorDetection(data.torDetection);
        setHint(data.hint || '');
        setLoaded(true);
        setUnavailable(false);
      } catch {
        if (alive) setUnavailable(true);
      }
    })();
    return () => { alive = false; };
  }, [reloadKey]);

  if (unavailable) {
    return (
      <div className="settings-block glass">
        <h3><Wifi size={20} /> Подключение</h3>
        <div className="mode-note">
          <WifiOff size={18} />
          <div>
            <b>Приложение работает без backend</b>
            <p>
              Поиск и досье запрашивают Wikipedia, Wikidata, OpenAlex, Crossref и Internet Archive прямо из браузера.
              Маршруты Tor и прокси настраиваются в приложении на компьютере (npm run dev) — там же доступен полный анализатор URL.
            </p>
          </div>
        </div>
        <div className="settings-actions">
          <button className="secondary" onClick={() => { resetBackendProbe(); setReloadKey((key) => key + 1); }}>
            <RefreshCw size={18} /> Проверить backend снова
          </button>
        </div>
      </div>
    );
  }

  if (!loaded || !form) {
    return (
      <div className="settings-block glass">
        <h3><Wifi size={20} /> Подключение</h3>
        <div className="empty-state glass">Загружаем настройки…</div>
      </div>
    );
  }

  const detectedTor = torDetection?.probes?.find((probe) => probe.open);
  const patch = (changes) => setForm((current) => ({ ...current, ...changes }));

  const save = async (extraChanges = {}) => {
    setSaving(true); setError(''); setSavedNotice('');
    try {
      const payload = { ...form, ...extraChanges };
      const timeoutValue = payload.timeoutMs;
      const data = await saveNetworkSettings({
        ...payload,
        timeoutMs: timeoutValue === '' || timeoutValue === null ? null : Math.round(Number(timeoutValue) * 1000),
      });
      setForm(data.settings);
      setActive(data.active);
      setTorDetection(data.torDetection);
      setSavedNotice(`Настройки сохранены. Активный маршрут: ${data.active.label}.`);
    } catch (err) {
      setError(err.message || 'Не удалось сохранить настройки');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true); setTestReport(null);
    try {
      setTestReport(await runNetworkTest());
    } catch (err) {
      setTestReport({ error: err.message || 'Проверка не удалась' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <div className="settings-block glass">
        <h3><Wifi size={20} /> Способ подключения</h3>
        <div className="settings-status soft">
          <div className="settings-status-main">
            <span className={`status-dot ${active?.proxyUri ? 'ok' : 'idle'}`} />
            <div>
              <b>Текущий маршрут</b>
              <p>{active ? active.label : '—'}{active ? ` • таймаут ${Math.round(active.timeoutMs / 1000)} с` : ''}</p>
            </div>
          </div>
          <div className="settings-status-side">
            {detectedTor
              ? <span className="tor-detected"><ShieldCheck size={16} /> {detectedTor.note} доступен: порт {detectedTor.port}</span>
              : <span className="tor-missing"><WifiOff size={16} /> Tor не запущен</span>}
            <button className="secondary small" onClick={() => setReloadKey((key) => key + 1)}><RefreshCw size={15} /> Обновить</button>
          </div>
          {hint && <p className="settings-hint">{hint}</p>}
        </div>

        <div className="mode-cards">
          {MODES.map((mode) => {
            const Icon = mode.icon;
            return (
              <button key={mode.id} className={`mode-card ${form.mode === mode.id ? 'active' : ''}`} onClick={() => patch({ mode: mode.id })}>
                <Icon size={20} />
                <b>{mode.title}</b>
                <p>{mode.text}</p>
                {form.mode === mode.id && <span className="mode-check"><CheckCircle2 size={16} /></span>}
              </button>
            );
          })}
        </div>

        {form.mode === 'tor' && (
          <div className="settings-subblock">
            <h4>SOCKS5-порт Tor</h4>
            <div className="tor-ports">
              {TOR_PORTS.map((option) => (
                <label key={option.port} className={Number(form.torPort) === option.port ? 'active' : ''}>
                  <input type="radio" name="tor-port" checked={Number(form.torPort) === option.port} onChange={() => patch({ torPort: option.port })} />
                  {option.label}
                </label>
              ))}
              <label className={![9150, 9050].includes(Number(form.torPort)) ? 'active' : ''}>
                <input type="radio" name="tor-port" checked={![9150, 9050].includes(Number(form.torPort))} onChange={() => patch({ torPort: 9155 })} />
                другой:
                <input
                  className="mini-input"
                  type="number"
                  min={1}
                  max={65535}
                  value={[9150, 9050].includes(Number(form.torPort)) ? '' : form.torPort}
                  placeholder="9150"
                  onChange={(event) => patch({ torPort: Number(event.target.value) || 9150 })}
                />
              </label>
            </div>
            {detectedTor && Number(form.torPort) !== detectedTor.port && (
              <p className="settings-hint accent">
                Обнаружен {detectedTor.note} на порту {detectedTor.port}.{' '}
                <button className="link-button" onClick={() => patch({ torPort: detectedTor.port })}>Использовать порт {detectedTor.port}</button>
              </p>
            )}
          </div>
        )}

        {form.mode === 'custom' && (
          <div className="settings-subblock">
            <h4>Параметры прокси</h4>
            <div className="proxy-row">
              <label>
                Протокол
                <select value={form.customProtocol} onChange={(event) => patch({ customProtocol: event.target.value })}>
                  <option value="socks5">socks5</option>
                  <option value="http">http</option>
                  <option value="https">https</option>
                </select>
              </label>
              <label className="grow">
                Адрес
                <input value={form.customHost} onChange={(event) => patch({ customHost: event.target.value })} placeholder="127.0.0.1" />
              </label>
              <label>
                Порт
                <input type="number" min={1} max={65535} value={form.customPort} onChange={(event) => patch({ customPort: Number(event.target.value) || 0 })} />
              </label>
            </div>
          </div>
        )}

        <div className="settings-subblock">
          <h4>Таймаут запроса</h4>
          <div className="proxy-row">
            <label className="grow">
              Таймаут (в секундах, пусто — автоматически)
              <input
                value={timeoutSeconds(form.timeoutMs)}
                placeholder={form.mode === 'tor' ? '45' : form.mode === 'custom' ? '25' : '12'}
                onChange={(event) => patch({ timeoutMs: event.target.value })}
                inputMode="numeric"
              />
            </label>
          </div>
        </div>

        <div className="settings-actions">
          <button className="primary" onClick={() => save()} disabled={saving}>
            {saving ? <Loader2 size={18} className="spin" /> : <Save size={18} />} Сохранить настройки
          </button>
          <button
            className="secondary"
            onClick={() => save({ mode: 'direct', torPort: 9150, customProtocol: 'socks5', customHost: '127.0.0.1', customPort: 9050, timeoutMs: null })}
            disabled={saving}
          >
            Сбросить
          </button>
        </div>
        {savedNotice && <div className="save-notice">{savedNotice}</div>}
        {error && <div className="api-notice">{error}</div>}
      </div>

      <div className="settings-block glass">
        <h3><PlugZap size={20} /> Диагностика соединения</h3>
        <p className="settings-hint">Проверка опрашивает Wikipedia всеми доступными маршрутами и подсказывает рабочий вариант.</p>
        <button className="primary" onClick={test} disabled={testing}>
          {testing ? <Loader2 size={18} className="spin" /> : <PlugZap size={18} />} {testing ? 'Проверяем маршруты…' : 'Проверить соединение'}
        </button>

        {testReport && !testReport.error && (
          <div className="nettest">
            {testReport.torExit && (
              <div className={`nettest-exit ${testReport.torExit.isTor ? 'tor' : ''}`}>
                {testReport.torExit.isTor
                  ? <><ShieldCheck size={16} /> Трафик идёт через Tor. Выходной узел: {testReport.torExit.exitIp}</>
                  : <><Wifi size={16} /> Выходной IP: {testReport.torExit.exitIp} (не через Tor)</>}
              </div>
            )}
            {testReport.results.map((result) => (
              <div key={result.id} className={`nettest-row ${result.ok ? 'ok' : 'bad'} ${result.active ? 'current' : ''}`}>
                {result.ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                <div>
                  <b>{result.label}{result.active ? ' — активный' : ''}</b>
                  <span>{result.ok ? `работает, ${result.ms} мс` : result.error}</span>
                </div>
                {result.ok && !result.active && (
                  <button
                    className="link-button"
                    onClick={() => {
                      const changes = result.id === 'direct'
                        ? { mode: 'direct' }
                        : result.id === 'tor-browser'
                          ? { mode: 'tor', torPort: 9150 }
                          : result.id === 'tor-service'
                            ? { mode: 'tor', torPort: 9050 }
                            : { mode: 'custom' };
                      patch(changes);
                      save(changes);
                    }}
                  >
                    Использовать
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {testReport?.error && <div className="api-notice">{testReport.error}</div>}
      </div>
    </>
  );
}

export default function SettingsPage() {
  return (
    <section className="page settings-page">
      <PageTitle
        icon={SettingsIcon}
        eyebrow="параметры приложения"
        title="Настройки"
        text="Оформление, подключение к внешним источникам и локальные данные."
      />
      <div className="settings-grid">
        <AppearanceSection />
        <DataSection />
        <ConnectionSection />
      </div>
    </section>
  );
}
