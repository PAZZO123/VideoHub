import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './button';

export function Spinner({ className }: { className?: string }): JSX.Element {
  return (
    <Loader2
      className={cn('size-6 animate-spin text-brand-400', className)}
      role="status"
      aria-label="Loading"
    />
  );
}

export function PageLoader({ label = 'Loading…' }: { label?: string }): JSX.Element {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
      <Spinner className="size-8" />
      <p className="text-sm text-ink-400">{label}</p>
    </div>
  );
}

/** Placeholder that matches a poster card's aspect ratio to avoid layout shift. */
export function CardSkeleton({ className }: { className?: string }): JSX.Element {
  return (
    <div className={cn('w-[168px] sm:w-[184px]', className)} aria-hidden="true">
      <div className="skeleton aspect-[2/3] w-full rounded-card" />
      <div className="skeleton mt-2.5 h-3.5 w-4/5 rounded" />
      <div className="skeleton mt-1.5 h-3 w-2/5 rounded" />
    </div>
  );
}

export function RailSkeleton({ count = 6 }: { count?: number }): JSX.Element {
  return (
    <div className="rail" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
      <div className="text-ink-500" aria-hidden="true">
        {icon ?? <Inbox className="size-9" />}
      </div>
      <h3 className="text-lg font-semibold text-ink-100">{title}</h3>
      {description && <p className="max-w-md text-sm text-ink-400">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}): JSX.Element {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.04] px-6 py-14 text-center"
    >
      <AlertTriangle className="size-9 text-red-400" aria-hidden="true" />
      <h3 className="text-lg font-semibold text-ink-100">{title}</h3>
      {description && <p className="max-w-md text-sm text-ink-400">{description}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
