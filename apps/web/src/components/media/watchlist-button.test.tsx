import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MediaKind } from '@videohub/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { WatchlistButton } from './watchlist-button';

const savedIds = vi.fn();
const add = vi.fn();
const removeByMedia = vi.fn();
const navigate = vi.fn();

vi.mock('@/services/library.service', () => ({
  watchlistService: {
    savedIds: (...args: unknown[]) => savedIds(...args),
    add: (...args: unknown[]) => add(...args),
    removeByMedia: (...args: unknown[]) => removeByMedia(...args),
  },
  historyService: {},
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

let authenticated = true;
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ isAuthenticated: authenticated }),
}));

describe('WatchlistButton', () => {
  beforeEach(() => {
    authenticated = true;
    savedIds.mockReset().mockResolvedValue([]);
    add.mockReset().mockResolvedValue({});
    removeByMedia.mockReset().mockResolvedValue({ removed: true });
    navigate.mockReset();
  });

  it('offers to add when the title is not saved', async () => {
    renderWithProviders(<WatchlistButton kind={MediaKind.MOVIE} mediaId="m1" />);

    const button = await screen.findByRole('button', { name: /add to watchlist/i });
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows the saved state when the title is already in the list', async () => {
    savedIds.mockResolvedValue(['m1']);

    renderWithProviders(<WatchlistButton kind={MediaKind.MOVIE} mediaId="m1" />);

    const button = await screen.findByRole('button', { name: /in your watchlist/i });
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('flips to saved immediately on click, before the request resolves', async () => {
    // Never resolves: proves the update is optimistic rather than a refetch.
    add.mockReturnValue(new Promise(() => {}));

    renderWithProviders(<WatchlistButton kind={MediaKind.MOVIE} mediaId="m1" />);
    await userEvent.click(await screen.findByRole('button', { name: /add to watchlist/i }));

    expect(await screen.findByRole('button', { name: /in your watchlist/i })).toBeInTheDocument();
  });

  it('sends the movie id under movieId for a MOVIE', async () => {
    renderWithProviders(<WatchlistButton kind={MediaKind.MOVIE} mediaId="m1" />);
    await userEvent.click(await screen.findByRole('button', { name: /add to watchlist/i }));

    await waitFor(() =>
      expect(add).toHaveBeenCalledWith({ kind: MediaKind.MOVIE, movieId: 'm1' }),
    );
  });

  it('sends the video id under videoId for a VIDEO', async () => {
    renderWithProviders(<WatchlistButton kind={MediaKind.VIDEO} mediaId="v1" />);
    await userEvent.click(await screen.findByRole('button', { name: /add to watchlist/i }));

    await waitFor(() =>
      expect(add).toHaveBeenCalledWith({ kind: MediaKind.VIDEO, videoId: 'v1' }),
    );
  });

  it('removes when clicked while saved', async () => {
    savedIds.mockResolvedValue(['m1']);

    renderWithProviders(<WatchlistButton kind={MediaKind.MOVIE} mediaId="m1" />);
    await userEvent.click(await screen.findByRole('button', { name: /in your watchlist/i }));

    await waitFor(() => expect(removeByMedia).toHaveBeenCalledWith(MediaKind.MOVIE, 'm1'));
    expect(add).not.toHaveBeenCalled();
  });

  it('rolls back to unsaved when the request fails', async () => {
    add.mockRejectedValue(new Error('network down'));

    renderWithProviders(<WatchlistButton kind={MediaKind.MOVIE} mediaId="m1" />);
    await userEvent.click(await screen.findByRole('button', { name: /add to watchlist/i }));

    // Optimistically saved, then reverted once the failure lands.
    expect(
      await screen.findByRole('button', { name: /add to watchlist/i }),
    ).toBeInTheDocument();
  });

  it('sends a signed-out visitor to sign in instead of failing silently', async () => {
    authenticated = false;

    renderWithProviders(<WatchlistButton kind={MediaKind.MOVIE} mediaId="m1" />);
    await userEvent.click(screen.getByRole('button', { name: /add to watchlist/i }));

    expect(navigate).toHaveBeenCalledWith('/login', expect.objectContaining({ state: expect.any(Object) }));
    expect(add).not.toHaveBeenCalled();
  });
});
