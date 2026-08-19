import { Clapperboard } from 'lucide-react';
import { Link } from 'react-router-dom';

const COLUMNS = [
  {
    title: 'Browse',
    links: [
      { to: '/movies', label: 'Movies' },
      { to: '/videos', label: 'Videos' },
      { to: '/trending', label: 'Trending' },
      { to: '/kids', label: 'Ibitente (Kids)' },
    ],
  },
  {
    title: 'Tools',
    links: [
      { to: '/ai', label: 'VideoHub AI' },
      { to: '/download', label: 'URL Downloader' },
      { to: '/search', label: 'Search' },
    ],
  },
  {
    title: 'Account',
    links: [
      { to: '/profile', label: 'Profile' },
      { to: '/watchlist', label: 'Watchlist' },
      { to: '/history', label: 'History' },
      { to: '/downloads', label: 'My downloads' },
    ],
  },
];

export function Footer(): JSX.Element {
  return (
    <footer className="mt-24 border-t border-white/[0.06] bg-ink-950">
      <div className="mx-auto max-w-[1600px] px-4 py-14 sm:px-6 lg:px-10">
        <div className="grid gap-10 md:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div>
            <Link to="/" className="flex items-center gap-2 text-lg font-bold text-white">
              <span className="grid size-8 place-items-center rounded-lg bg-brand-sheen">
                <Clapperboard className="size-4.5 text-white" aria-hidden="true" />
              </span>
              Video<span className="-ml-2 text-brand-300">Hub</span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-400">
              Discover movies and videos, get recommendations from VideoHub AI, and download
              from sources that permit it.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-sm font-semibold text-ink-100">{column.title}</h2>
              <ul className="mt-4 flex flex-col gap-2.5">
                {column.links.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="text-sm text-ink-400 transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 border-t border-white/[0.06] pt-6">
          {/* Stating the policy plainly is part of the product, not boilerplate. */}
          <p className="max-w-3xl text-xs leading-relaxed text-ink-500">
            VideoHub links to legitimate sources and only downloads from sources that permit it.
            We do not bypass DRM, authentication, paywalls, or any other technical protection.
            Uploads are reviewed before they become publicly searchable.
          </p>
          <p className="mt-4 text-xs text-ink-500">
            &copy; {new Date().getFullYear()} VideoHub. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
