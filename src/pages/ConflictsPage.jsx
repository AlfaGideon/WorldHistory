import { useMemo, useState } from 'react';
import { ArrowUpRight, Swords } from 'lucide-react';
import PageTitle from '../components/PageTitle';
import ReliabilityChip from '../components/ReliabilityChip';
import { conflictsWithDossiers } from '../data';

export default function ConflictsPage({ go }) {
  const [selectedId, setSelectedId] = useState(() => conflictsWithDossiers[4]?.id || conflictsWithDossiers[0]?.id);
  const selected = useMemo(
    () => conflictsWithDossiers.find((item) => item.id === selectedId) || conflictsWithDossiers[0],
    [selectedId],
  );

  if (!selected) return null;

  const mythCount = (selected.factCheck || []).filter((item) => /миф|упрощ/i.test(item.assessment)).length;

  return (
    <section className="page">
      <PageTitle
        icon={Swords}
        eyebrow="военная история"
        title="Истории военных конфликтов"
        text="Для каждого конфликта разобраны долгосрочные причины, повод, последствия, позиции сторон и распространённые мифы."
      />

      <div className="conflict-layout">
        <div className="conflict-list">
          {conflictsWithDossiers.map((conflict) => (
            <button
              key={conflict.id}
              className={selected.id === conflict.id ? 'active' : ''}
              onClick={() => setSelectedId(conflict.id)}
            >
              <span>{conflict.years}</span>
              <b>{conflict.name}</b>
              <small>{conflict.region}</small>
            </button>
          ))}
        </div>

        <article className="conflict-detail glass">
          <div className="detail-top">
            <div>
              <span className="pill">{selected.type || 'Конфликт'}</span>
              <h2>{selected.name}</h2>
              <p>{selected.years} • {selected.region}</p>
            </div>
            <Swords size={54} />
          </div>

          {selected.parties?.length > 0 && (
            <>
              <h4>Участники</h4>
              <div className="parties">{selected.parties.map((party) => <span key={party}>{party}</span>)}</div>
            </>
          )}

          {selected.summary && (
            <>
              <h4>Кратко</h4>
              <p className="dossier-summary">{selected.summary}</p>
            </>
          )}

          {selected.impact && (
            <>
              <h4>Историческое значение</h4>
              <p>{selected.impact}</p>
            </>
          )}

          {selected.causes?.length > 0 && (
            <>
              <h4>Причины</h4>
              <div className="factor-grid">
                {selected.causes.slice(0, 3).map((cause) => (
                  <div className="factor-card cause" key={cause.kind}><b>{cause.kind}</b><p>{cause.text}</p></div>
                ))}
              </div>
            </>
          )}

          {selected.outcomes?.length > 0 && (
            <>
              <h4>Последствия</h4>
              <div className="factor-grid">
                {selected.outcomes.slice(0, 3).map((outcome) => (
                  <div className="factor-card outcome" key={outcome.kind}><b>{outcome.kind}</b><p>{outcome.text}</p></div>
                ))}
              </div>
            </>
          )}

          {selected.learn?.length > 0 && (
            <>
              <h4>Что изучить</h4>
              <ol>{selected.learn.map((item) => <li key={item}>{item}</li>)}</ol>
            </>
          )}

          {selected.factCheck?.length > 0 && (
            <>
              <h4>Проверка утверждений{mythCount > 0 ? ` (разобрано мифов: ${mythCount})` : ''}</h4>
              <div className="fact-list compact-facts">
                {selected.factCheck.slice(0, 3).map((fact) => (
                  <div className="fact-row" key={fact.claim}>
                    <div><b>{fact.claim}</b><p>{fact.explanation}</p></div>
                    <ReliabilityChip value={fact.assessment} />
                  </div>
                ))}
              </div>
            </>
          )}

          <button className="dossier-button" onClick={() => go(`/dossier/${encodeURIComponent(selected.id)}`)}>
            Открыть полное досье конфликта <ArrowUpRight size={15} />
          </button>
        </article>
      </div>
    </section>
  );
}
