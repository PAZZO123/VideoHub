import type {
  AuthSession,
  LoginPayload,
  PublicUser,
  RegisterPayload,
  UpdateProfilePayload,
} from '@videohub/types';
import { api, tokenStore, unwrap } from '@/lib/api-client';

export const authService = {
  async register(payload: RegisterPayload): Promise<AuthSession> {
    const session = await unwrap<AuthSession>(api.post('/auth/register', payload));
    tokenStore.set(session);
    return session;
  },

  async login(payload: LoginPayload): Promise<AuthSession> {
    const session = await unwrap<AuthSession>(api.post('/auth/login', payload));
    tokenStore.set(session);
    return session;
  },

  async logout(): Promise<void> {
    const refreshToken = tokenStore.getRefresh();
    try {
      await api.post('/auth/logout', refreshToken ? { refreshToken } : {});
    } finally {
      // Clear locally even if the revoke call fails — the user asked to leave.
      tokenStore.clear();
    }
  },

  me(): Promise<PublicUser> {
    return unwrap<PublicUser>(api.get('/users/me'));
  },

  updateProfile(payload: UpdateProfilePayload): Promise<PublicUser> {
    return unwrap<PublicUser>(api.patch('/users/me', payload));
  },

  verifyAge(dateOfBirth: string): Promise<PublicUser> {
    return unwrap<PublicUser>(
      api.post('/auth/verify-age', { dateOfBirth, confirmAdult: true }),
    );
  },
};
