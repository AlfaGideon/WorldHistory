import { useMemo, useState } from 'react';
import { ArrowUpRight, Flag, Search, ShieldCheck } from 'lucide-react';
import PageTitle from '../components/PageTitle';
import { countriesWithDossiers } from '../data';

const PAGE_SIZE = 48;

export default function CountriesPage({ go }) {
  const [region, setRegion] = useState('Все');
  const [onlyDeep, setOnlyDeep] = useState(false);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const regions = useMemo(
    () => ['Все', ...new Set(countriesWithDossiers.map((item) => item.region))].sort((a, b) => a.localeCompare(b, 'ru')),
    [],
  );

  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return countriesWithDossiers.filter((country) => {
      if (region !== 'Все' && country.region !== region) return false;
      if (onlyDeep && !country.keyMoments?.length) return false;
      if (needle && !`${country.name} ${country.core} ${(country.topics || []).join(' ')}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [region, onlyDeep, query]);

  const deepCount = useMemo(() => countriesWithDossiers.filter((item) => item.keyMoments?.length).length, []);

  return (
    <section className="page">
      <PageTitle
        icon={Flag}
        eyebrow="история стран"
        title="Национальные истории в мировом контексте"
        text={`Каталог содержит ${countriesWithDossiers.length} государств и территорий. ${deepCount} из них снабжены полным досье: причины, последствия, хронология, историографические школы и проверка мифов.`}
      />

      <div className="catalog-controls glass">
        <div className="search-input compact">
          <Search size={18} />
          <input value={query} onChange={(event) => { setQuery(event.target.value); setLimit(PAGE_SIZE); }} placeholder="Поиск по названию или теме" aria-label="Поиск страны" />
        </div>
        <label className="switch">
          <input type="checkbox" checked={onlyDeep} onChange={(event) => { setOnlyDeep(event.target.checked); setLimit(PAGE_SIZE); }} />
          <span><ShieldCheck size={14} /> только глубокие досье</span>
        </label>
      </div>

      <div className="filters country-filter">
        {regions.map((item) => (
          <button key={item} className={region === item ? 'active' : ''} onClick={() => { setRegion(item); setLimit(PAGE_SIZE); }}>{item}</button>
        ))}
      </div>

      <div className="country-grid">
        {list.slice(0, limit).map((country) => {
          const deep = Boolean(country.keyMoments?.length);
          return (
            <article className={`country-card glass ${deep ? 'is-deep' : ''}`} key={country.id}>
              <button className="country-card-link" onClick={() => go(`/dossier/${encodeURIComponent(country.id)}`)} aria-label={`Открыть досье ${country.name}`}>
                <div className="country-flag">{country.flag}</div>
                <span>{country.region}</span>
                <h3>{country.name}</h3>
                <b>{country.timeline}</b>
                <p>{country.summary || country.core}</p>
                <div className="chips">{(country.topics || []).slice(0, 5).map((item) => <em key={item}>{item}</em>)}</div>
                <span className={`card-cta ${deep ? 'deep' : ''}`}>
                  {deep ? 'Открыть глубокое досье' : 'Построить досье'} <ArrowUpRight size={14} />
                </span>
              </button>
            </article>
          );
        })}
      </div>

      {list.length > limit && (
        <div className="load-more">
          <button className="secondary" onClick={() => setLimit((current) => current + PAGE_SIZE)}>
            Показать ещё ({list.length - limit})
          </button>
        </div>
      )}

      {!list.length && (
        <div className="empty-state glass">Ничего не найдено. Попробуйте изменить регион или сбросить фильтры.</div>
      )}
    </section>
  );
}
