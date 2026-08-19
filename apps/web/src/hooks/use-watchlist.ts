import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MediaKind } from '@videohub/types';
import { useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { watchlistService } from '@/services/library.service';

interface ToggleVariables {
  kind: MediaKind;
  mediaId: string;
  isSaved: boolean;
}

/**
 * Watchlist membership for a set of media ids, plus a toggle.
 *
 * The toggle updates the cache optimistically so the button responds instantly,
 * and rolls back if the request fails.
 */
export function useWatchlistIds(mediaIds: string[]) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  // Sorted and joined so the key is stable regardless of render order.
  const key = ['watchlist', 'ids', [...mediaIds].sort().join(',')];

  const { data: savedIds = [] } = useQuery({
    queryKey: key,
    queryFn: () => watchlistService.savedIds(mediaIds),
    enabled: isAuthenticated && mediaIds.length > 0,
    staleTime: 30_000,
  });

  const toggle = useMutation<void, Error, ToggleVariables, { previous: string[] }>({
    // Returns void: add and remove resolve to different shapes and the caller
    // only cares that the toggle landed.
    mutationFn: async ({ kind, mediaId, isSaved }) => {
      if (isSaved) {
        await watchlistService.removeByMedia(kind, mediaId);
        return;
      }
      await watchlistService.add(
        kind === MediaKind.MOVIE ? { kind, movieId: mediaId } : { kind, videoId: mediaId },
      );
    },

    onMutate: async ({ mediaId, isSaved }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<string[]>(key) ?? [];

      queryClient.setQueryData<string[]>(
        key,
        isSaved ? previous.filter((id) => id !== mediaId) : [...previous, mediaId],
      );

      return { previous };
    },

    onError: (_error, _variables, context) => {
      // Put the old membership back; the button returns to its real state.
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });

  const isSaved = useCallback((mediaId: string) => savedIds.includes(mediaId), [savedIds]);

  return { savedIds, isSaved, toggle };
}
