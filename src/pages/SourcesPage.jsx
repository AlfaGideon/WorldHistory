import { useMemo, useState } from 'react';
import { ExternalLink, Library, ShieldCheck } from 'lucide-react';
import PageTitle from '../components/PageTitle';
import ReliabilityChip from '../components/ReliabilityChip';
import { allCuratedSources, curatedSources, reliabilityLevels, sourceTypes } from '../data/sources';
import { analyzeSource } from '../api/client';

export default function SourcesPage() {
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');
  const [url, setUrl] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return curatedSources
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (type !== 'all' && item.type !== type) return false;
          if (needle && !`${item.name} ${item.note} ${item.stance}`.toLowerCase().includes(needle)) return false;
          return true;
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [type, query]);

  const inspect = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setAnalysis(null);
    try {
      setAnalysis(await analyzeSource(url));
    } catch (err) {
      setError(err.message.includes('Failed to fetch')
        ? 'Анализатор работает только при запущенном backend (npm run dev).'
        : err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="page">
      <PageTitle
        icon={Library}
        eyebrow="проверка знаний"
        title="Каталог источников"
        text={`${allCuratedSources.length} отобранных ресурсов: энциклопедии, архивы первоисточников, академические базы, музеи, данные и правозащитные отчёты. У каждого указаны тип, уровень доверия и возможная заинтересованность.`}
      />

      <div className="legend glass">
        <div>
          <b>Типы источников</b>
          <div className="chips">
            <button className={`chip-button ${type === 'all' ? 'active' : ''}`} onClick={() => setType('all')}>все</button>
            {sourceTypes.map((item) => (
              <button
                key={item.id}
                className={`chip-button ${type === item.id ? 'active' : ''}`}
                onClick={() => setType(item.id)}
                title={item.hint}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <b>Шкала достоверности</b>
          <div className="legend-scale">
            {reliabilityLevels.map((level) => (
              <span key={level.id}><ReliabilityChip value={level.label} title={level.hint} /></span>
            ))}
          </div>
        </div>
      </div>

      <div className="catalog-controls glass">
        <div className="search-input compact">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по каталогу" aria-label="Поиск источника" />
        </div>
      </div>

      <div className="sources-grid">
        {groups.map((group) => (
          <article className="source-group glass" key={group.title}>
            <h3><Library size={20} /> {group.title}</h3>
            {group.items.map((item) => (
              <a href={item.url} target="_blank" rel="noreferrer" key={item.name}>
                <div className="source-copy">
                  <b>{item.name}</b>
                  <p>{item.note}</p>
                  <small>{item.stance}</small>
                </div>
                <div className="source-meta">
                  <ReliabilityChip value={reliabilityLevels.find((level) => level.id === item.reliability)?.label} title={item.note} />
                  <ExternalLink size={18} />
                </div>
              </a>
            ))}
          </article>
        ))}
      </div>

      <form className="source-analyzer glass" onSubmit={inspect}>
        <div>
          <b>Проверить внешний источник</b>
          <p>Вставьте URL статьи или документа — загрузится страница и подготовится черновой анализ (нужен запущенный backend).</p>
        </div>
        <div className="analyzer-row">
          <input value={url} onChange={(event) => setUrl(event.target.value)} type="url" required placeholder="https://example.org/article" />
          <button className="primary" disabled={loading}>{loading ? 'Анализируем…' : 'Анализировать'}</button>
        </div>
        {error && <div className="api-notice">{error}</div>}
        {analysis && (
          <div className="analysis-result">
            <h3>{analysis.title}</h3>
            <div className="analysis-meta">
              <div><span>HTTP</span><b>{analysis.status}</b></div>
              <div><span>Автор</span><b>{analysis.author || 'не найден'}</b></div>
              <div><span>Дата</span><b>{analysis.publishedAt || 'не найдена'}</b></div>
              <div><span>Язык</span><b>{analysis.language || 'не определён'}</b></div>
              <div><span>Объём</span><b>{analysis.characters} знаков</b></div>
              <div><span>Ссылки</span><b>{analysis.links?.length || 0}</b></div>
            </div>
            {analysis.description && <p className="analysis-description">{analysis.description}</p>}
            <h4>Извлечённый текст</h4>
            <p>{analysis.preview || 'Основной текст не найден.'}</p>
            {analysis.headings?.length > 0 && (
              <div className="analysis-outline">
                <b>Структура материала</b>
                <div className="chips">{analysis.headings.slice(0, 8).map((heading) => <em key={heading}>{heading}</em>)}</div>
              </div>
            )}
            <div className="analysis-verdict"><ShieldCheck size={18} /><b>Оценка: {analysis.reliabilityHint}</b></div>
          </div>
        )}
      </form>
    </section>
  );
}
