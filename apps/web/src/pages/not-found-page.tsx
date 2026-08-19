import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function NotFoundPage(): JSX.Element {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <p className="font-display text-7xl font-bold text-brand-400">404</p>
      <h1 className="mt-4 text-2xl font-bold text-white">We couldn&apos;t find that page</h1>
      <p className="mt-2 max-w-md text-ink-400">
        The link may be broken, or the page may have moved.
      </p>
      <div className="mt-7 flex gap-3">
        <Link to="/">
          <Button size="lg">Back to home</Button>
        </Link>
        <Link to="/search">
          <Button size="lg" variant="outline">
            Search VideoHub
          </Button>
        </Link>
      </div>
    </div>
  );
}
