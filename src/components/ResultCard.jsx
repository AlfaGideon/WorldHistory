import { ArrowUpRight, ShieldCheck } from 'lucide-react';
import { SourceBadgeLink } from './SourceBadge';

export default function ResultCard({ record, onOpenDossier }) {
  const title = record.title || record.name || 'Без названия';
  const subtitle = record.period || record.timeline || record.years || record.dates;
  const body = record.summary || record.core || record.impact || record.snippet;
  const hasDossier = Boolean(record.sourcePack || record.perspectives || record.keyMoments || record.causes);

  return (
    <article className={`result-card glass ${record.local ? 'is-local' : ''}`}>
      <div className="result-card-top">
        <span className="pill">{record.kind}</span>
        <div className="result-card-badges">
          {record.local && hasDossier && (
            <span className="verified-chip" title="Проверенное досье с источниками и проверкой фактов">
              <ShieldCheck size={13} /> проверено
            </span>
          )}
          <SourceBadgeLink record={record} />
        </div>
      </div>
      <h3>{record.flag ? `${record.flag} ` : ''}{title}</h3>
      {subtitle && <b>{subtitle}</b>}
      {body && <p>{body}</p>}
      {Array.isArray(record.regions) && <div className="chips">{record.regions.map((item) => <em key={item}>{item}</em>)}</div>}
      {Array.isArray(record.topics) && <div className="chips">{record.topics.slice(0, 4).map((item) => <em key={item}>{item}</em>)}</div>}
      {Array.isArray(record.parties) && <div className="chips">{record.parties.map((item) => <em key={item}>{item}</em>)}</div>}
      {record.sourcePack?.sources?.length > 0 && (
        <div className="source-preview">
          <b>Источники внутри:</b>
          <span>{record.sourcePack.sources.slice(0, 3).map((source) => source.title.split('—')[0].trim()).join(' • ')}</span>
        </div>
      )}
      {record.local && hasDossier ? (
        <button className="dossier-button" onClick={() => onOpenDossier(record)}>
          Открыть разбор источников <ArrowUpRight size={15} />
        </button>
      ) : (
        <button className="dossier-button subtle" onClick={() => onOpenDossier(record)}>
          Собрать досье <ArrowUpRight size={15} />
        </button>
      )}
    </article>
  );
}
