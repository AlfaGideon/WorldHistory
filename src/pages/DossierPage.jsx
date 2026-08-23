import { useEffect, useState } from 'react';
import { ExternalLink, Shield, Sparkles } from 'lucide-react';
import { getDossier } from '../api/client';
import { allRecords, normalizeText } from '../utils/historyRecords';

export default function DossierPage({ dossierId, go }) {
  const record = allRecords.find((item) => item.id === dossierId || normalizeText(item.title) === normalizeText(dossierId));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    // Готовое локальное досье не должно зависеть от доступности внешнего API.
    if (!record) {
      getDossier(dossierId)
        .then((value) => active && setData(value))
        .catch(() => active && setError('Сервис временно недоступен. Попробуйте обновить страницу.'));
    }

    return () => { active = false; };
  }, [dossierId, record]);

  if (record) return <section className="page dossier-page"><div className="breadcrumbs"><button onClick={() => go('home')}>Главная</button><span>→</span><button onClick={() => go('explore')}>Поиск</button><span>→</span><b>{record.title}</b></div><Dossier record={record} onClose={() => go('explore')} /></section>;
  if (error) return <section className="page dossier-page"><div className="dossier glass"><h2>Сервис временно недоступен</h2><p>{error}</p><button className="close-dossier" onClick={() => go('explore')}>Назад к поиску</button></div></section>;
  if (!data) return <section className="page dossier-page"><div className="dossier glass loading-state">Строим исследовательский план…</div></section>;
  return <UniversalDossier data={data} go={go} />;
}

function UniversalDossier({ data, go }) {
  return <section className="page dossier-page"><div className="breadcrumbs"><button onClick={() => go('home')}>Главная</button><span>→</span><button onClick={() => go('explore')}>Поиск</button><span>→</span><b>{data.title}</b></div><article className="dossier glass"><div className="dossier-head"><div><span className="eyebrow"><Sparkles size={16} /> универсальное досье</span><h2>{data.title}</h2><p>{data.entityType} • {data.status === 'needs-live-research' ? 'внешние источники временно недоступны' : 'данные из внешних источников'}</p></div><button className="close-dossier" onClick={() => go('explore')}>Назад к поиску</button></div><p className="dossier-summary">{data.summary}</p><section className="dossier-section"><h3>Быстрые факты</h3><div className="fact-list">{data.quickFacts.map((fact) => <div className="fact-row" key={fact.label}><div><b>{fact.label}</b><p>{fact.value}</p></div><span>уточняется</span></div>)}</div></section><section className="dossier-section"><h3>План исследования</h3><ol>{data.researchPipeline.map((step) => <li key={step}>{step}</li>)}</ol></section><section className="dossier-section"><h3>Точки зрения</h3><div className="perspective-grid">{data.perspectives.map((view) => <div className="perspective" key={view.side}><b>{view.side}</b><p>{view.thesis}</p><small>{view.caution}</small></div>)}</div></section><section className="dossier-section"><h3>Найденные материалы</h3><div className="source-table">{(data.sources || []).map((source) => <a href={source.sourceUrl} target="_blank" rel="noreferrer" key={source.id}><div><b>{source.title}</b><p>{source.summary}</p><small>{source.kind} • {source.sourceName}</small></div><ExternalLink size={18} /></a>)}</div></section></article></section>;
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

