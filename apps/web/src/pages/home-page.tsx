import { SearchSort } from '@videohub/types';
import { AiCta } from '@/components/home/ai-cta';
import { ContinueWatchingRail } from '@/components/home/continue-watching';
import { CategoryGrid, KidsBanner } from '@/components/home/category-grid';
import { MovieRail, TrendingRail, VideoRail } from '@/components/home/data-rails';
import { Hero } from '@/components/home/hero';

export default function HomePage(): JSX.Element {
  return (
    <>
      <Hero />

      <ContinueWatchingRail />

      {/* Rails render nothing when their query comes back empty, so a fresh
          install shows a clean page rather than a column of empty headings. */}
      <TrendingRail />
      <MovieRail title="Popular Movies" sort={SearchSort.POPULARITY} />
      <MovieRail title="Recently Added" sort={SearchSort.NEWEST} />

      <CategoryGrid />

      <MovieRail title="Action" genre="action" />
      <MovieRail title="Comedy" genre="comedy" />
      <MovieRail title="Sci-Fi" genre="sci-fi" />
      <MovieRail title="African Cinema" genre="african-cinema" />

      <VideoRail />

      <KidsBanner />
      <AiCta />
    </>
  );
}
