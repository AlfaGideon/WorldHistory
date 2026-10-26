import { ArrowUpRight, Clock3 } from 'lucide-react';
import PageTitle from '../components/PageTitle';
import { erasWithDossiers } from '../data';

export default function ErasPage({ go }) {
  return (
    <section className="page">
      <PageTitle
        icon={Clock3}
        eyebrow="периодизация"
        title="Эпохи мировой истории"
        text="Каждая эпоха разобрана по одной схеме: что привело к изменениям, ключевые даты, чем закончилось и как это оценивают разные историографические школы."
      />
      <div className="timeline-wrap">
        {erasWithDossiers.map((era, index) => (
          <article className={`era-card ${era.gradient || 'from-sky'}`} key={era.id}>
            <div className="era-index">{String(index + 1).padStart(2, '0')}</div>
            <div>
              <span>{era.period}</span>
              <h3>{era.title}</h3>
              <p>{era.summary}</p>
              <ul>{(era.milestones || []).map((item) => <li key={item}>{item}</li>)}</ul>
              <div className="chips">{(era.regions || []).map((item) => <em key={item}>{item}</em>)}</div>
              <button className="dossier-button" onClick={() => go(`/dossier/${encodeURIComponent(era.id)}`)}>
                Открыть досье эпохи <ArrowUpRight size={15} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
