import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppConfig } from './config/app-config.service';

export const API_PREFIX = 'api/v1';

/** Shared HTTP configuration used by main.ts and the e2e test harness. */
export function configureApp(app: INestApplication, opts: { swagger?: boolean } = {}): void {
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

  if (opts.swagger) {
    const doc = new DocumentBuilder()
      .setTitle('One PayAlert API')
      .setDescription(
        'One Platform. Multiple Banks. Instant Payment Alerts.\n\n' +
          'Multi-tenant REST API shared by the Flutter app, merchant dashboard and CAM super admin. ' +
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
