import { useQuery } from '@tanstack/react-query';
import { SearchSort } from '@videohub/types';
import { MovieCard, VideoCard } from '@/components/media/media-card';
import { MediaRail } from '@/components/media/media-rail';
import { moviesService, trendingService, videosService } from '@/services/catalog.service';

/** Mixed movies-and-videos rail driven by the hourly trending score. */
export function TrendingRail(): JSX.Element {
  const { data, isPending } = useQuery({
    queryKey: ['trending', 20],
    queryFn: () => trendingService.list(20),
  });

  return (
    <MediaRail
      title="Trending Now"
      subtitle="What everyone is watching this week"
      viewAllHref="/trending"
      isLoading={isPending}
      isEmpty={!data || data.length === 0}
    >
      {data?.map((item) =>
        item.movie ? (
          <MovieCard key={item.movie.id} movie={item.movie} />
        ) : item.video ? (
          <VideoCard key={item.video.id} video={item.video} />
        ) : null,
      )}
    </MediaRail>
  );
}

/** Reusable movie rail bound to a sort or genre. */
export function MovieRail({
  title,
  subtitle,
  genre,
  sort = SearchSort.TRENDING,
}: {
  title: string;
  subtitle?: string;
  genre?: string;
  sort?: SearchSort;
}): JSX.Element {
  const { data, isPending } = useQuery({
    queryKey: ['movies', 'rail', { genre, sort }],
    queryFn: () => moviesService.list({ genre, sort, limit: 18 }),
  });

  const viewAllHref = genre ? `/movies?genre=${genre}` : `/movies?sort=${sort}`;

  return (
    <MediaRail
      title={title}
      subtitle={subtitle}
      viewAllHref={viewAllHref}
      isLoading={isPending}
      isEmpty={!data || data.items.length === 0}
    >
      {data?.items.map((movie) => (
        <MovieCard key={movie.id} movie={movie} />
      ))}
    </MediaRail>
  );
}

export function VideoRail(): JSX.Element {
  const { data, isPending } = useQuery({
    queryKey: ['videos', 'rail'],
    queryFn: () => videosService.list({ limit: 12, sort: SearchSort.NEWEST }),
  });

  return (
    <MediaRail
      title="Videos"
      subtitle="Fresh uploads from the community"
      viewAllHref="/videos"
      isLoading={isPending}
      isEmpty={!data || data.items.length === 0}
    >
      {data?.items.map((video) => (
        <VideoCard key={video.id} video={video} />
      ))}
    </MediaRail>
  );
}
