import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'kid';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand-500 text-white hover:bg-brand-400 active:bg-brand-600 shadow-lg shadow-brand-500/20',
  secondary: 'bg-ink-750 text-ink-100 hover:bg-ink-700 active:bg-ink-800',
  ghost: 'bg-transparent text-ink-200 hover:bg-white/[0.06] hover:text-white',
  outline:
    'bg-transparent text-ink-100 border border-white/15 hover:border-white/30 hover:bg-white/[0.04]',
  danger: 'bg-red-600 text-white hover:bg-red-500 active:bg-red-700',
  kid: 'bg-kid-pink text-white font-kid font-extrabold shadow-kid hover:brightness-110 active:translate-y-1 active:shadow-none',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-13 px-7 text-base gap-2.5',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    isLoading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    className,
    children,
    disabled,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      // Announces the pending state to screen readers, not just visually.
      aria-busy={isLoading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-xl font-semibold whitespace-nowrap',
        'transition-all duration-200 ease-out-expo',
        'disabled:opacity-50 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        leftIcon
      )}
      {children}
      {!isLoading && rightIcon}
    </button>
  );
});
