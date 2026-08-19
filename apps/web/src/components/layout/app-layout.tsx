import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { PageLoader } from '@/components/ui/states';
import { Footer } from './footer';
import { MobileTabBar, Navbar } from './navbar';

export function AppLayout(): JSX.Element {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* First tab stop on every page — lets keyboard users skip the nav. */}
      <a href="#main" className="sr-only sr-focusable">
        Skip to content
      </a>

      <Navbar />

      <main id="main" className="flex-1 pb-20 sm:pb-0">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>

      <Footer />
      <MobileTabBar />
    </div>
  );
}
