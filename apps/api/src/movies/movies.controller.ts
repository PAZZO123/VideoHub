import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { MovieDetail, MovieSummary, Paginated } from '@videohub/types';
import { CurrentUser, OptionalAuth, type RequestUser } from '../common/decorators';
import { QueryMoviesDto } from './dto/query-movies.dto';
import { MoviesService } from './movies.service';

@ApiTags('movies')
@Controller('movies')
export class MoviesController {
  constructor(private readonly moviesService: MoviesService) {}

  @OptionalAuth()
  @Get()
  @ApiOperation({
    summary: 'List movies',
    description:
      'Paginated and filterable. Age-restricted titles are returned only to verified 18+ accounts; accounts with Kids Mode on receive KIDS-rated titles only.',
  })
  findAll(
    @Query() query: QueryMoviesDto,
    @CurrentUser() user?: RequestUser,
  ): Promise<Paginated<MovieSummary>> {
    return this.moviesService.findAll(query, { user });
  }

  @OptionalAuth()
  @Get(':slug')
  @ApiOperation({ summary: 'Get one movie by slug' })
  @ApiParam({ name: 'slug', example: 'interstellar-2014' })
  @ApiResponse({ status: 404, description: 'Not found, or not visible to this viewer.' })
  async findOne(
    @Param('slug') slug: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<MovieDetail> {
    const movie = await this.moviesService.findBySlug(slug, { user });
    // Not awaited: a failed counter must not fail the page.
    void this.moviesService.recordView(movie.id);
    return movie;
  }

  @OptionalAuth()
  @Get(':slug/similar')
  @ApiOperation({ summary: 'Movies similar to this one, by shared genre' })
  findSimilar(
    @Param('slug') slug: string,
    @CurrentUser() user?: RequestUser,
  ): Promise<MovieSummary[]> {
    return this.moviesService.findSimilar(slug, { user });
  }
}
