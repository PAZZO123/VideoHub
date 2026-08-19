import type {
  MediaKind,
  Paginated,
  WatchHistoryItemDto,
  WatchlistItemDto,
} from '@videohub/types';
import { api, unwrap } from '@/lib/api-client';

export interface AddToWatchlistPayload {
  kind: MediaKind;
  movieId?: string;
  videoId?: string;
}

export interface RecordProgressPayload extends AddToWatchlistPayload {
  progressSeconds: number;
  durationSeconds?: number;
  completed?: boolean;
}

export const watchlistService = {
  list(kind?: MediaKind): Promise<WatchlistItemDto[]> {
    return unwrap(api.get('/watchlist', { params: kind ? { kind } : {} }));
  },

  /** Resolves toggle state for a whole grid in one request. */
  savedIds(mediaIds: string[]): Promise<string[]> {
    if (mediaIds.length === 0) return Promise.resolve([]);
    return unwrap(api.get('/watchlist/ids', { params: { ids: mediaIds.join(',') } }));
  },

  add(payload: AddToWatchlistPayload): Promise<WatchlistItemDto> {
    return unwrap(api.post('/watchlist', payload));
  },

  removeByMedia(kind: MediaKind, mediaId: string): Promise<{ removed: true }> {
    return unwrap(api.delete(`/watchlist/media/${kind}/${encodeURIComponent(mediaId)}`));
  },

  remove(itemId: string): Promise<{ removed: true }> {
    return unwrap(api.delete(`/watchlist/${encodeURIComponent(itemId)}`));
  },
};

export const historyService = {
  list(page = 1, limit = 24): Promise<Paginated<WatchHistoryItemDto>> {
    return unwrap(api.get('/history', { params: { page, limit } }));
  },

  continueWatching(): Promise<WatchHistoryItemDto[]> {
    return unwrap(api.get('/history/continue-watching'));
  },

  recordProgress(payload: RecordProgressPayload): Promise<WatchHistoryItemDto> {
    return unwrap(api.post('/history', payload));
  },

  remove(itemId: string): Promise<{ removed: true }> {
    return unwrap(api.delete(`/history/${encodeURIComponent(itemId)}`));
  },

  clear(): Promise<{ removed: number }> {
    return unwrap(api.delete('/history'));
  },
};
