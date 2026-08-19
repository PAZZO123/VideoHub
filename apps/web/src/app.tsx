import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/app-layout';
import { ProtectedRoute } from '@/components/layout/protected-route';
import { PlaceholderPage } from '@/pages/placeholder-page';

// Route-level code splitting: the landing bundle stays small and each surface
// is fetched only when it is first visited.
const HomePage = lazy(() => import('@/pages/home-page'));
const LoginPage = lazy(() => import('@/pages/login-page'));
const RegisterPage = lazy(() => import('@/pages/register-page'));
const MoviesPage = lazy(() => import('@/pages/movies-page'));
const MovieDetailPage = lazy(() => import('@/pages/movie-detail-page'));
const VideosPage = lazy(() => import('@/pages/videos-page'));
const VideoDetailPage = lazy(() => import('@/pages/video-detail-page'));
const SearchPage = lazy(() => import('@/pages/search-page'));
const TrendingPage = lazy(() => import('@/pages/trending-page'));
const KidsPage = lazy(() => import('@/pages/kids-page'));
const WatchlistPage = lazy(() => import('@/pages/watchlist-page'));
const HistoryPage = lazy(() => import('@/pages/history-page'));
const ProfilePage = lazy(() => import('@/pages/profile-page'));
const DownloadPage = lazy(() => import('@/pages/download-page'));
const DownloadsPage = lazy(() => import('@/pages/downloads-page'));
const NotFoundPage = lazy(() => import('@/pages/not-found-page'));

export function App(): JSX.Element {
  return (
    <Routes>
      {/* Auth pages render outside the app chrome. */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />

        <Route path="movies" element={<MoviesPage />} />
        <Route path="movies/:slug" element={<MovieDetailPage />} />
        <Route path="videos" element={<VideosPage />} />
        <Route path="videos/:slug" element={<VideoDetailPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="trending" element={<TrendingPage />} />
        <Route path="kids" element={<KidsPage />} />
        {/* Kids playback goes through the kids-only endpoints. */}
        <Route path="kids/:slug" element={<VideoDetailPage kids />} />

        <Route
          path="watchlist"
          element={
            <ProtectedRoute>
              <WatchlistPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="history"
          element={
            <ProtectedRoute>
              <HistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />

        <Route path="download" element={<DownloadPage />} />
        <Route
          path="downloads"
          element={
            <ProtectedRoute>
              <DownloadsPage />
            </ProtectedRoute>
          }
        />

        <Route path="ai" element={<PlaceholderPage title="VideoHub AI" phase="Phase 5" />} />

        <Route
          path="admin/*"
          element={
            <ProtectedRoute requireAdmin>
              <PlaceholderPage title="Admin dashboard" phase="Phase 6" />
            </ProtectedRoute>
          }
        />

        <Route path="404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Route>
    </Routes>
  );
}
