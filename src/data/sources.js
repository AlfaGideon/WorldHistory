/**
 * Curated catalogue of trusted historical sources. Every entry carries a
 * type, a reliability level and a possible stance/interest, so the UI can
 * explain *why* a source deserves trust and where its bias may lie.
 */

export const sourceTypes = [
  { id: 'encyclopedia', label: 'Энциклопедия', hint: 'Хорошая отправная точка для ориентации в теме.' },
  { id: 'archive', label: 'Архив / первоисточник', hint: 'Документы, карты, рукописи — база для доказательств.' },
  { id: 'academic', label: 'Академический', hint: 'Рецензируемые исследования и научная литература.' },
  { id: 'museum', label: 'Музей / наследие', hint: 'Артефакты, коллекции и экспертные описания.' },
  { id: 'data', label: 'Данные и статистика', hint: 'Измеримые ряды для проверки утверждений.' },
  { id: 'human-rights', label: 'Правозащитный', hint: 'Фиксирует нарушения прав; проверяйте методику.' },
  { id: 'state', label: 'Государственный', hint: 'Официальная позиция — обязательно помечайте как позицию стороны.' },
  { id: 'press', label: 'Пресса', hint: 'Оперативные сообщения; требует перекрёстной проверки.' },
];

export const reliabilityLevels = [
  { id: 'high', label: 'высокая', hint: 'Рецензирование, прозрачная методика, воспроизводимые данные.' },
  { id: 'medium-high', label: 'средне-высокая', hint: 'Авторитетная редактура, но спорные детали нужно проверять.' },
  { id: 'medium', label: 'средняя', hint: 'Полезно как навигатор по ссылкам, но не как окончательное доказательство.' },
  { id: 'position', label: 'позиция стороны', hint: 'Материал отражает интересы государства или организации.' },
  { id: 'unknown', label: 'требует оценки', hint: 'Недостаточно данных: проверьте автора, дату, методику и источники.' },
];

