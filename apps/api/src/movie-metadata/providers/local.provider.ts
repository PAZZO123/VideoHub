import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { ExternalMovie, MovieMetadataProvider } from '../movie-metadata.interface';

/**
 * Serves metadata from VideoHub's own database — no external calls, no API key.
 *
 * This is the default. It means the application is fully functional with zero
 * third-party dependencies, and nothing in the app assumes an external
 * catalogue is reachable.
 */
@Injectable()
export class LocalMetadataProvider implements MovieMetadataProvider {
  readonly name = 'local';

  constructor(private readonly prisma: PrismaService) {}

  async searchMovies(query: string, limit = 20): Promise<ExternalMovie[]> {
    const movies = await this.prisma.movie.findMany({
      where: {
        isPublished: true,
        title: { contains: query, mode: 'insensitive' },
      },
      include: { genres: { include: { genre: true } } },
      orderBy: [{ trendingScore: 'desc' }, { id: 'asc' }],
      take: limit,
    });

    return movies.map((movie) => this.toExternal(movie));
  }

  async getMovie(externalId: string): Promise<ExternalMovie | null> {
    const movie = await this.prisma.movie.findFirst({
      where: { OR: [{ id: externalId }, { slug: externalId }] },
      include: { genres: { include: { genre: true } } },
    });

    return movie ? this.toExternal(movie) : null;
  }

  async getTrendingMovies(limit = 20): Promise<ExternalMovie[]> {
    const movies = await this.prisma.movie.findMany({
      where: { isPublished: true },
      include: { genres: { include: { genre: true } } },
      orderBy: [{ trendingScore: 'desc' }, { id: 'asc' }],
      take: limit,
    });

    return movies.map((movie) => this.toExternal(movie));
  }

  private toExternal(movie: {
    id: string;
    title: string;
    originalTitle: string | null;
    overview: string | null;
    posterUrl: string | null;
    backdropUrl: string | null;
    releaseDate: Date | null;
    releaseYear: number | null;
    runtimeMinutes: number | null;
    rating: number | null;
    language: string | null;
    maturityRating: string;
    genres: { genre: { name: string } }[];
  }): ExternalMovie {
    return {
      externalId: movie.id,
      provider: this.name,
      title: movie.title,
      originalTitle: movie.originalTitle,
      overview: movie.overview,
      posterUrl: movie.posterUrl,
      backdropUrl: movie.backdropUrl,
      releaseDate: movie.releaseDate?.toISOString() ?? null,
      releaseYear: movie.releaseYear,
      runtimeMinutes: movie.runtimeMinutes,
      rating: movie.rating,
      language: movie.language,
      genreNames: movie.genres.map((link) => link.genre.name),
      adult: movie.maturityRating === 'ADULT',
    };
  }
}
