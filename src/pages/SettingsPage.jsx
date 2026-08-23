import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Globe2,
  Loader2,
  PlugZap,
  RefreshCw,
  Save,
  Settings as SettingsIcon,
  ShieldCheck,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { getNetworkSettings, runNetworkTest, saveNetworkSettings } from '../api/client';
import PageTitle from '../components/PageTitle';

const MODES = [
  { id: 'direct', title: 'Напрямую', icon: Globe2, text: 'Обычное подключение без прокси. Подходит, если внешние сайты открываются в вашем браузере (например, в Firefox).' },
  { id: 'tor', title: 'Tor Browser', icon: ShieldCheck, text: 'Когда Tor Browser запущен, запросы идут через его SOCKS5-прокси на 127.0.0.1:9150. Tor должен быть включён всё время работы поиска.' },
  { id: 'custom', title: 'Свой прокси', icon: PlugZap, text: 'HTTP, HTTPS или SOCKS5-прокси: укажите адрес и порт вручную (например, прокси провайдера или локальная служба tor на 9050).' },
];

const TOR_PORTS = [
  { port: 9150, label: '9150 — Tor Browser' },
  { port: 9050, label: '9050 — служба tor' },
];

function timeoutSeconds(value) {
  if (value === null || value === undefined || value === '') return '';
  return String(Math.round(value / 1000));
}

