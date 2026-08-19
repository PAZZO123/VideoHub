import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DownloadDto, DownloadStatus } from '@videohub/types';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  ShieldAlert,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Pagination } from '@/components/media/pagination';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import { downloadsService, formatBytes } from '@/services/downloads.service';
import { usePageTitle } from '@/hooks/use-page-title';

const STATUS_STYLE: Record<DownloadStatus, { label: string; className: string; icon: JSX.Element }> = {
  PENDING: {
    label: 'Queued',
    className: 'text-ink-300 bg-white/[0.06]',
    icon: <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />,
  },
  RUNNING: {
    label: 'Downloading',
    className: 'text-brand-200 bg-brand-500/15',
    icon: <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />,
  },
  COMPLETED: {
    label: 'Ready',
    className: 'text-green-300 bg-green-500/15',
    icon: <CheckCircle2 className="size-3.5" aria-hidden="true" />,
  },
  FAILED: {
    label: 'Failed',
    className: 'text-red-300 bg-red-500/15',
    icon: <XCircle className="size-3.5" aria-hidden="true" />,
  },
  BLOCKED: {
    label: 'Not permitted',
    className: 'text-amber-300 bg-amber-500/15',
    icon: <ShieldAlert className="size-3.5" aria-hidden="true" />,
  },
};

function DownloadRow({
  item,
  onRemove,
  isRemoving,
}: {
  item: DownloadDto;
  onRemove: (id: string) => void;
  isRemoving: boolean;
}): JSX.Element {
  const status = STATUS_STYLE[item.status];

  return (
    <li className="rounded-xl border border-white/[0.06] bg-ink-850 p-4 transition-colors hover:border-white/[0.14]">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold text-ink-100">{item.title ?? item.host}</h3>
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                status.className,
              )}
            >
              {status.icon}
              {status.label}
            </span>
          </div>

          <p className="mt-1.5 truncate text-xs text-ink-500">{item.sourceUrl}</p>

          {/* The refusal reason stays visible here, not just at analyze time. */}
          {item.message && (
            <p
              className={cn(
                'mt-3 rounded-lg px-3 py-2 text-xs leading-relaxed',
                item.status === 'BLOCKED'
                  ? 'bg-amber-500/[0.08] text-amber-200/90'
                  : 'bg-white/[0.04] text-ink-400',
              )}
            >
              {item.message}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-400">
            {item.fileSizeBytes !== null && <span>{formatBytes(item.fileSizeBytes)}</span>}
            {item.format && <span>{item.format}</span>}
            <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {item.status === 'COMPLETED' && (
              <Button size="sm" leftIcon={<Download className="size-3.5" />}>
                Save file
              </Button>
            )}
            <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" rightIcon={<ExternalLink className="size-3.5" />}>
                Open source
              </Button>
            </a>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onRemove(item.id)}
          disabled={isRemoving}
          aria-label={`Remove ${item.title ?? 'download'}`}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-red-500/15 hover:text-red-400 disabled:opacity-50"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

export default function DownloadsPage(): JSX.Element {
  usePageTitle('Your Downloads');
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['downloads', page],
    queryFn: () => downloadsService.list(page),
    placeholderData: (previous) => previous,
    // Poll only while something is actually in flight, so an idle list makes no
    // requests at all.
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      return items.some((item) => item.status === 'PENDING' || item.status === 'RUNNING')
        ? 2000
        : false;
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => downloadsService.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['downloads'] }),
  });

  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-28 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 font-display text-display-md font-bold text-white">
            <Download className="size-8 text-brand-400" aria-hidden="true" />
            Your Downloads
          </h1>
          <p className="mt-2 text-ink-400">
            {data ? `${data.meta.total.toLocaleString()} entries` : 'Everything you have requested'}
          </p>
        </div>

        <Link to="/download">
          <Button variant="outline">New download</Button>
        </Link>
      </header>

      <div className="mt-10">
        {isError ? (
          <ErrorState title="Couldn't load your downloads" onRetry={() => void refetch()} />
        ) : isPending ? (
          <div className="flex justify-center py-16">
            <Spinner className="size-8" />
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={<Download className="size-9" />}
            title="No downloads yet"
            description="Paste a URL on the download page and VideoHub will check whether the source permits it."
            action={
              <Link to="/download">
                <Button>Analyze a URL</Button>
              </Link>
            }
          />
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {data.items.map((item) => (
                <DownloadRow
                  key={item.id}
                  item={item}
                  onRemove={(id) => remove.mutate(id)}
                  isRemoving={remove.isPending}
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
