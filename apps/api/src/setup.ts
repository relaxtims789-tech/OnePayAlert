import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppConfig } from './config/app-config.service';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

export const API_PREFIX = 'api/v1';

/**
 * Shared HTTP/WebSocket configuration used by main.ts and the e2e test harness.
 * The app must be created with `{ rawBody: true }` so webhook signatures can be verified.
 */
export async function configureApp(app: INestApplication, opts: { swagger?: boolean } = {}): Promise<void> {
  const config = app.get(AppConfig);

  app.setGlobalPrefix(API_PREFIX);
  app.use(helmet());
  app.enableCors({ origin: config.get('CORS_ORIGINS'), credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();

  const io = new RedisIoAdapter(app);
  await io.connectToRedis();
  app.useWebSocketAdapter(io);

  if (opts.swagger) {
    const doc = new DocumentBuilder()
      .setTitle('One PayAlert API')
      .setDescription(
        'One Platform. Multiple Banks. Instant Payment Alerts.\n\n' +
          'Multi-tenant REST API shared by the Flutter app, merchant dashboard and MysoftKH super admin. ' +
          'All tenant data is scoped to the company in the access token. ' +
          'Money values are integer minor units (e.g. USD cents).',
      )
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc), {
      jsonDocumentUrl: 'docs/openapi.json',
    });
  }
}
