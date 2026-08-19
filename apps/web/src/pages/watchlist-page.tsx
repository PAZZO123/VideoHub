import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MovieCard, VideoCard } from '@/components/media/media-card';
import { MediaGrid } from '@/components/media/media-rail';
import { Button } from '@/components/ui/button';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { watchlistService } from '@/services/library.service';
import { usePageTitle } from '@/hooks/use-page-title';

export default function WatchlistPage(): JSX.Element {
  usePageTitle('Your Watchlist');
  const queryClient = useQueryClient();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['watchlist'],
    queryFn: () => watchlistService.list(),
  });

  const remove = useMutation({
    mutationFn: (itemId: string) => watchlistService.remove(itemId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-20 pt-28 sm:px-6 lg:px-10">
      <header>
        <h1 className="flex items-center gap-3 font-display text-display-md font-bold text-white">
          <Bookmark className="size-8 text-brand-400" aria-hidden="true" />
          Your Watchlist
        </h1>
        <p className="mt-2 text-ink-400">
          {data ? `${data.length} saved title${data.length === 1 ? '' : 's'}` : 'Titles you saved for later'}
        </p>
      </header>

      <div className="mt-10">
        {isError ? (
          <ErrorState title="Couldn't load your watchlist" onRetry={() => void refetch()} />
        ) : isPending ? (
          <MediaGrid>
            {Array.from({ length: 6 }, (_, index) => (
              <CardSkeleton key={index} />
            ))}
          </MediaGrid>
        ) : data.length === 0 ? (
          <EmptyState
            icon={<Bookmark className="size-9" />}
            title="Your watchlist is empty"
            description="Save movies and videos to find them here later."
            action={
              <Link to="/movies">
                <Button>Browse movies</Button>
              </Link>
            }
          />
        ) : (
          <MediaGrid>
            {data.map((item) => (
              <div key={item.id} className="group/item relative">
                {item.movie ? (
                  <MovieCard movie={item.movie} />
                ) : item.video ? (
                  <VideoCard video={item.video} />
                ) : null}

                <button
                  type="button"
                  onClick={() => remove.mutate(item.id)}
                  disabled={remove.isPending}
                  aria-label={`Remove ${item.movie?.title ?? item.video?.title ?? 'item'} from watchlist`}
                  className="absolute right-2 top-2 grid size-8 place-items-center rounded-lg bg-ink-950/85 text-white opacity-0 backdrop-blur-sm transition-all hover:bg-red-600 focus-visible:opacity-100 group-hover/item:opacity-100"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </MediaGrid>
        )}
      </div>
    </div>
  );
}
