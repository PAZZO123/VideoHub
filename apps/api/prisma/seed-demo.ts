/**
 * Optional demo content, so the homepage rails, trending job and Ibitente page
 * render with real data during development.
 *
 * Everything here is public-domain or openly licensed (Internet Archive,
 * Wikimedia, Blender open movies) — nothing is scraped and no protected source
 * is referenced. Idempotent: re-running upserts by slug.
 *
 *   npm run db:seed:demo --workspace=@videohub/api
 */
import { MaturityRating, ModerationStatus, PrismaClient, SourceAccess } from '@prisma/client';

const prisma = new PrismaClient();

interface DemoMovie {
  slug: string;
  title: string;
  tagline?: string;
  overview: string;
  releaseYear: number;
  runtimeMinutes: number;
  rating: number;
  language: string;
  director?: string;
  genres: string[];
  maturityRating: MaturityRating;
  posterUrl?: string;
  cast?: { name: string; character?: string }[];
  source?: { platform: string; url: string; access: SourceAccess; downloadAllowed: boolean };
}

const MOVIES: DemoMovie[] = [
  {
    slug: 'night-of-the-living-dead-1968',
    title: 'Night of the Living Dead',
    tagline: 'They keep coming back in a bloodthirsty lust for human flesh.',
    overview:
      'Seven people barricade themselves inside a rural farmhouse as the recently dead rise and attack the living. A landmark of independent horror, now in the public domain.',
    releaseYear: 1968,
    runtimeMinutes: 96,
    rating: 7.8,
    language: 'en',
    director: 'George A. Romero',
    genres: ['horror', 'thriller'],
    maturityRating: MaturityRating.MATURE,
    cast: [
      { name: 'Duane Jones', character: 'Ben' },
      { name: 'Judith O’Dea', character: 'Barbra' },
    ],
    source: {
      platform: 'Internet Archive',
      url: 'https://archive.org/details/night_of_the_living_dead',
      access: SourceAccess.PUBLIC_DOMAIN,
      downloadAllowed: true,
    },
  },
  {
    slug: 'big-buck-bunny-2008',
    title: 'Big Buck Bunny',
    tagline: 'A big rabbit with a heart of gold.',
    overview:
      'A gentle giant rabbit takes revenge on three bullying rodents. Produced by the Blender Foundation and released under Creative Commons.',
    releaseYear: 2008,
    runtimeMinutes: 10,
    rating: 7.4,
    language: 'en',
    director: 'Sacha Goedegebure',
    genres: ['animation', 'comedy', 'family'],
    maturityRating: MaturityRating.KIDS,
    source: {
      platform: 'Blender Open Movies',
      url: 'https://archive.org/details/BigBuckBunny_124',
      access: SourceAccess.PUBLIC_DOMAIN,
      downloadAllowed: true,
    },
  },
  {
    slug: 'sintel-2010',
    title: 'Sintel',
    tagline: 'A lone warrior searching for her lost companion.',
    overview:
      'A young woman crosses a harsh world in search of the dragon she once nursed back to health. A Blender Foundation open movie.',
    releaseYear: 2010,
    runtimeMinutes: 15,
    rating: 7.6,
    language: 'en',
    director: 'Colin Levy',
    genres: ['animation', 'fantasy', 'adventure'],
    maturityRating: MaturityRating.GENERAL,
    source: {
      platform: 'Blender Open Movies',
      url: 'https://archive.org/details/Sintel',
      access: SourceAccess.PUBLIC_DOMAIN,
      downloadAllowed: true,
    },
  },
  {
    slug: 'tears-of-steel-2012',
    title: 'Tears of Steel',
    overview:
      'In a future Amsterdam, a group of scientists attempt to reverse a catastrophe by recreating a moment from the past. A Blender open movie shot with live action and VFX.',
    releaseYear: 2012,
    runtimeMinutes: 12,
    rating: 7.1,
    language: 'en',
    director: 'Ian Hubert',
    genres: ['sci-fi', 'drama'],
    maturityRating: MaturityRating.TEEN,
    source: {
      platform: 'Blender Open Movies',
      url: 'https://archive.org/details/TearsOfSteel',
      access: SourceAccess.PUBLIC_DOMAIN,
      downloadAllowed: true,
    },
  },
  {
    slug: 'his-girl-friday-1940',
    title: 'His Girl Friday',
    tagline: 'The thrill of the scoop.',
    overview:
      'A newspaper editor schemes to keep his ace reporter — and ex-wife — from remarrying and leaving the paper. A screwball comedy classic in the public domain.',
    releaseYear: 1940,
    runtimeMinutes: 92,
    rating: 7.9,
    language: 'en',
    director: 'Howard Hawks',
    genres: ['comedy', 'romance'],
    maturityRating: MaturityRating.GENERAL,
    cast: [
      { name: 'Cary Grant', character: 'Walter Burns' },
      { name: 'Rosalind Russell', character: 'Hildy Johnson' },
    ],
    source: {
      platform: 'Internet Archive',
      url: 'https://archive.org/details/his_girl_friday',
      access: SourceAccess.PUBLIC_DOMAIN,
      downloadAllowed: true,
    },
  },
  {
    slug: 'nosferatu-1922',
    title: 'Nosferatu',
    tagline: 'A symphony of horror.',
    overview:
      'An estate agent travels to the Carpathians to meet a reclusive count, and brings a plague home with him. F. W. Murnau’s expressionist landmark.',
    releaseYear: 1922,
    runtimeMinutes: 94,
    rating: 7.9,
    language: 'de',
    director: 'F. W. Murnau',
    genres: ['horror', 'fantasy'],
    maturityRating: MaturityRating.TEEN,
    source: {
      platform: 'Internet Archive',
      url: 'https://archive.org/details/nosferatu',
      access: SourceAccess.PUBLIC_DOMAIN,
      downloadAllowed: true,
    },
  },
  {
    slug: 'charade-1963',
    title: 'Charade',
    overview:
      'A widow is pursued by several men who want the fortune her murdered husband stole. Fell into the public domain through a copyright notice omission.',
    releaseYear: 1963,
    runtimeMinutes: 113,
    rating: 7.9,
    language: 'en',
    director: 'Stanley Donen',
    genres: ['mystery', 'romance', 'thriller'],
    maturityRating: MaturityRating.GENERAL,
    cast: [
      { name: 'Cary Grant', character: 'Peter Joshua' },
      { name: 'Audrey Hepburn', character: 'Regina Lampert' },
    ],
    source: {
      platform: 'Internet Archive',
      url: 'https://archive.org/details/Charade_1963',
      access: SourceAccess.PUBLIC_DOMAIN,
      downloadAllowed: true,
    },
  },
  {
    slug: 'the-general-1926',
    title: 'The General',
    overview:
      'A railway engineer pursues his stolen locomotive — and his sweetheart — through enemy lines. Buster Keaton’s celebrated silent comedy.',
    releaseYear: 1926,
    runtimeMinutes: 79,
    rating: 8.1,
    language: 'en',
    director: 'Buster Keaton',
    genres: ['comedy', 'action', 'war'],
    maturityRating: MaturityRating.GENERAL,
    source: {
      platform: 'Internet Archive',
      url: 'https://archive.org/details/TheGeneral_20141024',
      access: SourceAccess.PUBLIC_DOMAIN,
      downloadAllowed: true,
    },
  },
];

