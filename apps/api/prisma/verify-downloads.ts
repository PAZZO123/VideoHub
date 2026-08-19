/**
 * Exercises the downloader against the live API.
 *
 * Confirms that protected platforms are refused with a specific reason and an
 * "open at source" link, that SSRF targets are blocked, and that an authorized
 * public-domain source actually transfers and stores a file.
 *
 *   npm run db:verify:downloads --workspace=@videohub/api
 */
import { PrismaClient } from '@prisma/client';
import { registerUser } from './verify-helpers';

const BASE = 'http://localhost:3000/api';
const prisma = new PrismaClient();

interface Reply {
  status: number;
  json: { success?: boolean; code?: string; message?: string; data?: any } | null;
}

async function call(
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
  return { status: res.status, json: (await res.json().catch(() => null)) as Reply['json'] };
}

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail = ''): void => {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const analyze = (url: string): Promise<Reply> => call('POST', '/downloads/analyze', { body: { url } });

async function main(): Promise<void> {
  console.log('Verifying the downloader against the live API…\n');

  console.log('protected platforms are refused, with a way to reach the source');
  for (const [url, label] of [
    ['https://www.netflix.com/watch/80100172', 'Netflix'],
    ['https://www.disneyplus.com/movies/x/y', 'Disney+'],
    ['https://www.primevideo.com/detail/x', 'Prime Video'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'YouTube'],
    ['https://www.hulu.com/watch/x', 'Hulu'],
  ] as const) {
    const res = await analyze(url);
    const data = res.json?.data;
    check(
      `${label} refused with a reason and a source link`,
      res.status === 200 &&
        data?.permitted === false &&
        typeof data?.refusalReason === 'string' &&
        typeof data?.originalUrl === 'string' &&
        data.originalUrl.length > 0,
      data?.refusalReason,
    );
  }

  console.log('\nSSRF targets are blocked');
  for (const [url, label] of [
    ['http://169.254.169.254/latest/meta-data/', 'cloud metadata'],
    ['http://127.0.0.1:3000/api/health', 'loopback'],
    ['http://localhost:3000/api/health', 'localhost by name'],
    ['http://10.0.0.1/', 'private class A'],
    ['http://192.168.1.1/', 'private class C'],
    ['http://[::1]/', 'IPv6 loopback'],
  ] as const) {
    const res = await analyze(url);
    // A 400 from DTO validation and a 200 with permitted:false are both refusals.
    check(
      `${label} refused`,
      res.status === 400 || res.json?.data?.permitted === false,
      res.json?.data?.refusalReason ?? `HTTP ${res.status}`,
    );
  }

  console.log('\nmalformed and non-http URLs');
  for (const [url, label] of [
    ['file:///etc/passwd', 'file scheme'],
    ['ftp://example.com/x.mp4', 'ftp scheme'],
    ['not a url', 'not a url'],
  ] as const) {
    const res = await analyze(url);
    // Validation may reject at the DTO (400) or the policy (200 + refusal);
    // either is a refusal, neither is a permit.
    check(
      `${label} never permitted`,
      res.status === 400 || res.json?.data?.permitted === false,
      `${res.status}`,
    );
  }

  console.log('\nembedded credentials');
  const creds = await analyze('https://user:pass@archive.org/details/x');
  check(
    'a URL carrying credentials is refused',
    creds.status === 400 || creds.json?.data?.permitted === false,
    creds.json?.data?.refusalReason ?? `${creds.status}`,
  );

  console.log('\nauthorized source');
  const sources = await call('GET', '/downloads/sources');
  check(
    'the allowlist is published for the UI',
    Array.isArray(sources.json?.data) && sources.json!.data.length > 0,
    `${sources.json?.data?.length} hosts`,
  );

  // A small, genuinely public-domain file from an allowlisted host.
    // ~30 MB, comfortably under the default limit. The 4K original is 2.96 GB and
  // is correctly refused as too large.
  const REAL_FILE =
    'https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c0/Big_Buck_Bunny_4K.webm/Big_Buck_Bunny_4K.webm.240p.vp9.webm';
  const OVERSIZED_FILE = 'https://upload.wikimedia.org/wikipedia/commons/c/c0/Big_Buck_Bunny_4K.webm';
  const permitted = await analyze(REAL_FILE);
  check(
    'an allowlisted public-domain file is permitted',
    permitted.json?.data?.permitted === true,
    permitted.json?.data?.message,
  );
  check(
    'analysis reports a format and size',
    (permitted.json?.data?.formats?.length ?? 0) > 0,
    JSON.stringify(permitted.json?.data?.formats?.[0]),
  );

  console.log('\ndownload records');
  const stamp = Date.now();
  const email = `dl-${stamp}@verify.local`;
  const token = await registerUser(email, 'Download Verifier', 'DownloadTest123');

  const anon = await call('POST', '/downloads', { body: { url: REAL_FILE } });
  check('starting a download requires an account', anon.status === 401);

  const blocked = await call('POST', '/downloads', {
    token,
    body: { url: 'https://www.netflix.com/watch/1' },
  });
  check(
    'a refused download is recorded rather than thrown away',
    blocked.json?.data?.status === 'BLOCKED',
    blocked.json?.data?.refusalReason,
  );
  check(
    'the refusal message is kept on the record',
    (blocked.json?.data?.message?.length ?? 0) > 20,
  );

  const list = await call('GET', '/downloads', { token });
  check('the blocked attempt appears in the list', list.json?.data?.items?.length === 1);

  const otherToken = await registerUser(`other-${stamp}@verify.local`, 'Other', 'DownloadTest123');
  const otherList = await call('GET', '/downloads', { token: otherToken });
  check("another user cannot see someone else's downloads", otherList.json?.data?.items?.length === 0);

  const foreign = await call('GET', `/downloads/${blocked.json!.data.id}`, {
    token: otherToken,
  });
  check('fetching another user’s download 404s', foreign.status === 404, foreign.json?.code);

  const oversized = await call('POST', '/downloads', { token, body: { url: OVERSIZED_FILE } });
  check(
    'a file over the size limit is refused, not transferred',
    oversized.json?.data?.status === 'BLOCKED' &&
      oversized.json?.data?.refusalReason === 'TOO_LARGE',
    oversized.json?.data?.refusalReason,
  );

  // --- the real transfer ----------------------------------------------------
  console.log('\nend-to-end transfer (~30 MB, may take a moment)');
  const started = await call('POST', '/downloads', { token, body: { url: REAL_FILE } });
  check('an authorized download is accepted', started.json?.data?.status === 'PENDING');

  const id: string = started.json!.data.id;
  let final = started.json!.data;

  for (let attempt = 0; attempt < 90; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const poll = await call('GET', `/downloads/${id}`, { token });
    final = poll.json!.data;
    if (final.status === 'COMPLETED' || final.status === 'FAILED' || final.status === 'BLOCKED') {
      break;
    }
  }

  check('the transfer completes', final.status === 'COMPLETED', final.status);
  check('the stored size is recorded', (final.fileSizeBytes ?? 0) > 1_000_000, `${final.fileSizeBytes} bytes`);
  check('a storage key is recorded', typeof final.storageKey === 'string' && final.storageKey.length > 0, final.storageKey);

  if (final.storageKey) {
    const { existsSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const onDisk = resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR ?? './storage', final.storageKey);
    check('the file actually exists in storage', existsSync(onDisk), onDisk);
  }

  // Deleting the record should take the stored file with it.
  const removed = await call('DELETE', `/downloads/${id}`, { token });
  check('deleting the record succeeds', removed.status === 200);

  if (final.storageKey) {
    const { existsSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const onDisk = resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR ?? './storage', final.storageKey);
    check('deleting the record removes the stored file', !existsSync(onDisk));
  }

  await prisma.user.deleteMany({ where: { email: { contains: `-${stamp}@verify.local` } } });

  console.log(`\n${passed}/${passed + failed} checks passed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error('Downloader verification error:', error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
