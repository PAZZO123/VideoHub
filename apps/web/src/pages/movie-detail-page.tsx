import { useQuery } from '@tanstack/react-query';
import { MediaKind, type SourceAccess, type SourceDto } from '@videohub/types';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Download,
  ExternalLink,
  Film,
  Play,
  Star,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { MovieCard } from '@/components/media/media-card';
import { WatchlistButton } from '@/components/media/watchlist-button';
import { Button } from '@/components/ui/button';
import { ErrorState, PageLoader } from '@/components/ui/states';
import { ApiRequestError } from '@/lib/api-client';
import { moviesService } from '@/services/catalog.service';

/** Human wording for how a source may be consumed. */
const ACCESS_LABELS: Record<SourceAccess, string> = {
  FREE_STREAM: 'Watch free',
  SUBSCRIPTION: 'With subscription',
  RENT: 'Rent',
  BUY: 'Buy',
  PUBLIC_DOMAIN: 'Public domain',
  LICENSED_DOWNLOAD: 'Licensed download',
};

function SourceRow({ source }: { source: SourceDto }): JSX.Element {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-ink-850 p-3.5 transition-colors hover:border-white/[0.16]">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/[0.06]">
        {source.downloadAllowed ? (
          <Download className="size-4 text-brand-300" aria-hidden="true" />
        ) : (
          <Play className="size-4 text-brand-300" aria-hidden="true" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink-100">{source.platform}</p>
        <p className="text-xs text-ink-400">
          {ACCESS_LABELS[source.access]}
          {source.qualityLabel ? ` · ${source.qualityLabel}` : ''}
          {source.region ? ` · ${source.region}` : ''}
        </p>
      </div>

      <a
        href={source.url}
        target="_blank"
        // noreferrer alongside noopener: this is an outbound link to a third party.
        rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-ink-100 transition-colors hover:border-white/30 hover:bg-white/[0.04]"
      >
        Open
        <ExternalLink className="size-3.5" aria-hidden="true" />
      </a>
    </li>
  );
}

export default function MovieDetailPage(): JSX.Element {
  const { slug = '' } = useParams<{ slug: string }>();

  const {
    data: movie,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['movie', slug],
    queryFn: () => moviesService.get(slug),
    enabled: Boolean(slug),
  });

  const { data: similar } = useQuery({
    queryKey: ['movie', slug, 'similar'],
    queryFn: () => moviesService.similar(slug),
    enabled: Boolean(movie),
  });

  if (isPending) return <PageLoader label="Loading movie…" />;

  if (isError) {
    const notFound = error instanceof ApiRequestError && error.status === 404;
    return (
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-32">
        <ErrorState
          title={notFound ? 'Movie not found' : "Couldn't load this movie"}
          description={
            notFound
              ? 'This title may have been removed, or it may not be available to your account.'
              : 'Something went wrong. Please try again.'
          }
          onRetry={notFound ? undefined : () => void refetch()}
        />
      </div>
    );
  }

  const downloadableSources = movie.sources.filter((source) => source.downloadAllowed);

  return (
    <article className="pb-20">
      {/* Backdrop */}
      <div className="relative isolate">
        <div className="absolute inset-0 -z-10">
          {movie.backdropUrl ? (
            <img
              src={movie.backdropUrl}
              alt=""
              className="size-full object-cover object-top"
              fetchPriority="high"
            />
          ) : (
            <div className="size-full bg-ink-850" />
          )}
          <div className="absolute inset-0 bg-hero-fade" />
        </div>

        <div className="mx-auto max-w-[1600px] px-4 pb-10 pt-24 sm:px-6 lg:px-10">
          <Link
            to="/movies"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-300 transition-colors hover:text-white"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            All movies
          </Link>

          <div className="mt-8 flex flex-col gap-8 sm:flex-row sm:items-end">
            <div className="w-40 shrink-0 overflow-hidden rounded-2xl shadow-2xl sm:w-56">
              {movie.posterUrl ? (
                <img
                  src={movie.posterUrl}
                  alt={`Poster for ${movie.title}`}
                  className="aspect-[2/3] w-full object-cover"
                />
              ) : (
                <div className="grid aspect-[2/3] w-full place-items-center bg-ink-750">
                  <Film className="size-10 text-ink-500" aria-hidden="true" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="font-display text-display-md font-bold text-balance text-white">
                {movie.title}
              </h1>

              {movie.tagline && (
                <p className="mt-2 text-lg italic text-ink-300">{movie.tagline}</p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                {movie.rating !== null && (
                  <span className="inline-flex items-center gap-1.5 font-semibold text-white">
                    <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden="true" />
                    {movie.rating.toFixed(1)}
                  </span>
                )}
                {movie.releaseYear && (
                  <span className="inline-flex items-center gap-1.5 text-ink-300">
                    <Calendar className="size-4" aria-hidden="true" />
                    {movie.releaseYear}
                  </span>
                )}
                {movie.runtimeMinutes && (
                  <span className="inline-flex items-center gap-1.5 text-ink-300">
                    <Clock className="size-4" aria-hidden="true" />
                    {Math.floor(movie.runtimeMinutes / 60)}h {movie.runtimeMinutes % 60}m
                  </span>
                )}
                <span className="rounded border border-white/20 px-1.5 py-0.5 text-xs font-semibold text-ink-200">
                  {movie.maturityRating}
                </span>
              </div>

              {movie.genres.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-2">
                  {movie.genres.map((genre) => (
                    <li key={genre.id}>
                      <Link
                        to={`/movies?genre=${genre.slug}`}
                        className="inline-block rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-ink-200 transition-colors hover:border-white/25 hover:text-white"
                      >
                        {genre.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-7 flex flex-wrap gap-3">
                {movie.trailerUrl && (
                  <a href={movie.trailerUrl} target="_blank" rel="noopener noreferrer">
                    <Button size="lg" leftIcon={<Play className="size-4.5" />}>
                      Watch trailer
                    </Button>
                  </a>
                )}
                <WatchlistButton kind={MediaKind.MOVIE} mediaId={movie.id} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-10">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div>
            {movie.overview && (
              <section>
                <h2 className="text-lg font-bold text-white">Overview</h2>
                <p className="mt-3 leading-relaxed text-ink-300">{movie.overview}</p>
              </section>
            )}

            {movie.cast.length > 0 && (
              <section className="mt-10">
                <h2 className="text-lg font-bold text-white">Cast</h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {movie.cast.slice(0, 16).map((member) => (
                    <li
                      key={`${member.name}-${member.order}`}
                      className="rounded-lg border border-white/[0.08] bg-ink-850 px-3 py-2"
                    >
                      <p className="text-sm font-medium text-ink-100">{member.name}</p>
                      {member.character && (
                        <p className="text-xs text-ink-400">{member.character}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {movie.director && (
              <section className="mt-10">
                <h2 className="text-lg font-bold text-white">Director</h2>
                <p className="mt-2 text-ink-300">{movie.director}</p>
              </section>
            )}
          </div>

          <aside>
            <h2 className="text-lg font-bold text-white">Available sources</h2>

            {movie.sources.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-2.5">
                {movie.sources.map((source) => (
                  <SourceRow key={source.id} source={source} />
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-ink-400">
                No sources listed for this title yet.
              </p>
            )}

            {/* States the policy where the user is deciding what to do. */}
            {movie.sources.length > 0 && downloadableSources.length === 0 && (
              <p className="mt-4 rounded-xl border border-white/[0.08] bg-ink-850 px-4 py-3.5 text-xs leading-relaxed text-ink-400">
                None of these sources permit downloading through VideoHub. You can watch this
                title on the platforms above.
              </p>
            )}
          </aside>
        </div>

        {similar && similar.length > 0 && (
          <section className="mt-16">
            <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              You may also like
            </h2>
            <div className="rail mt-4">
              {similar.map((item) => (
                <MovieCard key={item.id} movie={item} />
              ))}
            </div>
          </section>
        )}
      </div>
    </article>
  );
}
