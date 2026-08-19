import { MediaKind } from '@videohub/types';
import { Check, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { useWatchlistIds } from '@/hooks/use-watchlist';

/**
 * Add/remove toggle for a single title.
 *
 * Signed-out visitors get sent to sign-in rather than a silent failure, with the
 * current page recorded so they come back to where they were.
 */
export function WatchlistButton({
  kind,
  mediaId,
  size = 'lg',
  variant = 'outline',
  fullWidth,
}: {
  kind: MediaKind;
  mediaId: string;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
  fullWidth?: boolean;
}): JSX.Element {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { isSaved, toggle } = useWatchlistIds([mediaId]);

  const saved = isSaved(mediaId);

  const handleClick = (): void => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: window.location.pathname } });
      return;
    }
    toggle.mutate({ kind, mediaId, isSaved: saved });
  };

  return (
    <Button
      size={size}
      variant={saved ? 'secondary' : variant}
      fullWidth={fullWidth}
      onClick={handleClick}
      isLoading={toggle.isPending}
      leftIcon={saved ? <Check className="size-4.5" /> : <Plus className="size-4.5" />}
      aria-pressed={saved}
    >
      {saved ? 'In your watchlist' : 'Add to Watchlist'}
    </Button>
  );
}

/** Compact icon-only variant for overlaying a card. */
export function WatchlistIconButton({
  kind,
  mediaId,
  title,
}: {
  kind: MediaKind;
  mediaId: string;
  title: string;
}): JSX.Element | null {
  const { isAuthenticated } = useAuth();
  const { isSaved, toggle } = useWatchlistIds([mediaId]);

  // No point showing a toggle that only redirects, on a card.
  if (!isAuthenticated) return null;

  const saved = isSaved(mediaId);

  return (
    <button
      type="button"
      onClick={(event) => {
        // The card itself is a link; don't navigate when toggling.
        event.preventDefault();
        event.stopPropagation();
        toggle.mutate({ kind, mediaId, isSaved: saved });
      }}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${title} from watchlist` : `Add ${title} to watchlist`}
      className="grid size-8 place-items-center rounded-lg bg-ink-950/85 text-white backdrop-blur-sm transition-colors hover:bg-brand-500"
    >
      {saved ? (
        <Check className="size-4" aria-hidden="true" />
      ) : (
        <Plus className="size-4" aria-hidden="true" />
      )}
    </button>
  );
}
