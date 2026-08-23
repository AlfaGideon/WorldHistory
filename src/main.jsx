import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Archive,
  BookOpen,
  Compass,
  ExternalLink,
  Filter,
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
import { conflicts, countries, eras, glossary, sourceGroups, studyPaths } from './historyData';
import './styles.css';
import { getDossier, searchHistory } from './api/client';

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

const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^а-яa-z0-9\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const searchSynonyms = {
  чечня: ['чечня', 'чеченская', 'чеченские', 'ичкерия', 'грозный', 'северный кавказ'],
  чеченская: ['чечня', 'чеченская', 'ичкерия', 'грозный'],
  вов: ['великая отечественная', 'вторая мировая', 'world war ii'],
  ссср: ['советский союз', 'ссср', 'ussr'],
  россия: ['россия', 'русь', 'московское княжество', 'ссср'],
};

const expandQuery = (query) => {
  const normalized = normalizeText(query);
  const tokens = normalized.split(' ').filter(Boolean);
  const expanded = new Set([normalized, ...tokens]);
  tokens.forEach((token) => (searchSynonyms[token] || []).forEach((word) => expanded.add(normalizeText(word))));
  if (searchSynonyms[normalized]) {
    searchSynonyms[normalized].forEach((word) => expanded.add(normalizeText(word)));
  }
  return [...expanded].filter(Boolean);
};

const allRecords = [
  ...eras.map((item) => ({
    ...item,
    kind: 'Эпоха',
    text: `${item.title} ${item.period} ${item.summary} ${item.regions.join(' ')} ${item.milestones.join(' ')} ${item.aliases?.join(' ') || ''}`,
  })),
  ...countries.map((item) => ({
    ...item,
    title: item.name,
    kind: 'Страна',
    text: `${item.name} ${item.region} ${item.timeline} ${item.core} ${item.topics.join(' ')} ${item.sources.join(' ')} ${item.aliases?.join(' ') || ''}`,
  })),
  ...conflicts.map((item) => ({
    ...item,
    title: item.name,
    kind: 'Конфликт',
    text: `${item.name} ${item.years} ${item.region} ${item.parties.join(' ')} ${item.impact} ${item.learn.join(' ')} ${item.aliases?.join(' ') || ''} ${item.keyMoments?.map((m) => `${m.date} ${m.title} ${m.text}`).join(' ') || ''} ${item.perspectives?.map((p) => `${p.side} ${p.thesis}`).join(' ') || ''} ${item.sourcePack?.sources?.map((src) => `${src.title} ${src.type} ${src.note}`).join(' ') || ''}`,
  })),
].map((record) => ({ ...record, searchText: normalizeText(`${record.title} ${record.text}`) }));

