import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  /** Rendered instead of the default panel when supplied. */
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time crashes.
 *
 * Without this, one thrown error anywhere in the tree unmounts the whole app and
 * leaves a blank white page with nothing to act on. React only supports this via
 * a class component — there is no hook equivalent.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept in the console rather than shown: a stack trace is for whoever is
    // debugging, not for the person who just wanted to watch something.
    console.error('Unhandled render error:', error, info.componentStack);
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div
        role="alert"
        className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center"
      >
        <span className="grid size-14 place-items-center rounded-2xl bg-red-500/15">
          <AlertTriangle className="size-7 text-red-400" aria-hidden="true" />
        </span>

        <h1 className="mt-6 text-2xl font-bold text-white">Something went wrong</h1>
        <p className="mt-3 text-ink-400">
          This part of VideoHub ran into a problem. Trying again usually clears it.
        </p>

        <div className="mt-7 flex gap-3">
          <Button leftIcon={<RotateCcw className="size-4" />} onClick={this.reset}>
            Try again
          </Button>
          <Button variant="outline" onClick={() => window.location.assign('/')}>
            Back to home
          </Button>
        </div>
      </div>
    );
  }
}
