import { Body, Controller, Delete, Get, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  UserRole,
  type AdminStatsDto,
  type AdminUserDto,
  type CategoryDto,
  type GenreDto,
  type MovieDetail,
  type ModerationItem,
  type Paginated,
  type SourceDto,
} from '@videohub/types';
import { CurrentUser, Roles } from '../common/decorators';
import { AdminService } from './admin.service';
import {
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

/**
 * Every route here is admin-only. The guard is applied at the controller level
 * rather than per-method, so a new endpoint cannot be added unprotected by
 * forgetting a decorator.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Platform statistics for the dashboard' })
  getStats(): Promise<AdminStatsDto> {
    return this.adminService.getStats();
  }

  // --- movies ---------------------------------------------------------------

  @Post('movies')
  @ApiOperation({ summary: 'Add a movie' })
  createMovie(@Body() dto: CreateMovieDto): Promise<MovieDetail> {
    return this.adminService.createMovie(dto);
  }

  @Patch('movies/:id')
  @ApiOperation({ summary: 'Edit a movie' })
  updateMovie(@Param('id') id: string, @Body() dto: UpdateMovieDto): Promise<MovieDetail> {
    return this.adminService.updateMovie(id, dto);
  }

  @Delete('movies/:id')
  @ApiOperation({ summary: 'Delete a movie' })
  deleteMovie(@Param('id') id: string): Promise<{ removed: true }> {
    return this.adminService.deleteMovie(id);
  }

  @Post('movies/:id/sources')
  @ApiOperation({
    summary: 'Add a source to a movie',
    description:
      'downloadAllowed reflects the licence only. It never implies bypassing a technical protection.',
  })
  addSource(@Param('id') id: string, @Body() dto: CreateSourceDto): Promise<SourceDto> {
    return this.adminService.addSource(id, dto);
  }

  @Delete('sources/:id')
  @ApiOperation({ summary: 'Remove a source' })
  deleteSource(@Param('id') id: string): Promise<{ removed: true }> {
    return this.adminService.deleteSource(id);
  }

  // --- moderation -----------------------------------------------------------

  @Get('moderation')
  @ApiOperation({
    summary: 'Uploads awaiting review',
    description: 'Oldest first — a review queue should be fair rather than newest-first.',
  })
  moderationQueue(@Query() query: ModerationQueryDto): Promise<Paginated<ModerationItem>> {
    return this.adminService.moderationQueue(query);
  }

  @Patch('moderation/:id')
  @ApiOperation({
    summary: 'Approve or reject an upload',
    description: 'A rejection must carry a note, so the uploader knows what to fix.',
  })
  moderate(
    @Param('id') id: string,
    @Body() dto: ModerationDecisionDto,
    @CurrentUser('id') adminId: string,
  ): Promise<ModerationItem> {
    return this.adminService.moderate(id, dto, adminId);
  }

  @Delete('videos/:id')
  @ApiOperation({ summary: 'Delete a video outright' })
  deleteVideo(@Param('id') id: string): Promise<{ removed: true }> {
    return this.adminService.deleteVideo(id);
  }

  // --- users ----------------------------------------------------------------

  @Get('users')
  @ApiOperation({ summary: 'List and search users' })
  listUsers(@Query() query: AdminUsersQueryDto): Promise<Paginated<AdminUserDto>> {
    return this.adminService.listUsers(query);
  }

  @Patch('users/:id')
  @ApiOperation({
    summary: 'Change a user’s role or active state',
    description:
      'Refuses to demote or deactivate the acting admin, or to remove the last remaining admin.',
  })
  updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser('id') adminId: string,
  ): Promise<AdminUserDto> {
    return this.adminService.updateUser(id, dto, adminId);
  }

  // --- taxonomy -------------------------------------------------------------

  @Post('categories')
  @ApiOperation({ summary: 'Add a category' })
  createCategory(@Body() dto: CreateCategoryDto): Promise<CategoryDto> {
    return this.adminService.createCategory(dto);
  }

  @Delete('categories/:id')
  @ApiOperation({ summary: 'Delete a category' })
  deleteCategory(@Param('id') id: string): Promise<{ removed: true }> {
    return this.adminService.deleteCategory(id);
  }

  @Post('genres')
  @ApiOperation({ summary: 'Add a genre' })
  createGenre(@Body() dto: CreateGenreDto): Promise<GenreDto> {
    return this.adminService.createGenre(dto);
  }

  @Delete('genres/:id')
  @ApiOperation({ summary: 'Delete a genre' })
  deleteGenre(@Param('id') id: string): Promise<{ removed: true }> {
    return this.adminService.deleteGenre(id);
  }
}

@Module({
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
