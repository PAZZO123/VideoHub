import { Clapperboard } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Shared frame for the sign-in and sign-up pages. */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center px-4 py-24">
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 size-[44rem] -translate-x-1/2 rounded-full bg-brand-600/20 blur-[120px]" />
      </div>

      <div className="w-full max-w-md">
        <Link to="/" className="mx-auto flex w-fit items-center gap-2 text-xl font-bold text-white">
          <span className="grid size-9 place-items-center rounded-lg bg-brand-sheen">
            <Clapperboard className="size-5 text-white" aria-hidden="true" />
          </span>
          Video<span className="-ml-2 text-brand-300">Hub</span>
        </Link>

        <div className="mt-8 rounded-3xl border border-white/[0.08] bg-ink-850/80 p-7 backdrop-blur-xl sm:p-9">
          <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
          <p className="mt-2 text-sm text-ink-400">{subtitle}</p>
          <div className="mt-7">{children}</div>
        </div>
      </div>
    </div>
  );
}
