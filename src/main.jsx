import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Archive,
  BookOpen,
  Compass,
  ExternalLink,
  Flag,
  Globe2,
  Landmark,
  Library,
  Map,
  Menu,
  Search,
  Shield,
  Sparkles,
  Swords,
  Timeline,
  X,
} from 'lucide-react';
import { conflicts, countries, eras, sourceGroups, studyPaths } from './historyData';
import './styles.css';
import { analyzeSource } from './api/client';
import DossierPage from './pages/DossierPage';
import SearchPage from './pages/SearchPage';
import PageTitle from './components/PageTitle';

const nav = [
  { id: 'home', label: 'Главная', icon: Compass, path: '/' },
  { id: 'explore', label: 'Поиск', icon: Search, path: '/search' },
  { id: 'eras', label: 'Эпохи', icon: Timeline, path: '/eras' },
  { id: 'countries', label: 'Страны', icon: Flag, path: '/countries' },
  { id: 'conflicts', label: 'Конфликты', icon: Swords, path: '/conflicts' },
  { id: 'sources', label: 'Источники', icon: Library, path: '/sources' },
];

const routeMap = Object.fromEntries(nav.map((item) => [item.id, item.path]));
const pageByPath = Object.fromEntries(nav.map((item) => [item.path, item.id]));

function parseRoute(pathname = '/') {
  const normalized = pathname === '' ? '/' : pathname;
  if (normalized.startsWith('/dossier/')) {
    return { page: 'dossier', dossierId: decodeURIComponent(normalized.replace('/dossier/', '')) };
  }
  return { page: pageByPath[normalized] || 'home', dossierId: null };
}

