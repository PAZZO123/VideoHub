import { useQuery } from '@tanstack/react-query';
import { Video } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { VideoCard } from '@/components/media/media-card';
import { MediaGrid } from '@/components/media/media-rail';
import { SearchField } from '@/components/media/search-field';
import { Pagination } from '@/components/media/pagination';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import { taxonomyService, videosService } from '@/services/catalog.service';
import { usePageTitle } from '@/hooks/use-page-title';

export default function VideosPage(): JSX.Element {
  usePageTitle('Videos');
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get('page') ?? '1');
  const category = searchParams.get('category') ?? undefined;
  const q = searchParams.get('q') ?? '';

  const { data: categories } = useQuery({
    queryKey: ['categories', 'non-kids'],
    queryFn: () => taxonomyService.categories(false),
    staleTime: 60 * 60 * 1000,
  });

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['videos', { page, category, q }],
    queryFn: () => videosService.list({ page, category, q: q || undefined }),
    placeholderData: (previous) => previous,
  });

  const setParam = (key: string, value?: string): void => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    // Changing the category resets pagination.
    if (key !== 'page') params.delete('page');
    setSearchParams(params);
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-20 pt-28 sm:px-6 lg:px-10">
      <header>
        <h1 className="font-display text-display-md font-bold text-white">Videos</h1>
        <p className="mt-2 text-ink-400">
          {data
            ? `${data.meta.total.toLocaleString()} ${data.meta.total === 1 ? 'video' : 'videos'}`
            : 'Browse everything on VideoHub'}
        </p>
      </header>

      <div className="mt-7">
        <SearchField
          value={q}
          // Searching from page 3 must not strand you past the end of a
          // shorter result set.
          onChange={(next) => setParam('q', next || undefined)}
          label="Search videos"
          placeholder="Search by title, description or tag…"
          className="max-w-xl"
        />
      </div>

      {categories && categories.length > 0 && (
        <nav aria-label="Categories" className="mt-5">
          <ul className="flex flex-wrap gap-2">
            <li>
              <button
                type="button"
                onClick={() => setParam('category', undefined)}
                aria-current={!category ? 'true' : undefined}
                className={cn(
                  'rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                  !category
                    ? 'border-brand-400 bg-brand-500/15 text-white'
                    : 'border-white/10 bg-white/[0.03] text-ink-300 hover:border-white/25 hover:text-white',
                )}
              >
                All
              </button>
            </li>
            {categories.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setParam('category', item.slug)}
                  aria-current={category === item.slug ? 'true' : undefined}
                  className={cn(
                    'rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                    category === item.slug
                      ? 'border-brand-400 bg-brand-500/15 text-white'
                      : 'border-white/10 bg-white/[0.03] text-ink-300 hover:border-white/25 hover:text-white',
                  )}
                >
                  <span className="mr-1.5" aria-hidden="true">
                    {item.iconEmoji}
                  </span>
                  {item.name}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="mt-10">
        {isError ? (
          <ErrorState
            title="Couldn't load videos"
            onRetry={() => void refetch()}
            description="Something went wrong fetching videos."
          />
        ) : isPending ? (
          <MediaGrid variant="landscape">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="w-full">
                <div className="skeleton aspect-video w-full rounded-card" />
                <div className="skeleton mt-2.5 h-3.5 w-4/5 rounded" />
              </div>
            ))}
          </MediaGrid>
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={<Video className="size-9" />}
            title={q ? `No videos match “${q}”` : 'No videos here yet'}
            description={
              q
                ? 'Try a different word, or clear the search to browse everything.'
                : category
                  ? 'Nothing in this category yet. Try another one.'
                  : 'Approved uploads will appear here.'
            }
          />
        ) : (
          <>
            <MediaGrid variant="landscape">
              {data.items.map((video) => (
                <VideoCard key={video.id} video={video} className="w-full" />
              ))}
            </MediaGrid>
            <Pagination
              meta={data.meta}
              onPageChange={(next) => {
                setParam('page', String(next));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
