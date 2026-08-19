import { CATEGORIES } from '@videohub/config';
import { Link } from 'react-router-dom';

/**
 * Browse entry points. Rendered from the shared taxonomy rather than the API so
 * the homepage has meaningful content on first paint with no request.
 */
export function CategoryGrid(): JSX.Element {
  const categories = CATEGORIES.filter((category) => !category.isKids);

  return (
    <section className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-10">
      <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">Browse by category</h2>

      <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {categories.map((category) => (
          <li key={category.slug}>
            <Link
              to={`/videos?category=${category.slug}`}
              className="group relative flex h-32 flex-col justify-end overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-850 p-4 transition-all duration-300 ease-out-expo hover:-translate-y-1 hover:border-white/20 hover:shadow-card-hover"
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 opacity-15 transition-opacity duration-300 group-hover:opacity-30"
                style={{
                  background: `radial-gradient(circle at 70% 20%, ${category.colorHex}, transparent 65%)`,
                }}
              />
              <span className="text-2xl" aria-hidden="true">
                {category.iconEmoji}
              </span>
              <span className="mt-2 font-semibold text-white">{category.name}</span>
              <span className="line-clamp-1 text-xs text-ink-400">{category.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Ibitente entry point — deliberately louder than the rest of the dark UI. */
export function KidsBanner(): JSX.Element {
  return (
    <section className="mx-auto max-w-[1600px] px-4 py-10 sm:px-6 lg:px-10">
      <Link
        to="/kids"
        className="group relative flex flex-col items-start gap-4 overflow-hidden rounded-3xl bg-kid-sheen p-8 transition-transform duration-300 ease-out-expo hover:scale-[1.01] sm:flex-row sm:items-center sm:gap-8 sm:p-10"
      >
        <div
          className="flex shrink-0 gap-2 text-5xl sm:text-6xl"
          aria-hidden="true"
        >
          <span className="animate-bounce-soft">🌈</span>
          <span className="animate-wiggle">🎈</span>
          <span className="animate-bounce-soft [animation-delay:0.4s]">🦄</span>
        </div>

        <div className="min-w-0">
          <h2 className="font-kid text-3xl font-extrabold text-white drop-shadow-[0_2px_0_rgba(0,0,0,0.15)] sm:text-4xl">
            Ibitente
          </h2>
          <p className="mt-1.5 font-kid text-lg font-bold text-white/95">
            Cartoons, songs and stories just for kids!
          </p>
          <p className="mt-1 text-sm font-medium text-white/80">
            Indirimbo, inkuru n&apos;amashusho y&apos;abana
          </p>
        </div>

        <span className="ml-auto hidden shrink-0 rounded-full bg-white px-6 py-3 font-kid text-lg font-extrabold text-kid-pink shadow-kid transition-transform group-hover:scale-105 sm:block">
          Let&apos;s go!
        </span>
      </Link>
    </section>
  );
}
