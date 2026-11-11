import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfig } from './config/app-config.service';
import { configureApp } from './setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });
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