export const curatedSources = [
  {
    title: 'Энциклопедии и справочники',
    icon: 'library',
    items: [
      { name: 'World History Encyclopedia', url: 'https://www.worldhistory.org/', type: 'encyclopedia', reliability: 'high', stance: 'научно-просветительская', note: 'Рецензируемые статьи с картами и библиографией; удобная точка входа в тему.' },
      { name: 'Encyclopædia Britannica', url: 'https://www.britannica.com/', type: 'encyclopedia', reliability: 'medium-high', stance: 'обзорная нейтральная', note: 'Проверенные обзоры и биографии; для спорных деталей недостаточно.' },
      { name: 'Internet Encyclopedia of Ukraine', url: 'https://www.encyclopediaofukraine.com/', type: 'encyclopedia', reliability: 'high', stance: 'региональная академическая', note: 'Глубокая региональная история Восточной Европы.' },
    ],
  },
  {
    title: 'Архивы и первоисточники',
    icon: 'archive',
    items: [
      { name: 'Perseus Digital Library (Tufts)', url: 'https://www.perseus.tufts.edu/', type: 'archive', reliability: 'high', stance: 'академический корпус текстов', note: 'Оригиналы и переводы античных авторов со словарями.' },
      { name: 'Internet History Sourcebooks (Fordham)', url: 'https://sourcebooks.fordham.edu/', type: 'archive', reliability: 'high', stance: 'университетская хрестоматия', note: 'Античность, Средневековье, Новое время: хроники, хартии, законы.' },
      { name: 'Library of Congress', url: 'https://www.loc.gov/', type: 'archive', reliability: 'high', stance: 'государственный архив', note: 'Документы, карты, фотографии, оцифрованная пресса.' },
      { name: 'National Archives (США)', url: 'https://www.archives.gov/', type: 'archive', reliability: 'high', stance: 'государственный архив', note: 'Официальные документы и образовательные коллекции.' },
      { name: 'Europeana', url: 'https://www.europeana.eu/', type: 'archive', reliability: 'high', stance: 'культурное наследие ЕС', note: 'Миллионы оцифрованных материалов музеев и библиотек Европы.' },
      { name: 'Gallica (Национальная библиотека Франции)', url: 'https://gallica.bnf.fr/', type: 'archive', reliability: 'high', stance: 'государственный архив', note: 'Рукописи, пресса, книги, карты.' },
      { name: 'Древнерусские берестяные грамоты', url: 'http://gramoty.ru/', type: 'archive', reliability: 'high', stance: 'академическая база', note: 'Более 1200 подлинных бытовых документов средневековой Руси.' },
      { name: 'Прожито — корпус дневников', url: 'https://prozhito.org/', type: 'archive', reliability: 'high', stance: 'исследовательский архив', note: 'Личные дневники и воспоминания с поиском по датам.' },
    ],
  },
  {
    title: 'Академические и научные базы',
    icon: 'graduation-cap',
    items: [
      { name: 'OpenAlex', url: 'https://openalex.org/', type: 'academic', reliability: 'high', stance: 'открытая наукометрия', note: 'Более 200 млн научных работ; поиск рецензируемых публикаций.' },
      { name: 'Crossref', url: 'https://www.crossref.org/', type: 'academic', reliability: 'high', stance: 'инфраструктура цитирования', note: 'DOI и метаданные научных публикаций.' },
      { name: 'CORE', url: 'https://core.ac.uk/', type: 'academic', reliability: 'high', stance: 'открытый доступ', note: 'Открытые академические тексты со всего мира.' },
      { name: 'JSTOR Daily', url: 'https://daily.jstor.org/', type: 'academic', reliability: 'medium-high', stance: 'научно-популярные статьи', note: 'Краткие материалы на основе исследований из JSTOR.' },
      { name: '1914-1918-Online', url: 'https://encyclopedia.1914-1918-online.net/', type: 'academic', reliability: 'high', stance: 'рецензируемая энциклопедия', note: 'Международный консорциум историков Первой мировой войны.' },
      { name: 'Chinese Text Project', url: 'https://ctext.org/', type: 'archive', reliability: 'high', stance: 'академическая оцифровка', note: 'Оригиналы и переводы классических текстов Китая.' },
    ],
  },
  {
    title: 'Данные, карты и проверка фактов',
    icon: 'chart',
    items: [
      { name: 'Our World in Data', url: 'https://ourworldindata.org/', type: 'data', reliability: 'high', stance: 'открытые данные (Оксфорд)', note: 'Проверяемые ряды: демография, бедность, войны, энергия, ВВП.' },
      { name: 'Slave Voyages Database', url: 'https://www.slavevoyages.org/', type: 'data', reliability: 'high', stance: 'количественная история', note: 'Архивные записи о более чем 36 000 рейсах работорговли.' },
      { name: 'David Rumsey Map Collection', url: 'https://www.davidrumsey.com/', type: 'museum', reliability: 'high', stance: 'картографический архив', note: 'Исторические карты высокого разрешения.' },
      { name: 'United Nations Digital Library', url: 'https://digitallibrary.un.org/', type: 'data', reliability: 'high', stance: 'международно-правовые документы', note: 'Резолюции, договоры, деколонизация, права человека.' },
      { name: 'Wilson Center Digital Archive', url: 'https://digitalarchive.wilsoncenter.org/', type: 'archive', reliability: 'high', stance: 'рассекреченные архивы', note: 'Документы МИД, ЦК и спецслужб по холодной войне.' },
    ],
  },
  {
    title: 'Музеи и культурное наследие',
    icon: 'landmark',
    items: [
      { name: 'The Metropolitan Museum of Art', url: 'https://www.metmuseum.org/art/collection', type: 'museum', reliability: 'high', stance: 'музейная экспертиза', note: 'Артефакты, эссе и хронологии искусства.' },
      { name: 'Smithsonian', url: 'https://www.si.edu/', type: 'museum', reliability: 'high', stance: 'музейная экспертиза', note: 'Образовательные ресурсы и коллекции.' },
      { name: 'Imperial War Museums', url: 'https://www.iwm.org.uk/collections', type: 'museum', reliability: 'high', stance: 'музей войны', note: 'Документы, техника, свидетельства участников.' },
    ],
  },
];

/** Flat list of every curated source (used for search and cross-links). */
export const allCuratedSources = curatedSources.flatMap((group) =>
  group.items.map((item) => ({ ...item, group: group.title })));
