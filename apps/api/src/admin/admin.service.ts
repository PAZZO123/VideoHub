import { Injectable, Logger } from '@nestjs/common';
import { MaturityRating, ModerationStatus, Prisma } from '@prisma/client';
import {
  ErrorCode,
  UserRole,
  type AdminStatsDto,
  type AdminUserDto,
  type CategoryDto,
  type GenreDto,
  type MovieDetail,
  type Paginated,
  type SourceDto,
  type VideoSummary,
} from '@videohub/types';
import slugify from 'slugify';
import { paginate } from '../common/dto/pagination.dto';
import { AppException } from '../common/exceptions/app.exception';
import {
  MOVIE_DETAIL_INCLUDE,
  toGenreDto,
  toMovieDetail,
  toSourceDto,
} from '../movies/movies.mapper';
import { PrismaService } from '../prisma/prisma.service';
import { VIDEO_SUMMARY_INCLUDE, toCategoryDto, toVideoSummary } from '../videos/videos.mapper';
import type {
  AdminUsersQueryDto,
  CreateCategoryDto,
  CreateGenreDto,
  CreateMovieDto,
  CreateSourceDto,
  ModerationDecisionDto,
  ModerationQueryDto,
  UpdateMovieDto,
  UpdateUserDto,
} from './dto/admin.dto';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  // --- dashboard ------------------------------------------------------------

  async getStats(): Promise<AdminStatsDto> {
    // One transaction so the numbers on the dashboard are mutually consistent
    // rather than sampled at slightly different moments.
    const [
      totalUsers,
      totalMovies,
      totalVideos,
      totalDownloads,
      totalSearches,
      pendingModeration,
      mostViewed,
      trending,
    ] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.movie.count(),
      this.prisma.video.count(),
      this.prisma.download.count(),
      this.prisma.searchHistory.count(),
      this.prisma.video.count({ where: { moderationStatus: ModerationStatus.PENDING } }),
      this.prisma.movie.findMany({
        include: { genres: { include: { genre: true } } },
        orderBy: { viewCount: 'desc' },
        take: 5,
      }),
      this.prisma.movie.findMany({
        include: { genres: { include: { genre: true } } },
        orderBy: { trendingScore: 'desc' },
        take: 5,
      }),
    ]);

    const toSummary = (movie: (typeof mostViewed)[number]) => ({
      id: movie.id,
      slug: movie.slug,
      title: movie.title,
      overview: movie.overview,
      posterUrl: movie.posterUrl,
      backdropUrl: movie.backdropUrl,
      releaseYear: movie.releaseYear,
      runtimeMinutes: movie.runtimeMinutes,
      rating: movie.rating,
      language: movie.language,
      maturityRating: movie.maturityRating,
      genres: movie.genres.map((link) => toGenreDto(link.genre)),
      trendingScore: movie.trendingScore,
      popularity: movie.popularity,
    });

    return {
      totalUsers,
      totalMovies,
      totalVideos,
      totalDownloads,
      totalSearches,
      pendingModeration,
      mostViewedMovies: mostViewed.map(toSummary),
      trendingMovies: trending.map(toSummary),
    };
  }

  // --- movies ---------------------------------------------------------------

  async createMovie(dto: CreateMovieDto): Promise<MovieDetail> {
    const slug = await this.uniqueMovieSlug(dto.slug ?? dto.title);
    const genreIds = await this.resolveGenreIds(dto.genreSlugs);

    const movie = await this.prisma.movie.create({
      data: {
        ...this.movieData(dto),
        slug,
        title: dto.title,
        ...(genreIds.length > 0
          ? { genres: { create: genreIds.map((genreId) => ({ genreId })) } }
          : {}),
      },
      include: MOVIE_DETAIL_INCLUDE,
    });

    this.logger.log(`Movie created: ${movie.slug}`);
    return toMovieDetail(movie);
  }

  async updateMovie(id: string, dto: UpdateMovieDto): Promise<MovieDetail> {
    await this.assertMovieExists(id);

    // Genres are replaced wholesale when supplied, so the caller does not have
    // to diff them — omitting the field leaves them untouched.
    if (dto.genreSlugs) {
      const genreIds = await this.resolveGenreIds(dto.genreSlugs);
      await this.prisma.movieGenre.deleteMany({ where: { movieId: id } });
      if (genreIds.length > 0) {
        await this.prisma.movieGenre.createMany({
          data: genreIds.map((genreId) => ({ movieId: id, genreId })),
        });
      }
    }

    const movie = await this.prisma.movie.update({
      where: { id },
      data: {
        ...this.movieData(dto),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.slug !== undefined ? { slug: await this.uniqueMovieSlug(dto.slug, id) } : {}),
      },
      include: MOVIE_DETAIL_INCLUDE,
    });

    return toMovieDetail(movie);
  }

  async deleteMovie(id: string): Promise<{ removed: true }> {
    await this.assertMovieExists(id);
    await this.prisma.movie.delete({ where: { id } });
    this.logger.log(`Movie deleted: ${id}`);
    return { removed: true };
  }

  // --- sources --------------------------------------------------------------

  async addSource(movieId: string, dto: CreateSourceDto): Promise<SourceDto> {
    await this.assertMovieExists(movieId);

    const source = await this.prisma.source.create({
      data: {
        movieId,
        platform: dto.platform,
        url: dto.url,
        access: dto.access,
        downloadAllowed: dto.downloadAllowed ?? false,
        region: dto.region ?? null,
        qualityLabel: dto.qualityLabel ?? null,
        licenseNote: dto.licenseNote ?? null,
      },
    });

    return toSourceDto(source);
  }

  async deleteSource(id: string): Promise<{ removed: true }> {
    const { count } = await this.prisma.source.deleteMany({ where: { id } });
    if (count === 0) {
      throw AppException.notFound(ErrorCode.SOURCE_NOT_FOUND, 'That source could not be found.');
    }
    return { removed: true };
  }

  // --- moderation -----------------------------------------------------------

  async moderationQueue(query: ModerationQueryDto): Promise<Paginated<VideoSummary>> {
    const where = { moderationStatus: query.status ?? ModerationStatus.PENDING };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.video.findMany({
        where,
        include: VIDEO_SUMMARY_INCLUDE,
        // Oldest first: a review queue should be fair, not newest-first.
        orderBy: { createdAt: 'asc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.video.count({ where }),
    ]);

    return paginate(items.map(toVideoSummary), query.page, query.take, total);
  }

  async moderate(
    videoId: string,
    dto: ModerationDecisionDto,
    moderatorId: string,
  ): Promise<VideoSummary> {
    const existing = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!existing) {
      throw AppException.notFound(ErrorCode.VIDEO_NOT_FOUND, 'That video could not be found.');
    }

    if (dto.status === ModerationStatus.REJECTED && !dto.note?.trim()) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        'Give a reason when rejecting, so the uploader knows what to fix.',
      );
    }

    const video = await this.prisma.video.update({
      where: { id: videoId },
      data: {
        moderationStatus: dto.status,
        moderationNote: dto.note ?? null,
        moderatedAt: new Date(),
      },
      include: VIDEO_SUMMARY_INCLUDE,
    });

    this.logger.log(`Video ${videoId} ${dto.status.toLowerCase()} by ${moderatorId}`);
    return toVideoSummary(video);
  }

  async deleteVideo(id: string): Promise<{ removed: true }> {
    const { count } = await this.prisma.video.deleteMany({ where: { id } });
    if (count === 0) {
      throw AppException.notFound(ErrorCode.VIDEO_NOT_FOUND, 'That video could not be found.');
    }
    return { removed: true };
  }

  // --- users ----------------------------------------------------------------

  async listUsers(query: AdminUsersQueryDto): Promise<Paginated<AdminUserDto>> {
    const where: Prisma.UserWhereInput = query.q
      ? {
          OR: [
            { email: { contains: query.q, mode: 'insensitive' } },
            { displayName: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {};

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        // Counts come from the relation, so this stays one query rather than
        // N+1 lookups per user.
        include: { _count: { select: { watchlist: true, downloads: true } } },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.user.count({ where }),
    ]);

    const items: AdminUserDto[] = users.map((user) => ({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role as UserRole,
      plan: user.plan,
      ageVerified: user.ageVerified,
      createdAt: user.createdAt.toISOString(),
      watchlistCount: user._count.watchlist,
      downloadCount: user._count.downloads,
    }));

    return paginate(items, query.page, query.take, total);
  }

  async updateUser(
    targetId: string,
    dto: UpdateUserDto,
    actingAdminId: string,
  ): Promise<AdminUserDto> {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      include: { _count: { select: { watchlist: true, downloads: true } } },
    });

    if (!target) {
      throw AppException.notFound(ErrorCode.USER_NOT_FOUND, 'That account could not be found.');
    }

    // Locking yourself out is almost never intended, and recovering needs
    // database access — so it is refused rather than confirmed.
    if (targetId === actingAdminId) {
      if (dto.role === UserRole.USER) {
        throw AppException.badRequest(
          ErrorCode.VALIDATION_FAILED,
          'You cannot remove your own admin role.',
        );
      }
      if (dto.isActive === false) {
        throw AppException.badRequest(
          ErrorCode.VALIDATION_FAILED,
          'You cannot deactivate your own account.',
        );
      }
    }

    // Removing the last admin would leave the platform unmanageable.
    if (dto.role === UserRole.USER && target.role === UserRole.ADMIN) {
      const admins = await this.prisma.user.count({ where: { role: UserRole.ADMIN } });
      if (admins <= 1) {
        throw AppException.badRequest(
          ErrorCode.VALIDATION_FAILED,
          'This is the only admin account. Promote another account first.',
        );
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: {
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: { _count: { select: { watchlist: true, downloads: true } } },
    });

    // A deactivated account must lose its sessions immediately, not at expiry.
    if (dto.isActive === false) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: targetId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    this.logger.log(`User ${targetId} updated by admin ${actingAdminId}`);

    return {
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      role: updated.role as UserRole,
      plan: updated.plan,
      ageVerified: updated.ageVerified,
      createdAt: updated.createdAt.toISOString(),
      watchlistCount: updated._count.watchlist,
      downloadCount: updated._count.downloads,
    };
  }

  // --- taxonomy -------------------------------------------------------------

  async createCategory(dto: CreateCategoryDto): Promise<CategoryDto> {
    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        slug: dto.slug ?? this.slugify(dto.name),
        description: dto.description ?? null,
        isKids: dto.isKids ?? false,
        iconEmoji: dto.iconEmoji ?? null,
        colorHex: dto.colorHex ?? null,
      },
    });
    return toCategoryDto(category);
  }

  async deleteCategory(id: string): Promise<{ removed: true }> {
    const { count } = await this.prisma.category.deleteMany({ where: { id } });
    if (count === 0) {
      throw AppException.notFound(
        ErrorCode.CATEGORY_NOT_FOUND,
        'That category could not be found.',
      );
    }
    return { removed: true };
  }

  async createGenre(dto: CreateGenreDto): Promise<GenreDto> {
    const genre = await this.prisma.genre.create({
      data: { name: dto.name, slug: dto.slug ?? this.slugify(dto.name) },
    });
    return toGenreDto(genre);
  }

  async deleteGenre(id: string): Promise<{ removed: true }> {
    const { count } = await this.prisma.genre.deleteMany({ where: { id } });
    if (count === 0) {
      throw AppException.notFound(ErrorCode.GENRE_NOT_FOUND, 'That genre could not be found.');
    }
    return { removed: true };
  }

  // --- helpers --------------------------------------------------------------

  /**
   * The scalar fields an admin may write, built from whichever keys the caller
   * actually supplied.
   *
   * Typed as a plain shape rather than `MovieUpdateInput` so the same builder
   * serves both create and update — Prisma's update type allows atomic
   * operations (`{ set: … }`) that its create type does not.
   */
  private movieData(dto: Partial<CreateMovieDto>): MovieWritableFields {
    const data: MovieWritableFields = {};

    if (dto.overview !== undefined) data.overview = dto.overview;
    if (dto.tagline !== undefined) data.tagline = dto.tagline;
    if (dto.posterUrl !== undefined) data.posterUrl = dto.posterUrl;
    if (dto.backdropUrl !== undefined) data.backdropUrl = dto.backdropUrl;
    if (dto.trailerUrl !== undefined) data.trailerUrl = dto.trailerUrl;
    if (dto.runtimeMinutes !== undefined) data.runtimeMinutes = dto.runtimeMinutes;
    if (dto.rating !== undefined) data.rating = dto.rating;
    if (dto.language !== undefined) data.language = dto.language;
    if (dto.director !== undefined) data.director = dto.director;
    if (dto.isPublished !== undefined) data.isPublished = dto.isPublished;
    if (dto.maturityRating !== undefined) {
      data.maturityRating = dto.maturityRating as MaturityRating;
    }
    if (dto.releaseYear !== undefined) {
      data.releaseYear = dto.releaseYear;
      data.releaseDate = new Date(Date.UTC(dto.releaseYear, 0, 1));
    }

    return data;
  }

  private async resolveGenreIds(slugs?: string[]): Promise<string[]> {
    if (!slugs || slugs.length === 0) return [];

    const genres = await this.prisma.genre.findMany({
      where: { slug: { in: slugs } },
      select: { id: true, slug: true },
    });

    const missing = slugs.filter((slug) => !genres.some((genre) => genre.slug === slug));
    if (missing.length > 0) {
      throw AppException.badRequest(
        ErrorCode.GENRE_NOT_FOUND,
        `Unknown genre${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`,
      );
    }

    return genres.map((genre) => genre.id);
  }

  private async assertMovieExists(id: string): Promise<void> {
    const exists = await this.prisma.movie.findUnique({ where: { id }, select: { id: true } });
    if (!exists) {
      throw AppException.notFound(ErrorCode.MOVIE_NOT_FOUND, 'That movie could not be found.');
    }
  }

  private slugify(value: string): string {
    return slugify(value, { lower: true, strict: true });
  }

  /** Appends a counter until the slug is free, ignoring the row being updated. */
  private async uniqueMovieSlug(source: string, ignoreId?: string): Promise<string> {
    const base = this.slugify(source) || 'movie';
    let candidate = base;
    let suffix = 2;

    for (;;) {
      const clash = await this.prisma.movie.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!clash || clash.id === ignoreId) return candidate;
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
  }
}

/** Scalar movie fields an admin may set, valid for both create and update. */
interface MovieWritableFields {
  overview?: string;
  tagline?: string;
  posterUrl?: string;
  backdropUrl?: string;
  trailerUrl?: string;
  runtimeMinutes?: number;
  rating?: number;
  language?: string;
  director?: string;
  isPublished?: boolean;
  maturityRating?: MaturityRating;
  releaseYear?: number;
  releaseDate?: Date;
}
