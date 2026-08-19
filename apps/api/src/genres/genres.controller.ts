import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { GenreDto } from '@videohub/types';
import { Public } from '../common/decorators';
import { toGenreDto } from '../movies/movies.mapper';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GenresService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<GenreDto[]> {
    const genres = await this.prisma.genre.findMany({ orderBy: { name: 'asc' } });
    return genres.map(toGenreDto);
  }
}

@ApiTags('genres')
@Controller('genres')
export class GenresController {
  constructor(private readonly genresService: GenresService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all genres' })
  findAll(): Promise<GenreDto[]> {
    return this.genresService.findAll();
  }
}

@Module({
  controllers: [GenresController],
  providers: [GenresService],
  exports: [GenresService],
})
export class GenresModule {}
