import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useDebounce } from '@/hooks/use-debounce';
import { cn } from '@/lib/cn';

interface SearchFieldProps {
  /** The committed value, usually read back from the URL. */
  value: string;
  /** Fired once typing settles, not on every keystroke. */
  onChange: (value: string) => void;
  placeholder?: string;
  /** Announced to screen readers; every instance needs its own. */
  label: string;
  className?: string;
  /** Softer, rounder styling for the children's section. */
  playful?: boolean;
}

/**
 * The search box used across the listing pages.
 *
 * Local state drives the input so typing stays responsive, and the debounced
 * value is what reaches the caller — a listing page turns each change into a
 * request, and firing one per keystroke would hammer the API and make results
 * flicker.
 *
 * The caller owns the committed value, so a page can keep it in the URL and
 * have back, refresh and sharing all behave.
 */
export function SearchField({
  value,
  onChange,
  placeholder = 'Search…',
  label,
  className,
  playful = false,
}: SearchFieldProps): JSX.Element {
  const [text, setText] = useState(value);
  const debounced = useDebounce(text, 300);

  // Push settled input up. Guarded so re-renders do not re-fire the same value.
  useEffect(() => {
    if (debounced !== value) onChange(debounced);
    // `onChange` is redefined per render by most callers; depending on it here
    // would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // Follow the URL when it changes from elsewhere — a cleared filter, a back
  // button — without fighting the user mid-type.
  useEffect(() => {
    setText((current) => (current === value ? current : value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className={cn('relative', className)}>
      <Search
        className={cn(
          'pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2',
          playful ? 'text-ink-700' : 'text-ink-500',
        )}
        aria-hidden="true"
      />
      <input
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={cn(
          'h-10 w-full pl-9 pr-9 text-sm transition-colors focus:outline-none',
          playful
            ? 'rounded-full border-2 border-white/70 bg-white/95 font-kid text-ink-900 placeholder:text-ink-600 focus:border-white'
            : 'rounded-xl border border-white/[0.08] bg-ink-800 text-ink-100 hover:border-white/[0.16] focus:border-brand-400',
        )}
      />
      {text && (
        <button
          type="button"
          onClick={() => setText('')}
          aria-label="Clear search"
          className={cn(
            'absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full transition-colors',
            playful
              ? 'text-ink-700 hover:bg-black/10 hover:text-ink-900'
              : 'text-ink-500 hover:bg-white/10 hover:text-white',
          )}
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
