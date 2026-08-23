import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Clock3, Database, Eye, Info, RefreshCw, Scale, Shield, Sparkles } from 'lucide-react';
import { createDossierFallback, getDossier } from '../api/client';
import { allRecords, normalizeText } from '../utils/historyRecords';
import { SourceBadgeLink } from '../components/SourceBadge';

const tabs = [
  { id: 'overview', label: 'Обзор', icon: Info },
  { id: 'timeline', label: 'Хронология', icon: Clock3 },
  { id: 'perspectives', label: 'Стороны', icon: Eye },
  { id: 'claims', label: 'Спорное', icon: Scale },
  { id: 'sources', label: 'Источники', icon: BookOpen },
];

const formatDate = (ms) => {
  if (!ms) return null;
  const date = new Date(Number(ms));
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export default function DossierPage({ dossierId, go }) {
  const record = allRecords.find((item) => item.id === dossierId || normalizeText(item.title) === normalizeText(dossierId));
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;
    if (!record) {
      getDossier(dossierId)
        .then((value) => active && setData(value))
        // A dossier must remain available when a static deployment cannot
        // reach its optional API. The fallback makes no factual claims.
        .catch(() => active && setData(createDossierFallback(dossierId)));
    }
    return () => { active = false; };
  }, [dossierId, record]);

  if (record) return <LocalDossier record={record} go={go} />;
  if (!data) return <section className="page dossier-page"><div className="dossier glass loading-state">Строим исследовательский план…</div></section>;

  const refresh = async () => {
    setRefreshing(true);
    try {
      setData(await getDossier(dossierId, { refresh: true }));
    } catch {
      // Keep the saved copy when a manual refresh cannot reach the API.
    } finally {
      setRefreshing(false);
    }
  };

  return <UniversalDossier data={data} go={go} onRefresh={refresh} refreshing={refreshing} />;
}

function Breadcrumbs({ title, go }) {
  return <div className="breadcrumbs"><button onClick={() => go('home')}>Главная</button><span>→</span><button onClick={() => go('explore')}>Поиск</button><span>→</span><b>{title}</b></div>;
}

function UniversalDossier({ data, go, onRefresh, refreshing }) {
  const savedAt = formatDate(data.cachedAt || data.fetchedAt);
  const fromCache = data.cacheStatus === 'hit' || data.cacheStatus === 'stale';
  const view = useMemo(() => ({
    title: data.title,
    eyebrow: 'универсальное досье',
    icon: Sparkles,
    meta: `${data.entityType} • ${data.status === 'live-multi-source' ? 'данные из внешних источников' : 'план исследования без неподтверждённых фактов'}`,
    summary: data.brief || data.summary,
    info: data.infobox || {
      type: data.entityType,
      dates: 'уточняются',
      region: 'уточняется',
      participants: 'уточняются',
      outcome: 'требуется исследование',
      confidence: data.status === 'needs-live-research' ? 'низкая' : 'средняя',
    },
    quickFacts: data.quickFacts || [],
    timeline: data.timeline || [],
    perspectives: data.perspectives || [],
    knownFacts: data.knownFacts || [],
    disputedClaims: data.disputedClaims || [],
    positionStatements: data.positionStatements || [],
    myths: data.myths || [],
    sources: (data.sources || []).map((source) => ({
      ...source,
      url: source.sourceUrl || source.url,
      type: source.kind || source.type,
      stance: source.sourceName || source.stance,
      note: source.summary || source.note,
      reliability: source.reliability || 'требует оценки',
    })),
    researchPipeline: data.researchPipeline || [],
    thumbnail: data.thumbnail || null,
    savedAt,
    fromCache,
    notice: ['local-research-plan', 'needs-live-research'].includes(data.status)
      ? 'Досье построено без внешних данных: сейчас backend не может получить материалы. Подключите маршрут (напрямую, Tor Browser или прокси) в настройках и обновите страницу.'
      : null,
  }), [data, savedAt, fromCache]);

  return <DossierLayout view={view} go={go} onRefresh={fromCache || savedAt ? onRefresh : null} refreshing={refreshing} />;
}

