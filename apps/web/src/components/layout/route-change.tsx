import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Makes a client-side navigation behave like a real page load.
 *
 * Without this, changing route leaves the scroll position where it was and
 * leaves focus on whatever link was clicked — so a keyboard user carries on
 * tabbing from the old page's position, and a screen reader is never told the
 * page changed at all. Both are things a browser does for free on a full
 * navigation and a single-page app has to do deliberately.
 */
export function RouteChangeHandler(): JSX.Element {
  const { pathname } = useLocation();
  const announcerRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip the initial mount: the browser has already positioned the page, and
    // announcing on load would talk over the page's own heading.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const prefersReducedMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });

    // Move focus to the main landmark so the next Tab starts from the top of the
    // new page. `tabIndex=-1` makes it focusable without adding a tab stop.
    const main = document.getElementById('main');
    if (main) {
      main.setAttribute('tabindex', '-1');
      main.focus({ preventScroll: true });
    }

    // Announce the new page. The title lags a frame behind the route, so this
    // reads it on the next tick.
    const timer = setTimeout(() => {
      if (announcerRef.current) {
        announcerRef.current.textContent = `${document.title} — page loaded`;
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [pathname]);

  return (
    <div
      ref={announcerRef}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    />
  );
}
