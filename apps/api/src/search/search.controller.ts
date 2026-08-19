import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { SearchResults, SearchSuggestions } from '@videohub/types';
import { CurrentUser, OptionalAuth, type RequestUser } from '../common/decorators';
import { SearchService } from './search.service';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @OptionalAuth()
  // Fires per keystroke after client debounce, so it gets a much higher ceiling
  // than the global limit — otherwise normal typing trips the throttler.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('suggest')
  @ApiOperation({
    summary: 'Instant-search suggestions',
    description: 'Small, capped result groups for the search dropdown. Not logged to history.',
  })
  @ApiQuery({ name: 'q', required: true })
  suggest(@Query('q') q = '', @CurrentUser() user?: RequestUser): Promise<SearchSuggestions> {
    return this.searchService.suggest(q, { user });
  }

  @OptionalAuth()
  @Get()
  @ApiOperation({ summary: 'Full search results across movies and videos' })
  @ApiQuery({ name: 'q', required: true })
  async search(@Query('q') q = '', @CurrentUser() user?: RequestUser): Promise<SearchResults> {
    const results = await this.searchService.search(q, { user });
    void this.searchService.recordSearch(q, results.totalMovies + results.totalVideos, user?.id);
    return results;
  }
}

@Module({
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
