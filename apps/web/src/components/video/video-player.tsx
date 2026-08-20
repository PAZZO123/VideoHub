import { AlertCircle, ExternalLink } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Spinner } from '@/components/ui/states';

interface VideoPlayerProps {
  src: string;
  poster?: string | undefined;
  captionsUrl?: string | null;
  captionsLabel?: string | null;
  language?: string | null;
  /** The provider's own page, offered when playback fails. */
  sourceUrl?: string | null;
  /** Shown in the slow-network hint, e.g. "archive.org". */
  sourceName?: string | null;
}

/** How long to buffer before admitting to the viewer that it is slow. */
const SLOW_AFTER_MS = 4000;

/**
 * Video element with honest loading feedback.
 *
 * Two deliberate choices:
 *
 * `preload="none"` — externally hosted media (the Internet Archive in
 * particular) can take many seconds just to return its first byte. With
 * `preload="metadata"` the browser starts that fetch as soon as the page
 * renders, so merely opening a video page felt broken. Now nothing is fetched
 * until the viewer actually presses play, and the page itself is instant.
 *
 * A visible buffering state — a stalled video with no feedback reads as a bug.
 * If buffering runs long we say why, and offer the original source, rather than
 * leaving a black rectangle.
 */
export function VideoPlayer({
  src,
  poster,
  captionsUrl,
  captionsLabel,
  language,
  sourceUrl,
  sourceName,
}: VideoPlayerProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isSlow, setIsSlow] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    if (!isBuffering) {
      setIsSlow(false);
      return;
    }
    const timer = setTimeout(() => setIsSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [isBuffering]);

  return (
    <div className="relative">
      {/* A captions track is rendered whenever one was supplied; the rule cannot
          see a conditionally rendered <track>. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        controls
        preload="none"
        poster={poster}
        className="aspect-video w-full"
        onLoadStart={() => {
          setIsBuffering(true);
          setHasFailed(false);
        }}
        onWaiting={() => setIsBuffering(true)}
        onStalled={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        onCanPlay={() => setIsBuffering(false)}
        onError={() => {
          setIsBuffering(false);
          setHasFailed(true);
        }}
      >
        {/* Typed explicitly so the browser does not have to sniff the container
            before committing to the source. */}
        <source src={src} type="video/mp4" />
        {captionsUrl && (
          <track
            kind="captions"
            src={captionsUrl}
            label={captionsLabel ?? 'Captions'}
            srcLang={language ?? 'en'}
            default
          />
        )}
        Your browser does not support the video element.
      </video>

      {isBuffering && !hasFailed && (
        <div
          className="pointer-events-none absolute inset-0 grid place-items-center bg-black/40"
          role="status"
          aria-live="polite"
        >
          <div className="text-center">
            <Spinner />
            <p className="mt-3 text-sm font-medium text-white">Buffering…</p>
            {isSlow && (
              <p className="mx-auto mt-1.5 max-w-xs text-pretty text-xs text-ink-300">
                This one streams directly from {sourceName ?? 'the original host'}, which can be
                slow. It will keep loading.
              </p>
            )}
          </div>
        </div>
      )}

      {hasFailed && (
        <div className="absolute inset-0 grid place-items-center bg-ink-900/95 px-4">
          <div className="text-center">
            <AlertCircle className="mx-auto size-8 text-amber-400" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-white">This video would not play.</p>
            <p className="mt-1 text-xs text-ink-400">
              The source may be temporarily unreachable.
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setHasFailed(false);
                  videoRef.current?.load();
                }}
                className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-400"
              >
                Try again
              </button>
              {sourceUrl && (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-medium text-ink-200 transition-colors hover:text-white"
                >
                  Open original
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