function useSearch(query, type) {
  return useMemo(() => {
    const terms = expandQuery(query);
    return allRecords.filter((record) => {
      const matchesType = type === 'Все' || record.kind === type;
      const matchesQuery = terms.length === 0 || terms.some((term) => record.searchText.includes(term));
      return matchesType && matchesQuery;
    });
  }, [query, type]);
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
        {route.page === 'explore' && <Explore go={go} />}
        {route.page === 'eras' && <Eras />}
        {route.page === 'countries' && <Countries />}
        {route.page === 'conflicts' && <Conflicts go={go} />}
        {route.page === 'sources' && <Sources />}
        {route.page === 'dossier' && <DossierPage dossierId={route.dossierId} go={go} />}
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

function Explore({ go }) {
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
      } catch (err) {
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
      <div className="truth-note glass"><Shield size={22} /><div><b>Универсальный исследователь</b><p>Сначала показываем найденные сущности, затем backend строит план исследования с фактами, источниками, позициями сторон и оговорками о достоверности.</p></div></div>
      {error && <div className="api-notice">{error}</div>}
      <div className="quick-tags">{glossary.map((word) => <button key={word} onClick={() => setQuery(word)}>#{word}</button>)}{['Франция', 'Китай', 'Россия', 'Османская империя', 'Косово'].map((word) => <button key={word} onClick={() => setQuery(word)}>#{word}</button>)}</div>
      <div className="results-meta">{status === 'loading' ? 'Обновляем результаты…' : 'Найдено: '}<b>{displayResults.length}</b></div>
      <div className="result-grid">{displayResults.map((record) => <ResultCard key={`${record.kind}-${record.id}`} record={{ ...record, title: record.title || record.name, period: record.dates }} onOpenDossier={(item) => go(`/dossier/${encodeURIComponent(item.id || item.title)}`)} />)}</div>
      {!displayResults.length && status !== 'loading' && <div className="empty-state glass">Ничего не найдено. Откройте досье по этому запросу — система попробует сформировать универсальный план исследования.</div>}
      <button className="primary universal-button" onClick={() => go(`/dossier/${encodeURIComponent(query)}`)} disabled={!query.trim()}><Sparkles size={18} /> Построить досье по «{query || 'теме'}»</button>
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
  return (
    <section className="page">
      <PageTitle icon={Library} eyebrow="проверка знаний" title="Каталог источников" text="Надежная история строится на сопоставлении источников. Используйте энциклопедии для ориентации, архивы для доказательств, карты и музеи для контекста." />
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

function PageTitle({ icon: Icon, eyebrow, title, text }) {
  return (
    <div className="page-title">
      <span className="eyebrow"><Icon size={16} /> {eyebrow}</span>
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
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

function DossierPage({ dossierId, go }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { let active = true; getDossier(dossierId).then((value) => active && setData(value)).catch((err) => active && setError(err.message)); return () => { active = false; }; }, [dossierId]);
  const record = allRecords.find((item) => item.id === dossierId || normalizeText(item.title) === normalizeText(dossierId));
  if (error) return <section className="page dossier-page"><div className="dossier glass"><h2>Не удалось загрузить досье</h2><p>{error}</p><button className="close-dossier" onClick={() => go('explore')}>Назад к поиску</button></div></section>;
  if (!data) return <section className="page dossier-page"><div className="dossier glass loading-state">Строим исследовательский план…</div></section>;
  if (!record && data) return <UniversalDossier data={data} go={go} />;

  if (!record) {
    return (
      <section className="page dossier-page">
        <div className="dossier glass">
          <div className="dossier-head">
            <div>
              <span className="eyebrow"><Shield size={16} /> досье не найдено</span>
              <h2>Пока нет локального досье</h2>
              <p>Для запроса «{dossierId}» нужно подключить backend-поиск, парсер источников и генератор универсального досье.</p>
            </div>
            <button className="close-dossier" onClick={() => go('explore')}>Назад к поиску</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page dossier-page">
      <div className="breadcrumbs">
        <button onClick={() => go('home')}>Главная</button>
        <span>→</span>
        <button onClick={() => go('explore')}>Поиск</button>
        <span>→</span>
        <b>{record.title}</b>
      </div>
      <Dossier record={record} onClose={() => go('explore')} />
    </section>
  );
}

function UniversalDossier({ data, go }) {
  return <section className="page dossier-page"><div className="breadcrumbs"><button onClick={() => go('home')}>Главная</button><span>→</span><button onClick={() => go('explore')}>Поиск</button><span>→</span><b>{data.title}</b></div><article className="dossier glass"><div className="dossier-head"><div><span className="eyebrow"><Sparkles size={16} /> универсальное досье</span><h2>{data.title}</h2><p>{data.entityType} • {data.status === 'needs-live-research' ? 'требуется проверка источников' : 'локальная база'}</p></div><button className="close-dossier" onClick={() => go('explore')}>Назад к поиску</button></div><p className="dossier-summary">{data.summary}</p><section className="dossier-section"><h3>Быстрые факты</h3><div className="fact-list">{data.quickFacts.map((fact) => <div className="fact-row" key={fact.label}><div><b>{fact.label}</b><p>{fact.value}</p></div><span>уточняется</span></div>)}</div></section><section className="dossier-section"><h3>План исследования</h3><ol>{data.researchPipeline.map((step) => <li key={step}>{step}</li>)}</ol></section><section className="dossier-section"><h3>Точки зрения</h3><div className="perspective-grid">{data.perspectives.map((view) => <div className="perspective" key={view.side}><b>{view.side}</b><p>{view.thesis}</p><small>{view.caution}</small></div>)}</div></section><section className="dossier-section"><h3>Найденные материалы</h3><div className="source-table">{(data.sources || []).map((source) => <a href={source.sourceUrl} target="_blank" rel="noreferrer" key={source.id}><div><b>{source.title}</b><p>{source.summary}</p><small>{source.kind} • {source.sourceName}</small></div><ExternalLink size={18} /></a>)}</div></section></article></section>;
}

function Dossier({ record, onClose }) {
  return (
    <article className="dossier glass">
      <div className="dossier-head">
        <div>
          <span className="eyebrow"><Shield size={16} /> проверка и источники</span>
          <h2>{record.title}</h2>
          <p>{record.years || record.period || record.timeline} • {record.region || record.kind}</p>
        </div>
        {onClose && <button className="close-dossier" onClick={onClose}>Назад к поиску</button>}
      </div>

      {record.sourcePack?.summary && <p className="dossier-summary">{record.sourcePack.summary}</p>}

      {record.keyMoments?.length > 0 && (
        <section className="dossier-section">
          <h3>Ключевые моменты</h3>
          <div className="moment-grid">
            {record.keyMoments.map((moment) => (
              <div className="moment" key={`${moment.date}-${moment.title}`}>
                <span>{moment.date}</span>
                <b>{moment.title}</b>
                <p>{moment.text}</p>
                <em>{moment.status}</em>
              </div>
            ))}
          </div>
        </section>
      )}

      {record.perspectives?.length > 0 && (
        <section className="dossier-section">
          <h3>Стороны взгляда</h3>
          <div className="perspective-grid">
            {record.perspectives.map((view) => (
              <div className="perspective" key={view.side}>
                <b>{view.side}</b>
                <p>{view.thesis}</p>
                <small>{view.caution}</small>
              </div>
            ))}
          </div>
        </section>
      )}

      {record.factCheck?.length > 0 && (
        <section className="dossier-section">
          <h3>Проверка утверждений</h3>
          <div className="fact-list">
            {record.factCheck.map((fact) => (
              <div className="fact-row" key={fact.claim}>
                <div>
                  <b>{fact.claim}</b>
                  <p>{fact.explanation}</p>
                </div>
                <span>{fact.assessment}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {record.sourcePack?.sources?.length > 0 && (
        <section className="dossier-section">
          <h3>Источники и достоверность</h3>
          <div className="source-table">
            {record.sourcePack.sources.map((source) => (
              <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>
                <div>
                  <b>{source.title}</b>
                  <p>{source.note}</p>
                  <small>{source.type} • {source.stance}</small>
                </div>
                <span className={`reliability ${source.reliability.includes('высок') ? 'high' : 'medium'}`}>{source.reliability}</span>
                <ExternalLink size={18} />
              </a>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

function Stat({ value, label }) {
  return <div className="stat"><b>{value}</b><span>{label}</span></div>;
}

createRoot(document.getElementById('root')).render(<App />);