interface DemoVideo {
  slug: string;
  title: string;
  description: string;
  categorySlug: string;
  durationSeconds: number;
  language: string;
  tags: string[];
  maturityRating: MaturityRating;
}

const VIDEOS: DemoVideo[] = [
  {
    slug: 'counting-song-one-to-ten',
    title: 'Counting 1 to 10',
    description: 'A cheerful sing-along for counting to ten.',
    categorySlug: 'learn-and-play',
    durationSeconds: 180,
    language: 'en',
    tags: ['numbers', 'counting', 'song'],
    maturityRating: MaturityRating.KIDS,
  },
  {
    slug: 'indirimbo-y-amabara',
    title: 'Indirimbo y’Amabara',
    description: 'Amabara mu Kinyarwanda — a colours song for little ones.',
    categorySlug: 'indirimbo-zabana',
    durationSeconds: 210,
    language: 'rw',
    tags: ['amabara', 'indirimbo', 'colours'],
    maturityRating: MaturityRating.KIDS,
  },
  {
    slug: 'the-lion-and-the-mouse',
    title: 'The Lion and the Mouse',
    description: 'A retelling of the classic fable about kindness repaid.',
    categorySlug: 'stories',
    durationSeconds: 300,
    language: 'en',
    tags: ['fable', 'story', 'bedtime'],
    maturityRating: MaturityRating.KIDS,
  },
  {
    slug: 'shapes-all-around-us',
    title: 'Shapes All Around Us',
    description: 'Spotting circles, squares and triangles in everyday places.',
    categorySlug: 'learn-and-play',
    durationSeconds: 240,
    language: 'en',
    tags: ['shapes', 'learning'],
    maturityRating: MaturityRating.KIDS,
  },
  {
    slug: 'inkuru-y-urukwavu',
    title: 'Inkuru y’Urukwavu',
    description: 'Inkuru nziza y’urukwavu rwihuta — a rabbit story in Kinyarwanda.',
    categorySlug: 'stories',
    durationSeconds: 260,
    language: 'rw',
    tags: ['inkuru', 'urukwavu'],
    maturityRating: MaturityRating.KIDS,
  },
  {
    slug: 'blender-open-movie-reel',
    title: 'Blender Open Movie Reel',
    description: 'Highlights from the Blender Foundation’s open movie projects.',
    categorySlug: 'learning',
    durationSeconds: 420,
    language: 'en',
    tags: ['animation', 'blender', 'open source'],
    maturityRating: MaturityRating.GENERAL,
  },
];

