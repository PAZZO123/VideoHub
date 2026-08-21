import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MaturityRating, ModerationItem, ModerationStatus } from '@videohub/types';
import { Check, Play, Search, ShieldCheck, Trash2, Video, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/states';
import { VideoPlayer } from '@/components/video/video-player';
import { useDebounce } from '@/hooks/use-debounce';
import { cn } from '@/lib/cn';
import { adminService } from '@/services/admin.service';

/** Ratings a moderator can assign, most permissive first. */
const RATINGS: { value: MaturityRating; label: string }[] = [
  { value: 'KIDS', label: 'Kids' },
  { value: 'GENERAL', label: 'General' },
  { value: 'TEEN', label: 'Teen' },
  { value: 'MATURE', label: 'Mature' },
  { value: 'ADULT', label: 'Adult 18+' },
];

const RATING_STYLE: Record<MaturityRating, string> = {
  KIDS: 'bg-green-500/15 text-green-300',
  GENERAL: 'bg-sky-500/15 text-sky-300',
  TEEN: 'bg-amber-500/15 text-amber-300',
  MATURE: 'bg-orange-500/15 text-orange-300',
  ADULT: 'bg-red-500/15 text-red-300',
};

function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${String(rest).padStart(2, '0')}s`;
}

function ModerationRow({ video }: { video: ModerationItem }): JSX.Element {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [watching, setWatching] = useState(false);
  const [rating, setRating] = useState<MaturityRating>(video.maturityRating);

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['admin-moderation'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
  };

  const decide = useMutation({
    mutationFn: ({ status, reason }: { status: ModerationStatus; reason?: string }) =>
      // The rating rides along only when the moderator actually changed it, so
      // an untouched dropdown never overwrites the uploader's own choice.
      adminService.moderate(
        video.id,
        status,
        reason,
        rating === video.maturityRating ? undefined : rating,
      ),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: () => adminService.deleteVideo(video.id),
    onSuccess: invalidate,
  });

  const isPending = video.moderationStatus === 'PENDING';
  const isApproved = video.moderationStatus === 'APPROVED';
  const duration = formatDuration(video.durationSeconds);

  return (
    <li className="rounded-xl border border-white/[0.06] bg-ink-850 p-4">
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={() => setWatching((open) => !open)}
          aria-expanded={watching}
          aria-label={`Preview ${video.title}`}
          className="group/thumb relative h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-ink-800"
        >
          {video.thumbnailUrl ? (
            <img
              src={video.thumbnailUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
          ) : (
            <div className="grid size-full place-items-center">
              <Video className="size-5 text-ink-500" aria-hidden="true" />
            </div>
          )}
          <span className="absolute inset-0 grid place-items-center bg-black/45 opacity-0 transition-opacity group-hover/thumb:opacity-100">
            <Play className="size-5 text-white" aria-hidden="true" />
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold text-ink-100">{video.title}</h3>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[0.6875rem] font-medium capitalize',
                RATING_STYLE[video.maturityRating],
              )}
            >
              {video.maturityRating === 'ADULT' ? '18+' : video.maturityRating.toLowerCase()}
            </span>
          </div>

          <p className="mt-1 text-xs text-ink-400">
            {video.uploaderName ? `by ${video.uploaderName}` : 'Unknown uploader'}
            {' · '}
            <time dateTime={video.createdAt}>
              {new Date(video.createdAt).toLocaleDateString()}
            </time>
            {video.category && ` · ${video.category.name}`}
            {duration && ` · ${duration}`}
          </p>

          {video.description && (
            <p className="mt-2 line-clamp-2 text-xs text-ink-400">{video.description}</p>
          )}

          {video.moderationNote && (
            <p className="mt-2 rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-ink-300">
              Note to uploader: {video.moderationNote}
            </p>
          )}

          {watching && (
            <div className="mt-3 overflow-hidden rounded-lg bg-black">
              {video.playbackUrl ? (
                <VideoPlayer
                  src={video.playbackUrl}
                  poster={video.thumbnailUrl ?? undefined}
                  sourceName="the original host"
                />
              ) : (
                <p className="p-4 text-xs text-ink-400">
                  This upload has no playable file, which is itself a reason to reject it.
                </p>
              )}
            </div>
          )}

          {/* Classification is part of the decision. An uploader can understate
              how adult their video is, and the moderator has now watched it. */}
          {isPending && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-400">
              <label htmlFor={`rating-${video.id}`}>Rating</label>
              <select
                id={`rating-${video.id}`}
                value={rating}
                onChange={(event) => setRating(event.target.value as MaturityRating)}
                className="h-8 rounded-lg border border-white/[0.08] bg-ink-800 px-2 text-xs text-ink-100 transition-colors hover:border-white/[0.16] focus:border-brand-400"
              >
                {RATINGS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {rating === 'ADULT' && (
                <span className="text-amber-300/90">
                  Hidden everywhere except for signed-in, age-verified adults.
                </span>
              )}
            </div>
          )}

          {rejecting ? (
            <div className="mt-3">
              {/* A rejection must say why — the server enforces this too. */}
              <Input
                label={isApproved ? 'Reason for unpublishing' : 'Reason for rejection'}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Explain what the uploader needs to fix"
                hint="The uploader sees this."
              />
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  disabled={!note.trim()}
                  isLoading={decide.isPending}
                  onClick={() => decide.mutate({ status: 'REJECTED', reason: note })}
                >
                  {isApproved ? 'Confirm unpublish' : 'Confirm rejection'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : confirmingDelete ? (
            <div className="mt-3">
              <p className="text-xs text-ink-300">
                Delete &ldquo;{video.title}&rdquo; permanently? This cannot be undone.
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  isLoading={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  Delete permanently
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                leftIcon={<Play className="size-3.5" />}
                onClick={() => setWatching((open) => !open)}
              >
                {watching ? 'Hide preview' : 'Watch'}
              </Button>

              {/* Approve is offered only while it would change something. Once
                  published, the useful actions are unpublishing and removal. */}
              {!isApproved && (
                <Button
                  size="sm"
                  isLoading={decide.isPending}
                  leftIcon={<Check className="size-3.5" />}
                  onClick={() => decide.mutate({ status: 'APPROVED' })}
                >
                  {isPending ? 'Approve' : 'Approve now'}
                </Button>
              )}

              <Button
                size="sm"
                variant="outline"
                leftIcon={<X className="size-3.5" />}
                onClick={() => setRejecting(true)}
              >
                {isApproved ? 'Unpublish' : 'Reject'}
              </Button>

              <Button
                size="sm"
                variant="ghost"
                leftIcon={<Trash2 className="size-3.5" />}
                onClick={() => setConfirmingDelete(true)}
              >
                Delete
              </Button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export function ModerationPanel(): JSX.Element {
  const [status, setStatus] = useState<ModerationStatus>('PENDING');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Debounced so a hundred-item queue is not re-queried on every keystroke.
  const query = useDebounce(search, 300);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['admin-moderation', status, page, query],
    queryFn: () => adminService.moderationQueue(status, page, query || undefined),
    // Keeps the previous page on screen while the next one loads, instead of
    // flashing a spinner over a queue someone is working through.
    placeholderData: (previous) => previous,
  });

  const tabs: ModerationStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setStatus(tab);
                setPage(1);
              }}
              aria-current={status === tab ? 'true' : undefined}
              className={cn(
                'rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                status === tab
                  ? 'border-brand-400 bg-brand-500/15 text-white'
                  : 'border-white/10 bg-white/[0.03] text-ink-300 hover:text-white',
              )}
            >
              {tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <div className="relative ml-auto w-full sm:w-80">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-500"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search title, description or uploader"
            aria-label="Search the moderation queue"
            className="h-10 w-full rounded-xl border border-white/[0.08] bg-ink-800 pl-9 pr-3 text-sm text-ink-100 transition-colors hover:border-white/[0.16] focus:border-brand-400 focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-6">
        {isError ? (
          <ErrorState title="Couldn't load the queue" onRetry={() => void refetch()} />
        ) : isPending ? (
          <div className="flex justify-center py-16">
            <Spinner className="size-8" />
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="size-9" />}
            title={
              query
                ? `Nothing matching “${query}”`
                : status === 'PENDING'
                  ? 'Nothing awaiting review'
                  : `No ${status.toLowerCase()} uploads`
            }
            description={
              query
                ? 'Try a different search, or clear it to see the whole queue.'
                : status === 'PENDING'
                  ? 'New uploads will appear here for review.'
                  : undefined
            }
          />
        ) : (
          <>
            <p className="mb-3 text-sm text-ink-400" aria-live="polite">
              {data.meta.total} {data.meta.total === 1 ? 'video' : 'videos'}
              {query && ` matching “${query}”`}
            </p>

            <ul className="flex flex-col gap-3">
              {data.items.map((video) => (
                <ModerationRow key={video.id} video={video} />
              ))}
            </ul>

            {data.meta.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!data.meta.hasPrev}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm text-ink-400">
                  Page {data.meta.page} of {data.meta.totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!data.meta.hasNext}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
