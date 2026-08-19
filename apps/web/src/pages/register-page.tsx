import { PASSWORD_RULES } from '@videohub/config';
import { Calendar, Lock, Mail, User } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { ApiRequestError } from '@/lib/api-client';
import { AuthShell } from './auth-shell';

export default function RegisterPage(): JSX.Element {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    displayName: '',
    email: '',
    password: '',
    dateOfBirth: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const update = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (form.displayName.trim().length < 2) {
      errors.displayName = 'Enter at least 2 characters.';
    }
    if (form.password.length < PASSWORD_RULES.MIN_LENGTH) {
      errors.password = `Use at least ${PASSWORD_RULES.MIN_LENGTH} characters.`;
    } else if (!/(?=.*[A-Za-z])(?=.*\d)/.test(form.password)) {
      errors.password = 'Include at least one letter and one number.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await register({
        displayName: form.displayName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        ...(form.dateOfBirth ? { dateOfBirth: form.dateOfBirth } : {}),
      });
      navigate('/', { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Free forever. Build a watchlist, track history and chat with VideoHub AI."
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4" noValidate>
        {error && (
          <p role="alert" className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        <Input
          label="Display name"
          autoComplete="name"
          required
          value={form.displayName}
          onChange={update('displayName')}
          error={fieldErrors.displayName}
          leftIcon={<User className="size-4" />}
          placeholder="Alex Uwase"
        />

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={update('email')}
          leftIcon={<Mail className="size-4" />}
          placeholder="you@example.com"
        />

        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          value={form.password}
          onChange={update('password')}
          error={fieldErrors.password}
          hint="At least 8 characters, with a letter and a number."
          leftIcon={<Lock className="size-4" />}
          placeholder="••••••••"
        />

        <Input
          label="Date of birth (optional)"
          type="date"
          value={form.dateOfBirth}
          onChange={update('dateOfBirth')}
          hint="Only needed to unlock age-restricted content. You can add it later."
          leftIcon={<Calendar className="size-4" />}
          max={new Date().toISOString().slice(0, 10)}
        />

        <Button type="submit" size="lg" fullWidth isLoading={isSubmitting} className="mt-2">
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-400">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-brand-300 hover:text-brand-200">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
