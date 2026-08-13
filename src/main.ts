import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { loadDockerSecrets } from './common/util/secrets.util';

loadDockerSecrets();

const getSwaggerServerUrl = (): string => {
  if (process.env.SWAGGER_SERVER_URL) {
    return `${process.env.SWAGGER_SERVER_URL.replace(/\/$/, '')}/`;
  }
  const port = process.env.PORT || '3000';
  return `http://localhost:${port}`;
};

const getCorsOrigin = (): boolean | string | string[] | RegExp => {
  if (process.env.NODE_ENV === 'production') {
    const allowed = process.env.CORS_ORIGINS;
    if (allowed) {
      return allowed.split(',').map((o) => o.trim());
    }
    return false;
  }
  return /^http:\/\/localhost(:\d+)?$/;
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: getCorsOrigin(),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle(process.env.APP_NAME || 'NestJS App')
    .setDescription('NestJS REST API')
    .setVersion('1.0.0')
    .addServer(getSwaggerServerUrl())
    .addTag('Health', 'Service health and readiness')
    .addTag('Auth', 'Public registration and user authentication')
    .addTag('Public Content', 'Public article and feed access')
    .addTag('Redirects', 'Public and personal article redirects')
    .addTag('Email Actions', 'Opaque-link actions and digest pages opened from email')
    .addTag('Users', 'Authenticated user profile, onboarding, feedback, and source discovery')
    .addTag('Taxonomy', 'Authenticated user taxonomy and stream catalog access')
    .addTag('Feed', 'Authenticated personalized feed')
    .addTag('Saved Articles', 'Authenticated saved-article management')
    .addTag('Admin - Auth', 'Administrator authentication')
    .addTag('Admin - Admins', 'Administrator management')
    .addTag('Admin - Users', 'User administration')
    .addTag('Admin - Articles', 'Article administration')
    .addTag('Admin - Sources', 'Source, candidate, preference, and coverage administration')
    .addTag('Admin - Taxonomy', 'Taxonomy and stream administration')
    .addTag('Admin - Digests', 'Digest administration and preview delivery')
    .addTag('Admin - Jobs', 'Queue operations')
    .addTag('Admin - User Actions', 'User feedback, saves, and opens administration')
    .addApiKey({ type: 'apiKey', name: 'X-API-KEY', in: 'header' }, 'api-key')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Administrator JWT' },
      'administrator-bearer',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
}

bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
