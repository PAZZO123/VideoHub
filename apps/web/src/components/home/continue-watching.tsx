import { useQuery } from '@tanstack/react-query';
import type { WatchHistoryItemDto } from '@videohub/types';
import { Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MediaRail } from '@/components/media/media-rail';
import { useAuth } from '@/hooks/use-auth';
import { historyService } from '@/services/library.service';

function remainingLabel(item: WatchHistoryItemDto): string | null {
  if (!item.durationSeconds) return null;
  const remaining = Math.max(0, item.durationSeconds - item.progressSeconds);
  const minutes = Math.round(remaining / 60);
  return minutes > 0 ? `${minutes} min left` : 'Almost done';
}

function ResumeCard({ item }: { item: WatchHistoryItemDto }): JSX.Element | null {
  const media = item.movie ?? item.video;
  if (!media) return null;

  const isMovie = item.movie !== null;
  const href = isMovie ? `/movies/${media.slug}` : `/videos/${media.slug}`;
  const image = isMovie ? item.movie?.backdropUrl ?? item.movie?.posterUrl : item.video?.thumbnailUrl;
  const remaining = remainingLabel(item);

  return (
    <article className="group w-[268px] sm:w-[300px]">
      <Link to={href} className="block focus-visible:outline-none">
        <div className="relative overflow-hidden rounded-card bg-ink-800 shadow-card transition-all duration-300 ease-out-expo group-hover:-translate-y-1 group-hover:shadow-card-hover">
          <div className="aspect-video w-full">
            {image ? (
              <img
                src={image}
                alt=""
                loading="lazy"
                className="size-full object-cover transition-transform duration-500 ease-out-expo group-hover:scale-105"
              />
            ) : (
              <div className="grid size-full place-items-center bg-ink-750">
                <Play className="size-8 text-ink-500" aria-hidden="true" />
              </div>
            )}
          </div>

          <span className="absolute inset-0 grid place-items-center bg-ink-950/30 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <span className="grid size-12 place-items-center rounded-full bg-white/95 shadow-lg">
              <Play className="size-5 translate-x-0.5 fill-ink-900 text-ink-900" aria-hidden="true" />
            </span>
          </span>

          {/* Resume position. The bar is decorative; the text below carries the
              same information for screen readers. */}
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20" aria-hidden="true">
            <div
              className="h-full bg-brand-400"
              style={{ width: `${Math.round(item.progressRatio * 100)}%` }}
            />
          </div>
        </div>

        <h3 className="mt-2.5 line-clamp-1 text-sm font-semibold text-ink-100 transition-colors group-hover:text-white">
          {media.title}
        </h3>
      </Link>

      <p className="mt-1 text-xs text-ink-400">
        {remaining ?? `${Math.round(item.progressRatio * 100)}% watched`}
      </p>
    </article>
  );
}

export function ContinueWatchingRail(): JSX.Element | null {
  const { isAuthenticated } = useAuth();

  const { data, isPending } = useQuery({
    queryKey: ['continue-watching'],
    queryFn: () => historyService.continueWatching(),
    enabled: isAuthenticated,
    // Progress changes as the user watches; don't serve a stale row.
    staleTime: 0,
  });

  if (!isAuthenticated) return null;

  return (
    <MediaRail
      title="Continue Watching"
      subtitle="Pick up where you left off"
      viewAllHref="/history"
      isLoading={isPending}
      isEmpty={!data || data.length === 0}
    >
      {data?.map((item) => <ResumeCard key={item.id} item={item} />)}
    </MediaRail>
  );
}
