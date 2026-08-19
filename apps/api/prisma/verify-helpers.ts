/**
 * Shared helpers for the live verification scripts.
 *
 * These talk to the running API over HTTP rather than through a mocked Prisma
 * client, so they exercise guards, validation, serialisation and the real
 * database together.
 */

/** Loose envelope shape — these scripts assert on the wire format, not types. */
export interface Envelope {
  success?: boolean;
  code?: string;
  message?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

export interface Reply {
  status: number;
  json: Envelope | null;
}

export const BASE = 'http://localhost:3000/api';

export async function call(
  method: string,
  path: string,
  { token, body }: { token?: string; body?: unknown } = {},
): Promise<Reply> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  return { status: res.status, json: (await res.json().catch(() => null)) as Envelope | null };
}

/**
 * Registers a verification user, waiting out the rate limiter when needed.
 *
 * /auth/register is deliberately capped at 5 per minute, and the full suite
 * creates more accounts than that across its scripts — so a 429 here is the
 * product working correctly, not a failure. Without this the scripts died with
 * "Cannot read properties of undefined", which says nothing about the cause.
 */
export async function registerUser(
  email: string,
  label: string,
  password = 'VerifyPass123',
): Promise<string> {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const reg = await call('POST', '/auth/register', {
      body: { email, password, displayName: label },
    });

    const token = reg.json?.data?.accessToken as string | undefined;
    if (token) return token;

    if (reg.status === 429) {
      const wait = 15_000 * attempt;
      console.log(`  ..    rate limited registering ${label}; waiting ${wait / 1000}s`);
      await new Promise((resolve) => setTimeout(resolve, wait));
      continue;
    }

    throw new Error(
      `Could not register ${label}: HTTP ${reg.status} ${reg.json?.code ?? ''} ${
        reg.json?.message ?? ''
      }`.trim(),
    );
  }

  throw new Error(
    `Could not register ${label}: still rate limited after 4 attempts. Wait a minute and re-run.`,
  );
}

/** Signs in an existing account, with the same 429 tolerance. */
export async function loginUser(email: string, password: string): Promise<string> {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const res = await call('POST', '/auth/login', { body: { email, password } });
    const token = res.json?.data?.accessToken as string | undefined;
    if (token) return token;

    if (res.status === 429) {
      const wait = 15_000 * attempt;
      console.log(`  ..    rate limited signing in; waiting ${wait / 1000}s`);
      await new Promise((resolve) => setTimeout(resolve, wait));
      continue;
    }

    throw new Error(`Could not sign in as ${email}: HTTP ${res.status} ${res.json?.code ?? ''}`.trim());
  }

  throw new Error(`Could not sign in as ${email}: still rate limited after 4 attempts.`);
}
