import { Construction } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';

/**
 * Temporary route target for surfaces that land in a later phase. Replaced as
 * each phase ships — never shipped as the final state of a route.
 */
export function PlaceholderPage({ title, phase }: { title: string; phase: string }): JSX.Element {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-32 sm:px-6">
      <EmptyState
        icon={<Construction className="size-9" />}
        title={title}
        description={`This section arrives in ${phase}. The route and navigation are wired up already.`}
        action={
          <Link to="/">
            <Button variant="outline">Back to home</Button>
          </Link>
        }
      />
    </div>
  );
}