async function main(): Promise<void> {
  console.log('Seeding demo content…');

  const genres = await prisma.genre.findMany();
  const genreBySlug = new Map(genres.map((g) => [g.slug, g.id]));

  for (const movie of MOVIES) {
    const record = await prisma.movie.upsert({
      where: { slug: movie.slug },
      update: {
        title: movie.title,
        tagline: movie.tagline ?? null,
        overview: movie.overview,
        releaseYear: movie.releaseYear,
        releaseDate: new Date(`${movie.releaseYear}-01-01`),
        runtimeMinutes: movie.runtimeMinutes,
        rating: movie.rating,
        language: movie.language,
        director: movie.director ?? null,
        maturityRating: movie.maturityRating,
      },
      create: {
        slug: movie.slug,
        title: movie.title,
        tagline: movie.tagline ?? null,
        overview: movie.overview,
        releaseYear: movie.releaseYear,
        releaseDate: new Date(`${movie.releaseYear}-01-01`),
        runtimeMinutes: movie.runtimeMinutes,
        rating: movie.rating,
        ratingCount: Math.round(movie.rating * 120),
        language: movie.language,
        director: movie.director ?? null,
        maturityRating: movie.maturityRating,
        // Seeded engagement so the trending job has something to rank.
        viewCount: Math.round(movie.rating * 37),
        popularity: movie.rating * 10,
      },
    });

    // Replace rather than accumulate, so re-running does not duplicate.
    await prisma.movieGenre.deleteMany({ where: { movieId: record.id } });
    for (const slug of movie.genres) {
      const genreId = genreBySlug.get(slug);
      if (genreId) {
        await prisma.movieGenre.create({ data: { movieId: record.id, genreId } });
      }
    }

    if (movie.cast) {
      await prisma.castMember.deleteMany({ where: { movieId: record.id } });
      await prisma.castMember.createMany({
        data: movie.cast.map((member, order) => ({
          movieId: record.id,
          name: member.name,
          character: member.character ?? null,
          order,
        })),
      });
    }

    if (movie.source) {
      await prisma.source.deleteMany({ where: { movieId: record.id } });
      await prisma.source.create({
        data: {
          movieId: record.id,
          platform: movie.source.platform,
          url: movie.source.url,
          access: movie.source.access,
          downloadAllowed: movie.source.downloadAllowed,
          licenseNote: 'Public domain / openly licensed.',
        },
      });
    }
  }
  console.log(`  movies: ${MOVIES.length}`);

  const categories = await prisma.category.findMany();
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c.id]));

  for (const video of VIDEOS) {
    await prisma.video.upsert({
      where: { slug: video.slug },
      update: {
        title: video.title,
        description: video.description,
        durationSeconds: video.durationSeconds,
        language: video.language,
        tags: video.tags,
        maturityRating: video.maturityRating,
        categoryId: categoryBySlug.get(video.categorySlug) ?? null,
        moderationStatus: ModerationStatus.APPROVED,
      },
      create: {
        slug: video.slug,
        title: video.title,
        description: video.description,
        durationSeconds: video.durationSeconds,
        language: video.language,
        tags: video.tags,
        maturityRating: video.maturityRating,
        categoryId: categoryBySlug.get(video.categorySlug) ?? null,
        // Demo rows are pre-approved; real uploads start PENDING.
        moderationStatus: ModerationStatus.APPROVED,
        moderatedAt: new Date(),
        viewCount: video.durationSeconds,
      },
    });
  }
  console.log(`  videos: ${VIDEOS.length}`);
  console.log('Done. Run the trending recalculation to populate scores.');
}

main()
  .catch((error: unknown) => {
    console.error('Demo seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
