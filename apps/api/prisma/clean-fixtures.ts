/**
 * Removes leftover verification fixtures.
 *
 * The verify scripts clean up after themselves, but a crash mid-run (a rate
 * limit, a dropped connection) can strand rows — and a stray ADULT fixture then
 * makes the *next* run's count assertions fail for the wrong reason. Run this
 * when a verification failure mentions unexpected totals.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const movies = await prisma.movie.deleteMany({
    where: {
      OR: [{ slug: { startsWith: 'adult-fixture-' } }, { slug: { startsWith: 'kids-fixture-' } }],
    },
  });

  const videos = await prisma.video.deleteMany({
    where: { slug: { startsWith: 'verify-fixture-' } },
  });

  // Cascades take the users' watchlists, history and downloads with them.
  const users = await prisma.user.deleteMany({
    where: { email: { endsWith: '@verify.local' } },
  });

  console.log('Removed leftover verification fixtures:');
  console.log(`  movies: ${movies.count}`);
  console.log(`  videos: ${videos.count}`);
  console.log(`  users:  ${users.count}`);
}

main()
  .catch((error: unknown) => {
    console.error('Cleanup failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
