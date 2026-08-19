/**
 * Seeds the taxonomy (genres, categories) and an admin account.
 *
 * Idempotent — safe to re-run. Content itself is not seeded here; movies and
 * videos arrive through the admin dashboard or a metadata-provider sync.
 *
 *   npm run db:seed
 */
import { PrismaClient } from '@prisma/client';
import { CATEGORIES, GENRES } from '@videohub/config';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seedGenres(): Promise<void> {
  for (const genre of GENRES) {
    await prisma.genre.upsert({
      where: { slug: genre.slug },
      update: { name: genre.name },
      create: { name: genre.name, slug: genre.slug },
    });
  }
  console.log(`  genres:     ${GENRES.length}`);
}

async function seedCategories(): Promise<void> {
  for (const [index, category] of CATEGORIES.entries()) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        description: category.description,
        isKids: category.isKids,
        iconEmoji: category.iconEmoji,
        colorHex: category.colorHex,
        sortOrder: index,
      },
      create: {
        name: category.name,
        slug: category.slug,
        description: category.description,
        isKids: category.isKids,
        iconEmoji: category.iconEmoji,
        colorHex: category.colorHex,
        sortOrder: index,
      },
    });
  }
  console.log(`  categories: ${CATEGORIES.length}`);
}

async function seedAdmin(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  // No hardcoded credentials: without both variables the admin is skipped
  // rather than created with a guessable default.
  if (!email || !password) {
    console.log('  admin:      skipped (set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD)');
    return;
  }

  if (password.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters.');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: { role: 'ADMIN' },
    create: {
      email: email.toLowerCase(),
      passwordHash,
      displayName: 'VideoHub Admin',
      role: 'ADMIN',
      ageVerified: true,
      ageVerifiedAt: new Date(),
    },
  });

  console.log(`  admin:      ${email}`);
}

async function main(): Promise<void> {
  console.log('Seeding VideoHub…');
  await seedGenres();
  await seedCategories();
  await seedAdmin();
  console.log('Done.');
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
