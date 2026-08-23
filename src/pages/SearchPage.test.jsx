// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SearchPage from './SearchPage';

const payload = {
  query: 'Косово',
  mode: 'live-multi-source',
  results: [
    {
      id: 'wiki:Косово',
      title: 'Косово',
      kind: 'Энциклопедия',
      summary: 'Регион на Балканах.',
      sourceUrl: 'https://ru.wikipedia.org/wiki/Косово',
      sourceName: 'Wikipedia',
    },
    {
      id: 'openalex:W1',
      title: 'Kosovo study',
      kind: 'Научная публикация',
      summary: 'A study.',
      sourceUrl: 'https://doi.org/10.1/x',
      sourceName: 'OpenAlex',
    },
  ],
  providerStatus: [
    { id: 'wikipedia', label: 'Wikipedia', ok: true, count: 1 },
    { id: 'openalex', label: 'OpenAlex', ok: false, count: 0, error: 'сеть сброшена' },
  ],
  network: { shortLabel: 'напрямую' },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SearchPage', () => {
  it('renders provider status chips with clickable logo badges', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    }));
    render(<SearchPage go={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Найдено:')).toBeInTheDocument());

    const wikiBadge = screen.getByRole('link', { name: 'Открыть источник: Wikipedia' });
    expect(wikiBadge).toHaveAttribute('href', 'https://ru.wikipedia.org/wiki/Косово');
    const alexBadge = screen.getByRole('link', { name: 'Открыть источник: OpenAlex' });
    expect(alexBadge).toHaveAttribute('href', 'https://doi.org/10.1/x');
    // The old visible text link must be gone — only the logo icon remains.
    expect(screen.queryByText(/Открыть источник/i)).not.toBeInTheDocument();

    expect(screen.getByTitle('Wikipedia: найдено 1')).toBeInTheDocument();
    expect(screen.getByTitle(/OpenAlex: сеть сброшена/)).toBeInTheDocument();
  });

  it('keeps the build-dossier button directly under the search input', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...payload, results: [] }),
    }));
    render(<SearchPage go={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Найдено:')).toBeInTheDocument());

    const console = document.querySelector('.search-console');
    const input = console.querySelector('.search-input');
    const button = screen.getByRole('button', { name: /Построить досье/ });
    const filters = console.querySelector('.filters');

    expect(console).toContainElement(input);
    expect(console).toContainElement(button);
    expect(console).toContainElement(filters);
    // order: input -> dossier button -> filters
    expect(input.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button.compareDocumentPosition(filters) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
