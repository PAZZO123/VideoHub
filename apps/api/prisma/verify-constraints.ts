/**
 * Verifies the schema behaviours that unit tests with a mocked Prisma client
 * cannot prove — they depend on real PostgreSQL semantics.
 *
 *   1. @@unique([userId, movieId]) / @@unique([userId, videoId]) behave as one
 *      row per user per title, given Postgres treats NULLs as distinct.
 *   2. upsert works through those compound keys.
 *   3. Cascade deletes clean up dependent rows.
 *
 * Creates its own throwaway data and removes it again, so it is safe to run
 * against a database that has real content.
 *
 *   npm run db:verify --workspace=@videohub/api
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const results: { name: string; ok: boolean; detail: string }[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const SUFFIX = `verify-${Date.now()}`;

async function main(): Promise<void> {
  console.log('Verifying schema constraints against PostgreSQL…\n');

  // --- fixtures ------------------------------------------------------------
  const user = await prisma.user.create({
    data: {
      email: `${SUFFIX}@verify.local`,
      passwordHash: 'not-a-real-hash',
      displayName: 'Constraint Verifier',
    },
  });

  const movieA = await prisma.movie.create({
    data: { slug: `movie-a-${SUFFIX}`, title: 'Verify Movie A' },
  });
  const movieB = await prisma.movie.create({
    data: { slug: `movie-b-${SUFFIX}`, title: 'Verify Movie B' },
  });
  const video = await prisma.video.create({
    data: { slug: `video-${SUFFIX}`, title: 'Verify Video' },
  });

  // --- 1. compound uniqueness ---------------------------------------------
  console.log('1. Compound unique constraints');

  await prisma.watchlistItem.create({
    data: { userId: user.id, kind: 'MOVIE', movieId: movieA.id },
  });

  let duplicateRejected = false;
  try {
    await prisma.watchlistItem.create({
      data: { userId: user.id, kind: 'MOVIE', movieId: movieA.id },
    });
  } catch {
    duplicateRejected = true;
  }
  check('rejects the same movie twice for one user', duplicateRejected);

  // A second movie for the same user must still be allowed.
  await prisma.watchlistItem.create({
    data: { userId: user.id, kind: 'MOVIE', movieId: movieB.id },
  });
  check('allows a different movie for the same user', true);

  // The critical case: both rows have videoId = NULL. If Postgres treated NULLs
  // as equal, the second insert above would have failed.
  const nullVideoRows = await prisma.watchlistItem.count({
    where: { userId: user.id, videoId: null },
  });
  check(
    'multiple rows share videoId = NULL (NULLs are distinct)',
    nullVideoRows === 2,
    `${nullVideoRows} rows`,
  );

  await prisma.watchlistItem.create({
    data: { userId: user.id, kind: 'VIDEO', videoId: video.id },
  });
  check('allows a video entry alongside movie entries', true);

  // --- 2. upsert through compound keys ------------------------------------
  console.log('\n2. Upsert on compound keys');

  await prisma.watchHistory.upsert({
    where: { userId_movieId: { userId: user.id, movieId: movieA.id } },
    update: { progressSeconds: 100 },
    create: {
      userId: user.id,
      kind: 'MOVIE',
      movieId: movieA.id,
      progressSeconds: 100,
      durationSeconds: 6000,
    },
  });

  await prisma.watchHistory.upsert({
    where: { userId_movieId: { userId: user.id, movieId: movieA.id } },
    update: { progressSeconds: 250 },
    create: {
      userId: user.id,
      kind: 'MOVIE',
      movieId: movieA.id,
      progressSeconds: 250,
      durationSeconds: 6000,
    },
  });

  const historyRows = await prisma.watchHistory.findMany({
    where: { userId: user.id, movieId: movieA.id },
  });
  check(
    'repeated upsert updates one row rather than inserting',
    historyRows.length === 1 && historyRows[0]?.progressSeconds === 250,
    `${historyRows.length} row(s), progress=${historyRows[0]?.progressSeconds}`,
  );

  await prisma.watchHistory.upsert({
    where: { userId_videoId: { userId: user.id, videoId: video.id } },
    update: { progressSeconds: 42 },
    create: {
      userId: user.id,
      kind: 'VIDEO',
      videoId: video.id,
      progressSeconds: 42,
      durationSeconds: 300,
    },
  });
  const videoHistory = await prisma.watchHistory.count({
    where: { userId: user.id, videoId: video.id },
  });
  check('upsert works through the video compound key', videoHistory === 1);

  // --- 3. cascade deletes --------------------------------------------------
  console.log('\n3. Cascade deletes');

  // Deleting a movie must remove watchlist and history rows pointing at it.
  await prisma.movie.delete({ where: { id: movieB.id } });
  const orphanedByMovie = await prisma.watchlistItem.count({ where: { movieId: movieB.id } });
  check('deleting a movie removes its watchlist entries', orphanedByMovie === 0);

  // Deleting the user must remove everything owned by them.
  await prisma.user.delete({ where: { id: user.id } });

  const [leftWatchlist, leftHistory] = await Promise.all([
    prisma.watchlistItem.count({ where: { userId: user.id } }),
    prisma.watchHistory.count({ where: { userId: user.id } }),
  ]);
  check('deleting a user removes their watchlist', leftWatchlist === 0);
  check('deleting a user removes their history', leftHistory === 0);

  // --- cleanup -------------------------------------------------------------
  await prisma.movie.deleteMany({ where: { slug: { contains: SUFFIX } } });
  await prisma.video.deleteMany({ where: { slug: { contains: SUFFIX } } });

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed${failed.length ? ' — FAILURES ABOVE' : ''}`,
  );
  if (failed.length > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error('Verification error:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
