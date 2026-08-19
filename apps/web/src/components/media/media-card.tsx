import type { MovieSummary, VideoSummary } from '@videohub/types';
import { Film, Play, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';

function formatRuntime(minutes: number | null): string | null {
  if (!minutes) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

function formatDuration(seconds: number | null): string | null {
  if (!seconds) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
    : `${minutes}:${String(rest).padStart(2, '0')}`;
}

/** Poster-shaped card for a movie. */
export function MovieCard({
  movie,
  className,
}: {
  movie: MovieSummary;
  className?: string;
}): JSX.Element {
  const runtime = formatRuntime(movie.runtimeMinutes);

  return (
    <article className={cn('group w-[158px] sm:w-[180px]', className)}>
      <Link
        to={`/movies/${movie.slug}`}
        className="block focus-visible:outline-none"
        // The card is one link; the heading below carries the accessible name.
        aria-labelledby={`movie-title-${movie.id}`}
      >
        <div className="relative overflow-hidden rounded-card bg-ink-800 shadow-card transition-all duration-300 ease-out-expo group-hover:-translate-y-1 group-hover:shadow-card-hover">
          <div className="aspect-[2/3] w-full">
            {movie.posterUrl ? (
              <img
                src={movie.posterUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-full object-cover transition-transform duration-500 ease-out-expo group-hover:scale-105"
              />
            ) : (
              <div className="grid size-full place-items-center bg-ink-750">
                <Film className="size-8 text-ink-500" aria-hidden="true" />
              </div>
            )}
          </div>

          <div className="pointer-events-none absolute inset-0 bg-card-fade opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

          <span className="pointer-events-none absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <span className="grid size-12 place-items-center rounded-full bg-white/95 shadow-lg">
              <Play className="size-5 translate-x-0.5 fill-ink-900 text-ink-900" aria-hidden="true" />
            </span>
          </span>

          {movie.rating !== null && (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-ink-950/85 px-1.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden="true" />
              {movie.rating.toFixed(1)}
            </span>
          )}
        </div>

        <h3
          id={`movie-title-${movie.id}`}
          className="mt-2.5 line-clamp-2 text-sm font-semibold leading-snug text-ink-100 transition-colors group-hover:text-white"
        >
          {movie.title}
        </h3>
      </Link>

      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-400">
        {movie.releaseYear && <span>{movie.releaseYear}</span>}
        {movie.releaseYear && runtime && <span aria-hidden="true">·</span>}
        {runtime && <span>{runtime}</span>}
      </p>
    </article>
  );
}

/** Landscape card for a video. */
export function VideoCard({
  video,
  className,
  to,
}: {
  video: VideoSummary;
  className?: string;
  to?: string;
}): JSX.Element {
  const duration = formatDuration(video.durationSeconds);

  return (
    <article className={cn('group w-[268px] sm:w-[300px]', className)}>
      <Link
        to={to ?? `/videos/${video.slug}`}
        className="block focus-visible:outline-none"
        aria-labelledby={`video-title-${video.id}`}
      >
        <div className="relative overflow-hidden rounded-card bg-ink-800 shadow-card transition-all duration-300 ease-out-expo group-hover:-translate-y-1 group-hover:shadow-card-hover">
          <div className="aspect-video w-full">
            {video.thumbnailUrl ? (
              <img
                src={video.thumbnailUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-full object-cover transition-transform duration-500 ease-out-expo group-hover:scale-105"
              />
            ) : (
              <div className="grid size-full place-items-center bg-ink-750">
                <Play className="size-8 text-ink-500" aria-hidden="true" />
              </div>
            )}
          </div>

          {duration && (
            <span className="absolute bottom-2 right-2 rounded bg-ink-950/85 px-1.5 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
              {duration}
            </span>
          )}
        </div>

        <h3
          id={`video-title-${video.id}`}
          className="mt-2.5 line-clamp-2 text-sm font-semibold leading-snug text-ink-100 transition-colors group-hover:text-white"
        >
          {video.title}
        </h3>
      </Link>

      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-400">
        {video.category && <span>{video.category.name}</span>}
        {video.category && video.viewCount > 0 && <span aria-hidden="true">·</span>}
        {video.viewCount > 0 && (
          <span>
            {video.viewCount.toLocaleString()} view{video.viewCount === 1 ? '' : 's'}
          </span>
        )}
      </p>
    </article>
  );
}
