import type { LoginPayload, PublicUser, RegisterPayload, UpdateProfilePayload } from '@videohub/types';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setSessionExpiredHandler, tokenStore } from '@/lib/api-client';
import { authService } from '@/services/auth.service';
import { AuthContext, type AuthContextValue } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore the session on mount when a token is present.
  useEffect(() => {
    let cancelled = false;

    async function restore(): Promise<void> {
      if (!tokenStore.getAccess()) {
        setIsLoading(false);
        return;
      }
      try {
        const me = await authService.me();
        if (!cancelled) setUser(me);
      } catch {
        // The interceptor already tried to refresh; a failure here means the
        // stored tokens are dead.
        tokenStore.clear();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  // Let the axios interceptor drop us back to a signed-out state.
  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
    return () => setSessionExpiredHandler(null);
  }, []);

  const login = useCallback(async (payload: LoginPayload) => {
    const session = await authService.login(payload);
    setUser(session.user);
    return session.user;
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const session = await authService.register(payload);
    setUser(session.user);
    return session.user;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (payload: UpdateProfilePayload) => {
    const updated = await authService.updateProfile(payload);
    setUser(updated);
    return updated;
  }, []);

  const verifyAge = useCallback(async (dateOfBirth: string) => {
    const updated = await authService.verifyAge(dateOfBirth);
    setUser(updated);
    return updated;
  }, []);

  const refreshUser = useCallback(async () => {
    if (!tokenStore.getAccess()) return;
    try {
      setUser(await authService.me());
    } catch {
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      isAdmin: user?.role === 'ADMIN',
      login,
      register,
      logout,
      updateProfile,
      verifyAge,
      refreshUser,
    }),
    [user, isLoading, login, register, logout, updateProfile, verifyAge, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
