import { useEffect, useState } from 'react';
import { Filter, Search, Shield, Sparkles } from 'lucide-react';
import { searchHistory } from '../api/client';
import { glossary } from '../historyData';
import PageTitle from '../components/PageTitle';

export default function SearchPage({ go }) {
  const [query, setQuery] = useState('война');
  const [type, setType] = useState('Все');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setStatus('loading'); setError('');
      try {
        const data = await searchHistory(query, type === 'Все' ? 'all' : type);
        if (active) { setResults(data.results || []); setStatus('ready'); }
      } catch {
        if (active) { setResults([]); setError('Не удалось получить данные из внешних источников. Попробуйте ещё раз.'); setStatus('error'); }
      }
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [query, type]);

  const displayResults = results;
  return (
    <section className="page">
      <PageTitle icon={Search} eyebrow="исследователь" title="Глобальный поиск по истории" text="Введите страну, эпоху, событие, регион или понятие. Поиск обращается к backend API и умеет открыть универсальное досье даже для темы вне локальной базы." />
      <div className="search-console glass">
        <div className="search-input"><Search size={22} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Например: Франция, Китай, Османская империя, Косово, Чечня" /></div>
        <div className="filters"><Filter size={18} />{['Все', 'Эпоха', 'Страна', 'Конфликт'].map((item) => <button key={item} className={type === item ? 'active' : ''} onClick={() => setType(item)}>{item}</button>)}</div>
      </div>
      <div className="truth-note glass"><Shield size={22} /><div><b>Live-исследователь</b><p>Сначала показываем найденные сущности, затем backend строит план исследования с фактами, источниками, позициями сторон и оговорками о достоверности.</p></div></div>
      {error && <div className="api-notice">{error}</div>}
      <div className="quick-tags">{glossary.map((word) => <button key={word} onClick={() => setQuery(word)}>#{word}</button>)}{['Франция', 'Китай', 'Россия', 'Османская империя', 'Косово'].map((word) => <button key={word} onClick={() => setQuery(word)}>#{word}</button>)}</div>
      <div className="results-meta">{status === 'loading' ? 'Обновляем результаты…' : 'Найдено: '}<b>{displayResults.length}</b></div>
      <div className="result-grid">{displayResults.map((record) => <ResultCard key={`${record.kind}-${record.id}`} record={{ ...record, title: record.title || record.name, period: record.dates }} onOpenDossier={(item) => go(`/dossier/${encodeURIComponent(item.title || item.id)}`)} />)}</div>
      {!displayResults.length && status !== 'loading' && <div className="empty-state glass">Ничего не найдено. Откройте досье по этому запросу — система попробует сформировать универсальный план исследования.</div>}
      <button className="primary universal-button" onClick={() => go(`/dossier/${encodeURIComponent(query)}`)} disabled={!query.trim()}><Sparkles size={18} /> Построить досье по «{query || 'теме'}»</button>
    </section>
  );
}


function ResultCard({ record, onOpenDossier }) {
  const subtitle = record.period || record.timeline || record.years;
  const body = record.summary || record.core || record.impact;
  const hasDossier = record.sourcePack || record.perspectives || record.keyMoments;
  return (
    <article className="result-card glass">
      <span className="pill">{record.kind}</span>
      <h3>{record.flag ? `${record.flag} ` : ''}{record.title}</h3>
      <b>{subtitle}</b>
      <p>{body}</p>
      {'regions' in record && <div className="chips">{record.regions.map((r) => <em key={r}>{r}</em>)}</div>}
      {'topics' in record && <div className="chips">{record.topics.slice(0, 4).map((r) => <em key={r}>{r}</em>)}</div>}
      {'parties' in record && <div className="chips">{record.parties.map((r) => <em key={r}>{r}</em>)}</div>}
      {record.sourcePack?.sources?.length > 0 && (
        <div className="source-preview">
          <b>Источники внутри:</b>
          <span>{record.sourcePack.sources.slice(0, 3).map((source) => source.title.split('—')[0].trim()).join(' • ')}</span>
        </div>
      )}
      {hasDossier && <button className="dossier-button" onClick={() => onOpenDossier(record)}>Открыть разбор источников</button>}
      {record.sourceUrl && <a className="dossier-button source-link" href={record.sourceUrl} target="_blank" rel="noreferrer">Открыть источник: {record.sourceName || 'внешний источник'}</a>}
    </article>
  );
}

