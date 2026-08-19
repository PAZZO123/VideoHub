import { INestApplication, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? [{ emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }]
          : [{ emit: 'event', level: 'error' }],
    });
  }

  /**
   * Connects, retrying briefly on failure.
   *
   * Neon's free tier suspends a database after a few minutes idle, and the
   * connection that wakes it frequently times out before the compute is ready.
   * Without a retry the API simply refuses to boot until someone runs it a
   * second time — which is exactly the kind of thing that looks like an outage
   * on a scale-to-zero deployment.
   */
  async onModuleInit(): Promise<void> {
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.$connect();
        this.logger.log(
          attempt === 1
            ? 'Connected to PostgreSQL'
            : `Connected to PostgreSQL (attempt ${attempt})`,
        );
        return;
      } catch (error: unknown) {
        if (attempt === maxAttempts) throw error;

        // Linear backoff: a cold start takes seconds, not minutes.
        const waitMs = attempt * 2000;
        this.logger.warn(
          `Database not reachable (attempt ${attempt}/${maxAttempts}); retrying in ${waitMs}ms. ` +
            'A serverless database may be waking from idle.',
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Lets Nest close the pool cleanly on SIGTERM (important on free hosting). */
  enableShutdownHooks(app: INestApplication): void {
    process.on('beforeExit', () => {
      void app.close();
    });
  }

  /** Simple connectivity probe used by the health endpoint. */
  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
