import { useEffect } from 'react';

const APP_NAME = 'VideoHub';

/**
 * Sets the document title for a page.
 *
 * Beyond the browser tab, this is what the route announcer reads out after a
 * client-side navigation — so a screen reader user is told where they landed.
 */
export function usePageTitle(title?: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · ${APP_NAME}` : `${APP_NAME} — Discover. Watch. Enjoy.`;

    // Restoring on unmount keeps the title correct if a page unmounts without a
    // route change (a modal route, say).
    return () => {
      document.title = previous;
    };
  }, [title]);
}
