/**
 * Proves the age gate and Kids Mode against a real ADULT-rated row in Postgres,
 * through the live HTTP API — not through a mocked Prisma client.
 *
 * Inserts one ADULT movie and one KIDS movie, exercises every viewer state, then
 * removes them again.
 */
import { PrismaClient, MaturityRating } from '@prisma/client';

/** Loose envelope shape — these scripts assert on the wire format, not types. */
interface Envelope {
  success?: boolean;
  code?: string;
  message?: string;
  data?: any;
}

interface Reply {
  status: number;
  json: Envelope | null;
}

const BASE = 'http://localhost:3000/api';
const prisma = new PrismaClient();

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

async function call(method: string, path: string, { token, body }: { token?: string; body?: unknown } = {}): Promise<Reply> {
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

const stamp = Date.now();
const ADULT_SLUG = `adult-fixture-${stamp}`;
const KIDS_SLUG = `kids-fixture-${stamp}`;

async function makeUser(label: string, { verify = false, kidsMode = false } = {}): Promise<string> {
  const email = `${label}-${stamp}@verify.local`;
  const reg = await call('POST', '/auth/register', {
    body: { email, password: 'GateTest123', displayName: label },
  });
  let token: string = reg.json!.data.accessToken;

  if (verify) {
    await call('POST', '/auth/verify-age', {
      token,
      body: { dateOfBirth: '1990-01-01', confirmAdult: true },
    });
    // Claims are re-read per request, so the existing token now reflects it.
  }
  if (kidsMode) {
    await call('PATCH', '/users/me', { token, body: { kidsMode: true } });
  }
  return token;
}

async function main(): Promise<void> {
  console.log('Verifying the age gate against real ADULT content…\n');

  await prisma.movie.create({
    data: {
      slug: ADULT_SLUG,
      title: `Adult Fixture ${stamp}`,
      maturityRating: MaturityRating.ADULT,
      overview: 'Age-restricted fixture row.',
      rating: 5,
    },
  });
  await prisma.movie.create({
    data: {
      slug: KIDS_SLUG,
      title: `Kids Fixture ${stamp}`,
      maturityRating: MaturityRating.KIDS,
      overview: 'Kids fixture row.',
      rating: 5,
    },
  });

  const listHas = (res: Reply, slug: string) => Boolean(res.json?.data?.items?.some((m: { slug: string }) => m.slug === slug));
  const searchHas = (res: Reply, slug: string) => Boolean(res.json?.data?.movies?.some((m: { slug: string }) => m.slug === slug));

  // --- guest ---------------------------------------------------------------
  console.log('guest');
  const guestList = await call('GET', '/movies?limit=60');
  check('ADULT title absent from the listing', !listHas(guestList, ADULT_SLUG));
  check('KIDS title present in the listing', listHas(guestList, KIDS_SLUG));

  const guestDetail = await call('GET', `/movies/${ADULT_SLUG}`);
  check('ADULT detail returns 404, not 403', guestDetail.status === 404, guestDetail.json?.code);

  const guestSearch = await call('GET', `/search?q=Fixture ${stamp}`);
  check('ADULT title absent from search', !searchHas(guestSearch, ADULT_SLUG));
  check('KIDS title found by search', searchHas(guestSearch, KIDS_SLUG));

  // --- signed in, unverified ----------------------------------------------
  console.log('\nsigned in, not age-verified');
  const plain = await makeUser('plain');
  const plainList = await call('GET', '/movies?limit=60', { token: plain });
  check('ADULT title still absent', !listHas(plainList, ADULT_SLUG));
  check(
    'ADULT detail still 404s',
    (await call('GET', `/movies/${ADULT_SLUG}`, { token: plain })).status === 404,
  );
  const plainWatchlistAdd = await call('POST', '/watchlist', {
    token: plain,
    body: { kind: 'MOVIE', movieId: (await prisma.movie.findUniqueOrThrow({ where: { slug: ADULT_SLUG } })).id },
  });
  check(
    'cannot add an ADULT title to the watchlist',
    plainWatchlistAdd.status === 404,
    plainWatchlistAdd.json?.code,
  );

  // --- verified 18+ ---------------------------------------------------------
  console.log('\nverified 18+');
  const adult = await makeUser('adult', { verify: true });
  const adultList = await call('GET', '/movies?limit=60', { token: adult });
  check('ADULT title now appears in the listing', listHas(adultList, ADULT_SLUG));
  check(
    'ADULT detail is served',
    (await call('GET', `/movies/${ADULT_SLUG}`, { token: adult })).status === 200,
  );
  check('ADULT title findable by search', searchHas(await call('GET', `/search?q=Fixture ${stamp}`, { token: adult }), ADULT_SLUG));

  // --- kids mode -----------------------------------------------------------
  console.log('\nkids mode (on a verified adult account)');
  const kid = await makeUser('kid', { verify: true, kidsMode: true });
  const kidList = await call('GET', '/movies?limit=60', { token: kid });
  check('ADULT title hidden despite verification', !listHas(kidList, ADULT_SLUG));
  check('KIDS title still visible', listHas(kidList, KIDS_SLUG));
  check(
    'non-kids titles hidden too (MATURE demo movie)',
    !listHas(kidList, 'night-of-the-living-dead-1968'),
  );
  check(
    'ADULT detail 404s in kids mode',
    (await call('GET', `/movies/${ADULT_SLUG}`, { token: kid })).status === 404,
  );

  // --- count leakage --------------------------------------------------------
  console.log('\ncount integrity');
  const guestTotal: number = guestList.json!.data.meta.total;
  const adultTotal: number = adultList.json!.data.meta.total;
  const kidTotal: number = kidList.json!.data.meta.total;
  check(
    'the ADULT row is excluded from the guest total, not just the page',
    adultTotal === guestTotal + 1,
    `guest=${guestTotal} verified=${adultTotal}`,
  );
  check('kids mode total counts only KIDS titles', kidTotal < guestTotal, `kids=${kidTotal}`);

  // --- cleanup --------------------------------------------------------------
  await prisma.movie.deleteMany({ where: { slug: { in: [ADULT_SLUG, KIDS_SLUG] } } });
  await prisma.user.deleteMany({ where: { email: { contains: `-${stamp}@verify.local` } } });

  console.log(`\n${passed}/${passed + failed} checks passed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e: unknown) => {
    console.error('Age-gate run error:', e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
