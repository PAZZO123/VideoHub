import type { LoginPayload, PublicUser, RegisterPayload, UpdateProfilePayload } from '@videohub/types';
import { createContext } from 'react';

export interface AuthContextValue {
  user: PublicUser | null;
  /** True until the initial session restore settles. Gate redirects on this. */
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (payload: LoginPayload) => Promise<PublicUser>;
  register: (payload: RegisterPayload) => Promise<PublicUser>;
  logout: () => Promise<void>;
  updateProfile: (payload: UpdateProfilePayload) => Promise<PublicUser>;
  verifyAge: (dateOfBirth: string) => Promise<PublicUser>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
