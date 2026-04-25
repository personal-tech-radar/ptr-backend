import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { loadDockerSecrets } from './common/util/secrets.util';

loadDockerSecrets();

const getSwaggerServerUrl = (): string => {
  const port = process.env.PORT || '3000';
  if (process.env.NODE_ENV === 'production') {
    return process.env.SWAGGER_SERVER_URL + '/';
  }
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
    .addApiKey({ type: 'apiKey', name: 'X-API-KEY', in: 'header' }, 'api-key')
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