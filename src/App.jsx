import { useEffect, useState } from 'react';
import {
  BookMarked, Compass, Flag, Globe2, Library, Menu, Moon, Search, Settings,
  Sun, Swords, Timeline, WifiOff, X,
} from 'lucide-react';
import { getHealth } from './api/client';
import HomePage from './pages/HomePage';
import SearchPage from './pages/SearchPage';
import ErasPage from './pages/ErasPage';
import CountriesPage from './pages/CountriesPage';
import ConflictsPage from './pages/ConflictsPage';
import SourcesPage from './pages/SourcesPage';
import SavedPage from './pages/SavedPage';
import SettingsPage from './pages/SettingsPage';
import DossierPage from './pages/DossierPage';
import { useTheme } from './hooks/useTheme';
import { useSaved } from './hooks/useSaved';
import { currentPath, navigate, onRouteChange, parsePath } from './router';

export const nav = [
  { id: 'home', label: 'Главная', icon: Compass, path: '/' },
  { id: 'explore', label: 'Поиск', icon: Search, path: '/search' },
  { id: 'eras', label: 'Эпохи', icon: Timeline, path: '/eras' },
  { id: 'countries', label: 'Страны', icon: Flag, path: '/countries' },
  { id: 'conflicts', label: 'Конфликты', icon: Swords, path: '/conflicts' },
  { id: 'sources', label: 'Источники', icon: Library, path: '/sources' },
  { id: 'saved', label: 'Сохранённое', icon: BookMarked, path: '/saved' },
  { id: 'settings', label: 'Настройки', icon: Settings, path: '/settings' },
];

const routeMap = Object.fromEntries(nav.map((item) => [item.id, item.path]));
const pageByPath = Object.fromEntries(nav.map((item) => [item.path, item.id]));

const bottomNav = ['home', 'explore', 'saved', 'settings'];

/**
 * Research mode chosen on the home screen: `quick` opens a compact briefing,
 * `deep` the full dossier overview and `academic` jumps straight to sources.
 */
const RESEARCH_MODES = {
  quick: { tab: 'overview', depth: 'quick' },
  deep: { tab: 'overview', depth: 'deep' },
  academic: { tab: 'sources', depth: 'deep' },
};

export function parseRoute(search = '') {
  const raw = parsePath(currentPath(), search);
  if (raw.page === 'dossier') return raw;
  return { ...raw, page: pageByPath[raw.page] || 'home' };
}

export function ConnectionBadge({ go }) {
  const [state, setState] = useState({ status: 'checking', label: 'Проверяем сеть…' });

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const health = await getHealth();
        if (!alive) return;
        const network = health.network;
        setState({
          status: network?.proxyUri ? 'ok' : 'idle',
          label: network ? `Backend • ${network.shortLabel || network.label}` : 'Backend подключён',
        });
      } catch {
        if (alive) setState({ status: 'offline', label: 'Офлайн-режим' });
      }
    };
    check();
    const timer = setInterval(check, 60_000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  return (
    <button
      className={`conn-badge ${state.status === 'offline' ? 'bad' : state.status === 'ok' ? 'ok' : ''}`}
      onClick={() => go('settings')}
      title="Состояние подключения. Нажмите, чтобы открыть настройки."
    >
      {state.status === 'offline' ? <WifiOff size={14} /> : <span className="status-dot" />}
      {state.label}
    </button>
  );
}

export function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  return (
    <button className="icon-button" onClick={toggle} aria-label="Переключить тему" title="Переключить тему">
      {resolved === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

export default function App() {
  const [route, setRoute] = useState(() => parseRoute(window.location.search));
  const [mobileOpen, setMobileOpen] = useState(false);
  const { items: savedItems } = useSaved();
  const isDossier = route.page === 'dossier';

  useEffect(() => onRouteChange((_path, search) => setRoute(parseRoute(search))), []);

  const go = (target) => {
    navigate(routeMap[target] || target);
    setRoute(parseRoute(''));
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className={`app-shell ${isDossier ? 'dossier-mode' : ''}`}>
      <div className="orb orb-a" />
      <div className="orb orb-b" />

      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <button className="close-mobile" onClick={() => setMobileOpen(false)} aria-label="Закрыть меню">
          <X size={20} />
        </button>
        <div className="brand" onClick={() => go('home')} role="button" tabIndex={0}>
          <div className="brand-mark"><Globe2 size={26} /></div>
          <div className="brand-copy">
            <strong>WorldHistory</strong>
            <span>Atlas & Research</span>
          </div>
        </div>
        <nav aria-label="Основная навигация">
          {nav.map(({ id, label, icon: Icon }) => (
            <button key={id} className={route.page === id ? 'active' : ''} onClick={() => go(id)} title={label}>
              <Icon size={18} />
              <span>{label}</span>
              {id === 'saved' && savedItems.length > 0 && <em className="nav-count">{savedItems.length}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-card">
          <Compass size={20} />
          <b>Метод</b>
          <p>Сопоставляем энциклопедии, архивы и научные публикации, разделяем факты, интерпретации и позиции сторон.</p>
        </div>
      </aside>

      {mobileOpen && <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-hidden="true" />}

      <main>
        <header className="topbar">
          <button className="menu icon-button" onClick={() => setMobileOpen(true)} aria-label="Открыть меню"><Menu /></button>
          <div className="topbar-title">История мира • страны • войны • источники</div>
          <div className="topbar-actions">
            <ConnectionBadge go={go} />
            <ThemeToggle />
          </div>
        </header>

        {route.page === 'home' && <HomePage go={go} />}
        {route.page === 'explore' && <SearchPage key="search" go={go} initialQuery={route.query || ''} />}
        {route.page === 'eras' && <ErasPage go={go} />}
        {route.page === 'countries' && <CountriesPage go={go} />}
        {route.page === 'conflicts' && <ConflictsPage go={go} />}
        {route.page === 'sources' && <SourcesPage go={go} />}
        {route.page === 'saved' && <SavedPage go={go} />}
        {route.page === 'settings' && <SettingsPage />}
        {route.page === 'dossier' && (
          <DossierPage
            key={route.dossierId}
            dossierId={route.dossierId}
            go={go}
            initialTab={(RESEARCH_MODES[route.mode] || RESEARCH_MODES.deep).tab}
            depth={(RESEARCH_MODES[route.mode] || RESEARCH_MODES.deep).depth}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="Быстрая навигация">
        {bottomNav.map((id) => {
          const item = nav.find((entry) => entry.id === id);
          const Icon = item.icon;
          return (
            <button key={id} className={route.page === id ? 'active' : ''} onClick={() => go(id)}>
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
        <button onClick={() => setMobileOpen(true)} aria-label="Открыть меню">
          <Menu size={20} />
          <span>Меню</span>
        </button>
      </nav>
    </div>
  );
}
