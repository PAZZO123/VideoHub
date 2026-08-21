import { useQuery } from '@tanstack/react-query';
import { Flame } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { MovieCard, VideoCard } from '@/components/media/media-card';
import { MediaGrid } from '@/components/media/media-rail';
import { SearchField } from '@/components/media/search-field';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { trendingService } from '@/services/catalog.service';
import { usePageTitle } from '@/hooks/use-page-title';

export default function TrendingPage(): JSX.Element {
  usePageTitle('Trending');
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['trending', 40, q],
    queryFn: () => trendingService.list(40, q || undefined),
    // Holds the current results while a new search resolves, rather than
    // collapsing the grid to skeletons on every keystroke.
    placeholderData: (previous) => previous,
  });

  const setSearch = (next: string): void => {
    const params = new URLSearchParams(searchParams);
    if (next) params.set('q', next);
    else params.delete('q');
    setSearchParams(params);
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-20 pt-28 sm:px-6 lg:px-10">
      <header>
        <h1 className="flex items-center gap-3 font-display text-display-md font-bold text-white">
          <Flame className="size-9 text-accent-500" aria-hidden="true" />
          Trending
        </h1>
        <p className="mt-2 text-ink-400">
          What people are watching, searching for and saving right now.
        </p>
      </header>

      <div className="mt-7">
        <SearchField
          value={q}
          onChange={setSearch}
          label="Search trending"
          placeholder="Search what's trending…"
          className="max-w-xl"
        />
      </div>

      <div className="mt-8">
        {isError ? (
          <ErrorState title="Couldn't load trending" onRetry={() => void refetch()} />
        ) : isPending ? (
          <MediaGrid>
            {Array.from({ length: 12 }, (_, index) => (
              <CardSkeleton key={index} />
            ))}
          </MediaGrid>
        ) : data.length === 0 ? (
          <EmptyState
            icon={<Flame className="size-9" />}
            title={q ? `Nothing trending matches “${q}”` : 'Nothing trending yet'}
            description={
              q
                ? 'Try a different word, or clear the search to see everything trending.'
                : "Trending scores are recalculated hourly once there's activity to measure."
            }
          />
        ) : (
          <MediaGrid>
            {data.map((item) =>
              item.movie ? (
                <MovieCard key={item.movie.id} movie={item.movie} />
              ) : item.video ? (
                <VideoCard key={item.video.id} video={item.video} />
              ) : null,
            )}
          </MediaGrid>
        )}
      </div>
    </div>
  );
}
