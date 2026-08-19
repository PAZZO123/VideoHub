import { LANGUAGES } from '@videohub/config';
import type { GenreDto } from '@videohub/types';
import { SearchSort } from '@videohub/types';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

export interface CatalogFilters {
  genre?: string;
  year?: number;
  minRating?: number;
  language?: string;
  sort?: string;
}

const SORT_OPTIONS = [
  { value: SearchSort.TRENDING, label: 'Trending' },
  { value: SearchSort.POPULARITY, label: 'Popular' },
  { value: SearchSort.RATING, label: 'Top rated' },
  { value: SearchSort.NEWEST, label: 'Newest' },
  { value: SearchSort.TITLE, label: 'A–Z' },
];

const RATING_OPTIONS = [6, 7, 8, 9];

/** Current year back 30, plus a decade bucket beyond that. */
function recentYears(): number[] {
  const current = new Date().getFullYear();
  return Array.from({ length: 30 }, (_, index) => current - index);
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-ink-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 min-w-[8.5rem] rounded-xl border border-white/[0.08] bg-ink-800 px-3 text-sm text-ink-100 transition-colors hover:border-white/[0.16] focus:border-brand-400"
      >
        {children}
      </select>
    </label>
  );
}

export function FilterBar({
  filters,
  genres,
  onChange,
  showGenre = true,
  className,
}: {
  filters: CatalogFilters;
  genres?: GenreDto[];
  onChange: (next: CatalogFilters) => void;
  showGenre?: boolean;
  className?: string;
}): JSX.Element {
  const hasActiveFilters = Boolean(
    filters.genre || filters.year || filters.minRating || filters.language,
  );

  // An empty string from a <select> means "no filter", so it is stripped rather
  // than sent as `?genre=`.
  const set = (key: keyof CatalogFilters, raw: string): void => {
    const next = { ...filters };
    if (!raw) {
      delete next[key];
    } else if (key === 'year' || key === 'minRating') {
      next[key] = Number(raw);
    } else {
      next[key] = raw as never;
    }
    onChange(next);
  };

  return (
    <div className={cn('flex flex-wrap items-end gap-3', className)}>
      {showGenre && genres && genres.length > 0 && (
        <Select label="Genre" value={filters.genre ?? ''} onChange={(v) => set('genre', v)}>
          <option value="">All genres</option>
          {genres.map((genre) => (
            <option key={genre.id} value={genre.slug}>
              {genre.name}
            </option>
          ))}
        </Select>
      )}

      <Select label="Year" value={filters.year?.toString() ?? ''} onChange={(v) => set('year', v)}>
        <option value="">Any year</option>
        {recentYears().map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </Select>

      <Select
        label="Rating"
        value={filters.minRating?.toString() ?? ''}
        onChange={(v) => set('minRating', v)}
      >
        <option value="">Any rating</option>
        {RATING_OPTIONS.map((rating) => (
          <option key={rating} value={rating}>
            {rating}+
          </option>
        ))}
      </Select>

      <Select
        label="Language"
        value={filters.language ?? ''}
        onChange={(v) => set('language', v)}
      >
        <option value="">Any language</option>
        {LANGUAGES.map((language) => (
          <option key={language.code} value={language.code}>
            {language.label}
          </option>
        ))}
      </Select>

      <Select label="Sort by" value={filters.sort ?? SearchSort.TRENDING} onChange={(v) => set('sort', v)}>
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<X className="size-3.5" />}
          onClick={() => onChange({ sort: filters.sort })}
        >
          Clear
        </Button>
      )}
    </div>
  );
}
