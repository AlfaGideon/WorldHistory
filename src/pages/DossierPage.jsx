import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, BookOpen, Clock3, Database, Eye, GraduationCap, Info, RefreshCw,
  Scale, Shield, Sparkles, Target,
} from 'lucide-react';
import PageTitle from '../components/PageTitle';
import DossierActions from '../components/DossierActions';
import QuizBlock from '../components/QuizBlock';
import ReliabilityChip from '../components/ReliabilityChip';
import { SourceBadge } from '../components/SourceBadge';
import { dossierFromRecord, findRecord, refreshDossier, resolveDossier } from '../services/research';

const tabs = [
  { id: 'overview', label: 'Обзор', icon: Info },
  { id: 'causes', label: 'Причины и итоги', icon: Target },
  { id: 'timeline', label: 'Хронология', icon: Clock3 },
  { id: 'perspectives', label: 'Стороны', icon: Eye },
  { id: 'claims', label: 'Спорное', icon: Scale },
  { id: 'sources', label: 'Источники', icon: BookOpen },
  { id: 'quiz', label: 'Проверка', icon: GraduationCap },
];

const formatDate = (ms) => {
  if (!ms) return null;
  const date = new Date(Number(ms));
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const dedupeSources = (items = []) => {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = item.url || item.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
};

/** Normalizes any dossier payload (curated, backend or live) into one view model. */
function buildView(data, dossierId) {
  const live = data?.live || null;
  const curated = data?.status === 'curated-dossier' || data?.status === 'live-multi-source' ? data : null;
  const base = curated || live || data;

  const sources = dedupeSources([
    ...(base?.sources || []),
    ...(live?.sources || []),
  ]).map((source) => ({
    ...source,
    url: source.url || source.sourceUrl,
    type: source.type || source.kind,
    stance: source.stance || source.sourceName,
    note: source.note || source.summary,
    reliability: source.reliability || 'требует оценки',
  }));

  const infobox = {
    type: base?.infobox?.type || base?.entityType || 'историческая тема',
    dates: base?.infobox?.dates || 'уточняются',
    region: base?.infobox?.region || 'уточняется',
    participants: base?.infobox?.participants || 'не указаны',
    outcome: base?.infobox?.outcome || 'требует исследования',
    confidence: base?.infobox?.confidence || 'предварительная',
    ...(base?.infobox?.partOf ? { partOf: base.infobox.partOf } : {}),
  };

  const status = base?.status || 'unknown';
  const isPlan = ['local-research-plan', 'needs-live-research'].includes(status);

  return {
    title: base?.title || dossierId,
    eyebrow: status === 'curated-dossier' ? 'проверенное досье' : isPlan ? 'план исследования' : 'досье из внешних источников',
    icon: status === 'curated-dossier' ? Shield : isPlan ? AlertTriangle : Sparkles,
    meta: [infobox.type, infobox.dates].filter(Boolean).join(' • '),
    summary: base?.brief || base?.summary || '',
    info: infobox,
    causes: base?.causes || [],
    outcomes: base?.outcomes || [],
    timeline: base?.timeline || [],
    perspectives: base?.perspectives || [],
    knownFacts: base?.knownFacts || [],
    disputedClaims: base?.disputedClaims || [],
    positionStatements: base?.positionStatements || [],
    myths: base?.myths || [],
    quickFacts: live?.quickFacts || base?.quickFacts || [],
    sources,
    researchPipeline: base?.researchPipeline || [],
    quiz: base?.quiz || [],
    thumbnail: base?.thumbnail || null,
    articleUrl: base?.articleUrl || null,
    savedAt: formatDate(data?.cachedAt),
    fromCache: data?.cacheStatus === 'hit' || data?.cacheStatus === 'stale',
    hasLive: Boolean(live),
    notice: isPlan
      ? 'Досье построено без внешних данных: сейчас backend и внешние источники недоступны. Подключите маршрут (напрямую, Tor Browser или прокси) в настройках и обновите страницу.'
      : data?.hint && !isPlan
        ? data.hint
        : null,
    status,
  };
}

export default function DossierPage({ dossierId, go, initialTab = 'overview', depth = 'deep' }) {
  // Curated records render synchronously — no spinner, works fully offline.
  const record = useMemo(() => findRecord(dossierId), [dossierId]);
  const [data, setData] = useState(() => (record ? dossierFromRecord(record) : null));
  const [activeTab, setActiveTab] = useState(initialTab);
  const [tabPicked, setTabPicked] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // The page is remounted per dossier id (see the `key` in the router), so the
  // active tab resets naturally and the curated dossier is available instantly.
  useEffect(() => {
    if (record) return undefined;
    let active = true;
    resolveDossier(dossierId)
      .then((value) => active && setData(value))
      .catch(() => active && setData(null));
    return () => { active = false; };
  }, [dossierId, record]);

  const view = useMemo(() => buildView(data, dossierId), [data, dossierId]);

  // The requested tab is only a hint: fall back to the overview when the
  // dossier has no content for it yet (topics without curated sources, etc.).
  const requestedTab = useMemo(() => {
    if (initialTab === 'causes' && !view.causes.length && !view.outcomes.length) return 'overview';
    if (initialTab === 'sources' && !view.sources.length) return 'overview';
    if (initialTab === 'quiz' && !view.quiz.length) return 'overview';
    return initialTab;
  }, [initialTab, view]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      setData(await refreshDossier(dossierId));
    } catch {
      // The previous dossier stays on screen; the notice explains the state.
    } finally {
      setRefreshing(false);
    }
  };

  if (!data) {
    return (
      <section className="page dossier-page">
        <div className="dossier glass loading-state">
          <RefreshCw size={18} className="spin" /> Собираем материалы по теме…
        </div>
      </section>
    );
  }

  const Icon = view.icon;
  const availableTabs = tabs.filter((tab) => (tab.id === 'quiz' ? view.quiz.length > 0 : true));
  // Once the reader picks a tab manually their choice wins; until then the
  // requested tab is used (with a fallback when it has no content).
  const activeTabId = tabPicked
    ? (availableTabs.some((tab) => tab.id === activeTab) ? activeTab : 'overview')
    : (availableTabs.some((tab) => tab.id === requestedTab) ? requestedTab : 'overview');

  return (
    <section className="page dossier-page">
      <Breadcrumbs title={view.title} go={go} />

      <article className="dossier glass">
        <header className="dossier-head">
          <div className="dossier-head-copy">
            <span className="eyebrow"><Icon size={16} /> {view.eyebrow}</span>
            <h1 className="dossier-title">{view.title}</h1>
            <p className="dossier-meta">{view.meta}</p>
          </div>
          {view.thumbnail && <img className="dossier-thumb" src={view.thumbnail} alt={view.title} loading="lazy" />}
        </header>

        <DossierActions view={view} dossierId={dossierId} />

        {(view.savedAt || refreshing || view.status !== 'local-research-plan') && (
          <div className="saved-row">
            <Database size={15} />
            <span>
              {view.savedAt
                ? `Данные сохранены ${view.savedAt}${view.fromCache ? ' • читаем из локального кэша' : ''}`
                : view.status === 'curated-dossier'
                  ? 'Проверенное досье хранится на устройстве и доступно без сети.'
                  : 'Материалы можно сохранить локально.'}
            </span>
            <button onClick={refresh} disabled={refreshing}>
              <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
              {refreshing ? 'Обновляем…' : 'Обновить данные'}
            </button>
          </div>
        )}

        {view.notice && (
          <div className="api-notice with-action dossier-notice">
            <span>{view.notice}</span>
            <button onClick={() => go('settings')}>Открыть настройки</button>
          </div>
        )}

        <nav className="dossier-tabs" aria-label="Разделы досье">
          {availableTabs.map(({ id, label, icon: TabIcon }) => (
            <button
              key={id}
              className={activeTabId === id ? 'active' : ''}
              onClick={() => { setActiveTab(id); setTabPicked(true); }}
            >
              <TabIcon size={17} />{label}
            </button>
          ))}
        </nav>

        {activeTabId === 'overview' && <OverviewTab view={view} go={go} depth={depth} />}
        {activeTabId === 'causes' && <CausesTab view={view} />}
        {activeTabId === 'timeline' && <TimelineTab timeline={view.timeline} />}
        {activeTabId === 'perspectives' && <PerspectivesTab perspectives={view.perspectives} />}
        {activeTabId === 'claims' && <ClaimsTab view={view} />}
        {activeTabId === 'sources' && <SourcesTab view={view} />}
        {activeTabId === 'quiz' && <QuizTab view={view} />}
      </article>
    </section>
  );
}

