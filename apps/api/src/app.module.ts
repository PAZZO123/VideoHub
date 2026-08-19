import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { join } from 'node:path';
import { AdminModule } from './admin/admin.controller';
import { AiAgentModule } from './ai-agent/ai-agent.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.controller';
import { DownloadsModule } from './downloads/downloads.controller';
import { GenresModule } from './genres/genres.controller';
import { HistoryModule } from './history/history.controller';
import { MovieMetadataModule } from './movie-metadata/movie-metadata.module';
import { MoviesModule } from './movies/movies.module';
import { SearchModule } from './search/search.controller';
import { TrendingModule } from './trending/trending.controller';
import { StorageModule } from './storage/storage.module';
import { UploadsModule } from './uploads/uploads.controller';
import { VideosModule } from './videos/videos.module';
import { WatchlistModule } from './watchlist/watchlist.controller';
import { AgeVerificationGuard } from './common/guards/age-verification.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { configuration } from './config/configuration';
import { validateEnv } from './config/env.validation';
import type { AppConfig } from './config/configuration';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Root .env is shared by both apps so there is one file to fill in.
      envFilePath: [join(process.cwd(), '.env'), join(process.cwd(), '../../.env')],
      load: [configuration],
      validate: validateEnv,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const { ttl, max } = config.get('rateLimit', { infer: true });
        return { throttlers: [{ name: 'default', ttl: ttl * 1000, limit: max }] };
      },
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    StorageModule,
    MovieMetadataModule,
    AuthModule,
    UsersModule,
    MoviesModule,
    VideosModule,
    GenresModule,
    CategoriesModule,
    SearchModule,
    TrendingModule,
    WatchlistModule,
    HistoryModule,
    DownloadsModule,
    AiAgentModule,
    UploadsModule,
    AdminModule,
    HealthModule,
  ],
  providers: [
    // Order matters: throttle, then authenticate, then authorise by role, then
    // by age. Each later guard can rely on the earlier one having run.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useFactory: (r: Reflector) => new JwtAuthGuard(r), inject: [Reflector] },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: AgeVerificationGuard },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
