/**
 * Builds the Movies page out of the real catalogue instead of placeholders.
 *
 * `db:seed:demo` writes skeleton Movie rows with no poster, and every one of
 * them duplicates a film already ingested as a Video by the catalogue sync. On
 * a live site that reads as broken: a grid of blank cards for titles you can
 * already watch elsewhere on the same site.
 *
 * This script instead derives Movie rows from the curated catalogue, so each
 * one carries the archive.org thumbnail, synopsis, runtime and rating that the
 * Video already has, plus a Source pointing at the item page.
 *
 * Videos are what play; Movies are metadata plus source links. That is the
 * existing split -- the movie detail page lists sources rather than embedding
 * a player -- and this script does not change it.
 *
 * Idempotent: upserts on the archive.org identity (not the slug, which is
 * derived from title and year), so re-run it after every catalogue sync.
 *
 *   npm run db:movies:from:catalogue --workspace=@videohub/api
 *   npm run db:movies:from:catalogue:ci --workspace=@videohub/api   (env from caller)
 *
 * `--keep-demo` leaves the seeded placeholder rows in place.
 */
import { PrismaClient, SourceAccess } from '@prisma/client';
import slugify from 'slugify';

const prisma = new PrismaClient();

/** The placeholder rows written by seed-demo.ts, by slug. */
const DEMO_MOVIE_SLUGS = [
  'night-of-the-living-dead-1968',
  'big-buck-bunny-2008',
  'sintel-2010',
  'tears-of-steel-2012',
  'his-girl-friday-1940',
  'nosferatu-1922',
  'charade-1963',
  'the-general-1926',
];

const ARCHIVE_PROVIDER = 'archive.org';

/**
 * Facts the source cannot be trusted for, keyed by archive.org identifier.
 *
 * Release years are rarely in the item title, and where they are they can be
 * wrong -- `charade1953` is the 1963 Donen film, not a 1953 one. Without a year
 * the Movies page's Year filter matches nothing, so these are set by hand.
 *
 * `title` overrides the item title where that title is the original-language
 * one; the original then moves to `originalTitle` rather than being discarded.
 */
const CURATED: Record<string, { year: number; title?: string; originalTitle?: string }> = {
  thegeneral1926: { year: 1926 },
  hisgirlfriday: { year: 1940 },
  steamboatbillipod: { year: 1928, title: 'Steamboat Bill, Jr.' },
  charade1953: { year: 1963 },
  nightofthelivingdead1080p: { year: 1968 },
  nosferatumostcompleteversion93mins: {
    year: 1922,
    title: 'Nosferatu',
    originalTitle: 'Nosferatu, eine Symphonie des Grauens',
  },
  daskabinettdesdoktorcaligarithecabinetofdrcaligari: {
    year: 1920,
    title: 'The Cabinet of Dr. Caligari',
    originalTitle: 'Das Kabinett des Doktor Caligari',
  },
  sintel: { year: 2010 },
  'tears-of-steel': { year: 2012 },
};

/**
 * Catalogue titles arrive as the archive.org item title, which often trails the
 * year ("The General 1926") or carries a parenthetical translation. Neither
 * belongs in a display title.
 */
function splitTitleAndYear(raw: string): { title: string; year: number | null } {
  const yearMatch = raw.match(/\b(18|19|20)\d{2}\b/);
  const year = yearMatch ? Number(yearMatch[0]) : null;

  let title = raw;
  if (yearMatch) {
    title = title.replace(yearMatch[0], ' ');
  }
  title = title
    .replace(/\s*\(([^)]*)\)\s*$/, '') // trailing parenthetical
    .replace(/[\s,;:-]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return { title: title || raw.trim(), year };
}

async function main(): Promise<void> {
  const keepDemo = process.argv.includes('--keep-demo');

  if (!keepDemo) {
    // externalProvider is the discriminator, and it is load-bearing. Seven of
    // these slugs are also what this script generates for the real films, so
    // matching on slug alone would delete the catalogue rows on every run --
    // and cascade would take their watchlist entries and watch history too.
    const removed = await prisma.movie.deleteMany({
      where: { slug: { in: DEMO_MOVIE_SLUGS }, externalProvider: null },
    });
    console.log(`Removed placeholder movies: ${removed.count}`);
  }

  const videos = await prisma.video.findMany({
    where: { category: { slug: 'movies' }, moderationStatus: 'APPROVED' },
    include: { category: { select: { slug: true } } },
    orderBy: { createdAt: 'asc' },
  });

  if (videos.length === 0) {
    console.log('No approved videos in the "movies" category. Run db:sync:catalogue first.');
    return;
  }

  let created = 0;
  let updated = 0;

  for (const video of videos) {
    const identifier = video.slug.replace(/^ia-/, '');
    const parsed = splitTitleAndYear(video.title);
    const curated = CURATED[identifier];

    const title = curated?.title ?? parsed.title;
    const year = curated?.year ?? parsed.year;
    const originalTitle = curated?.originalTitle ?? null;
    const slug = `${slugify(title, { lower: true, strict: true })}${year ? `-${year}` : ''}`;

    const data = {
      title,
      originalTitle,
      overview: video.description,
      posterUrl: video.thumbnailUrl,
      backdropUrl: video.thumbnailUrl,
      releaseYear: year,
      runtimeMinutes: video.durationSeconds ? Math.round(video.durationSeconds / 60) : null,
      language: video.language,
      maturityRating: video.maturityRating,
      externalProvider: ARCHIVE_PROVIDER,
      externalId: identifier,
      isPublished: true,
    };

    // Keyed on the archive identity, not the slug: the slug is derived from
    // title and year, so correcting either would otherwise create a duplicate
    // row rather than updating the existing one.
    const identity = {
      movie_external_identity: { externalProvider: ARCHIVE_PROVIDER, externalId: identifier },
    };
    const existing = await prisma.movie.findUnique({ where: identity });
    const movie = await prisma.movie.upsert({
      where: identity,
      create: { slug, ...data },
      update: { slug, ...data },
    });
    if (existing) {
      updated += 1;
    } else {
      created += 1;
    }

    // Replace rather than accumulate: re-running must not stack duplicate
    // source rows on the same movie.
    await prisma.source.deleteMany({
      where: { movieId: movie.id, platform: 'Internet Archive' },
    });
    await prisma.source.create({
      data: {
        platform: 'Internet Archive',
        url: `https://archive.org/details/${identifier}`,
        access: SourceAccess.PUBLIC_DOMAIN,
        downloadAllowed: video.downloadAllowed,
        licenseNote: 'Public domain or openly licensed, per the Internet Archive item page.',
        movieId: movie.id,
      },
    });

    console.log(`  ${title}${year ? ` (${year})` : ''}`);
  }

  console.log(`\nMovies created: ${created}, updated: ${updated}`);
}

main()
  .catch((error: unknown) => {
    console.error('Failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
