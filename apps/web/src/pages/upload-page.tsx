import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UPLOAD_RULES } from '@videohub/config';
import type { ModerationStatus } from '@videohub/types';
import { CheckCircle2, Clock, FileVideo, Trash2, Upload, XCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, Spinner } from '@/components/ui/states';
import { ApiRequestError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { taxonomyService } from '@/services/catalog.service';
import { uploadsService } from '@/services/admin.service';
import { usePageTitle } from '@/hooks/use-page-title';

const STATUS_STYLE: Record<ModerationStatus, { label: string; className: string; icon: JSX.Element }> = {
  PENDING: {
    label: 'Awaiting review',
    className: 'bg-amber-500/15 text-amber-300',
    icon: <Clock className="size-3.5" aria-hidden="true" />,
  },
  APPROVED: {
    label: 'Published',
    className: 'bg-green-500/15 text-green-300',
    icon: <CheckCircle2 className="size-3.5" aria-hidden="true" />,
  },
  REJECTED: {
    label: 'Not accepted',
    className: 'bg-red-500/15 text-red-300',
    icon: <XCircle className="size-3.5" aria-hidden="true" />,
  },
};

export default function UploadPage(): JSX.Element {
  usePageTitle('Upload a Video');
  const queryClient = useQueryClient();

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categorySlug, setCategorySlug] = useState('');
  const [tags, setTags] = useState('');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ['categories', 'all'],
    queryFn: () => taxonomyService.categories(),
    staleTime: 60 * 60 * 1000,
  });

  const { data: mine, isPending: minePending } = useQuery({
    queryKey: ['my-uploads'],
    queryFn: () => uploadsService.mine(),
  });

  const upload = useMutation({
    mutationFn: () =>
      uploadsService.create(
        {
          file: file as File,
          title: title.trim(),
          description: description.trim() || undefined,
          categorySlug: categorySlug || undefined,
          tags: tags.trim() || undefined,
          rightsConfirmed,
        },
        setProgress,
      ),
    onSuccess: () => {
      setSuccess(true);
      setFile(null);
      setTitle('');
      setDescription('');
      setTags('');
      setRightsConfirmed(false);
      setProgress(0);
      void queryClient.invalidateQueries({ queryKey: ['my-uploads'] });
    },
    onError: (caught: unknown) => {
      setProgress(0);
      setError(caught instanceof ApiRequestError ? caught.message : 'That upload failed.');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => uploadsService.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-uploads'] }),
  });

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    if (!file) {
      setError('Choose a video file to upload.');
      return;
    }
    if (!rightsConfirmed) {
      setError('You must confirm you hold the rights to publish this video.');
      return;
    }
    upload.mutate();
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-28 sm:px-6">
      <header>
        <h1 className="flex items-center gap-3 font-display text-display-md font-bold text-white">
          <Upload className="size-8 text-brand-400" aria-hidden="true" />
          Upload a video
        </h1>
        <p className="mt-3 text-ink-400">
          Uploads are reviewed before they appear publicly. Only upload content you made or hold
          the rights to.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
        {error && (
          <p role="alert" className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="rounded-xl border border-green-500/25 bg-green-500/10 px-4 py-3 text-sm text-green-300">
            Uploaded. It will appear publicly once a moderator approves it.
          </p>
        )}

        <div>
          <label htmlFor="file" className="block text-sm font-medium text-ink-200">
            Video file
          </label>
          <input
            id="file"
            type="file"
            accept={UPLOAD_RULES.ALLOWED_VIDEO_MIME.join(',')}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-ink-800 px-3.5 py-2.5 text-sm text-ink-100 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-500 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-400"
          />
          <p className="mt-1.5 text-sm text-ink-400">
            MP4, WebM, OGG, MOV or MKV.
            {file && ` Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`}
          </p>
        </div>

        <Input
          label="Title"
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={UPLOAD_RULES.MAX_TITLE_LENGTH}
        />

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-ink-200">
            Description
          </label>
          <textarea
            id="description"
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={UPLOAD_RULES.MAX_DESCRIPTION_LENGTH}
            className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-ink-800 px-3.5 py-2.5 text-sm text-ink-100 transition-colors hover:border-white/[0.16] focus:border-brand-400 focus:outline-none"
          />
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-200">Category</span>
          <select
            value={categorySlug}
            onChange={(event) => setCategorySlug(event.target.value)}
            className="h-11 rounded-xl border border-white/[0.08] bg-ink-800 px-3.5 text-sm text-ink-100 transition-colors hover:border-white/[0.16] focus:border-brand-400"
          >
            <option value="">No category</option>
            {categories?.map((category) => (
              <option key={category.id} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <Input
          label="Tags"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder="comma, separated, tags"
          hint={`Up to ${UPLOAD_RULES.MAX_TAGS} tags.`}
        />

        {/* The rights claim is the gate — not a formality. */}
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-ink-850 p-4">
          <input
            type="checkbox"
            checked={rightsConfirmed}
            onChange={(event) => setRightsConfirmed(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 rounded border-white/20 bg-ink-800 text-brand-500 focus:ring-brand-400"
          />
          <span className="text-sm text-ink-300">
            I made this video, or I hold the rights to publish it on VideoHub. I understand
            uploads are reviewed and that infringing content is removed.
          </span>
        </label>

        {upload.isPending && progress > 0 && (
          <div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-brand-400 transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p aria-live="polite" className="mt-1.5 text-sm text-ink-400">
              Uploading… {progress}%
            </p>
          </div>
        )}

        <Button
          type="submit"
          size="lg"
          isLoading={upload.isPending}
          disabled={!file || !title.trim() || !rightsConfirmed}
        >
          Upload for review
        </Button>
      </form>

      <section className="mt-14">
        <h2 className="text-lg font-bold text-white">Your uploads</h2>

        <div className="mt-4">
          {minePending ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : !mine || mine.items.length === 0 ? (
            <EmptyState
              icon={<FileVideo className="size-9" />}
              title="You haven't uploaded anything yet"
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {mine.items.map((video) => {
                const status = STATUS_STYLE[video.moderationStatus];
                return (
                  <li
                    key={video.id}
                    className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-ink-850 p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold text-ink-100">{video.title}</h3>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                            status.className,
                          )}
                        >
                          {status.icon}
                          {status.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-ink-500">
                        <time dateTime={video.createdAt}>
                          {new Date(video.createdAt).toLocaleDateString()}
                        </time>
                        {video.category && ` · ${video.category.name}`}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => remove.mutate(video.id)}
                      disabled={remove.isPending}
                      aria-label={`Delete ${video.title}`}
                      className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-red-500/15 hover:text-red-400 disabled:opacity-50"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
