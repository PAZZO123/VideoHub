import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { CategoryDto } from '@videohub/types';
import { Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { toCategoryDto } from '../videos/videos.mapper';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(kidsOnly?: boolean): Promise<CategoryDto[]> {
    const categories = await this.prisma.category.findMany({
      where: kidsOnly === undefined ? {} : { isKids: kidsOnly },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return categories.map(toCategoryDto);
  }
}

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List categories' })
  @ApiQuery({
    name: 'kids',
    required: false,
    description: 'true for the Ibitente tree only, false to exclude it, omitted for all.',
  })
  findAll(@Query('kids') kids?: string): Promise<CategoryDto[]> {
    const kidsOnly = kids === undefined ? undefined : kids === 'true';
    return this.categoriesService.findAll(kidsOnly);
  }
}

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
