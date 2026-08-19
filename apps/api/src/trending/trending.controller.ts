import { Controller, Get, Module, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole, type TrendingItemDto } from '@videohub/types';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { CurrentUser, OptionalAuth, Roles, type RequestUser } from '../common/decorators';
import { TrendingService } from './trending.service';

class TrendingQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

@ApiTags('trending')
@Controller('trending')
export class TrendingController {
  constructor(private readonly trendingService: TrendingService) {}

  @OptionalAuth()
  @Get()
  @ApiOperation({
    summary: 'Trending movies and videos',
    description: 'Ranked by a score recalculated hourly by a scheduled job.',
  })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @Query() query: TrendingQueryDto,
    @CurrentUser() user?: RequestUser,
  ): Promise<TrendingItemDto[]> {
    return this.trendingService.getTrending({ user }, query.limit ?? 20);
  }

  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @Post('recalculate')
  @ApiOperation({
    summary: 'Force a trending recalculation',
    description: 'Admin only. The same job also runs hourly on a schedule.',
  })
  recalculate(): Promise<{ movies: number; videos: number }> {
    return this.trendingService.recalculateTrending();
  }
}

@Module({
  controllers: [TrendingController],
  providers: [TrendingService],
  exports: [TrendingService],
})
export class TrendingModule {}
