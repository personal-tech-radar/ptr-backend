jest.mock('jsdom', () => ({ JSDOM: jest.fn() }));
jest.mock('@mozilla/readability', () => ({ Readability: jest.fn() }));

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('MVP3 application (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => app.close());

  it('starts the integrated application and exposes health', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });

  it('requires an API key for the public feed', async () => {
    await request(app.getHttpServer()).get('/public/feed').expect(401);
    await request(app.getHttpServer())
      .get('/public/feed')
      .set('X-API-KEY', process.env.API_KEY as string)
      .expect(200);
  });

  it('keeps public feed preview anonymous', async () => {
    await request(app.getHttpServer())
      .post('/public/feed/preview')
      .send({ technologies: [], interests: [], streams: [] })
      .expect((response) => {
        expect(response.status).not.toBe(401);
      });
  });

});
