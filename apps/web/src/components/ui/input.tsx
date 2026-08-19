import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, leftIcon, className, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-ink-200 mb-1.5">
          {label}
        </label>
      )}

      <div className="relative">
        {leftIcon && (
          <span
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"
            aria-hidden="true"
          >
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          // Point assistive tech at whichever helper text is actually rendered.
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={cn(
            'w-full h-11 rounded-xl bg-ink-800 border border-white/[0.08]',
            'px-3.5 text-sm text-ink-100 placeholder:text-ink-400',
            'transition-colors duration-200',
            'hover:border-white/[0.14]',
            'focus:border-brand-400 focus:bg-ink-850',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            leftIcon && 'pl-10',
            error && 'border-red-500/60 focus:border-red-500',
            className,
          )}
          {...props}
        />
      </div>

      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-sm text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-sm text-ink-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
