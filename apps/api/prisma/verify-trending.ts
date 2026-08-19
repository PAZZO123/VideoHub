/**
 * Exercises the trending recalculation against real rows, and confirms the
 * admin guard on the manual trigger.
 *
 * Creates a throwaway user, briefly promotes it to ADMIN to call the protected
 * endpoint, then deletes it.
 *
 *   npm run db:verify:trending --workspace=@videohub/api
 */
import { PrismaClient } from '@prisma/client';
import { registerUser } from './verify-helpers';

const BASE = 'http://localhost:3000/api';
const prisma = new PrismaClient();

interface Reply {
  status: number;
  json: { success?: boolean; code?: string; data?: any } | null;
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

async function main(): Promise<void> {
  console.log('Verifying the trending job against real rows…\n');

  const stamp = Date.now();
  const email = `trend-${stamp}@verify.local`;

  const token = await registerUser(email, 'Trend Verifier', 'TrendTest123');

  const denied = await call('POST', '/trending/recalculate', { token });
  check('a normal user cannot trigger the recalculation', denied.status === 403, denied.json?.code);

  await prisma.user.update({ where: { email }, data: { role: 'ADMIN' } });

  const run = await call('POST', '/trending/recalculate', { token });
  check('an admin can trigger it', run.status === 201 || run.status === 200, `${run.status}`);
  check(
    'it reports how many rows it scored',
    typeof run.json?.data?.movies === 'number' && typeof run.json?.data?.videos === 'number',
    JSON.stringify(run.json?.data),
  );

  const scored = await prisma.movie.findMany({
    select: { slug: true, trendingScore: true, rating: true, viewCount: true },
    orderBy: { trendingScore: 'desc' },
    take: 5,
  });

  check('scores are non-zero after the run', scored.some((m) => m.trendingScore > 0));
  check(
    'scores are ordered descending',
    scored.every((m, i) => i === 0 || scored[i - 1]!.trendingScore >= m.trendingScore),
  );

  console.log('\n  top titles by trending score:');
  scored.forEach((m) => console.log(`    ${m.trendingScore.toFixed(2).padStart(8)}  ${m.slug}`));

  const feed = await call('GET', '/trending?limit=5');
  check('GET /trending returns ranked items', (feed.json?.data?.length ?? 0) > 0, `${feed.json?.data?.length} items`);
  check(
    'the feed is ordered by score',
    (feed.json?.data ?? []).every(
      (item: { trendingScore: number }, i: number, arr: { trendingScore: number }[]) =>
        i === 0 || arr[i - 1]!.trendingScore >= item.trendingScore,
    ),
  );

  await prisma.user.delete({ where: { email } });

  console.log(`\n${passed}/${passed + failed} checks passed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error('Trending verification error:', error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
