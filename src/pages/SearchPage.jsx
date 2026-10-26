import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Filter, Loader2, Search, Shield, Sparkles, Star } from 'lucide-react';
import { runSearch } from '../services/research';
import PageTitle from '../components/PageTitle';
import { SourceBadge } from '../components/SourceBadge';
import ResultCard from '../components/ResultCard';

const FILTERS = ['Все', 'Эпоха', 'Страна', 'Конфликт'];
const EXAMPLES = ['Первая мировая война', 'Китай', 'Деколонизация', 'Холодная война', 'Косово', 'Средневековье'];

export default function SearchPage({ go, initialQuery = '' }) {
  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState('Все');
  const [data, setData] = useState({ results: [], providerStatus: [], mode: 'local', localCount: 0 });
  const [status, setStatus] = useState('loading');
  const requestId = useRef(0);

  const search = useCallback(async (value, kind) => {
    const id = requestId.current + 1;
    requestId.current = id;
    setStatus('loading');
    try {
      const result = await runSearch(value, kind === 'Все' ? 'all' : kind);
      if (id !== requestId.current) return;
      setData(result);
      setStatus('ready');
    } catch {
      if (id !== requestId.current) return;
      setData({ results: [], providerStatus: [], mode: 'local', localCount: 0, hint: 'Не удалось выполнить поиск.' });
      setStatus('ready');
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query, type), 300);
    return () => clearTimeout(timer);
  }, [query, type, search]);

  const localResults = useMemo(() => (data.results || []).filter((item) => item.local), [data.results]);
  const liveResults = useMemo(() => (data.results || []).filter((item) => !item.local), [data.results]);
  const providerStatus = data.providerStatus || [];

  return (
    <section className="page">
      <PageTitle
        icon={Search}
        eyebrow="исследователь"
        title="Глобальный поиск по истории"
        text="Сначала показываются проверенные локальные досье (работают офлайн), затем — материалы Wikipedia, Wikidata, OpenAlex, Crossref и Internet Archive."
      />

      <div className="search-console glass">
        <div className="search-input">
          <Search size={22} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Например: Франция, Китай, Османская империя, Косово, Чечня"
            aria-label="Поисковый запрос"
          />
          {status === 'loading' && <Loader2 size={18} className="spin" />}
        </div>
        <button
          className="primary universal-button"
          onClick={() => go(`/dossier/${encodeURIComponent(query)}`)}
          disabled={!query.trim()}
        >
          <Sparkles size={18} /> Построить досье по «{query.trim() || 'теме'}»
        </button>
        <div className="filters">
          <Filter size={18} />
          {FILTERS.map((item) => (
            <button key={item} className={type === item ? 'active' : ''} onClick={() => setType(item)}>{item}</button>
          ))}
        </div>
      </div>

      <div className="quick-tags">
        {EXAMPLES.map((word) => <button key={word} onClick={() => setQuery(word)}>#{word}</button>)}
      </div>

      {data.hint && status !== 'loading' && (
        <div className="api-notice with-action">
          <span><AlertTriangle size={16} /> {data.hint}</span>
          <button onClick={() => go('settings')}>Открыть настройки подключения</button>
        </div>
      )}

      {providerStatus.length > 0 && (
        <div className="provider-status">
          {providerStatus.map((provider) => (
            <span
              key={provider.id}
              className={`provider-chip ${provider.ok ? 'ok' : 'fail'}`}
              title={provider.ok ? `${provider.label}: найдено ${provider.count}` : `${provider.label}: ${provider.error || 'недоступен'}`}
            >
              <SourceBadge name={provider.label} size={16} />
              <b>{provider.label}</b>
              <em>{provider.ok ? provider.count : 'недоступен'}</em>
            </span>
          ))}
        </div>
      )}

      <div className="results-meta">
        {status === 'loading' ? 'Обновляем результаты…' : 'Найдено: '}
        <b>{(data.results || []).length}</b>
        {localResults.length > 0 && <span className="route-chip"><Star size={13} /> {localResults.length} проверенных досье</span>}
        {data.mode === 'local' && <span className="route-chip">офлайн-каталог</span>}
        {data.network?.shortLabel && <span className="route-chip">маршрут: {data.network.shortLabel}</span>}
      </div>

      {localResults.length > 0 && (
        <>
          <h2 className="results-group-title"><Shield size={18} /> Проверенные досье</h2>
          <div className="result-grid">
            {localResults.map((record) => (
              <ResultCard
                key={`local-${record.id}`}
                record={record}
                onOpenDossier={(item) => go(`/dossier/${encodeURIComponent(item.id || item.title)}`)}
              />
            ))}
          </div>
        </>
      )}

      {liveResults.length > 0 && (
        <>
          <h2 className="results-group-title"><Sparkles size={18} /> Материалы внешних источников</h2>
          <div className="result-grid">
            {liveResults.map((record) => (
              <ResultCard
                key={`${record.kind}-${record.id}`}
                record={record}
                onOpenDossier={(item) => go(`/dossier/${encodeURIComponent(item.title || item.id)}`)}
              />
            ))}
          </div>
        </>
      )}

      {status !== 'loading' && !localResults.length && !liveResults.length && (
        <div className="empty-state glass">
          <Shield size={22} />
          <p>
            Ничего не найдено в локальном каталоге и внешних источниках.
            Откройте досье по этому запросу — система сформирует структуру исследования.
          </p>
          {query.trim() && (
            <button className="primary" onClick={() => go(`/dossier/${encodeURIComponent(query.trim())}`)}>
              <Sparkles size={18} /> Построить план исследования
            </button>
          )}
        </div>
      )}
    </section>
  );
}
