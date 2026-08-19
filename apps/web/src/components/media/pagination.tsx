import type { PageMeta } from '@videohub/types';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Windowed page numbers with ellipses, e.g. 1 … 4 5 6 … 20. */
function pageWindow(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

  const pages = new Set<number>([1, total, current]);
  if (current - 1 > 1) pages.add(current - 1);
  if (current + 1 < total) pages.add(current + 1);

  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | 'gap')[] = [];

  sorted.forEach((page, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined && page - previous > 1) result.push('gap');
    result.push(page);
  });

  return result;
}

export function Pagination({
  meta,
  onPageChange,
}: {
  meta: PageMeta;
  onPageChange: (page: number) => void;
}): JSX.Element | null {
  if (meta.totalPages <= 1) return null;

  return (
    <nav aria-label="Pagination" className="mt-12 flex items-center justify-center gap-1.5">
      <Button
        variant="outline"
        size="sm"
        disabled={!meta.hasPrev}
        onClick={() => onPageChange(meta.page - 1)}
        aria-label="Previous page"
        leftIcon={<ChevronLeft className="size-4" />}
      >
        <span className="hidden sm:inline">Previous</span>
      </Button>

      <ul className="flex items-center gap-1.5">
        {pageWindow(meta.page, meta.totalPages).map((entry, index) =>
          entry === 'gap' ? (
            <li key={`gap-${index}`} className="px-1 text-ink-500" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={entry}>
              <button
                type="button"
                onClick={() => onPageChange(entry)}
                aria-current={entry === meta.page ? 'page' : undefined}
                className={
                  entry === meta.page
                    ? 'size-9 rounded-lg bg-brand-500 text-sm font-semibold text-white'
                    : 'size-9 rounded-lg text-sm font-medium text-ink-300 transition-colors hover:bg-white/[0.06] hover:text-white'
                }
              >
                {entry}
              </button>
            </li>
          ),
        )}
      </ul>

      <Button
        variant="outline"
        size="sm"
        disabled={!meta.hasNext}
        onClick={() => onPageChange(meta.page + 1)}
        aria-label="Next page"
        rightIcon={<ChevronRight className="size-4" />}
      >
        <span className="hidden sm:inline">Next</span>
      </Button>
    </nav>
  );
}
