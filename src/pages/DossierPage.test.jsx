// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DossierPage from './DossierPage';

afterEach(cleanup);

describe('DossierPage', () => {
  it('shows an infobox and switches between dossier sections', () => {
    render(<DossierPage dossierId="first-chechen-war" go={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Первая чеченская война' })).toBeInTheDocument();
    expect(screen.getByText('Уверенность')).toBeInTheDocument();
    expect(screen.getByText('Что известно точно')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Хронология/ }));
    expect(screen.getByText('Хасавюртовские соглашения')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Спорное/ }));
    expect(screen.getByText('Мифы и упрощения')).toBeInTheDocument();
    expect(screen.getByText('Только одна сторона совершала нарушения.')).toBeInTheDocument();
  });
});
