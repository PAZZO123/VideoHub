import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, ExternalLink, Eye, Play } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { VideoPlayer } from '@/components/video/video-player';
import { ErrorState, PageLoader } from '@/components/ui/states';
import { API_URL, ApiRequestError } from '@/lib/api-client';
import { videosService } from '@/services/catalog.service';

export default function VideoDetailPage({ kids = false }: { kids?: boolean }): JSX.Element {
  const { slug = '' } = useParams<{ slug: string }>();

  // The download route sends a browser back here with a reason when it could
  // not serve the file, rather than leaving it on a page of raw JSON.
  const [searchParams, setSearchParams] = useSearchParams();
  const downloadProblem = searchParams.get('download');

  const { data: video, isPending, isError, error, refetch } = useQuery({
    queryKey: ['video', slug, { kids }],
    queryFn: () => (kids ? videosService.getKids(slug) : videosService.get(slug)),
    enabled: Boolean(slug),
  });

  if (isPending) return <PageLoader label="Loading video…" />;

  if (isError) {
    const notFound = error instanceof ApiRequestError && error.status === 404;
    return (
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-32">
        <ErrorState
          title={notFound ? 'Video not found' : "Couldn't load this video"}
          description={
            notFound
              ? 'This video may have been removed, or it may not be available to your account.'
              : 'Something went wrong. Please try again.'
          }
          onRetry={notFound ? undefined : () => void refetch()}
        />
      </div>
    );
  }

  return (
    <article className="mx-auto max-w-5xl px-4 pb-20 pt-28 sm:px-6">
      <Link
        to={kids ? '/kids' : '/videos'}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-300 transition-colors hover:text-white"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {kids ? 'Back to Ibitente' : 'All videos'}
      </Link>

      <div className="mt-6 overflow-hidden rounded-2xl bg-black">
        {video.playbackUrl ? (
          <VideoPlayer
            src={video.playbackUrl}
            poster={video.thumbnailUrl ?? undefined}
            captionsUrl={video.captionsUrl}
            captionsLabel={video.captionsLabel}
            language={video.language}
            sourceUrl={video.source?.url ?? null}
            sourceName={video.source?.platform ?? null}
          />
        ) : (
          <div className="grid aspect-video w-full place-items-center bg-ink-850">
            <div className="text-center">
              <Play className="mx-auto size-10 text-ink-500" aria-hidden="true" />
              <p className="mt-3 text-sm text-ink-400">No playable source for this video.</p>
            </div>
          </div>
        )}
      </div>

      <h1 className="mt-7 text-2xl font-bold text-balance text-white sm:text-3xl">{video.title}</h1>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-400">
        {video.category && (
          <Link
            to={`/videos?category=${video.category.slug}`}
            className="inline-flex items-center gap-1.5 transition-colors hover:text-white"
          >
            <span aria-hidden="true">{video.category.iconEmoji}</span>
            {video.category.name}
          </Link>
        )}
        <span className="inline-flex items-center gap-1.5">
          <Eye className="size-4" aria-hidden="true" />
          {video.viewCount.toLocaleString()} view{video.viewCount === 1 ? '' : 's'}
        </span>
        {video.uploaderName && <span>Uploaded by {video.uploaderName}</span>}
      </div>

      {downloadProblem && (
        <div
          role="alert"
          className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-4 py-3.5 text-sm text-amber-200/90"
        >
          <span>
            {downloadProblem === 'source-unreachable'
              ? 'That download could not start — this title streams from its original host, which is not responding right now.'
              : 'That download is not available.'}
          </span>
          <button
            type="button"
            onClick={() => setSearchParams({}, { replace: true })}
            className="font-medium underline underline-offset-2 hover:text-amber-100"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        {/* Only offered when the rights holder confirmed download rights. */}
        {video.downloadAllowed ? (
          // A plain link, not a fetch-to-blob: the browser streams the file
          // straight to disk with its own progress UI, where reading a
          // feature-length video into memory first would not. The API sets
          // Content-Disposition, so this saves rather than navigates.
          <a href={`${API_URL}/videos/${video.slug}/download`} download>
            <Button leftIcon={<Download className="size-4" />}>Download</Button>
          </a>
        ) : video.source ? (
          <a href={video.source.url} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" rightIcon={<ExternalLink className="size-4" />}>
              Open original source
            </Button>
          </a>
        ) : null}
      </div>

      {!video.downloadAllowed && (
        <p className="mt-4 rounded-xl border border-white/[0.08] bg-ink-850 px-4 py-3.5 text-xs leading-relaxed text-ink-400">
          This video does not permit downloading through VideoHub.
        </p>
      )}

      {video.description && (
        <section className="mt-10">
          <h2 className="text-lg font-bold text-white">Description</h2>
          <p className="mt-3 whitespace-pre-line leading-relaxed text-ink-300">
            {video.description}
          </p>
        </section>
      )}

      {video.tags.length > 0 && (
        <ul className="mt-8 flex flex-wrap gap-2">
          {video.tags.map((tag) => (
            <li
              key={tag}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-ink-300"
            >
              #{tag}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
