import { useQuery } from '@tanstack/react-query';
import { Film } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { FilterBar, type CatalogFilters } from '@/components/media/filter-bar';
import { SearchField } from '@/components/media/search-field';
import { MovieCard } from '@/components/media/media-card';
import { MediaGrid } from '@/components/media/media-rail';
import { Pagination } from '@/components/media/pagination';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import { moviesService } from '@/services/catalog.service';
import { taxonomyService } from '@/services/catalog.service';
import { usePageTitle } from '@/hooks/use-page-title';

export default function MoviesPage(): JSX.Element {
  usePageTitle('Movies');
  // The URL is the source of truth for filters, so a filtered view is
  // shareable, bookmarkable and survives a back-navigation.
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get('page') ?? '1');
  const q = searchParams.get('q') ?? '';
  const filters: CatalogFilters = {
    genre: searchParams.get('genre') ?? undefined,
    year: searchParams.get('year') ? Number(searchParams.get('year')) : undefined,
    minRating: searchParams.get('minRating') ? Number(searchParams.get('minRating')) : undefined,
    language: searchParams.get('language') ?? undefined,
    sort: searchParams.get('sort') ?? undefined,
  };

  const { data: genres } = useQuery({
    queryKey: ['genres'],
    queryFn: () => taxonomyService.genres(),
    staleTime: 60 * 60 * 1000,
  });

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['movies', { page, q, ...filters }],
    queryFn: () => moviesService.list({ page, q: q || undefined, ...filters }),
    // Keeps the previous page visible while the next one loads, instead of
    // collapsing the grid to skeletons on every page change.
    placeholderData: (previous) => previous,
  });

  const updateParams = (next: Record<string, string | number | undefined>): void => {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === '') params.delete(key);
      else params.set(key, String(value));
    }
    setSearchParams(params);
  };

  const handleFilterChange = (nextFilters: CatalogFilters): void => {
    updateParams({
      genre: nextFilters.genre,
      year: nextFilters.year,
      minRating: nextFilters.minRating,
      language: nextFilters.language,
      sort: nextFilters.sort,
      page: 1, // A filter change invalidates the current page number.
    });
  };

  const handlePageChange = (nextPage: number): void => {
    updateParams({ page: nextPage });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-20 pt-28 sm:px-6 lg:px-10">
      <header>
        <h1 className="font-display text-display-md font-bold text-white">Movies</h1>
        <p className="mt-2 text-ink-400">
          {data
            ? `${data.meta.total.toLocaleString()} ${data.meta.total === 1 ? 'title' : 'titles'}`
            : 'Browse the full catalogue'}
        </p>
      </header>

      <div className="mt-7">
        <SearchField
          value={q}
          // Searching from page 4 must not leave you on page 4 of a shorter
          // list of results.
          onChange={(next) => updateParams({ q: next, page: undefined })}
          label="Search movies"
          placeholder="Search by title, director or cast…"
          className="max-w-xl"
        />
      </div>

      <div className="mt-5">
        <FilterBar filters={filters} genres={genres} onChange={handleFilterChange} />
      </div>

      <div className="mt-10">
        {isError ? (
          <ErrorState
            title="Couldn't load movies"
            description="Something went wrong fetching the catalogue."
            onRetry={() => void refetch()}
          />
        ) : isPending ? (
          <MediaGrid>
            {Array.from({ length: 12 }, (_, index) => (
              <CardSkeleton key={index} />
            ))}
          </MediaGrid>
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={<Film className="size-9" />}
            title={q ? `No movies match “${q}”` : 'No movies match those filters'}
            description={
              q
                ? 'Try a different title, or clear the search to browse everything.'
                : 'Try widening your filters, or clear them to see everything.'
            }
          />
        ) : (
          <>
            <MediaGrid>
              {data.items.map((movie) => (
                <MovieCard key={movie.id} movie={movie} />
              ))}
            </MediaGrid>
            <Pagination meta={data.meta} onPageChange={handlePageChange} />
          </>
        )}
      </div>
    </div>
  );
}
