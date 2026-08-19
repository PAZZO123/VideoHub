import { LANGUAGES, ADULT_AGE_THRESHOLD } from '@videohub/config';
import { BadgeCheck, Baby, LogOut, ShieldCheck, User as UserIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { ApiRequestError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { usePageTitle } from '@/hooks/use-page-title';

function Section({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-ink-850 p-6 sm:p-7">
      <div className="flex items-start gap-3">
        {icon && (
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-brand-300">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          {description && <p className="mt-1 text-sm text-ink-400">{description}</p>}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Self-attested 18+ check. Requires a qualifying DOB and an explicit tick. */
function AgeVerificationForm(): JSX.Element {
  const { user, verifyAge } = useAuth();
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (user?.ageVerified) {
    return (
      <p className="flex items-center gap-2 text-sm text-green-400">
        <BadgeCheck className="size-5" aria-hidden="true" />
        Verified — age-restricted titles are available to your account.
      </p>
    );
  }

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);

    if (!confirmed) {
      setError(`You must confirm that you are ${ADULT_AGE_THRESHOLD} or older.`);
      return;
    }

    setIsSubmitting(true);
    try {
      await verifyAge(dateOfBirth);
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError ? caught.message : 'Verification failed. Try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <Input
        label="Date of birth"
        type="date"
        required
        value={dateOfBirth}
        onChange={(e) => setDateOfBirth(e.target.value)}
        max={new Date().toISOString().slice(0, 10)}
      />

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 rounded border-white/20 bg-ink-800 text-brand-500 focus:ring-brand-400"
        />
        <span className="text-sm text-ink-300">
          I confirm I am {ADULT_AGE_THRESHOLD} years of age or older.
        </span>
      </label>

      <Button type="submit" isLoading={isSubmitting} disabled={!dateOfBirth || !confirmed}>
        Verify my age
      </Button>
    </form>
  );
}

export default function ProfilePage(): JSX.Element {
  usePageTitle('Your Profile');
  const { user, updateProfile, logout } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [preferredLanguage, setPreferredLanguage] = useState(user?.preferredLanguage ?? '');
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [isSaving, setIsSaving] = useState(false);
  const [kidsSaving, setKidsSaving] = useState(false);

  if (!user) return <></>;

  const handleSave = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setIsSaving(true);
    setStatus('idle');

    try {
      await updateProfile({
        displayName: displayName.trim(),
        preferredLanguage: preferredLanguage || null,
      });
      setStatus('saved');
    } catch {
      setStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleKidsMode = async (): Promise<void> => {
    setKidsSaving(true);
    try {
      await updateProfile({ kidsMode: !user.kidsMode });
    } finally {
      setKidsSaving(false);
    }
  };

  const handleLogout = async (): Promise<void> => {
    await logout();
    navigate('/');
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-28 sm:px-6">
      <header className="flex items-center gap-4">
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="size-16 rounded-full object-cover" />
        ) : (
          <span className="grid size-16 place-items-center rounded-full bg-brand-600 text-2xl font-bold text-white">
            {user.displayName.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold text-white sm:text-3xl">
            {user.displayName}
          </h1>
          <p className="truncate text-sm text-ink-400">{user.email}</p>
        </div>
      </header>

      <div className="mt-10 flex flex-col gap-5">
        <Section title="Profile" description="How you appear on VideoHub." icon={<UserIcon className="size-5" />}>
          <form onSubmit={(e) => void handleSave(e)} className="flex flex-col gap-4">
            <Input
              label="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-200">Preferred language</span>
              <select
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value)}
                className="h-11 rounded-xl border border-white/[0.08] bg-ink-800 px-3.5 text-sm text-ink-100 transition-colors hover:border-white/[0.16] focus:border-brand-400"
              >
                <option value="">No preference</option>
                {LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center gap-3">
              <Button type="submit" isLoading={isSaving}>
                Save changes
              </Button>
              {/* Announced politely so a screen reader confirms the save. */}
              <span aria-live="polite" className="text-sm">
                {status === 'saved' && <span className="text-green-400">Saved.</span>}
                {status === 'error' && <span className="text-red-400">Couldn&apos;t save.</span>}
              </span>
            </div>
          </form>
        </Section>

        <Section
          title="Kids Mode"
          description="When on, VideoHub only ever returns content rated for children — everywhere, including search and recommendations."
          icon={<Baby className="size-5" />}
        >
          <button
            type="button"
            role="switch"
            aria-checked={user.kidsMode}
            onClick={() => void toggleKidsMode()}
            disabled={kidsSaving}
            className="flex w-full items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-ink-800 px-4 py-3.5 text-left transition-colors hover:border-white/20 disabled:opacity-60"
          >
            <span className="text-sm font-medium text-ink-100">
              Kids Mode is {user.kidsMode ? 'on' : 'off'}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                user.kidsMode ? 'bg-kid-green' : 'bg-ink-600',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 size-5 rounded-full bg-white transition-transform',
                  user.kidsMode ? 'translate-x-[1.375rem]' : 'translate-x-0.5',
                )}
              />
            </span>
          </button>
        </Section>

        <Section
          title="Age verification"
          description={`Required before any ${ADULT_AGE_THRESHOLD}+ content is shown. Turning this on switches Kids Mode off.`}
          icon={<ShieldCheck className="size-5" />}
        >
          <AgeVerificationForm />
        </Section>

        <Section title="Account" description="Plan and session.">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-ink-300">
              Plan: <span className="font-semibold text-white">{user.plan}</span>
              <span className="ml-2 text-ink-500">Everything on VideoHub is free.</span>
            </p>
            <Button
              variant="outline"
              leftIcon={<LogOut className="size-4" />}
              onClick={() => void handleLogout()}
            >
              Sign out
            </Button>
          </div>
        </Section>
      </div>
    </div>
  );
}
