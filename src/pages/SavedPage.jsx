import { BookMarked, ExternalLink, Trash2 } from 'lucide-react';
import PageTitle from '../components/PageTitle';
import { useSaved } from '../hooks/useSaved';
import { clearSaved } from '../services/savedStore';

const formatDate = (ms) => {
  if (!ms) return '';
  const date = new Date(Number(ms));
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export default function SavedPage({ go }) {
  const { items, toggle } = useSaved();

  return (
    <section className="page">
      <PageTitle
        icon={BookMarked}
        eyebrow="ваша библиотека"
        title="Сохранённые исследования"
        text="Сохранённые досье хранятся на устройстве: они открываются без сети, в том числе в мобильном приложении."
        actions={items.length > 0 ? (
          <button className="ghost small" onClick={clearSaved}><Trash2 size={15} /> Очистить всё</button>
        ) : null}
      />

      {items.length === 0 ? (
        <div className="empty-state glass">
          <BookMarked size={22} />
          <p>Пока ничего не сохранено. Откройте любое досье и нажмите «Сохранить» — оно появится здесь.</p>
          <button className="primary" onClick={() => go('explore')}>Перейти в поиск</button>
        </div>
      ) : (
        <div className="saved-grid">
          {items.map((item) => (
            <article className="saved-card glass" key={item.id}>
              <button className="saved-card-main" onClick={() => go(item.path || `/dossier/${encodeURIComponent(item.id)}`)}>
                <span className="pill">{item.kind || 'досье'}</span>
                <b>{item.title}</b>
                <em>сохранено {formatDate(item.savedAt)}</em>
                <ExternalLink size={15} />
              </button>
              <button className="ghost small danger" onClick={() => toggle(item)} aria-label="Убрать из сохранённых">
                <Trash2 size={15} />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
