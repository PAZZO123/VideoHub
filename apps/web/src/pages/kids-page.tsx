import { useQuery } from '@tanstack/react-query';
import type { VideoSummary } from '@videohub/types';
import { Play, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { taxonomyService, videosService } from '@/services/catalog.service';
import { cn } from '@/lib/cn';

/**
 * Ibitente — the kids surface.
 *
 * Intentionally breaks the dark cinematic theme: bright, chunky, high-contrast
 * and animated. Kids-only content is enforced server-side by /api/kids/*, so
 * this page cannot show anything else even if a filter were wrong.
 */

const FLOATING_EMOJI = ['🌈', '⭐', '🎈', '🦄', '🎵', '🚀', '🐻', '🌻'];

const CATEGORY_COLORS = [
  'bg-kid-pink',
  'bg-kid-purple',
  'bg-kid-blue',
  'bg-kid-green',
  'bg-kid-yellow',
  'bg-kid-orange',
];

function KidVideoCard({ video, index }: { video: VideoSummary; index: number }): JSX.Element {
  const color = CATEGORY_COLORS[index % CATEGORY_COLORS.length];

  return (
    <Link
      to={`/kids/${video.slug}`}
      className="group block focus-visible:outline-none"
      aria-label={video.title}
    >
      <div
        className={cn(
          'relative overflow-hidden rounded-3xl border-4 border-white shadow-kid transition-transform duration-300 ease-out-expo group-hover:-translate-y-2 group-hover:rotate-1',
          color,
        )}
      >
        <div className="aspect-video w-full">
          {video.thumbnailUrl ? (
            <img
              src={video.thumbnailUrl}
              alt=""
              loading="lazy"
              className="size-full object-cover"
            />
          ) : (
            <div className="grid size-full place-items-center text-6xl" aria-hidden="true">
              {FLOATING_EMOJI[index % FLOATING_EMOJI.length]}
            </div>
          )}
        </div>

        {/* Big obvious play button — small targets are hard for little hands. */}
        <span className="absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <span className="grid size-20 place-items-center rounded-full bg-white shadow-xl">
            <Play className="size-9 translate-x-1 fill-kid-pink text-kid-pink" aria-hidden="true" />
          </span>
        </span>
      </div>

      <h3 className="mt-3 text-center font-kid text-lg font-extrabold leading-tight text-white">
        {video.title}
      </h3>
    </Link>
  );
}

export default function KidsPage(): JSX.Element {
  const [activeCategory, setActiveCategory] = useState<string | undefined>(undefined);

  const { data: categories } = useQuery({
    queryKey: ['categories', 'kids'],
    queryFn: () => taxonomyService.categories(true),
    staleTime: 60 * 60 * 1000,
  });

  const { data, isPending } = useQuery({
    queryKey: ['kids-videos', activeCategory],
    queryFn: () => videosService.listKids({ category: activeCategory, limit: 24 }),
    placeholderData: (previous) => previous,
  });

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#2B1055] via-[#4C1D95] to-[#6D28D9] pb-24 pt-24">
      {/* Decorative floaters. Hidden from assistive tech and stilled for
          users who asked for reduced motion (handled globally in CSS). */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-24 -z-0">
        {FLOATING_EMOJI.map((emoji, index) => (
          <span
            key={emoji}
            className="absolute animate-bounce-soft text-4xl opacity-70"
            style={{
              left: `${(index * 12 + 5) % 95}%`,
              top: `${(index % 3) * 60}px`,
              animationDelay: `${index * 0.35}s`,
            }}
          >
            {emoji}
          </span>
        ))}
      </div>

      <div className="relative mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-10">
        <header className="text-center">
          <h1 className="font-kid text-5xl font-extrabold text-white drop-shadow-[0_4px_0_rgba(0,0,0,0.2)] sm:text-7xl">
            Ibitente
          </h1>
          <p className="mt-4 font-kid text-2xl font-bold text-kid-yellow">
            Cartoons, songs and stories!
          </p>
          <p className="mt-1 font-kid text-lg font-bold text-white/80">
            Indirimbo, inkuru n&apos;amashusho y&apos;abana
          </p>
        </header>

        {categories && categories.length > 0 && (
          <nav aria-label="Kids categories" className="mt-10">
            <ul className="flex flex-wrap justify-center gap-3">
              <li>
                <button
                  type="button"
                  onClick={() => setActiveCategory(undefined)}
                  aria-current={!activeCategory ? 'true' : undefined}
                  className={cn(
                    'rounded-full border-4 px-6 py-3 font-kid text-lg font-extrabold transition-transform hover:scale-105 active:scale-95',
                    !activeCategory
                      ? 'border-white bg-white text-kid-purple shadow-kid'
                      : 'border-white/40 bg-white/10 text-white',
                  )}
                >
                  ✨ Everything
                </button>
              </li>
              {categories.map((category) => (
                <li key={category.id}>
                  <button
                    type="button"
                    onClick={() => setActiveCategory(category.slug)}
                    aria-current={activeCategory === category.slug ? 'true' : undefined}
                    className={cn(
                      'rounded-full border-4 px-6 py-3 font-kid text-lg font-extrabold transition-transform hover:scale-105 active:scale-95',
                      activeCategory === category.slug
                        ? 'border-white bg-white text-kid-purple shadow-kid'
                        : 'border-white/40 bg-white/10 text-white',
                    )}
                  >
                    <span className="mr-2" aria-hidden="true">
                      {category.iconEmoji}
                    </span>
                    {category.name}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="mt-12">
          {isPending ? (
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="animate-pulse">
                  <div className="aspect-video w-full rounded-3xl border-4 border-white/30 bg-white/10" />
                  <div className="mx-auto mt-3 h-5 w-2/3 rounded-full bg-white/20" />
                </div>
              ))}
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="rounded-3xl border-4 border-dashed border-white/40 px-6 py-16 text-center">
              <p className="text-7xl" aria-hidden="true">
                🎪
              </p>
              <h2 className="mt-4 font-kid text-3xl font-extrabold text-white">
                Nothing here yet!
              </h2>
              <p className="mt-2 font-kid text-lg font-bold text-white/80">
                New cartoons and songs are coming soon. Check back!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((video, index) => (
                <KidVideoCard key={video.id} video={video} index={index} />
              ))}
            </div>
          )}
        </div>

        <p className="mt-16 flex items-center justify-center gap-2 text-center font-kid text-base font-bold text-white/70">
          <Sparkles className="size-5" aria-hidden="true" />
          Only kid-safe videos live here
        </p>
      </div>
    </div>
  );
}
