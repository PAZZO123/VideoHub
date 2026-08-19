import { useMutation, useQuery } from '@tanstack/react-query';
import type { DownloadAnalysis } from '@videohub/types';
import {
  ArrowRight,
  CheckCircle2,
  Download,
  ExternalLink,
  Info,
  Link2,
  ShieldAlert,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { ApiRequestError } from '@/lib/api-client';
import { downloadsService, formatBytes } from '@/services/downloads.service';

/** Refusal panel. States the reason plainly and always offers the source link. */
function RefusalPanel({ analysis }: { analysis: DownloadAnalysis }): JSX.Element {
  return (
    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-6">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="font-semibold text-white">
            This source does not permit downloading through VideoHub
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-300">{analysis.message}</p>

          <a
            href={analysis.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-ink-100 transition-colors hover:border-white/30 hover:bg-white/[0.04]"
          >
            Open original source
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </div>
  );
}

function PermittedPanel({
  analysis,
  onDownload,
  isDownloading,
  isAuthenticated,
}: {
  analysis: DownloadAnalysis;
  onDownload: () => void;
  isDownloading: boolean;
  isAuthenticated: boolean;
}): JSX.Element {
  const format = analysis.formats[0];

  return (
    <div className="rounded-2xl border border-green-500/25 bg-green-500/[0.05] p-6">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-white">This source permits downloading</h2>

          <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="text-ink-400">Title</dt>
              <dd className="min-w-0 truncate font-medium text-ink-100">
                {analysis.title ?? 'Untitled'}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink-400">Host</dt>
              <dd className="font-medium text-ink-100">{analysis.host}</dd>
            </div>
            {format && (
              <>
                <div className="flex gap-2">
                  <dt className="text-ink-400">Format</dt>
                  <dd className="font-medium text-ink-100">{format.container}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-ink-400">Size</dt>
                  <dd className="font-medium text-ink-100">
                    {formatBytes(format.approxSizeBytes)}
                  </dd>
                </div>
              </>
            )}
          </dl>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {isAuthenticated ? (
              <Button
                onClick={onDownload}
                isLoading={isDownloading}
                leftIcon={<Download className="size-4" />}
              >
                Download
              </Button>
            ) : (
              <Link to="/login" state={{ from: '/download' }}>
                <Button rightIcon={<ArrowRight className="size-4" />}>
                  Sign in to download
                </Button>
              </Link>
            )}

            <a
              href={analysis.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-300 transition-colors hover:text-white"
            >
              Open at source
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DownloadPage(): JSX.Element {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: sources } = useQuery({
    queryKey: ['download-sources'],
    queryFn: () => downloadsService.sources(),
    staleTime: 60 * 60 * 1000,
  });

  const analyze = useMutation({
    mutationFn: (target: string) => downloadsService.analyze(target),
    onError: (caught: unknown) => {
      setError(
        caught instanceof ApiRequestError ? caught.message : 'Could not analyze that URL.',
      );
    },
  });

  const start = useMutation({
    mutationFn: (target: string) => downloadsService.create(target),
    onSuccess: () => navigate('/downloads'),
    onError: (caught: unknown) => {
      setError(
        caught instanceof ApiRequestError ? caught.message : 'Could not start that download.',
      );
    },
  });

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    setError(null);
    const trimmed = url.trim();
    if (trimmed) analyze.mutate(trimmed);
  };

  const analysis = analyze.data;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-28 sm:px-6">
      <header>
        <h1 className="flex items-center gap-3 font-display text-display-md font-bold text-white">
          <Link2 className="size-8 text-brand-400" aria-hidden="true" />
          Download
        </h1>
        <p className="mt-3 text-ink-400">
          Paste a video URL. VideoHub checks whether the source permits downloading, and tells you
          plainly when it does not.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="mt-8">
        <Input
          label="Video URL"
          type="url"
          inputMode="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://archive.org/details/…"
          leftIcon={<Link2 className="size-4" />}
          error={error ?? undefined}
        />

        <Button
          type="submit"
          size="lg"
          className="mt-4"
          isLoading={analyze.isPending}
          disabled={!url.trim()}
        >
          Analyze
        </Button>
      </form>

      <div className="mt-8">
        {analysis &&
          (analysis.permitted ? (
            <PermittedPanel
              analysis={analysis}
              isAuthenticated={isAuthenticated}
              isDownloading={start.isPending}
              onDownload={() => start.mutate(analysis.url)}
            />
          ) : (
            <RefusalPanel analysis={analysis} />
          ))}
      </div>

      {/* Stating the policy up front is better than surprising people with a
          refusal after they have pasted a link. */}
      <section className="mt-14 rounded-2xl border border-white/[0.08] bg-ink-850 p-6">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 size-5 shrink-0 text-ink-400" aria-hidden="true" />
          <div>
            <h2 className="font-semibold text-white">What VideoHub will and won&apos;t do</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-400">
              VideoHub downloads only from sources that permit it. It does not bypass DRM,
              authentication, paywalls, or any other technical protection — for anything else,
              you&apos;ll get a link to watch at the original source instead.
            </p>

            {sources && sources.length > 0 && (
              <>
                <h3 className="mt-6 text-sm font-semibold text-ink-200">
                  Authorized sources
                </h3>
                <ul className="mt-3 flex flex-col gap-2">
                  {sources.map((source) => (
                    <li key={source.host} className="text-sm">
                      <span className="font-medium text-ink-100">{source.label}</span>
                      <span className="text-ink-500"> — {source.basis}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </section>

      {isAuthenticated && (
        <p className="mt-8 text-center text-sm text-ink-400">
          <Link to="/downloads" className="font-medium text-brand-300 hover:text-brand-200">
            View your downloads
          </Link>
        </p>
      )}
    </div>
  );
}
