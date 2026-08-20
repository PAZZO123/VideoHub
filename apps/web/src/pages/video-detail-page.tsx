import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, ExternalLink, Eye, Play } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ErrorState, PageLoader } from '@/components/ui/states';
import { ApiRequestError } from '@/lib/api-client';
import { videosService } from '@/services/catalog.service';

export default function VideoDetailPage({ kids = false }: { kids?: boolean }): JSX.Element {
  const { slug = '' } = useParams<{ slug: string }>();

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
          // A captions track is rendered below whenever the uploader supplied
          // one; the rule cannot see a conditionally rendered <track>.
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            controls
            preload="metadata"
            poster={video.thumbnailUrl ?? undefined}
            className="aspect-video w-full"
          >
            {/* Typed explicitly. Without it the browser has to sniff the
                container before it will commit to the source, which is slower
                and, on a cross-origin file behind a redirect, sometimes fails
                outright. Everything we ingest or accept is MP4. */}
            <source src={video.playbackUrl} type="video/mp4" />
            {video.captionsUrl && (
              <track
                kind="captions"
                src={video.captionsUrl}
                label={video.captionsLabel ?? 'Captions'}
                srcLang={video.language ?? 'en'}
                default
              />
            )}
            Your browser does not support the video element.
          </video>
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

      <div className="mt-6 flex flex-wrap gap-3">
        {/* Only offered when the rights holder confirmed download rights. */}
        {video.downloadAllowed ? (
          <Button leftIcon={<Download className="size-4" />}>Download</Button>
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
