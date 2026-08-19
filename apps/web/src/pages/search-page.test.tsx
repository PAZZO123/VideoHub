import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import SearchPage from './search-page';

const search = vi.fn();

vi.mock('@/services/catalog.service', () => ({
  searchService: {
    search: (...args: unknown[]) => search(...args),
    suggest: vi.fn(),
  },
}));

const EMPTY = { movies: [], videos: [], totalMovies: 0, totalVideos: 0 };

describe('SearchPage', () => {
  beforeEach(() => {
    search.mockReset();
    search.mockResolvedValue(EMPTY);
  });

  it('prompts before enough characters are typed, and issues no request', async () => {
    renderWithProviders(<SearchPage />);

    await userEvent.type(screen.getByLabelText(/search movies and videos/i), 'a');

    expect(screen.getByText(/what are you looking for/i)).toBeInTheDocument();
    expect(search).not.toHaveBeenCalled();
  });

  it('debounces to a single request while typing', async () => {
    renderWithProviders(<SearchPage />);

    await userEvent.type(screen.getByLabelText(/search movies and videos/i), 'interstellar');

    await waitFor(() => expect(search).toHaveBeenCalled());
    // Twelve keystrokes must not become twelve requests.
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('interstellar');
  });

  it('reports when a query matches nothing', async () => {
    renderWithProviders(<SearchPage />);

    await userEvent.type(screen.getByLabelText(/search movies and videos/i), 'zzzznotathing');

    expect(await screen.findByText(/no results for/i)).toBeInTheDocument();
  });

  it('renders results grouped by kind', async () => {
    search.mockResolvedValue({
      movies: [
        {
          id: 'm1',
          slug: 'interstellar',
          title: 'Interstellar',
          overview: null,
          posterUrl: null,
          backdropUrl: null,
          releaseYear: 2014,
          runtimeMinutes: 169,
          rating: 8.7,
          language: 'en',
          maturityRating: 'TEEN',
          genres: [],
          trendingScore: 10,
          popularity: 5,
        },
      ],
      videos: [],
      totalMovies: 1,
      totalVideos: 0,
    });

    renderWithProviders(<SearchPage />);
    await userEvent.type(screen.getByLabelText(/search movies and videos/i), 'interstellar');

    expect(await screen.findByRole('heading', { name: /^Movies/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Interstellar' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^Videos/ })).not.toBeInTheDocument();
  });

  it('seeds the field from the URL query', () => {
    renderWithProviders(<SearchPage />, { route: '/search?q=dune' });
    expect(screen.getByLabelText(/search movies and videos/i)).toHaveValue('dune');
  });
});
