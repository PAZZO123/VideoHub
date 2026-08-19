import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';

interface HealthReport {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  timestamp: string;
  checks: {
    database: 'up' | 'down';
  };
  config: {
    aiProvider: string;
    metadataProvider: string;
    storageProvider: string;
  };
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness and dependency check' })
  async check(): Promise<HealthReport> {
    const databaseUp = await this.prisma.ping();

    return {
      status: databaseUp ? 'ok' : 'degraded',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: { database: databaseUp ? 'up' : 'down' },
      // Which interchangeable implementations are active. No secrets here.
      config: {
        aiProvider: this.config.get('ai', { infer: true }).provider,
        metadataProvider: this.config.get('metadata', { infer: true }).provider,
        storageProvider: this.config.get('storage', { infer: true }).provider,
      },
    };
  }
}
