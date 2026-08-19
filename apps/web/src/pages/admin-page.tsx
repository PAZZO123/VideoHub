import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ModerationStatus, VideoSummary } from '@videohub/types';
import {
  Check,
  Clock,
  Download,
  Film,
  LayoutDashboard,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/states';
import { useAuth } from '@/hooks/use-auth';
import { useDebounce } from '@/hooks/use-debounce';
import { cn } from '@/lib/cn';
import { adminService } from '@/services/admin.service';

// --- dashboard ---------------------------------------------------------------

function StatTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: JSX.Element;
}): JSX.Element {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-ink-850 p-5">
      <div className="flex items-center gap-2 text-ink-400">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums text-white">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function Dashboard(): JSX.Element {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminService.stats(),
  });

  if (isError) return <ErrorState title="Couldn't load statistics" onRetry={() => void refetch()} />;
  if (isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-8" />
      </div>
    );
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile label="Users" value={data.totalUsers} icon={<Users className="size-4" />} />
        <StatTile label="Movies" value={data.totalMovies} icon={<Film className="size-4" />} />
        <StatTile label="Videos" value={data.totalVideos} icon={<Video className="size-4" />} />
        <StatTile
          label="Downloads"
          value={data.totalDownloads}
          icon={<Download className="size-4" />}
        />
        <StatTile label="Searches" value={data.totalSearches} icon={<Search className="size-4" />} />
        <StatTile
          label="Awaiting review"
          value={data.pendingModeration}
          icon={<Clock className="size-4" />}
        />
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="text-lg font-bold text-white">Most viewed</h2>
          {data.mostViewedMovies.length === 0 ? (
            <p className="mt-3 text-sm text-ink-400">No movies yet.</p>
          ) : (
            <ol className="mt-3 flex flex-col gap-2">
              {data.mostViewedMovies.map((movie, index) => (
                <li
                  key={movie.id}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-ink-850 px-4 py-3"
                >
                  <span className="w-5 text-sm font-semibold text-ink-500">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-100">
                    {movie.title}
                  </span>
                  {movie.rating !== null && (
                    <span className="text-xs text-ink-400">{movie.rating.toFixed(1)}</span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">Trending</h2>
          {data.trendingMovies.length === 0 ? (
            <p className="mt-3 text-sm text-ink-400">Nothing scored yet.</p>
          ) : (
            <ol className="mt-3 flex flex-col gap-2">
              {data.trendingMovies.map((movie, index) => (
                <li
                  key={movie.id}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-ink-850 px-4 py-3"
                >
                  <span className="w-5 text-sm font-semibold text-ink-500">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-100">
                    {movie.title}
                  </span>
                  <span className="text-xs tabular-nums text-ink-400">
                    {movie.trendingScore.toFixed(0)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

// --- moderation --------------------------------------------------------------

function ModerationRow({ video }: { video: VideoSummary }): JSX.Element {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const decide = useMutation({
    mutationFn: ({ status, reason }: { status: ModerationStatus; reason?: string }) =>
      adminService.moderate(video.id, status, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-moderation'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    },
  });

  return (
    <li className="rounded-xl border border-white/[0.06] bg-ink-850 p-4">
      <div className="flex items-start gap-4">
        <div className="h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-ink-800">
          {video.thumbnailUrl ? (
            <img src={video.thumbnailUrl} alt="" className="size-full object-cover" />
          ) : (
            <div className="grid size-full place-items-center">
              <Video className="size-5 text-ink-500" aria-hidden="true" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-ink-100">{video.title}</h3>
          <p className="mt-1 text-xs text-ink-400">
            {video.uploaderName ? `by ${video.uploaderName}` : 'Unknown uploader'}
            {' · '}
            <time dateTime={video.createdAt}>
              {new Date(video.createdAt).toLocaleDateString()}
            </time>
            {video.category && ` · ${video.category.name}`}
          </p>
          {video.description && (
            <p className="mt-2 line-clamp-2 text-xs text-ink-400">{video.description}</p>
          )}

          {rejecting ? (
            <div className="mt-3">
              {/* A rejection must say why — the server enforces this too. */}
              <Input
                label="Reason for rejection"
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
                  Confirm rejection
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                isLoading={decide.isPending}
                leftIcon={<Check className="size-3.5" />}
                onClick={() => decide.mutate({ status: 'APPROVED' })}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                leftIcon={<X className="size-3.5" />}
                onClick={() => setRejecting(true)}
              >
                Reject
              </Button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function Moderation(): JSX.Element {
  const [status, setStatus] = useState<ModerationStatus>('PENDING');

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['admin-moderation', status],
    queryFn: () => adminService.moderationQueue(status),
  });

  const tabs: ModerationStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setStatus(tab)}
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
            title={status === 'PENDING' ? 'Nothing awaiting review' : `No ${status.toLowerCase()} uploads`}
            description={
              status === 'PENDING' ? 'New uploads will appear here for review.' : undefined
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {data.items.map((video) => (
              <ModerationRow key={video.id} video={video} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// --- users -------------------------------------------------------------------

function UsersPanel(): JSX.Element {
  const queryClient = useQueryClient();
  const { user: me } = useAuth();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 300);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['admin-users', debounced],
    queryFn: () => adminService.users(1, debounced || undefined),
    placeholderData: (previous) => previous,
  });

  const update = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; role?: 'USER' | 'ADMIN'; isActive?: boolean }) =>
      adminService.updateUser(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  return (
    <div>
      <div className="max-w-md">
        <Input
          label="Search users"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Email or display name"
          leftIcon={<Search className="size-4" />}
        />
      </div>

      {update.isError && (
        <p role="alert" className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {update.error instanceof Error ? update.error.message : 'Could not update that account.'}
        </p>
      )}

      <div className="mt-6">
        {isError ? (
          <ErrorState title="Couldn't load users" onRetry={() => void refetch()} />
        ) : isPending ? (
          <div className="flex justify-center py-16">
            <Spinner className="size-8" />
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState icon={<Users className="size-9" />} title="No users match that search" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-left text-xs uppercase tracking-wide text-ink-400">
                  <th scope="col" className="py-3 pr-4 font-medium">User</th>
                  <th scope="col" className="py-3 pr-4 font-medium">Role</th>
                  <th scope="col" className="py-3 pr-4 font-medium">Watchlist</th>
                  <th scope="col" className="py-3 pr-4 font-medium">Downloads</th>
                  <th scope="col" className="py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((user) => (
                  <tr key={user.id} className="border-b border-white/[0.04]">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-ink-100">{user.displayName}</p>
                      <p className="text-xs text-ink-500">{user.email}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={cn(
                          'rounded-full px-2 py-1 text-xs font-medium',
                          user.role === 'ADMIN'
                            ? 'bg-brand-500/15 text-brand-200'
                            : 'bg-white/[0.06] text-ink-300',
                        )}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="py-3 pr-4 tabular-nums text-ink-300">{user.watchlistCount}</td>
                    <td className="py-3 pr-4 tabular-nums text-ink-300">{user.downloadCount}</td>
                    <td className="py-3">
                      {/* The server refuses self-demotion too; hiding it here
                          just avoids offering an action that cannot succeed. */}
                      {user.id === me?.id ? (
                        <span className="text-xs text-ink-500">That&apos;s you</span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          isLoading={update.isPending}
                          onClick={() =>
                            update.mutate({
                              id: user.id,
                              role: user.role === 'ADMIN' ? 'USER' : 'ADMIN',
                            })
                          }
                        >
                          {user.role === 'ADMIN' ? 'Demote' : 'Make admin'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// --- taxonomy ----------------------------------------------------------------

function Taxonomy(): JSX.Element {
  const queryClient = useQueryClient();
  const [genreName, setGenreName] = useState('');
  const [categoryName, setCategoryName] = useState('');

  const { data: genres } = useQuery({
    queryKey: ['genres'],
    queryFn: () => import('@/services/catalog.service').then((m) => m.taxonomyService.genres()),
  });
  const { data: categories } = useQuery({
    queryKey: ['categories', 'all'],
    queryFn: () => import('@/services/catalog.service').then((m) => m.taxonomyService.categories()),
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['genres'] });
    void queryClient.invalidateQueries({ queryKey: ['categories'] });
  };

  const addGenre = useMutation({
    mutationFn: () => adminService.createGenre({ name: genreName.trim() }),
    onSuccess: () => {
      setGenreName('');
      invalidate();
    },
  });

  const addCategory = useMutation({
    mutationFn: () => adminService.createCategory({ name: categoryName.trim() }),
    onSuccess: () => {
      setCategoryName('');
      invalidate();
    },
  });

  const removeGenre = useMutation({
    mutationFn: (id: string) => adminService.deleteGenre(id),
    onSuccess: invalidate,
  });
  const removeCategory = useMutation({
    mutationFn: (id: string) => adminService.deleteCategory(id),
    onSuccess: invalidate,
  });

  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <section>
        <h2 className="text-lg font-bold text-white">Genres</h2>
        <div className="mt-3 flex items-end gap-2">
          <Input
            label="New genre"
            value={genreName}
            onChange={(event) => setGenreName(event.target.value)}
            placeholder="e.g. Musical"
          />
          <Button
            disabled={!genreName.trim()}
            isLoading={addGenre.isPending}
            onClick={() => addGenre.mutate()}
          >
            Add
          </Button>
        </div>

        <ul className="mt-4 flex flex-wrap gap-2">
          {genres?.map((genre) => (
            <li
              key={genre.id}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] py-1.5 pl-3 pr-1.5 text-sm text-ink-200"
            >
              {genre.name}
              <button
                type="button"
                aria-label={`Delete ${genre.name}`}
                onClick={() => removeGenre.mutate(genre.id)}
                className="grid size-6 place-items-center rounded-full text-ink-500 hover:bg-red-500/20 hover:text-red-400"
              >
                <Trash2 className="size-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold text-white">Categories</h2>
        <div className="mt-3 flex items-end gap-2">
          <Input
            label="New category"
            value={categoryName}
            onChange={(event) => setCategoryName(event.target.value)}
            placeholder="e.g. Sports"
          />
          <Button
            disabled={!categoryName.trim()}
            isLoading={addCategory.isPending}
            onClick={() => addCategory.mutate()}
          >
            Add
          </Button>
        </div>

        <ul className="mt-4 flex flex-wrap gap-2">
          {categories?.map((category) => (
            <li
              key={category.id}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] py-1.5 pl-3 pr-1.5 text-sm text-ink-200"
            >
              <span aria-hidden="true">{category.iconEmoji}</span>
              {category.name}
              {category.isKids && (
                <span className="rounded bg-kid-pink/20 px-1.5 py-0.5 text-[0.625rem] font-semibold text-kid-pink">
                  KIDS
                </span>
              )}
              <button
                type="button"
                aria-label={`Delete ${category.name}`}
                onClick={() => removeCategory.mutate(category.id)}
                className="grid size-6 place-items-center rounded-full text-ink-500 hover:bg-red-500/20 hover:text-red-400"
              >
                <Trash2 className="size-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// --- shell -------------------------------------------------------------------

const TABS = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/moderation', label: 'Moderation', icon: ShieldCheck, end: false },
  { to: '/admin/users', label: 'Users', icon: Users, end: false },
  { to: '/admin/taxonomy', label: 'Taxonomy', icon: Film, end: false },
];

export default function AdminPage(): JSX.Element {
  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-20 pt-28 sm:px-6 lg:px-10">
      <header>
        <h1 className="font-display text-display-md font-bold text-white">Admin</h1>
        <p className="mt-2 text-ink-400">Content, moderation and accounts.</p>
      </header>

      <nav aria-label="Admin sections" className="mt-7 border-b border-white/[0.08]">
        <ul className="flex flex-wrap gap-1">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                    isActive
                      ? 'border-brand-400 text-white'
                      : 'border-transparent text-ink-400 hover:text-white',
                  )
                }
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-8">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="moderation" element={<Moderation />} />
          <Route path="users" element={<UsersPanel />} />
          <Route path="taxonomy" element={<Taxonomy />} />
        </Routes>
      </div>
    </div>
  );
}
