// Must stay first: loads the APP_ENV-specific env file before Prisma can load `.env`.
import './load-env';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfig } from './config/app-config.service';
import { enableDefaultMetrics } from './common/metrics';
import { configureApp } from './setup';

async function bootstrap(): Promise<void> {
  // Decided before the app (and its validated config) exists, so start-up errors are logged the same way.
  const live = process.env.APP_ENV === 'production' || process.env.APP_ENV === 'demo';
  const json = (process.env.LOG_FORMAT ?? (live ? 'json' : 'pretty')) === 'json';
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    logger: new ConsoleLogger({ json, colors: !json, timestamp: !json }),
  });
  enableDefaultMetrics();
  const config = app.get(AppConfig);
  await configureApp(app, { swagger: !config.isProduction });

  const port = config.get('PORT');
  await app.listen(port);
  Logger.log(
    `One PayAlert API (${config.get('APP_ENV')}) on http://localhost:${port}/api/v1 — docs at /docs`,
    'Bootstrap',
  );
}

void bootstrap();
