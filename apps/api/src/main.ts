import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { APP_NAME } from '@videohub/config';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import type { AppConfig } from './config/configuration';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  // Release the buffered startup logs immediately. Without this, anything that
  // fails between here and listen() would exit with no output at all.
  app.flushLogs();

  const config = app.get(ConfigService<AppConfig, true>);
  const port = config.get('port', { infer: true });
  const prefix = config.get('apiPrefix', { infer: true });
  const origins = config.get('webOrigin', { infer: true });
  const isProd = config.get('nodeEnv', { infer: true }) === 'production';

  app.setGlobalPrefix(prefix);

  // Secure headers. CSP is disabled only so the Swagger UI can load its own
  // assets; the API itself serves JSON, not documents.
  app.use(helmet({ contentSecurityPolicy: isProd ? undefined : false }));
  app.use(compression());

  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Request size limit — uploads go through the storage service, not JSON bodies.
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { limit: '1mb', extended: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      // Never echo the submitted value back — it may contain a password.
      validationError: { target: false, value: false },
    }),
  );

  const prisma = app.get(PrismaService);
  prisma.enableShutdownHooks(app);
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle(`${APP_NAME} API`)
    .setDescription(
      'Video and movie discovery, authorized downloads, and the VideoHub AI recommendation agent.',
    )
    .setVersion('0.1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${prefix}/docs`, app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(port, '0.0.0.0');

  logger.log(`${APP_NAME} API listening on http://localhost:${port}/${prefix}`);
  logger.log(`API docs at http://localhost:${port}/${prefix}/docs`);
  logger.log(`AI provider: ${config.get('ai', { infer: true }).provider}`);
}

/**
 * Boot failures are almost always a missing env var or an unreachable database.
 * Print something actionable instead of letting a 200KB Prisma stack trace be
 * the first thing a developer sees.
 */
bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');

  if (error instanceof Error && 'errorCode' in error && error.errorCode === 'P1001') {
    logger.error(
      'Cannot reach the database. Check DATABASE_URL in your .env — for Neon, use the pooled connection string and make sure it ends with ?sslmode=require.',
    );
  } else if (error instanceof Error && error.message.startsWith('Invalid environment')) {
    logger.error(error.message);
  } else {
    logger.error('Failed to start the API.', error instanceof Error ? error.stack : String(error));
  }

  process.exit(1);
});
