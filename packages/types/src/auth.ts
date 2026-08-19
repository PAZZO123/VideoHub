import type { PublicUser } from './models';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Access-token lifetime in seconds. */
  expiresIn: number;
}

export interface AuthSession extends AuthTokens {
  user: PublicUser;
}

export interface RegisterPayload {
  email: string;
  password: string;
  displayName: string;
  dateOfBirth?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RefreshPayload {
  refreshToken: string;
}

export interface UpdateProfilePayload {
  displayName?: string;
  avatarUrl?: string | null;
  preferredLanguage?: string | null;
  kidsMode?: boolean;
}

/** JWT access-token claims. */
export interface JwtAccessClaims {
  sub: string;
  email: string;
  role: string;
  plan: string;
  ageVerified: boolean;
}