function Breadcrumbs({ title, go }) {
  return (
    <nav className="breadcrumbs" aria-label="Хлебные крошки">
      <button onClick={() => go('home')}>Главная</button><span>→</span>
      <button onClick={() => go('explore')}>Поиск</button><span>→</span>
      <b>{title}</b>
    </nav>
  );
}

function OverviewTab({ view, go, depth = 'deep' }) {
  const info = [
    ['Тип', view.info.type],
    ['Даты', view.info.dates],
    ['Регион', view.info.region],
    ['Участники', view.info.participants],
    ['Итог / значение', view.info.outcome],
    ['Уверенность', view.info.confidence],
    ...(view.info.partOf ? [['Часть чего', view.info.partOf]] : []),
  ];

  return (
    <div className="dossier-tab-panel">
      <section className="dossier-infobox">
        {info.map(([label, value]) => (
          <div key={label}><span>{label}</span><b>{value}</b></div>
        ))}
      </section>

      <section className="dossier-section">
        <h3>Кратко</h3>
        <p className="dossier-summary">{view.summary}</p>
        {view.articleUrl && (
          <a className="inline-link" href={view.articleUrl} target="_blank" rel="noreferrer">
            Открыть исходную статью
          </a>
        )}
      </section>

      {view.quickFacts?.length > 0 && (
        <section className="dossier-section">
          <h3>Быстрые факты</h3>
          <div className="chips">
            {view.quickFacts.map((fact) => (
              <em key={fact.label} title={fact.value}>{fact.label}: {fact.value}</em>
            ))}
          </div>
        </section>
      )}

      <EvidencePreview view={view} />

      {depth !== 'quick' && (view.causes.length > 0 || view.outcomes.length > 0) && (
        <section className="dossier-section">
          <h3>Причины и последствия</h3>
          <div className="factor-grid">
            {view.causes.slice(0, 2).map((cause) => (
              <article className="factor-card cause" key={cause.kind}>
                <b>{cause.kind}</b>
                <p>{cause.text}</p>
              </article>
            ))}
            {view.outcomes.slice(0, 2).map((outcome) => (
              <article className="factor-card outcome" key={outcome.kind}>
                <b>{outcome.kind}</b>
                <p>{outcome.text}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {depth !== 'quick' && view.researchPipeline.length > 0 && (
        <section className="dossier-section">
          <h3>Что изучить дальше</h3>
          <ol>{view.researchPipeline.map((step) => <li key={step}>{step}</li>)}</ol>
        </section>
      )}

      {view.sources.length > 0 && (
        <section className="dossier-section">
          <h3>Ключевые источники</h3>
          <div className="source-table">
            {view.sources.slice(0, 3).map((source) => (
              <a href={source.url} target="_blank" rel="noreferrer" key={source.url || source.title}>
                <SourceBadge name={source.stance || source.sourceName} size={26} />
                <div className="source-copy">
                  <b>{source.title}</b>
                  <p>{source.note}</p>
                </div>
                <ReliabilityChip value={source.reliability} />
              </a>
            ))}
          </div>
          <button className="ghost small" onClick={() => go('sources')}>Весь каталог источников</button>
        </section>
      )}
    </div>
  );
}

function EvidencePreview({ view }) {
  return (
    <section className="dossier-section">
      <h3>Статус информации</h3>
      <div className="evidence-grid">
        <EvidenceCard tone="known" title="Что известно точно" items={view.knownFacts} empty="Подтверждённые утверждения будут добавлены после сопоставления источников." />
        <EvidenceCard tone="disputed" title="Что спорно" items={view.disputedClaims} empty="Спорные утверждения пока не выделены." />
        <EvidenceCard tone="position" title="Позиции сторон" items={view.positionStatements} empty="Позиции сторон пока не определены." />
      </div>
    </section>
  );
}

function EvidenceCard({ title, items, empty, tone }) {
  return (
    <div className={`evidence-card ${tone}`}>
      <h4>{title}</h4>
      {items.length
        ? <ul>{items.slice(0, 3).map((item, index) => <li key={item.claim || item.text || index}>{item.claim || item.text || item}</li>)}</ul>
        : <p>{empty}</p>}
    </div>
  );
}

function CausesTab({ view }) {
  const hasContent = view.causes.length > 0 || view.outcomes.length > 0;
  if (!hasContent) {
    return (
      <div className="dossier-tab-panel">
        <EmptyTab text="Для этой темы разделы «причины» и «последствия» ещё не собраны. Мы не добавляем объяснения без опоры на источники." />
      </div>
    );
  }
  return (
    <div className="dossier-tab-panel">
      {view.causes.length > 0 && (
        <section className="dossier-section tab-section">
          <h3>Почему это произошло</h3>
          <div className="factor-grid">
            {view.causes.map((cause) => (
              <article className="factor-card cause" key={cause.kind}>
                <b>{cause.kind}</b>
                <p>{cause.text}</p>
              </article>
            ))}
          </div>
        </section>
      )}
      {view.outcomes.length > 0 && (
        <section className="dossier-section tab-section">
          <h3>Чем это закончилось</h3>
          <div className="factor-grid">
            {view.outcomes.map((outcome) => (
              <article className="factor-card outcome" key={outcome.kind}>
                <b>{outcome.kind}</b>
                <p>{outcome.text}</p>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TimelineTab({ timeline }) {
  return (
    <div className="dossier-tab-panel">
      <section className="dossier-section tab-section">
        <h3>Хронология</h3>
        {timeline.length ? (
          <ol className="timeline">
            {timeline.map((moment) => (
              <li className="moment" key={`${moment.date}-${moment.title}`}>
                <span className="moment-date">{moment.date}</span>
                <div>
                  <b>{moment.title}</b>
                  <p>{moment.text}</p>
                  {moment.status && <em>{moment.status}</em>}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyTab text="Для этой темы хронология ещё не собрана. Даты нельзя добавлять без проверки источников." />
        )}
      </section>
    </div>
  );
}

function PerspectivesTab({ perspectives }) {
  return (
    <div className="dossier-tab-panel">
      <section className="dossier-section tab-section">
        <h3>Стороны и точки зрения</h3>
        {perspectives.length ? (
          <div className="perspective-grid">
            {perspectives.map((item) => (
              <article className="perspective" key={`${item.side}-${item.thesis}`}>
                <b>{item.side}</b>
                <p>{item.thesis}</p>
                {item.caution && (
                  <small><Shield size={13} /> {item.caution}</small>
                )}
              </article>
            ))}
          </div>
        ) : (
          <EmptyTab text="Недостаточно данных, чтобы корректно выделить независимые позиции." />
        )}
      </section>
    </div>
  );
}

function ClaimsTab({ view }) {
  const groups = [
    ['Что известно точно', view.knownFacts, 'known'],
    ['Что спорно', view.disputedClaims, 'disputed'],
    ['Позиция стороны', view.positionStatements, 'position'],
    ['Мифы и упрощения', view.myths, 'myth'],
  ];
  return (
    <div className="dossier-tab-panel">
      <section className="dossier-section tab-section">
        <h3>Проверка утверждений</h3>
        <div className="claim-groups">
          {groups.map(([title, items, tone]) => (
            <div className="claim-group" key={title}>
              <h4 className={tone}>{title}</h4>
              {items.length ? (
                <div className="fact-list">
                  {items.map((fact, index) => (
                    <div className="fact-row" key={fact.claim || fact.text || index}>
                      <div>
                        <b>{fact.claim || fact.text || fact}</b>
                        {fact.explanation && <p>{fact.explanation}</p>}
                      </div>
                      <ReliabilityChip value={fact.assessment || title.toLowerCase()} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-inline">Нет классифицированных утверждений.</p>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SourcesTab({ view }) {
  return (
    <div className="dossier-tab-panel">
      <section className="dossier-section tab-section">
        <h3>Источники и достоверность</h3>
        {view.sources.length ? (
          <>
            {view.sourcePack?.summary && <p className="dossier-summary">{view.sourcePack.summary}</p>}
            <div className="source-table">
              {view.sources.map((source) => (
                <a href={source.url} target="_blank" rel="noreferrer" key={source.url || source.title}>
                  <SourceBadge name={source.stance || source.sourceName} size={26} />
                  <div className="source-copy">
                    <b>{source.title}</b>
                    {source.note && <p>{source.note}</p>}
                    <small>{[source.type, source.stance].filter(Boolean).join(' • ')}</small>
                  </div>
                  <ReliabilityChip value={source.reliability} />
                </a>
              ))}
            </div>
          </>
        ) : (
          <EmptyTab text="Внешние материалы пока недоступны. Исследовательский план сохранён, источники можно загрузить позже." />
        )}
      </section>
    </div>
  );
}

function QuizTab({ view }) {
  return (
    <div className="dossier-tab-panel">
      <QuizBlock items={view.quiz} />
      <section className="dossier-section">
        <PageTitle
          eyebrow="метод"
          title="Как читать это досье"
          text="Три правила источниковедения: разделяйте установленный факт и интерпретацию, проверяйте, кто и зачем создал источник, и ищите независимые подтверждения."
        />
      </section>
    </div>
  );
}

function EmptyTab({ text }) {
  return (
    <div className="dossier-empty">
      <Shield size={22} />
      <p>{text}</p>
    </div>
  );
}
