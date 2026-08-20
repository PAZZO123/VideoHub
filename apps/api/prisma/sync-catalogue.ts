/**
 * Fills the catalogue with real, playable video from the configured provider.
 *
 * Idempotent — re-running updates existing rows rather than duplicating them,
 * and never overrides a moderation decision a human already made.
 *
 *   npm run db:sync:catalogue --workspace=@videohub/api
 *   npm run db:sync:catalogue --workspace=@videohub/api -- --curated-only
 *
 * `--curated-only` skips the discovery queries and ingests just the hand-checked
 * titles, which is the fast path when you only want something watchable on the
 * homepage.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { CatalogueSyncService } from '../src/video-catalogue/catalogue-sync.service';

async function main(): Promise<void> {
  const logger = new Logger('CatalogueSync');
  const curatedOnly = process.argv.includes('--curated-only');

  // A standalone context boots the providers and Prisma without opening a port.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const sync = app.get(CatalogueSyncService);
    const report = await sync.sync({ includeDiscovery: !curatedOnly });

    logger.log('');
    logger.log(`Provider:          ${report.provider}`);
    logger.log(`Created:           ${report.created}`);
    logger.log(`  published:       ${report.published}`);
    logger.log(`  queued to review:${report.queuedForReview}`);
    logger.log(`Updated:           ${report.updated}`);
    logger.log(`Skipped:           ${report.skipped}`);

    const perCategory = Object.entries(report.perCategory);
    if (perCategory.length > 0) {
      logger.log('New titles by category:');
      for (const [slug, count] of perCategory.sort((a, b) => b[1] - a[1])) {
        logger.log(`  ${slug.padEnd(20)} ${count}`);
      }
    }

    if (report.queuedForReview > 0) {
      logger.log('');
      logger.log(
        `${report.queuedForReview} title(s) are PENDING and invisible to the public until an admin approves them in the moderation queue.`,
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  new Logger('CatalogueSync').error(
    'Catalogue sync failed.',
    error instanceof Error ? error.stack : String(error),
  );
  process.exit(1);
});
