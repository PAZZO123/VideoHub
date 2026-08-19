import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import HomePage from './home-page';

const navigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

// The homepage now includes Continue Watching, which reads auth context.
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ isAuthenticated: false, user: null, isAdmin: false, isLoading: false }),
}));

vi.mock('@/services/library.service', () => ({
  historyService: { continueWatching: vi.fn().mockResolvedValue([]) },
  watchlistService: { savedIds: vi.fn().mockResolvedValue([]) },
}));

// The homepage rails each fire a query; stub the service layer so these tests
// cover the page itself rather than the network.
vi.mock('@/services/catalog.service', () => ({
  moviesService: { list: vi.fn().mockResolvedValue({ items: [], meta: {} }) },
  videosService: { list: vi.fn().mockResolvedValue({ items: [], meta: {} }) },
  trendingService: { list: vi.fn().mockResolvedValue([]) },
  taxonomyService: {
    genres: vi.fn().mockResolvedValue([]),
    categories: vi.fn().mockResolvedValue([]),
  },
  searchService: { suggest: vi.fn(), search: vi.fn() },
}));

describe('HomePage', () => {
  beforeEach(() => {
    navigate.mockClear();
  });

  it('renders the hero headline', () => {
    renderWithProviders(<HomePage />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(/Discover/);
    expect(heading).toHaveTextContent(/Enjoy/);
  });

  it('sends a search to the results page', async () => {
    renderWithProviders(<HomePage />);

    await userEvent.type(screen.getByLabelText(/search movies and videos/i), 'interstellar');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(navigate).toHaveBeenCalledWith('/search?q=interstellar');
  });

  it('ignores a whitespace-only search', async () => {
    renderWithProviders(<HomePage />);

    await userEvent.type(screen.getByLabelText(/search movies and videos/i), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(navigate).not.toHaveBeenCalled();
  });

  it('surfaces the Ibitente kids entry point', () => {
    renderWithProviders(<HomePage />);
    expect(screen.getByRole('heading', { name: 'Ibitente' })).toBeInTheDocument();
  });

  it('links to the AI assistant', () => {
    renderWithProviders(<HomePage />);
    expect(screen.getByRole('link', { name: /start a conversation/i })).toHaveAttribute(
      'href',
      '/ai',
    );
  });

  it('hides rails that resolve empty rather than showing bare headings', async () => {
    renderWithProviders(<HomePage />);

    // While pending a rail shows its title over skeletons; once every stubbed
    // query resolves empty, the rail should remove itself entirely.
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Trending Now' })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: 'Popular Movies' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Videos' })).not.toBeInTheDocument();
  });
});