export default function SettingsPage() {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
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
    getNetworkSettings()
      .then((data) => {
        if (!alive) return;
        setForm(data.settings);
        setActive(data.active);
        setTorDetection(data.torDetection);
        setHint(data.hint || '');
        setLoaded(true);
        setLoadError('');
      })
      .catch((err) => {
        if (alive) setLoadError(err.message || 'Не удалось загрузить настройки');
      });
    return () => { alive = false; };
  }, [reloadKey]);

  const patch = (changes) => setForm((current) => ({ ...current, ...changes }));

  const save = async (extraChanges = {}) => {
    setSaving(true); setError(''); setSavedNotice('');
    try {
      const payload = { ...form, ...extraChanges };
      const timeoutSecondsValue = payload.timeoutMs;
      const normalized = {
        ...payload,
        timeoutMs: timeoutSecondsValue === '' || timeoutSecondsValue === null ? null : Math.round(Number(timeoutSecondsValue) * 1000),
      };
      const data = await saveNetworkSettings(normalized);
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

  if (loadError) {
    return (
      <section className="page">
        <PageTitle icon={SettingsIcon} eyebrow="параметры приложения" title="Настройки подключения" text="Управление тем, как поиск обращается к внешним источникам." />
        <div className="api-notice">{loadError}. Убедитесь, что запущен backend (npm run dev), и обновите страницу.</div>
      </section>
    );
  }

  if (!loaded || !form) {
    return (
      <section className="page">
        <PageTitle icon={SettingsIcon} eyebrow="параметры приложения" title="Настройки подключения" text="Управление тем, как поиск обращается к внешним источникам." />
        <div className="empty-state glass">Загружаем настройки…</div>
      </section>
    );
  }

  const detectedTor = torDetection?.probes?.find((probe) => probe.open);

  return (
    <section className="page settings-page">
      <PageTitle icon={SettingsIcon} eyebrow="параметры приложения" title="Настройки подключения" text="Поиск работает в реальном времени через Wikipedia, Wikidata и OpenAlex. Здесь выбирается маршрут: напрямую, через Tor Browser или через ваш прокси." />

      <div className="settings-status glass">
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
          <button className="secondary" onClick={() => setReloadKey((key) => key + 1)}><RefreshCw size={16} /> Обновить статус</button>
        </div>
        {hint && <p className="settings-hint">{hint}</p>}
      </div>

      <div className="settings-grid">
        <div className="settings-block glass">
          <h3><Wifi size={20} /> Способ подключения</h3>
          <div className="mode-cards">
            {MODES.map((mode) => {
              const Icon = mode.icon;
              return (
                <button
                  key={mode.id}
                  className={`mode-card ${form.mode === mode.id ? 'active' : ''}`}
                  onClick={() => patch({ mode: mode.id })}
                >
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
                    <input
                      type="radio"
                      name="tor-port"
                      checked={Number(form.torPort) === option.port}
                      onChange={() => patch({ torPort: option.port })}
                    />
                    {option.label}
                  </label>
                ))}
                <label className={![9150, 9050].includes(Number(form.torPort)) ? 'active' : ''}>
                  <input
                    type="radio"
                    name="tor-port"
                    checked={![9150, 9050].includes(Number(form.torPort))}
                    onChange={() => patch({ torPort: 9155 })}
                  />
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
              <p className="settings-hint">
                Запустите Tor Browser и дождитесь соединения с сетью — приложение подключится к его прокси автоматически.
                Поиск через Tor работает медленнее: таймаут по умолчанию увеличен.
              </p>
            </div>
          )}

          {form.mode === 'custom' && (
            <div className="settings-subblock">
              <h4>Параметры прокси</h4>
              <div className="proxy-row">
                <label>
                  Протокол
                  <select
                    value={form.customProtocol}
                    onChange={(event) => patch({ customProtocol: event.target.value })}
                  >
                    <option value="socks5">socks5</option>
                    <option value="http">http</option>
                    <option value="https">https</option>
                  </select>
                </label>
                <label className="grow">
                  Адрес
                  <input
                    value={form.customHost}
                    onChange={(event) => patch({ customHost: event.target.value })}
                    placeholder="127.0.0.1"
                  />
                </label>
                <label>
                  Порт
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={form.customPort}
                    onChange={(event) => patch({ customPort: Number(event.target.value) || 0 })}
                  />
                </label>
              </div>
              <p className="settings-hint">
                Пример: локальная служба tor — socks5, 127.0.0.1, 9050. Прокси браузера (Firefox) здесь не используется:
                поиск выполняет backend, поэтому нужен адрес прокси, доступный с этого компьютера.
              </p>
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
            <button className="secondary" onClick={() => save({ mode: 'direct', torPort: 9150, customProtocol: 'socks5', customHost: '127.0.0.1', customPort: 9050, timeoutMs: null })} disabled={saving}>
              Сбросить
            </button>
          </div>
          {savedNotice && <div className="save-notice">{savedNotice}</div>}
          {error && <div className="api-notice">{error}</div>}
        </div>

        <div className="settings-block glass">
          <h3><PlugZap size={20} /> Диагностика соединения</h3>
          <p className="settings-hint">
            Проверка опрашивает Wikipedia всеми доступными маршрутами и подсказывает рабочий вариант.
            {torDetection && !detectedTor && ' Tor сейчас не запущен — проверка портов 9150/9050 завершится ошибкой.'}
          </p>
          <button className="primary" onClick={test} disabled={testing}>
            {testing ? <Loader2 size={18} className="spin" /> : <PlugZap size={18} />} {testing ? 'Проверяем маршруты…' : 'Проверить соединение'}
          </button>

          {testReport && !testReport.error && (
            <div className="nettest">
              {testReport.torExit && (
                <div className={`nettest-exit ${testReport.torExit.isTor ? 'tor' : ''}`}>
                  {testReport.torExit.isTor
                    ? <><ShieldCheck size={16} /> Трафик действительно идёт через Tor. Выходной узел: {testReport.torExit.exitIp}</>
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
                  {!result.ok && ['tor-browser', 'tor-service'].includes(result.id) && detectedTor?.port !== (result.id === 'tor-browser' ? 9150 : 9050) && (
                    <button className="link-button" onClick={() => patch({ mode: 'tor', torPort: detectedTor?.port })} disabled={!detectedTor}>Включить Tor</button>
                  )}
                  {result.ok && !result.active && (
                    <button className="link-button" onClick={() => {
                      const changes = result.id === 'direct'
                        ? { mode: 'direct' }
                        : result.id === 'tor-browser'
                          ? { mode: 'tor', torPort: 9150 }
                          : result.id === 'tor-service'
                            ? { mode: 'tor', torPort: 9050 }
                            : { mode: 'custom' };
                      patch(changes);
                      save(changes);
                    }}>Использовать</button>
                  )}
                </div>
              ))}
              <p className="settings-hint">
                {testReport.recommendation
                  ? testReport.recommendation.alreadyActive
                    ? `Активный маршрут (${testReport.recommendation.label}) работает — всё в порядке.`
                    : `Рекомендуемый маршрут: ${testReport.recommendation.label}. Нажмите «Использовать» рядом с ним.`
                  : 'Ни один маршрут не работает. Проверьте интернет или запустите Tor Browser и повторите проверку.'}
              </p>
            </div>
          )}
          {testReport?.error && <div className="api-notice">{testReport.error}</div>}
        </div>
      </div>
    </section>
  );
}
