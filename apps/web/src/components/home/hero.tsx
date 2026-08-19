import { Flame, Search, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function Hero(): JSX.Element {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed) navigate(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <section className="relative isolate overflow-hidden">
      {/* Ambient colour wash. Pure CSS — no image request on first paint. */}
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <div className="absolute -top-1/3 left-1/2 size-[52rem] -translate-x-1/2 rounded-full bg-brand-600/25 blur-[120px]" />
        <div className="absolute -right-40 top-1/4 size-[34rem] rounded-full bg-accent-500/15 blur-[110px]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink-900 to-transparent" />
      </div>

      <div className="mx-auto max-w-[1600px] px-4 pb-20 pt-32 sm:px-6 sm:pt-40 lg:px-10 lg:pb-28">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-ink-200">
            <Sparkles className="size-3.5 text-brand-300" aria-hidden="true" />
            Free for everyone — no subscription
          </span>

          <h1 className="mt-6 font-display text-display-lg font-bold text-balance text-white">
            Discover.
            <br />
            Watch.
            <br />
            <span className="bg-brand-sheen bg-clip-text text-transparent">Enjoy.</span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-300">
            Find movies and videos you&apos;ll love — with recommendations from VideoHub AI that
            tell you <em className="not-italic text-ink-100">why</em> they picked them.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 max-w-xl" role="search">
            <label htmlFor="hero-search" className="sr-only">
              Search movies and videos
            </label>
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-ink-850/80 p-2 backdrop-blur-xl transition-colors focus-within:border-brand-400/60">
              <Search className="ml-2.5 size-5 shrink-0 text-ink-400" aria-hidden="true" />
              <input
                id="hero-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search movies, videos…"
                className="min-w-0 flex-1 bg-transparent py-2 text-base text-white outline-none placeholder:text-ink-400"
              />
              <Button type="submit" size="md" className="shrink-0">
                Search
              </Button>
            </div>
          </form>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/trending">
              <Button variant="outline" size="lg" leftIcon={<Flame className="size-4.5" />}>
                Explore Trending
              </Button>
            </Link>
            <Link to="/ai">
              <Button variant="ghost" size="lg" leftIcon={<Sparkles className="size-4.5" />}>
                Ask VideoHub AI
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
