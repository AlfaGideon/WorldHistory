// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

/**
 * Smoke test for the whole shell: every route must render without a backend
 * and without the network — exactly the situation of the packaged mobile app
 * on first launch.
 */
const goTo = (path) => window.history.pushState({}, '', path);

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  vi.stubGlobal('matchMedia', undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  goTo('/');
});

describe('App shell without a backend', () => {
  const routes = [
    ['/', /Любая тема/],
    ['/eras', /Эпохи мировой истории/],
    ['/conflicts', /Истории военных конфликтов/],
    ['/sources', /Каталог источников/],
    ['/saved', /Сохранённые исследования/],
    ['/settings', /Настройки/],
    ['/dossier/ru', /Россия/],
    ['/unknown-page', /Любая тема/],
  ];

  for (const [path, matcher] of routes) {
    it(`renders ${path}`, () => {
      goTo(path);
      render(<App />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(matcher);
    });
  }

  it('shows the offline connection state and keeps the curated dossier readable', async () => {
    goTo('/dossier/ru');
    render(<App />);
    await waitFor(() => expect(screen.getByText('Офлайн-режим')).toBeInTheDocument());
    expect(screen.getByText('Уверенность')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Сохранить/ })).toBeInTheDocument();
  });
});