function LocalDossier({ record, go }) {
  const factChecks = record.factCheck || [];
  const knownFacts = factChecks.filter((fact) => fact.assessment.toLowerCase().includes('высок'));
  const myths = factChecks.filter((fact) => /миф|упрощение/.test(fact.assessment.toLowerCase()));
  const disputedClaims = factChecks.filter((fact) => !knownFacts.includes(fact) && !myths.includes(fact));
  const summary = record.sourcePack?.summary || record.impact || record.core || record.summary;
  const view = {
    title: record.title,
    eyebrow: 'проверка и источники',
    icon: Shield,
    meta: `${record.years || record.period || record.timeline || 'даты уточняются'} • ${record.region || record.kind}`,
    summary,
    info: {
      type: record.type || record.kind,
      dates: record.years || record.period || record.timeline || 'уточняются',
      region: record.region || record.regions?.join(', ') || 'уточняется',
      participants: record.parties?.join(', ') || 'не указаны',
      outcome: record.impact || record.core || 'требуется дополнительное исследование',
      confidence: record.sourcePack?.sources?.length ? 'средне-высокая' : 'предварительная',
    },
    timeline: record.keyMoments || [],
    perspectives: record.perspectives || [],
    knownFacts,
    disputedClaims,
    myths,
    positionStatements: (record.perspectives || []).map((viewpoint) => ({ claim: viewpoint.thesis, assessment: 'позиция стороны', explanation: viewpoint.side })),
    sources: record.sourcePack?.sources || [],
    researchPipeline: record.learn || [],
  };

  return <DossierLayout view={view} go={go} />;
}

function DossierLayout({ view, go, onRefresh, refreshing }) {
  const [activeTab, setActiveTab] = useState('overview');
  const Icon = view.icon;

  return (
    <section className="page dossier-page">
      <Breadcrumbs title={view.title} go={go} />
      <article className="dossier glass">
        <div className="dossier-head">
          <div className="dossier-head-copy">
            <span className="eyebrow"><Icon size={16} /> {view.eyebrow}</span>
            <h2>{view.title}</h2>
            <p>{view.meta}</p>
          </div>
          {view.thumbnail && <img className="dossier-thumb" src={view.thumbnail} alt={view.title} loading="lazy" />}
          <button className="close-dossier" onClick={() => go('explore')}>Назад к поиску</button>
        </div>

        {(view.savedAt || onRefresh) && (
          <div className="saved-row">
            <Database size={15} />
            <span>
              {view.savedAt
                ? `Данные сохранены ${view.savedAt}${view.fromCache ? ' • читаем из локального кэша, сеть не расходуется' : ''}`
                : 'Данные можно сохранить локально — они не будут загружаться повторно.'}
            </span>
            {onRefresh && <button onClick={onRefresh} disabled={refreshing}><RefreshCw size={14} className={refreshing ? 'spin' : ''} />{refreshing ? 'Обновляем…' : 'Обновить данные'}</button>}
          </div>
        )}

        {view.notice && (
          <div className="api-notice with-action dossier-notice">
            <span>{view.notice}</span>
            <button onClick={() => go('settings')}>Открыть настройки</button>
          </div>
        )}

        <nav className="dossier-tabs" aria-label="Разделы досье">
          {tabs.map(({ id, label, icon: TabIcon }) => <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id)}><TabIcon size={17} />{label}</button>)}
        </nav>

        {activeTab === 'overview' && <OverviewTab view={view} />}
        {activeTab === 'timeline' && <TimelineTab timeline={view.timeline} />}
        {activeTab === 'perspectives' && <PerspectivesTab perspectives={view.perspectives} />}
        {activeTab === 'claims' && <ClaimsTab view={view} />}
        {activeTab === 'sources' && <SourcesTab sources={view.sources} />}
      </article>
    </section>
  );
}

