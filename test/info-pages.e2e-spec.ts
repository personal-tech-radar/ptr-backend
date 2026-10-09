jest.mock('jsdom', () => ({ JSDOM: jest.fn() }));
jest.mock('@mozilla/readability', () => ({ Readability: jest.fn() }));

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { InfoPage } from '../src/info-pages/entities/info-page.entity';
import { InfoPageDocument } from '../src/info-pages/models/info-page-document.model';

describe('Info pages HTTP API (e2e)', () => {
  let app: INestApplication;
  let repository: Repository<InfoPage>;
  let administratorToken: string;
  const createdIds: string[] = [];
  const apiKey = process.env.API_KEY as string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const bodyOf = (response: {
    body: unknown;
  }): {
    accessToken: string;
    id: string;
    fullText: InfoPageDocument;
    data: Array<Record<string, unknown>>;
  } =>
    response.body as {
      accessToken: string;
      id: string;
      fullText: InfoPageDocument;
      data: Array<Record<string, unknown>>;
    };

  const document = (text: string): InfoPageDocument => ({
    time: 1700000000000,
    blocks: [
      { id: 'section-id', type: 'header', data: { level: 2, text: 'Section title' } },
      { id: 'paragraph-id', type: 'paragraph', data: { text } },
    ],
    version: '2.x',
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    repository = app.get<Repository<InfoPage>>(getRepositoryToken(InfoPage));
    const httpServer = app.getHttpServer() as unknown as SupertestApp;

    const login = await request(httpServer)
      .post('/admin/auth/login')
      .send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })
      .expect(200);
    administratorToken = bodyOf(login).accessToken;
  });

  afterAll(async () => {
    if (createdIds.length) await repository.softDelete(createdIds);
    if (app) await app.close();
  });

  it('round-trips Editor.js objects and preserves public/admin visibility and list privacy', async () => {
    const httpServer = app.getHttpServer() as unknown as SupertestApp;
    const active = await request(httpServer)
      .post('/admin/info-pages')
      .set('Authorization', `Bearer ${administratorToken}`)
      .send({
        title: `Editor.js active ${suffix}`,
        fullText: document('Text with a <a href="https://example.com">safe link</a>.'),
      })
      .expect((response) => {
        if (response.status !== 201) throw new Error(JSON.stringify(response.body));
      });
    const activeBody = bodyOf(active);
    createdIds.push(activeBody.id);

    const inactive = await request(httpServer)
      .post('/admin/info-pages')
      .set('Authorization', `Bearer ${administratorToken}`)
      .send({
        title: `Editor.js inactive ${suffix}`,
        fullText: document('Inactive'),
        isActive: false,
      })
      .expect(201);
    const inactiveBody = bodyOf(inactive);
    createdIds.push(inactiveBody.id);

    expect(activeBody.fullText).toEqual(
      document('Text with a <a href="https://example.com">safe link</a>.'),
    );

    const publicList = await request(httpServer)
      .get('/info-pages?limit=100')
      .set('X-API-KEY', apiKey)
      .expect(200);
    const publicItems = bodyOf(publicList).data;
    expect(publicItems.some((item) => item.id === activeBody.id)).toBe(true);
    expect(publicItems.some((item) => item.id === inactiveBody.id)).toBe(false);
    expect(
      publicItems.every((item) => !Object.prototype.hasOwnProperty.call(item, 'fullText')),
    ).toBe(true);

    const publicDetail = await request(httpServer)
      .get(`/info-pages/${activeBody.id}`)
      .set('X-API-KEY', apiKey)
      .expect(200);
    expect(bodyOf(publicDetail).fullText).toEqual(activeBody.fullText);
    await request(httpServer)
      .get(`/info-pages/${inactiveBody.id}`)
      .set('X-API-KEY', apiKey)
      .expect(404);

    const adminList = await request(httpServer)
      .get('/admin/info-pages?limit=100')
      .set('Authorization', `Bearer ${administratorToken}`)
      .expect(200);
    const adminItems = bodyOf(adminList).data;
    expect(adminItems.some((item) => item.id === activeBody.id)).toBe(true);
    expect(adminItems.some((item) => item.id === inactiveBody.id)).toBe(true);
    expect(
      adminItems.every((item) => !Object.prototype.hasOwnProperty.call(item, 'fullText')),
    ).toBe(true);

    const adminDetail = await request(httpServer)
      .get(`/admin/info-pages/${activeBody.id}`)
      .set('Authorization', `Bearer ${administratorToken}`)
      .expect(200);
    expect(bodyOf(adminDetail).fullText).toEqual(activeBody.fullText);

    const updated = document('Updated <strong>without losing</strong> valid content.');
    const updateResponse = await request(httpServer)
      .patch(`/admin/info-pages/${activeBody.id}`)
      .set('Authorization', `Bearer ${administratorToken}`)
      .send({ fullText: updated })
      .expect(200);
    expect(bodyOf(updateResponse).fullText).toEqual(updated);

    await request(httpServer)
      .delete(`/admin/info-pages/${activeBody.id}`)
      .set('Authorization', `Bearer ${administratorToken}`)
      .expect(204);
    createdIds.splice(createdIds.indexOf(activeBody.id), 1);
    await request(httpServer)
      .get(`/info-pages/${activeBody.id}`)
      .set('X-API-KEY', apiKey)
      .expect(404);
    await request(httpServer)
      .get(`/admin/info-pages/${activeBody.id}`)
      .set('Authorization', `Bearer ${administratorToken}`)
      .expect(404);
    const deleted = await repository.findOne({
      where: { id: activeBody.id },
      withDeleted: true,
    });
    expect(deleted?.deletedAt).toBeInstanceOf(Date);
  });

  it('requires administrator auth and rejects string payloads, invalid blocks, and unsafe markup', async () => {
    const httpServer = app.getHttpServer() as unknown as SupertestApp;
    await request(httpServer).post('/admin/info-pages').expect(401);
    await request(httpServer).get('/info-pages').expect(401);

    await request(httpServer)
      .post('/admin/info-pages')
      .set('Authorization', `Bearer ${administratorToken}`)
      .send({
        title: `String content ${suffix}`,
        fullText: JSON.stringify(document('legacy string')),
      })
      .expect(400);

    await request(httpServer)
      .post('/admin/info-pages')
      .set('Authorization', `Bearer ${administratorToken}`)
      .send({
        title: `Invalid heading ${suffix}`,
        fullText: { blocks: [{ type: 'header', data: { text: 'Invalid H1', level: 1 } }] },
      })
      .expect(400);

    await request(httpServer)
      .post('/admin/info-pages')
      .set('Authorization', `Bearer ${administratorToken}`)
      .send({
        title: `Unsupported block ${suffix}`,
        fullText: { blocks: [{ type: 'image', data: { text: 'Unsupported' } }] },
      })
      .expect(400);

    await request(httpServer)
      .post('/admin/info-pages')
      .set('Authorization', `Bearer ${administratorToken}`)
      .send({
        title: `Unsafe markup ${suffix}`,
        fullText: document('<a href="javascript:alert(1)">unsafe</a>'),
      })
      .expect(400);

    await request(httpServer)
      .patch(`/admin/info-pages/${createdIds[0]}`)
      .set('Authorization', `Bearer ${administratorToken}`)
      .send({ fullText: null })
      .expect(400);
  });
});
