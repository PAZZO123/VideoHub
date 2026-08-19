import { useQuery } from '@tanstack/react-query';
import { Flame } from 'lucide-react';
import { MovieCard, VideoCard } from '@/components/media/media-card';
import { MediaGrid } from '@/components/media/media-rail';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { trendingService } from '@/services/catalog.service';
import { usePageTitle } from '@/hooks/use-page-title';

export default function TrendingPage(): JSX.Element {
  usePageTitle('Trending');
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['trending', 40],
    queryFn: () => trendingService.list(40),
  });

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

      <div className="mt-10">
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
            title="Nothing trending yet"
            description="Trending scores are recalculated hourly once there's activity to measure."
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
