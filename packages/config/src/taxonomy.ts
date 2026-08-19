/**
 * Seed taxonomy. This is the canonical list the seeder writes into the database;
 * the app always reads genres/categories back from the DB, never from here.
 */

export interface GenreSeed {
  name: string;
  slug: string;
}

export const GENRES: readonly GenreSeed[] = [
  { name: 'Action', slug: 'action' },
  { name: 'Adventure', slug: 'adventure' },
  { name: 'Animation', slug: 'animation' },
  { name: 'Comedy', slug: 'comedy' },
  { name: 'Crime', slug: 'crime' },
  { name: 'Documentary', slug: 'documentary' },
  { name: 'Drama', slug: 'drama' },
  { name: 'Family', slug: 'family' },
  { name: 'Fantasy', slug: 'fantasy' },
  { name: 'History', slug: 'history' },
  { name: 'Horror', slug: 'horror' },
  { name: 'Music', slug: 'music' },
  { name: 'Mystery', slug: 'mystery' },
  { name: 'Romance', slug: 'romance' },
  { name: 'Science Fiction', slug: 'sci-fi' },
  { name: 'Thriller', slug: 'thriller' },
  { name: 'War', slug: 'war' },
  { name: 'Western', slug: 'western' },
  { name: 'African Cinema', slug: 'african-cinema' },
];

export interface CategorySeed {
  name: string;
  slug: string;
  description: string;
  isKids: boolean;
  iconEmoji: string;
  colorHex: string;
}

export const CATEGORIES: readonly CategorySeed[] = [
  {
    name: 'Movies',
    slug: 'movies',
    description: 'Feature films from around the world.',
    isKids: false,
    iconEmoji: '\u{1F3AC}',
    colorHex: '#6366F1',
  },
  {
    name: 'Documentaries',
    slug: 'documentaries',
    description: 'True stories, told well.',
    isKids: false,
    iconEmoji: '\u{1F4F9}',
    colorHex: '#0EA5E9',
  },
  {
    name: 'Music',
    slug: 'music',
    description: 'Music videos, live sets and concert films.',
    isKids: false,
    iconEmoji: '\u{1F3B5}',
    colorHex: '#EC4899',
  },
  {
    name: 'African Cinema',
    slug: 'african-cinema',
    description: 'Films and series from across the continent.',
    isKids: false,
    iconEmoji: '\u{1F30D}',
    colorHex: '#F59E0B',
  },
  {
    name: 'Learning',
    slug: 'learning',
    description: 'Talks, tutorials and lectures.',
    isKids: false,
    iconEmoji: '\u{1F393}',
    colorHex: '#14B8A6',
  },
  // --- Ibitente: the kids tree ---------------------------------------------
  {
    name: 'Ibitente',
    slug: 'ibitente',
    description: 'Amashusho n’indirimbo z’abana — cartoons and songs for kids!',
    isKids: true,
    iconEmoji: '\u{1F308}',
    colorHex: '#FF4FA3',
  },
  {
    name: 'Indirimbo z’Abana',
    slug: 'indirimbo-zabana',
    description: 'Sing-along songs and nursery rhymes.',
    isKids: true,
    iconEmoji: '\u{1F3B6}',
    colorHex: '#FFB020',
  },
  {
    name: 'Cartoons',
    slug: 'cartoons',
    description: 'Colourful animated adventures.',
    isKids: true,
    iconEmoji: '\u{1F984}',
    colorHex: '#7C5CFF',
  },
  {
    name: 'Learn & Play',
    slug: 'learn-and-play',
    description: 'Numbers, letters, colours and shapes.',
    isKids: true,
    iconEmoji: '\u{1F9E9}',
    colorHex: '#22C55E',
  },
  {
    name: 'Stories',
    slug: 'stories',
    description: 'Bedtime stories and folk tales.',
    isKids: true,
    iconEmoji: '\u{1F4D6}',
    colorHex: '#38BDF8',
  },
];

export const KIDS_CATEGORY_SLUGS = CATEGORIES.filter((c) => c.isKids).map((c) => c.slug);

/** Languages offered in the filter UI. */
export const LANGUAGES: readonly { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'rw', label: 'Kinyarwanda' },
  { code: 'fr', label: 'French' },
  { code: 'sw', label: 'Swahili' },
  { code: 'es', label: 'Spanish' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
];
