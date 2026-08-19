import {
  Clapperboard,
  Download,
  LogOut,
  Menu,
  Search,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/cn';

const NAV_LINKS = [
  { to: '/movies', label: 'Movies' },
  { to: '/videos', label: 'Videos' },
  { to: '/trending', label: 'Trending' },
  { to: '/kids', label: 'Ibitente' },
  { to: '/download', label: 'Download' },
];

export function Navbar(): JSX.Element {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Transparent over the hero, frosted once the page scrolls.
  useEffect(() => {
    const onScroll = (): void => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Lock body scroll while the mobile sheet is open.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const handleLogout = async (): Promise<void> => {
    await logout();
    setMobileOpen(false);
    navigate('/');
  };

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300 ease-out-expo',
        scrolled || mobileOpen
          ? 'glass shadow-lg shadow-black/20'
          : 'bg-gradient-to-b from-ink-950/80 to-transparent',
      )}
    >
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-[1600px] items-center gap-6 px-4 sm:px-6 lg:px-10">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2 text-lg font-bold tracking-tight text-white"
        >
          <span className="grid size-8 place-items-center rounded-lg bg-brand-sheen">
            <Clapperboard className="size-4.5 text-white" aria-hidden="true" />
          </span>
          Video<span className="-ml-2 text-brand-300">Hub</span>
        </Link>

        <ul className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'text-white' : 'text-ink-300 hover:text-white',
                  )
                }
              >
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/search"
            aria-label="Search"
            className="grid size-10 place-items-center rounded-lg text-ink-200 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <Search className="size-5" aria-hidden="true" />
          </Link>

          <Link to="/ai" className="hidden sm:block">
            <Button size="sm" variant="ghost" leftIcon={<Sparkles className="size-4" />}>
              AI
            </Button>
          </Link>

          {isAuthenticated ? (
            <div className="hidden items-center gap-2 sm:flex">
              <Link
                to="/profile"
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-ink-200 transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="size-7 rounded-full object-cover" />
                ) : (
                  <span className="grid size-7 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">
                    {user?.displayName.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="max-w-[9rem] truncate">{user?.displayName}</span>
              </Link>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Sign out"
                onClick={() => void handleLogout()}
              >
                <LogOut className="size-4" aria-hidden="true" />
              </Button>
            </div>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link to="/login">
                <Button size="sm" variant="ghost">
                  Sign in
                </Button>
              </Link>
              <Link to="/register">
                <Button size="sm">Get started</Button>
              </Link>
            </div>
          )}

          <button
            type="button"
            className="grid size-10 place-items-center rounded-lg text-ink-200 transition-colors hover:bg-white/[0.06] hover:text-white lg:hidden"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div
          id="mobile-menu"
          className="animate-fade-in border-t border-white/[0.06] px-4 pb-6 pt-3 lg:hidden"
        >
          <ul className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'block rounded-lg px-3 py-2.5 text-base font-medium transition-colors',
                      isActive ? 'bg-white/[0.06] text-white' : 'text-ink-300 hover:text-white',
                    )
                  }
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-col gap-2 border-t border-white/[0.06] pt-4">
            {isAuthenticated ? (
              <>
                <Link to="/profile" onClick={() => setMobileOpen(false)}>
                  <Button variant="outline" fullWidth leftIcon={<User className="size-4" />}>
                    {user?.displayName}
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  fullWidth
                  leftIcon={<LogOut className="size-4" />}
                  onClick={() => void handleLogout()}
                >
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Link to="/login" onClick={() => setMobileOpen(false)}>
                  <Button variant="outline" fullWidth>
                    Sign in
                  </Button>
                </Link>
                <Link to="/register" onClick={() => setMobileOpen(false)}>
                  <Button fullWidth>Get started</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

/** Bottom tab bar — the primary navigation on phones. */
export function MobileTabBar(): JSX.Element {
  const tabs = [
    { to: '/', label: 'Home', icon: Clapperboard, end: true },
    { to: '/search', label: 'Search', icon: Search, end: false },
    { to: '/ai', label: 'AI', icon: Sparkles, end: false },
    { to: '/download', label: 'Download', icon: Download, end: false },
    { to: '/profile', label: 'You', icon: User, end: false },
  ];

  return (
    <nav
      aria-label="Primary"
      className="glass fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.08] pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <ul className="flex items-stretch justify-around">
        {tabs.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 py-2.5 text-[0.6875rem] font-medium transition-colors',
                  isActive ? 'text-brand-300' : 'text-ink-400',
                )
              }
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
