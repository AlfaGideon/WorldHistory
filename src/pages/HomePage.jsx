import { useMemo, useState } from 'react';
import {
  ArrowRight, BookMarked, Compass, GraduationCap, Layers, Library,
  Search, ShieldCheck, Sparkles,
} from 'lucide-react';
import { allCuratedSources } from '../data/sources';
import { countriesWithDossiers, erasWithDossiers, conflictsWithDossiers, studyPaths } from '../data';
import { featuredTopics } from '../data';

const EXAMPLES = [
  'Первая мировая война', 'Китай', 'Древний мир', 'Холодная война',
  'Франция', 'Столетняя война', 'Индия', 'Средневековье', 'Япония', 'Египет',
];

const MODES = [
  { id: 'quick', label: 'Быстрый обзор', icon: Sparkles, text: 'Краткая карточка: что это, даты, участники, итог.' },
  { id: 'deep', label: 'Глубокое исследование', icon: Layers, text: 'Причины, последствия, хронология, стороны и проверка фактов.' },
  { id: 'academic', label: 'Академический режим', icon: GraduationCap, text: 'Акцент на научные публикации, архивы и первоисточники.' },
];

const METHOD = [
  { icon: Library, title: 'Сопоставление источников', text: 'Один источник не доказывает ничего: мы показываем, где утверждение подтверждено, а где это позиция стороны.' },
  { icon: ShieldCheck, title: 'Прозрачная достоверность', text: 'Каждый материал помечен типом, уровнем доверия и возможной заинтересованностью.' },
  { icon: Search, title: 'Проверка популярных мифов', text: 'Отдельный раздел разбирает распространённые заблуждения и объясняет, почему они неверны.' },
];

export default function HomePage({ go }) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('deep');

  const stats = useMemo(() => {
    const deepCountries = countriesWithDossiers.filter((item) => item.keyMoments?.length).length;
    const deepConflicts = conflictsWithDossiers.filter((item) => item.factCheck?.length).length;
    return [
      { value: String(erasWithDossiers.length), label: 'эпох с разбором' },
      { value: String(deepCountries), label: 'глубоких досье стран' },
      { value: String(deepConflicts), label: 'военных конфликтов' },
      { value: String(allCuratedSources.length), label: 'проверенных источников' },
      { value: String(countriesWithDossiers.length), label: 'стран в каталоге' },
    ];
  }, []);

  const openDossier = (value, researchMode = mode) => {
    const topic = String(value || '').trim();
    if (!topic) return;
    go(`/dossier/${encodeURIComponent(topic)}?mode=${researchMode}`);
  };

  const submit = (event) => {
    event.preventDefault();
    openDossier(query);
  };

  const openExample = (value) => {
    setQuery(value);
    openDossier(value);
  };

  return (
    <section className="page home">
      <div className="hero glass">
        <div className="hero-copy">
          <span className="eyebrow"><Compass size={16} /> цифровой атлас мировой истории</span>
          <h1>Любая тема — как настоящее историческое досье.</h1>
          <p>
            Введите страну, эпоху, войну, процесс или спорный вопрос. Система соберёт причины, последствия,
            хронологию, позиции сторон и проверит популярные мифы по энциклопедиям, архивам и научным публикациям.
          </p>

          <form className="hero-search" onSubmit={submit}>
            <div className="hero-search-input">
              <Search size={22} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Например: Первая мировая война, Китай, Косово, деколонизация"
                aria-label="Историческая тема"
              />
              {query && (
                <button type="button" className="clear-input" onClick={() => setQuery('')} aria-label="Очистить">×</button>
              )}
            </div>
            <button className="primary" type="submit" disabled={!query.trim()}>
              <Sparkles size={18} /> Построить досье
            </button>
          </form>

          <div className="mode-row" role="radiogroup" aria-label="Режим исследования">
            {MODES.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={mode === item.id}
                  className={`mode-chip ${mode === item.id ? 'active' : ''}`}
                  onClick={() => setMode(item.id)}
                  title={item.text}
                >
                  <Icon size={16} /> {item.label}
                </button>
              );
            })}
          </div>

          <div className="quick-tags">
            {EXAMPLES.map((word) => (
              <button key={word} type="button" onClick={() => openExample(word)}>#{word}</button>
            ))}
          </div>
        </div>

        <aside className="hero-panel">
          <div className="stat-grid">
            {stats.map((stat) => (
              <div className="stat" key={stat.label}>
                <b>{stat.value}</b>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
          <div className="hero-note glass soft">
            <ShieldCheck size={20} />
            <div>
              <b>Правило проекта</b>
              <p>Никаких выдуманных фактов. Если источник недоступен, приложение показывает структуру исследования и честно сообщает, что данных нет.</p>
            </div>
          </div>
        </aside>
      </div>

      <div className="section-head">
        <div>
          <span className="eyebrow">готовые глубокие досье</span>
          <h2>Начните с разобранных тем</h2>
        </div>
        <button className="ghost" onClick={() => go('explore')}>Весь каталог <ArrowRight size={16} /></button>
      </div>

      <div className="topic-grid">
        {featuredTopics.map((topic) => (
          <button
            key={`${topic.kind}-${topic.id}`}
            className="topic-card glass"
            onClick={() => go(`/dossier/${encodeURIComponent(topic.id)}`)}
          >
            <span className="pill">{topic.kind}</span>
            <b>{topic.flag ? `${topic.flag} ` : ''}{topic.title}</b>
            <em>{topic.blurb}</em>
            <ArrowRight size={16} />
          </button>
        ))}
      </div>

      <div className="section-head">
        <div>
          <span className="eyebrow">маршруты обучения</span>
          <h2>Из хаоса фактов — в понятные траектории</h2>
        </div>
        <button className="ghost" onClick={() => go('sources')}>Каталог источников</button>
      </div>
      <div className="paths-grid">
        {studyPaths.map((path) => (
          <article className="path-card glass" key={path.title}>
            <span className="pill">{path.level}</span>
            <h3>{path.title}</h3>
            <ol>{path.steps.map((step) => <li key={step}>{step}</li>)}</ol>
          </article>
        ))}
      </div>

      <div className="feature-grid">
        {METHOD.map(({ icon: Icon, title, text }) => (
          <article className="feature-card" key={title}>
            <Icon size={24} />
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>

      <div className="home-cta glass">
        <div>
          <span className="eyebrow"><BookMarked size={16} /> сохраняйте и читайте офлайн</span>
          <h3>Ваши исследования остаются на устройстве</h3>
          <p>Сохранённые досье и кэш материалов хранятся локально — они доступны без сети, в том числе в мобильном приложении.</p>
        </div>
        <div className="home-cta-actions">
          <button className="primary" onClick={() => go('explore')}><Search size={18} /> Открыть исследователь</button>
          <button className="secondary" onClick={() => go('saved')}><BookMarked size={18} /> Сохранённое</button>
        </div>
      </div>
    </section>
  );
}
