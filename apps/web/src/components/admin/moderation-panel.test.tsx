import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ModerationItem, ModerationStatus } from '@videohub/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { ModerationPanel } from './moderation-panel';

const moderationQueue = vi.fn();
const moderate = vi.fn();
const deleteVideo = vi.fn();

vi.mock('@/services/admin.service', async () => {
  const actual = await vi.importActual<typeof import('@/services/admin.service')>(
    '@/services/admin.service',
  );
  return {
    ...actual,
    adminService: {
      moderationQueue: (...args: unknown[]) => moderationQueue(...args),
      moderate: (...args: unknown[]) => moderate(...args),
      deleteVideo: (...args: unknown[]) => deleteVideo(...args),
    },
  };
});

/**
 * Queries scoped to the row.
 *
 * The status tabs are labelled Pending / Approved / Rejected, so a bare
 * `getByRole('button', { name: /approve/i })` also matches the "Approved" tab.
 */
const row = () => within(screen.getByRole('listitem'));

function item(overrides: Partial<ModerationItem> = {}): ModerationItem {
  return {
    id: 'v1',
    slug: 'a-clip',
    title: 'A Clip',
    description: 'Something uploaded.',
    thumbnailUrl: null,
    playbackUrl: 'http://localhost:3000/api/files/uploads/a-clip.mp4',
    durationSeconds: 90,
    maturityRating: 'GENERAL',
    category: null,
    uploaderName: 'Someone',
    viewCount: 0,
    trendingScore: 0,
    moderationStatus: 'PENDING',
    moderationNote: null,
    moderatedAt: null,
    ...overrides,
  };
}

const page = (items: ModerationItem[]) => ({
  items,
  meta: { page: 1, limit: 24, total: items.length, totalPages: 1, hasNext: false, hasPrev: false },
});

describe('ModerationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    moderationQueue.mockResolvedValue(page([item()]));
    moderate.mockResolvedValue(item({ moderationStatus: 'APPROVED' }));
    deleteVideo.mockResolvedValue({ removed: true });
  });

  describe('watching before deciding', () => {
    it('offers a preview and only mounts the player once asked', async () => {
      // The player is not rendered up front: a queue page would otherwise open
      // a video connection per row.
      renderWithProviders(<ModerationPanel />);
      await screen.findByText('A Clip');

      expect(document.querySelector('video')).toBeNull();

      await userEvent.click(row().getByRole('button', { name: 'Watch' }));

      await waitFor(() => expect(document.querySelector('video')).not.toBeNull());
    });

    it('says so rather than showing an empty box when there is no file', async () => {
      moderationQueue.mockResolvedValue(page([item({ playbackUrl: null })]));
      renderWithProviders(<ModerationPanel />);
      await screen.findByText('A Clip');

      await userEvent.click(row().getByRole('button', { name: 'Watch' }));

      expect(await screen.findByText(/no playable file/i)).toBeInTheDocument();
    });
  });

  describe('actions by status', () => {
    it('offers Approve while a decision is outstanding', async () => {
      renderWithProviders(<ModerationPanel />);
      await screen.findByText('A Clip');

      expect(row().getByRole('button', { name: 'Approve' })).toBeInTheDocument();
      expect(row().getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    });

    it('drops Approve once the video is already approved', async () => {
      // Approving something already approved does nothing; removal is the
      // useful action at that point.
      moderationQueue.mockResolvedValue(page([item({ moderationStatus: 'APPROVED' })]));
      renderWithProviders(<ModerationPanel />);
      await screen.findByText('A Clip');

      expect(row().queryByRole('button', { name: /approve/i })).toBeNull();
      expect(row().getByRole('button', { name: 'Unpublish' })).toBeInTheDocument();
      expect(row().getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    });

    it('confirms before deleting, and never deletes on the first click', async () => {
      renderWithProviders(<ModerationPanel />);
      await screen.findByText('A Clip');

      await userEvent.click(row().getByRole('button', { name: 'Delete' }));
      expect(deleteVideo).not.toHaveBeenCalled();

      await userEvent.click(row().getByRole('button', { name: /delete permanently/i }));
      await waitFor(() => expect(deleteVideo).toHaveBeenCalledWith('v1'));
    });

    it('will not submit a rejection without a reason', async () => {
      renderWithProviders(<ModerationPanel />);
      await screen.findByText('A Clip');

      await userEvent.click(row().getByRole('button', { name: 'Reject' }));
      expect(row().getByRole('button', { name: /confirm rejection/i })).toBeDisabled();
    });
  });

  describe('classification', () => {
    it('sends no rating when the moderator left it alone', async () => {
      renderWithProviders(<ModerationPanel />);
      await screen.findByText('A Clip');

      await userEvent.click(row().getByRole('button', { name: 'Approve' }));

      await waitFor(() =>
        expect(moderate).toHaveBeenCalledWith('v1', 'APPROVED', undefined, undefined),
      );
    });

    it('sends the new rating when the moderator reclassified it', async () => {
      renderWithProviders(<ModerationPanel />);
      await screen.findByText('A Clip');

      await userEvent.selectOptions(row().getByLabelText(/rating/i), 'ADULT');
      await userEvent.click(row().getByRole('button', { name: 'Approve' }));

      await waitFor(() =>
        expect(moderate).toHaveBeenCalledWith('v1', 'APPROVED', undefined, 'ADULT'),
      );
    });

    it('warns what marking something adult actually does', async () => {
      renderWithProviders(<ModerationPanel />);
      await screen.findByText('A Clip');

      await userEvent.selectOptions(row().getByLabelText(/rating/i), 'ADULT');

      expect(row().getByText(/age-verified adults/i)).toBeInTheDocument();
    });
  });

  describe('search', () => {
    it('passes the query through to the API', async () => {
      renderWithProviders(<ModerationPanel />);
      await screen.findByText('A Clip');

      await userEvent.type(screen.getByLabelText(/search the moderation queue/i), 'bunny');

      // Debounced, so this lands a moment after typing stops.
      await waitFor(
        () =>
          expect(moderationQueue).toHaveBeenCalledWith(
            'PENDING' as ModerationStatus,
            1,
            'bunny',
          ),
        { timeout: 2000 },
      );
    });

    it('says nothing matched rather than showing an empty queue', async () => {
      renderWithProviders(<ModerationPanel />);
      await screen.findByText('A Clip');

      moderationQueue.mockResolvedValue(page([]));
      await userEvent.type(screen.getByLabelText(/search the moderation queue/i), 'zzz');

      expect(await screen.findByText(/nothing matching/i, {}, { timeout: 2000 })).toBeInTheDocument();
    });
  });
});
