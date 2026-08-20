import type { ApiError, ApiResponse, AuthTokens } from '@videohub/types';
import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

const ACCESS_TOKEN_KEY = 'videohub.accessToken';
const REFRESH_TOKEN_KEY = 'videohub.refreshToken';

export const tokenStore = {
  getAccess: (): string | null => localStorage.getItem(ACCESS_TOKEN_KEY),
  getRefresh: (): string | null => localStorage.getItem(REFRESH_TOKEN_KEY),
  set: (tokens: Pick<AuthTokens, 'accessToken' | 'refreshToken'>): void => {
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  },
  clear: (): void => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

/**
 * Error surface the UI works with. Every failure — network, HTTP, or API — is
 * normalised into this shape so components never branch on axios internals.
 */
export class ApiRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.getAccess();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** Callback the auth context registers so a failed refresh can clear its state. */
let onSessionExpired: (() => void) | null = null;
export const setSessionExpiredHandler = (handler: (() => void) | null): void => {
  onSessionExpired = handler;
};

// One in-flight refresh shared by every 401'd request, so a burst of parallel
// queries doesn't fire N refreshes and rotate the token out from under itself.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) return null;

  try {
    // Bare axios: the instance interceptor would attach the dead access token.
    const { data } = await axios.post<ApiResponse<AuthTokens>>(
      `${API_URL}/auth/refresh`,
      { refreshToken },
      { headers: { 'Content-Type': 'application/json' } },
    );

    if (!data.success) return null;

    tokenStore.set(data.data);
    return data.data.accessToken;
  } catch {
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean };

    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true;

      refreshPromise ??= refreshAccessToken().finally(() => {
        refreshPromise = null;
      });

      const newToken = await refreshPromise;

      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api.request(original);
      }

      tokenStore.clear();
      onSessionExpired?.();
    }

    throw toApiRequestError(error);
  },
);

function toApiRequestError(error: AxiosError<ApiError>): ApiRequestError {
  const payload = error.response?.data;

  if (payload && payload.success === false) {
    return new ApiRequestError(
      payload.code,
      payload.message,
      error.response?.status ?? 500,
      payload.details,
    );
  }

  if (error.code === 'ECONNABORTED') {
    return new ApiRequestError('TIMEOUT', 'That took too long. Please try again.', 408);
  }

  if (!error.response) {
    return new ApiRequestError(
      'NETWORK_ERROR',
      "Can't reach VideoHub right now. Check your connection.",
      0,
    );
  }

  return new ApiRequestError('INTERNAL_ERROR', 'Something went wrong. Please try again.', error.response.status);
}

/** Unwraps the `{ success, data }` envelope so callers get the payload directly. */
export async function unwrap<T>(promise: Promise<{ data: ApiResponse<T> }>): Promise<T> {
  const { data } = await promise;
  if (!data.success) {
    throw new ApiRequestError(data.code, data.message, 400, data.details);
  }
  return data.data;
}