function App() {
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname));
  const [mobileOpen, setMobileOpen] = useState(false);
  const isDossier = route.page === 'dossier';

  useEffect(() => {
    const handlePopState = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const go = (target) => {
    const path = routeMap[target] || target;
    window.history.pushState({}, '', path);
    setRoute(parseRoute(path));
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className={`app-shell ${isDossier ? 'dossier-mode' : ''}`}>
      <div className="orb orb-a" />
      <div className="orb orb-b" />
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <button className="close-mobile" onClick={() => setMobileOpen(false)} aria-label="Закрыть меню">
          <X size={20} />
        </button>
        <div className="brand" onClick={() => go('home')}>
          <div className="brand-mark"><Globe2 size={26} /></div>
          <div className="brand-copy">
            <strong>WorldHistory</strong>
            <span>Atlas & Study</span>
          </div>
        </div>
        <nav>
          {nav.map(({ id, label, icon: Icon }) => (
            <button key={id} className={route.page === id ? 'active' : ''} onClick={() => go(id)} title={label}>
              <Icon size={18} /> <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-card">
          <Sparkles size={20} />
          <b>Идея</b>
          <p>Собирайте знания из энциклопедий, архивов, карт и музейных коллекций в одном исследовательском рабочем пространстве.</p>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <button className="menu" onClick={() => setMobileOpen(true)} aria-label="Открыть меню"><Menu /></button>
          <div className="topbar-title">История мира • страны • войны • источники</div>
          <button className="ghost" onClick={() => go('explore')}>Начать поиск</button>
        </header>
        {route.page === 'home' && <Home go={go} />}
        {route.page === 'explore' && <SearchPage go={go} />}
        {route.page === 'eras' && <Eras />}
        {route.page === 'countries' && <Countries />}
        {route.page === 'conflicts' && <Conflicts go={go} />}
        {route.page === 'sources' && <Sources />}
        {route.page === 'dossier' && <DossierPage key={route.dossierId} dossierId={route.dossierId} go={go} />}
      </main>
    </div>
  );
}


function Home({ go }) {
  return (
    <section className="page home">
      <div className="hero glass">
        <div className="hero-copy">
          <div className="eyebrow"><Archive size={16} /> цифровой атлас мировой истории</div>
          <h1>Ищите, сравнивайте и изучайте историю красиво.</h1>
          <p>
            Многостраничное приложение для мировых эпох, истории стран, военных конфликтов и проверенных источников:
            от первичных документов до интерактивных карт и музеев.
          </p>
          <div className="hero-actions">
            <button className="primary" onClick={() => go('explore')}><Search size={18} /> Открыть исследователь</button>
            <button className="secondary" onClick={() => go('conflicts')}><Shield size={18} /> Военные конфликты</button>
          </div>
        </div>
        <div className="hero-panel">
          <div className="mini-map">
            {['Европа', 'Азия', 'Африка', 'Америка', 'Океания'].map((r, index) => <span key={r} style={{ '--i': index }}>{r}</span>)}
          </div>
          <div className="stat-grid">
            <Stat value="5" label="эпох" />
            <Stat value="6" label="стран" />
            <Stat value="8" label="конфликтов" />
            <Stat value="13+" label="источников" />
          </div>
        </div>
      </div>

      <div className="section-head">
        <div>
          <span className="eyebrow">маршруты обучения</span>
          <h2>Из хаоса фактов — в понятные траектории</h2>
        </div>
        <button className="ghost" onClick={() => go('sources')}>Каталог источников</button>
      </div>
      <div className="paths-grid">
        {studyPaths.map((path) => <StudyPath key={path.title} path={path} />)}
      </div>

      <div className="feature-grid">
        <Feature icon={Search} title="Умный поиск" text="Поиск по эпохам, странам, регионам, причинам и последствиям конфликтов." />
        <Feature icon={Timeline} title="Периодизация" text="Быстро переходите от древних цивилизаций к современной глобализации." />
        <Feature icon={Library} title="Источники" text="Каталог энциклопедий, архивов, карт, музеев и академических инструментов." />
      </div>
    </section>
  );
}

function Eras() {
  return (
    <section className="page">
      <PageTitle icon={Timeline} eyebrow="периодизация" title="Эпохи мировой истории" text="Каркас для изучения: ключевые процессы, регионы и точки поворота каждой эпохи." />
      <div className="timeline-wrap">
        {eras.map((era, index) => (
          <article className={`era-card ${era.gradient}`} key={era.id}>
            <div className="era-index">{String(index + 1).padStart(2, '0')}</div>
            <div>
              <span>{era.period}</span>
              <h3>{era.title}</h3>
              <p>{era.summary}</p>
              <ul>{era.milestones.map((m) => <li key={m}>{m}</li>)}</ul>
              <div className="chips">{era.regions.map((r) => <em key={r}>{r}</em>)}</div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Countries() {
  const [region, setRegion] = useState('Все');
  const regions = ['Все', ...new Set(countries.map((c) => c.region))];
  const list = region === 'Все' ? countries : countries.filter((c) => c.region === region);
  return (
    <section className="page">
      <PageTitle icon={Flag} eyebrow="история стран" title="Национальные истории в мировом контексте" text="Сравнивайте пути государств: институты, кризисы, культура, войны, источники и длительные процессы." />
      <div className="filters country-filter">
        {regions.map((r) => <button key={r} className={region === r ? 'active' : ''} onClick={() => setRegion(r)}>{r}</button>)}
      </div>
      <div className="country-grid">
        {list.map((country) => (
          <article className="country-card glass" key={country.id}>
            <div className="country-flag">{country.flag}</div>
            <span>{country.region}</span>
            <h3>{country.name}</h3>
            <b>{country.timeline}</b>
            <p>{country.core}</p>
            <div className="chips">{country.topics.map((t) => <em key={t}>{t}</em>)}</div>
            <div className="source-line"><BookOpen size={16} /> {country.sources.join(' • ')}</div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Conflicts({ go }) {
  const [selected, setSelected] = useState(conflicts[4]);
  return (
    <section className="page">
      <PageTitle icon={Swords} eyebrow="военная история" title="Истории военных конфликтов" text="Изучайте причины, участников, ход событий, последствия и то, как война меняет общество, экономику и международные системы." />
      <div className="conflict-layout">
        <div className="conflict-list">
          {conflicts.map((conflict) => (
            <button key={conflict.id} className={selected.id === conflict.id ? 'active' : ''} onClick={() => setSelected(conflict)}>
              <span>{conflict.years}</span>
              <b>{conflict.name}</b>
              <small>{conflict.region}</small>
            </button>
          ))}
        </div>
        <article className="conflict-detail glass">
          <div className="detail-top">
            <div>
              <span className="pill">{selected.type}</span>
              <h2>{selected.name}</h2>
              <p>{selected.years} • {selected.region}</p>
            </div>
            <Swords size={54} />
          </div>
          <h4>Участники</h4>
          <div className="parties">{selected.parties.map((p) => <span key={p}>{p}</span>)}</div>
          <h4>Историческое значение</h4>
          <p>{selected.impact}</p>
          <h4>Что изучить</h4>
          <ol>{selected.learn.map((item) => <li key={item}>{item}</li>)}</ol>
          {(selected.sourcePack || selected.perspectives || selected.keyMoments) && (
            <button className="dossier-button" onClick={() => go(`/dossier/${encodeURIComponent(selected.id)}`)}>Открыть отдельную страницу досье</button>
          )}
        </article>
      </div>
    </section>
  );
}

function Sources() {
  const [url, setUrl] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inspect = async (event) => {
    event.preventDefault(); setLoading(true); setError(''); setAnalysis(null);
    try { setAnalysis(await analyzeSource(url)); } catch (err) { setError(err.message); } finally { setLoading(false); }
  };
  return (
    <section className="page">
      <PageTitle icon={Library} eyebrow="проверка знаний" title="Каталог источников" text="Надежная история строится на сопоставлении источников. Используйте энциклопедии для ориентации, архивы для доказательств, карты и музеи для контекста." />
      <form className="source-analyzer glass" onSubmit={inspect}>
        <div><b>Проверить внешний источник</b><p>Вставьте URL статьи или документа — backend загрузит страницу и подготовит черновой анализ.</p></div>
        <div className="analyzer-row"><input value={url} onChange={(event) => setUrl(event.target.value)} type="url" required placeholder="https://example.org/article" /><button className="primary" disabled={loading}>{loading ? 'Анализируем…' : 'Анализировать'}</button></div>
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
            {analysis.headings?.length > 0 && <div className="analysis-outline"><b>Структура материала</b><div className="chips">{analysis.headings.slice(0, 8).map((heading) => <em key={heading}>{heading}</em>)}</div></div>}
            <div className="analysis-verdict"><Shield size={18} /><b>Оценка: {analysis.reliabilityHint}</b></div>
          </div>
        )}
      </form>
      <div className="sources-grid">
        {sourceGroups.map((group) => (
          <article className="source-group glass" key={group.title}>
            <h3><Landmark size={20} /> {group.title}</h3>
            {group.items.map((item) => (
              <a href={item.url} target="_blank" rel="noreferrer" key={item.name}>
                <div>
                  <b>{item.name}</b>
                  <p>{item.note}</p>
                </div>
                <ExternalLink size={18} />
              </a>
            ))}
          </article>
        ))}
      </div>
      <div className="research-card glass">
        <Map size={28} />
        <div>
          <h3>Метод исследователя</h3>
          <p>Начните с обзорной статьи, выпишите ключевые даты и понятия, проверьте их в первичных документах, сравните карты, затем посмотрите современную историографию.</p>
        </div>
      </div>
    </section>
  );
}

function StudyPath({ path }) {
  return (
    <article className="path-card glass">
      <span className="pill">{path.level}</span>
      <h3>{path.title}</h3>
      <ol>{path.steps.map((step) => <li key={step}>{step}</li>)}</ol>
    </article>
  );
}

function Feature({ icon: Icon, title, text }) {
  return (
    <article className="feature-card">
      <Icon size={24} />
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function Stat({ value, label }) {
  return <div className="stat"><b>{value}</b><span>{label}</span></div>;
}

createRoot(document.getElementById('root')).render(<App />);
