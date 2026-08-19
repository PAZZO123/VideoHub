import { useQuery } from '@tanstack/react-query';
import { MIN_SEARCH_LENGTH, SEARCH_DEBOUNCE_MS } from '@videohub/config';
import { Search, SearchX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MovieCard, VideoCard } from '@/components/media/media-card';
import { MediaGrid } from '@/components/media/media-rail';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { useDebounce } from '@/hooks/use-debounce';
import { searchService } from '@/services/catalog.service';

export default function SearchPage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') ?? '';

  const [input, setInput] = useState(urlQuery);
  const debounced = useDebounce(input, SEARCH_DEBOUNCE_MS);

  // Keep the URL in step with the debounced value, so results stay shareable
  // without writing a history entry per keystroke.
  useEffect(() => {
    const trimmed = debounced.trim();
    if (trimmed === urlQuery) return;

    const params = new URLSearchParams();
    if (trimmed) params.set('q', trimmed);
    setSearchParams(params, { replace: true });
  }, [debounced, urlQuery, setSearchParams]);

  const query = debounced.trim();
  const isSearchable = query.length >= MIN_SEARCH_LENGTH;

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['search', query],
    queryFn: () => searchService.search(query),
    enabled: isSearchable,
  });

  const totalResults = (data?.totalMovies ?? 0) + (data?.totalVideos ?? 0);

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-20 pt-28 sm:px-6 lg:px-10">
      <h1 className="font-display text-display-md font-bold text-white">Search</h1>

      <div className="mt-6 max-w-2xl">
        <label htmlFor="search-input" className="sr-only">
          Search movies and videos
        </label>
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-ink-850 p-2 transition-colors focus-within:border-brand-400/60">
          <Search className="ml-2.5 size-5 shrink-0 text-ink-400" aria-hidden="true" />
          <input
            id="search-input"
            type="search"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Search movies, videos, actors…"
            className="min-w-0 flex-1 bg-transparent py-2 text-base text-white outline-none placeholder:text-ink-400"
          />
        </div>
      </div>

      <div className="mt-10">
        {!isSearchable ? (
          <EmptyState
            icon={<Search className="size-9" />}
            title="What are you looking for?"
            description={`Type at least ${MIN_SEARCH_LENGTH} characters to search across movies, videos, actors and genres.`}
          />
        ) : isError ? (
          <ErrorState title="Search failed" onRetry={() => void refetch()} />
        ) : isPending ? (
          <MediaGrid>
            {Array.from({ length: 12 }, (_, index) => (
              <CardSkeleton key={index} />
            ))}
          </MediaGrid>
        ) : totalResults === 0 ? (
          <EmptyState
            icon={<SearchX className="size-9" />}
            title={`No results for "${query}"`}
            description="Try a different spelling, a shorter phrase, or search by genre or actor."
          />
        ) : (
          <div className="flex flex-col gap-14">
            <p aria-live="polite" className="text-sm text-ink-400">
              {totalResults.toLocaleString()} result{totalResults === 1 ? '' : 's'} for{' '}
              <span className="font-medium text-ink-100">&ldquo;{query}&rdquo;</span>
            </p>

            {data.movies.length > 0 && (
              <section>
                <h2 className="mb-5 text-xl font-bold text-white">
                  Movies{' '}
                  <span className="text-base font-normal text-ink-400">({data.totalMovies})</span>
                </h2>
                <MediaGrid>
                  {data.movies.map((movie) => (
                    <MovieCard key={movie.id} movie={movie} />
                  ))}
                </MediaGrid>
              </section>
            )}

            {data.videos.length > 0 && (
              <section>
                <h2 className="mb-5 text-xl font-bold text-white">
                  Videos{' '}
                  <span className="text-base font-normal text-ink-400">({data.totalVideos})</span>
                </h2>
                <MediaGrid variant="landscape">
                  {data.videos.map((video) => (
                    <VideoCard key={video.id} video={video} className="w-full" />
                  ))}
                </MediaGrid>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