function OverviewTab({ view }) {
  const info = [
    ['Тип', view.info.type], ['Даты', view.info.dates], ['Регион', view.info.region],
    ['Участники', view.info.participants], ['Итог / значение', view.info.outcome], ['Уверенность', view.info.confidence],
    ...(view.info.partOf ? [['Часть чего', view.info.partOf]] : []),
  ];
  return <div className="dossier-tab-panel"><section className="dossier-infobox">{info.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</section><section className="dossier-section"><h3>Кратко</h3><p className="dossier-summary">{view.summary}</p></section>{view.quickFacts?.length > 0 && <section className="dossier-section"><h3>Быстрые факты</h3><div className="chips">{view.quickFacts.map((fact) => <em key={fact.label} title={fact.value}>{fact.label}: {fact.value}</em>)}</div></section>}<EvidencePreview view={view} />{view.researchPipeline.length > 0 && <section className="dossier-section"><h3>Что изучить дальше</h3><ol>{view.researchPipeline.map((step) => <li key={step}>{step}</li>)}</ol></section>}</div>;
}

function EvidencePreview({ view }) {
  return <section className="dossier-section"><h3>Статус информации</h3><div className="evidence-grid"><EvidenceCard tone="known" title="Что известно точно" items={view.knownFacts} empty="Подтверждённые утверждения будут добавлены после сопоставления источников." /><EvidenceCard tone="disputed" title="Что спорно" items={view.disputedClaims} empty="Спорные утверждения пока не выделены." /><EvidenceCard tone="position" title="Позиции сторон" items={view.positionStatements} empty="Позиции сторон пока не определены." /></div></section>;
}

function EvidenceCard({ title, items, empty, tone }) {
  return <div className={`evidence-card ${tone}`}><h4>{title}</h4>{items.length ? <ul>{items.slice(0, 3).map((item, index) => <li key={item.claim || item.text || index}>{item.claim || item.text || item}</li>)}</ul> : <p>{empty}</p>}</div>;
}

function TimelineTab({ timeline }) {
  return <div className="dossier-tab-panel"><section className="dossier-section tab-section"><h3>Хронология</h3>{timeline.length ? <div className="moment-grid">{timeline.map((moment) => <div className="moment" key={`${moment.date}-${moment.title}`}><span>{moment.date}</span><b>{moment.title}</b><p>{moment.text}</p><em>{moment.status}</em></div>)}</div> : <EmptyTab text="Для этой темы хронология ещё не собрана. Даты нельзя добавлять без проверки источников." />}</section></div>;
}

function PerspectivesTab({ perspectives }) {
  return <div className="dossier-tab-panel"><section className="dossier-section tab-section"><h3>Стороны и точки зрения</h3>{perspectives.length ? <div className="perspective-grid">{perspectives.map((view) => <div className="perspective" key={`${view.side}-${view.thesis}`}><b>{view.side}</b><p>{view.thesis}</p><small>{view.caution}</small></div>)}</div> : <EmptyTab text="Недостаточно данных, чтобы корректно выделить независимые позиции." />}</section></div>;
}

function ClaimsTab({ view }) {
  const groups = [['Что известно точно', view.knownFacts, 'known'], ['Что спорно', view.disputedClaims, 'disputed'], ['Позиция стороны', view.positionStatements, 'position'], ['Мифы и упрощения', view.myths, 'myth']];
  return <div className="dossier-tab-panel"><section className="dossier-section tab-section"><h3>Проверка утверждений</h3><div className="claim-groups">{groups.map(([title, items, tone]) => <div className="claim-group" key={title}><h4 className={tone}>{title}</h4>{items.length ? <div className="fact-list">{items.map((fact, index) => <div className="fact-row" key={fact.claim || fact.text || index}><div><b>{fact.claim || fact.text || fact}</b>{fact.explanation && <p>{fact.explanation}</p>}</div><span>{fact.assessment || title.toLowerCase()}</span></div>)}</div> : <p className="empty-inline">Нет классифицированных утверждений.</p>}</div>)}</div></section></div>;
}

function SourcesTab({ sources }) {
  return <div className="dossier-tab-panel"><section className="dossier-section tab-section"><h3>Источники и достоверность</h3>{sources.length ? <div className="source-table">{sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.id || source.url}><SourceBadgeLink record={{ sourceUrl: source.url, sourceName: source.stance || source.sourceName }} size={26} /><div className="source-copy"><b>{source.title}</b><p>{source.note}</p><small>{source.type} • {source.stance}</small></div><span className={`reliability ${source.reliability?.includes('высок') ? 'high' : 'medium'}`}>{source.reliability || 'требует оценки'}</span></a>)}</div> : <EmptyTab text="Внешние материалы пока недоступны. Исследовательский план сохранён, источники можно загрузить позже." />}</section></div>;
}

function EmptyTab({ text }) {
  return <div className="dossier-empty"><Shield size={22} /><p>{text}</p></div>;
}
