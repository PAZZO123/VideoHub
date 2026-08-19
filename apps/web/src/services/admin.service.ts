import type {
  AdminStatsDto,
  AdminUserDto,
  CategoryDto,
  GenreDto,
  ModerationStatus,
  MovieDetail,
  Paginated,
  UserRole,
  VideoSummary,
} from '@videohub/types';
import { api, unwrap } from '@/lib/api-client';

export interface CreateMoviePayload {
  title: string;
  overview?: string;
  tagline?: string;
  posterUrl?: string;
  backdropUrl?: string;
  trailerUrl?: string;
  releaseYear?: number;
  runtimeMinutes?: number;
  rating?: number;
  language?: string;
  director?: string;
  maturityRating?: string;
  genreSlugs?: string[];
  isPublished?: boolean;
}

export const adminService = {
  stats(): Promise<AdminStatsDto> {
    return unwrap(api.get('/admin/stats'));
  },

  // --- moderation ---
  moderationQueue(status: ModerationStatus = 'PENDING', page = 1): Promise<Paginated<VideoSummary>> {
    return unwrap(api.get('/admin/moderation', { params: { status, page } }));
  },

  moderate(id: string, status: ModerationStatus, note?: string): Promise<VideoSummary> {
    return unwrap(
      api.patch(`/admin/moderation/${encodeURIComponent(id)}`, {
        status,
        ...(note ? { note } : {}),
      }),
    );
  },

  deleteVideo(id: string): Promise<{ removed: true }> {
    return unwrap(api.delete(`/admin/videos/${encodeURIComponent(id)}`));
  },

  // --- users ---
  users(page = 1, q?: string): Promise<Paginated<AdminUserDto>> {
    return unwrap(api.get('/admin/users', { params: { page, ...(q ? { q } : {}) } }));
  },

  updateUser(id: string, payload: { role?: UserRole; isActive?: boolean }): Promise<AdminUserDto> {
    return unwrap(api.patch(`/admin/users/${encodeURIComponent(id)}`, payload));
  },

  // --- content ---
  createMovie(payload: CreateMoviePayload): Promise<MovieDetail> {
    return unwrap(api.post('/admin/movies', payload));
  },

  updateMovie(id: string, payload: Partial<CreateMoviePayload>): Promise<MovieDetail> {
    return unwrap(api.patch(`/admin/movies/${encodeURIComponent(id)}`, payload));
  },

  deleteMovie(id: string): Promise<{ removed: true }> {
    return unwrap(api.delete(`/admin/movies/${encodeURIComponent(id)}`));
  },

  createCategory(payload: {
    name: string;
    description?: string;
    isKids?: boolean;
    iconEmoji?: string;
    colorHex?: string;
  }): Promise<CategoryDto> {
    return unwrap(api.post('/admin/categories', payload));
  },

  deleteCategory(id: string): Promise<{ removed: true }> {
    return unwrap(api.delete(`/admin/categories/${encodeURIComponent(id)}`));
  },

  createGenre(payload: { name: string }): Promise<GenreDto> {
    return unwrap(api.post('/admin/genres', payload));
  },

  deleteGenre(id: string): Promise<{ removed: true }> {
    return unwrap(api.delete(`/admin/genres/${encodeURIComponent(id)}`));
  },
};

export interface UploadPayload {
  file: File;
  title: string;
  description?: string;
  categorySlug?: string;
  tags?: string;
  language?: string;
  maturityRating?: string;
  rightsConfirmed: boolean;
  downloadAllowed?: boolean;
}

export const uploadsService = {
  /**
   * Sends the video as multipart. `onProgress` is driven by the XHR upload
   * event, which fetch cannot report.
   */
  create(payload: UploadPayload, onProgress?: (percent: number) => void): Promise<VideoSummary> {
    const form = new FormData();
    form.append('file', payload.file);
    form.append('title', payload.title);
    form.append('rightsConfirmed', String(payload.rightsConfirmed));

    if (payload.description) form.append('description', payload.description);
    if (payload.categorySlug) form.append('categorySlug', payload.categorySlug);
    if (payload.tags) form.append('tags', payload.tags);
    if (payload.language) form.append('language', payload.language);
    if (payload.maturityRating) form.append('maturityRating', payload.maturityRating);
    if (payload.downloadAllowed !== undefined) {
      form.append('downloadAllowed', String(payload.downloadAllowed));
    }

    return unwrap(
      api.post('/uploads', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (event) => {
          if (event.total) onProgress?.(Math.round((event.loaded / event.total) * 100));
        },
        // Large files legitimately take longer than the default client timeout.
        timeout: 10 * 60 * 1000,
      }),
    );
  },

  mine(page = 1): Promise<Paginated<VideoSummary>> {
    return unwrap(api.get('/uploads/mine', { params: { page } }));
  },

  remove(id: string): Promise<{ removed: true }> {
    return unwrap(api.delete(`/uploads/${encodeURIComponent(id)}`));
  },
};
