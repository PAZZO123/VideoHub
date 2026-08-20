import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { RailSkeleton } from '@/components/ui/states';
import { cn } from '@/lib/cn';

/**
 * Horizontally scrolling section of cards.
 *
 * Renders nothing when there is no content and no error — an empty rail is
 * noise on a homepage, not information.
 */
export function MediaRail({
  title,
  subtitle,
  viewAllHref,
  isLoading = false,
  isEmpty = false,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  viewAllHref?: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  children?: ReactNode;
  className?: string;
}): JSX.Element | null {
  if (!isLoading && isEmpty) return null;

  return (
    <section className={cn('mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-10', className)}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-ink-400">{subtitle}</p>}
        </div>

        {viewAllHref && (
          <Link
            to={viewAllHref}
            className="group inline-flex shrink-0 items-center gap-1 text-sm font-medium text-ink-300 transition-colors hover:text-white"
          >
            View all
            <ChevronRight
              className="size-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        )}
      </div>

      {isLoading ? <RailSkeleton /> : <div className="rail">{children}</div>}
    </section>
  );
}

/** Responsive grid used by the listing pages. */
export function MediaGrid({
  children,
  variant = 'poster',
  className,
}: {
  children: ReactNode;
  variant?: 'poster' | 'landscape';
  className?: string;
}): JSX.Element {
  return (
    <div
      className={cn(
        // `[&>*]:w-full` is load-bearing. The cards carry a fixed pixel width so
        // they work inside a horizontal rail, where `.rail > *` is `shrink-0`.
        // Dropped into a grid track narrower than that width, a card overflowed
        // its column and sat on top of its neighbour — a 300px VideoCard in a
        // 203px track overlapped the next card by ~97px. Making children fill
        // the track is what the grid means, and it fixes every listing page at
        // once rather than each one remembering to pass `w-full`.
        'grid justify-items-center gap-x-4 gap-y-7 [&>*]:w-full',
        variant === 'poster'
          ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7'
          : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  );
}
