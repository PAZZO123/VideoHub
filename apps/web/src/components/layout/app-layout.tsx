import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { PageLoader } from '@/components/ui/states';
import { ErrorBoundary } from './error-boundary';
import { Footer } from './footer';
import { MobileTabBar, Navbar } from './navbar';
import { RouteChangeHandler } from './route-change';

export function AppLayout(): JSX.Element {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* First tab stop on every page — lets keyboard users skip the nav. */}
      <a href="#main" className="sr-only sr-focusable">
        Skip to content
      </a>

      <RouteChangeHandler />
      <Navbar />

      <main id="main" className="flex-1 pb-20 sm:pb-0">
        {/* Scoped to the outlet so a crashing page keeps the chrome around it,
            leaving the user somewhere to navigate to. */}
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>

      <Footer />
      <MobileTabBar />
    </div>
  );
}
