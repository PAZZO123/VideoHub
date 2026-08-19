import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WatchHistoryItemDto } from '@videohub/types';
import { CheckCircle2, History, Play, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Pagination } from '@/components/media/pagination';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/states';
import { historyService } from '@/services/library.service';
import { usePageTitle } from '@/hooks/use-page-title';

function HistoryRow({
  item,
  onRemove,
  isRemoving,
}: {
  item: WatchHistoryItemDto;
  onRemove: (id: string) => void;
  isRemoving: boolean;
}): JSX.Element | null {
  const media = item.movie ?? item.video;
  if (!media) return null;

  const isMovie = item.movie !== null;
  const href = isMovie ? `/movies/${media.slug}` : `/videos/${media.slug}`;
  const image = isMovie ? item.movie?.posterUrl : item.video?.thumbnailUrl;
  const percent = Math.round(item.progressRatio * 100);

  return (
    <li className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-ink-850 p-3 transition-colors hover:border-white/[0.14]">
      <Link to={href} className="shrink-0">
        <div className="h-16 w-28 overflow-hidden rounded-lg bg-ink-800">
          {image ? (
            <img src={image} alt="" loading="lazy" className="size-full object-cover" />
          ) : (
            <div className="grid size-full place-items-center">
              <Play className="size-5 text-ink-500" aria-hidden="true" />
            </div>
          )}
        </div>
      </Link>

      <div className="min-w-0 flex-1">
        <Link to={href} className="line-clamp-1 font-semibold text-ink-100 hover:text-white">
          {media.title}
        </Link>

        <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-400">
          {item.completed ? (
            <>
              <CheckCircle2 className="size-3.5 text-green-400" aria-hidden="true" />
              Finished
            </>
          ) : (
            <>{percent}% watched</>
          )}
          <span aria-hidden="true">·</span>
          <time dateTime={item.lastWatchedAt}>
            {new Date(item.lastWatchedAt).toLocaleDateString()}
          </time>
        </p>

        {!item.completed && (
          <div className="mt-2 h-1 w-full max-w-xs overflow-hidden rounded-full bg-white/10" aria-hidden="true">
            <div className="h-full bg-brand-400" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => onRemove(item.id)}
        disabled={isRemoving}
        aria-label={`Remove ${media.title} from history`}
        className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-red-500/15 hover:text-red-400 disabled:opacity-50"
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </button>
    </li>
  );
}

export default function HistoryPage(): JSX.Element {
  usePageTitle('Watch History');
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['history', page],
    queryFn: () => historyService.list(page),
    placeholderData: (previous) => previous,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['history'] });
    void queryClient.invalidateQueries({ queryKey: ['continue-watching'] });
  };

  const removeOne = useMutation({
    mutationFn: (id: string) => historyService.remove(id),
    onSuccess: invalidate,
  });

  const clearAll = useMutation({
    mutationFn: () => historyService.clear(),
    onSuccess: () => {
      setConfirmingClear(false);
      setPage(1);
      invalidate();
    },
  });

  return (
    <div className="mx-auto max-w-4xl px-4 pb-20 pt-28 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 font-display text-display-md font-bold text-white">
            <History className="size-8 text-brand-400" aria-hidden="true" />
            Watch History
          </h1>
          <p className="mt-2 text-ink-400">
            {data ? `${data.meta.total.toLocaleString()} entries` : 'What you have been watching'}
          </p>
        </div>

        {data && data.items.length > 0 && (
          // Two-step confirm: clearing history is not recoverable.
          confirmingClear ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-300">Clear everything?</span>
              <Button
                size="sm"
                variant="danger"
                isLoading={clearAll.isPending}
                onClick={() => clearAll.mutate()}
              >
                Yes, clear
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmingClear(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Trash2 className="size-4" />}
              onClick={() => setConfirmingClear(true)}
            >
              Clear history
            </Button>
          )
        )}
      </header>

      <div className="mt-10">
        {isError ? (
          <ErrorState title="Couldn't load your history" onRetry={() => void refetch()} />
        ) : isPending ? (
          <div className="flex justify-center py-16">
            <Spinner className="size-8" />
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={<History className="size-9" />}
            title="Nothing watched yet"
            description="Titles you play will show up here so you can pick up where you left off."
            action={
              <Link to="/">
                <Button>Find something to watch</Button>
              </Link>
            }
          />
        ) : (
          <>
            <ul className="flex flex-col gap-2.5">
              {data.items.map((item) => (
                <HistoryRow
                  key={item.id}
                  item={item}
                  onRemove={(id) => removeOne.mutate(id)}
                  isRemoving={removeOne.isPending}
                />
              ))}
            </ul>
            <Pagination meta={data.meta} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
