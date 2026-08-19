import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DownloadAnalysis } from '@videohub/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import DownloadPage from './download-page';

const analyze = vi.fn();
const create = vi.fn();
const sources = vi.fn();

vi.mock('@/services/downloads.service', async () => {
  const actual = await vi.importActual<typeof import('@/services/downloads.service')>(
    '@/services/downloads.service',
  );
  return {
    ...actual,
    downloadsService: {
      analyze: (...args: unknown[]) => analyze(...args),
      create: (...args: unknown[]) => create(...args),
      sources: () => sources(),
      list: vi.fn(),
      get: vi.fn(),
      remove: vi.fn(),
    },
  };
});

let authenticated = true;
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ isAuthenticated: authenticated }),
}));

const REFUSED: DownloadAnalysis = {
  url: 'https://www.netflix.com/watch/1',
  host: 'netflix.com',
  permitted: false,
  refusalReason: 'PROTECTED_CONTENT',
  message:
    'This source protects its content technically and by its terms of service. VideoHub does not bypass those protections.',
  title: null,
  thumbnailUrl: null,
  durationSeconds: null,
  formats: [],
  originalUrl: 'https://www.netflix.com/watch/1',
};

const PERMITTED: DownloadAnalysis = {
  url: 'https://archive.org/download/x.mp4',
  host: 'archive.org',
  permitted: true,
  refusalReason: null,
  message: 'This source permits downloading through VideoHub.',
  title: 'Public Domain Film',
  thumbnailUrl: null,
  durationSeconds: 600,
  formats: [
    {
      formatId: 'source',
      label: 'Original file',
      container: 'video/mp4',
      qualityLabel: null,
      approxSizeBytes: 30_448_117,
    },
  ],
  originalUrl: 'https://archive.org/download/x.mp4',
};

async function submit(url: string): Promise<void> {
  await userEvent.type(screen.getByLabelText(/video url/i), url);
  await userEvent.click(screen.getByRole('button', { name: 'Analyze' }));
}

describe('DownloadPage', () => {
  beforeEach(() => {
    authenticated = true;
    analyze.mockReset();
    create.mockReset();
    sources.mockReset().mockResolvedValue([
      { host: 'archive.org', label: 'Internet Archive', basis: 'Public-domain collections.' },
    ]);
  });

  it('states the policy before the user pastes anything', () => {
    renderWithProviders(<DownloadPage />);
    expect(screen.getByText(/does not bypass DRM/i)).toBeInTheDocument();
  });

  it('lists the authorized sources', async () => {
    renderWithProviders(<DownloadPage />);
    expect(await screen.findByText('Internet Archive')).toBeInTheDocument();
  });

  describe('when a source is refused', () => {
    beforeEach(() => analyze.mockResolvedValue(REFUSED));

    it('explains why rather than just failing', async () => {
      renderWithProviders(<DownloadPage />);
      await submit('https://www.netflix.com/watch/1');

      expect(
        await screen.findByRole('heading', { name: /does not permit downloading/i }),
      ).toBeInTheDocument();
      expect(screen.getByText(/does not bypass those protections/i)).toBeInTheDocument();
    });

    it('always offers a link to the original source', async () => {
      renderWithProviders(<DownloadPage />);
      await submit('https://www.netflix.com/watch/1');

      const link = await screen.findByRole('link', { name: /open original source/i });
      expect(link).toHaveAttribute('href', REFUSED.originalUrl);
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    });

    it('offers no download button at all', async () => {
      renderWithProviders(<DownloadPage />);
      await submit('https://www.netflix.com/watch/1');

      await screen.findByRole('heading', { name: /does not permit downloading/i });
      expect(screen.queryByRole('button', { name: /^download$/i })).not.toBeInTheDocument();
    });
  });

  describe('when a source is permitted', () => {
    beforeEach(() => analyze.mockResolvedValue(PERMITTED));

    it('shows the file details', async () => {
      renderWithProviders(<DownloadPage />);
      await submit('https://archive.org/download/x.mp4');

      expect(await screen.findByText('Public Domain Film')).toBeInTheDocument();
      expect(screen.getByText('archive.org')).toBeInTheDocument();
      expect(screen.getByText('29.0 MB')).toBeInTheDocument();
    });

    it('starts the download when signed in', async () => {
      create.mockResolvedValue({ id: 'd1' });
      renderWithProviders(<DownloadPage />);
      await submit('https://archive.org/download/x.mp4');

      await userEvent.click(await screen.findByRole('button', { name: /^download$/i }));
      await waitFor(() => expect(create).toHaveBeenCalledWith(PERMITTED.url));
    });

    it('asks a signed-out visitor to sign in instead of failing', async () => {
      authenticated = false;
      renderWithProviders(<DownloadPage />);
      await submit('https://archive.org/download/x.mp4');

      expect(await screen.findByRole('link', { name: /sign in to download/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^download$/i })).not.toBeInTheDocument();
    });
  });

  it('does not analyze an empty URL', async () => {
    renderWithProviders(<DownloadPage />);
    expect(screen.getByRole('button', { name: 'Analyze' })).toBeDisabled();
    expect(analyze).not.toHaveBeenCalled();
  });
});
