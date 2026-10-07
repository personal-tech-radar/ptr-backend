import { readFileSync } from 'fs';
import { parse } from 'dotenv';
import { DataSource } from 'typeorm';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { createServer } from 'http';

// Exercise the running Docker HTTP server, including its real administrator guard.
describe('Administration HTTP API', () => {
  let db: DataSource;
  let token: string;
  const fixture = {
    user: randomUUID(),
    source: randomUUID(),
    article: randomUUID(),
    taxonomy: randomUUID(),
    interest: randomUUID(),
    digest: randomUUID(),
    candidate: randomUUID(),
  };
  let streamId: string;
  const base = process.env.ADMIN_E2E_BASE_URL || 'http://localhost:3000';
  const local = parse(readFileSync('.env'));
  async function get(path: string, authenticated = true) {
    return fetch(`${base}${path}`, {
      headers: authenticated ? { Authorization: `Bearer ${token}` } : {},
    });
  }

  beforeAll(async () => {
    db = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      synchronize: false,
    });
    await db.initialize();
    const response = await fetch(`${base}/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: local.ADMIN_EMAIL, password: local.ADMIN_PASSWORD }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { accessToken: string };
    token = body.accessToken;
    const [stream] = await db.query<Array<{ id: string }>>(
      'SELECT id FROM content_streams ORDER BY "sortOrder" LIMIT 1',
    );
    streamId = stream.id;
    await db.transaction(async (manager) => {
      await manager.query(
        'INSERT INTO users (id,email,"passwordHash","displayName","emailVerifiedAt","onboardingCompletedAt") VALUES ($1,$2,$3,$4,now(),now())',
        [
          fixture.user,
          `admin-http-${fixture.user}@example.invalid`,
          '!no-login-fixture!',
          'Admin HTTP fixture',
        ],
      );
      await manager.query(
        `INSERT INTO sources (id,name,url,type,category,enabled,status,"globalOpenedCount","globalSavedCount","globalUsefulCount","globalInteractionScore") VALUES ($1,'Admin HTTP fixture',$2,'rss','engineering_deep_dives',false,'active',1,1,1,25)`,
        [fixture.source, `https://example.invalid/${fixture.source}`],
      );
      await manager.query(
        `INSERT INTO articles (id,"sourceId",title,url,"urlHash","titleHash",status,"rawContent") VALUES ($1::uuid,$2,'Admin HTTP article',$3,$1::text,$1::text,'analyzed','Stored extraction')`,
        [fixture.article, fixture.source, `https://example.invalid/article/${fixture.article}`],
      );
      await manager.query(
        `INSERT INTO article_analyses ("articleId","preScreenIsRelevant","preScreenReason","preScreenAt","fullAnalysisAt","shortSummary","qualityScore","finalScore","mainStreamId","shouldIncludeInDailyDigest") VALUES ($1,true,'Relevant',now(),now(),'Current analysis summary',75,80,$2,true)`,
        [fixture.article, streamId],
      );
      await manager.query(
        `INSERT INTO technology_interests (id,kind,name,"normalizedName",aliases) VALUES ($1,'technology',$2,$3,'[]')`,
        [fixture.taxonomy, `Admin HTTP ${fixture.taxonomy}`, `admin http ${fixture.taxonomy}`],
      );
      await manager.query(
        `INSERT INTO technology_interests (id,kind,name,"normalizedName",aliases) VALUES ($1,'interest',$2,$3,'[]')`,
        [
          fixture.interest,
          `Admin HTTP interest ${fixture.interest}`,
          `admin http interest ${fixture.interest}`,
        ],
      );
      await manager.query(
        `INSERT INTO source_coverages ("sourceId","technologyInterestId","contentStreamId",origin) VALUES ($1,$2,$3,'technology')`,
        [fixture.source, fixture.taxonomy, streamId],
      );
      await manager.query(
        `INSERT INTO source_candidates (id,"normalizedUrl",domain,origin,status,"technologyInterestId","contentStreamId") VALUES ($1,$2,'example.invalid','seed','rejected',$3,$4)`,
        [
          fixture.candidate,
          `https://example.invalid/candidate/${fixture.candidate}`,
          fixture.taxonomy,
          streamId,
        ],
      );
      await manager.query(
        'INSERT INTO article_technology_interests ("articleId","technologyInterestId") VALUES ($1,$2)',
        [fixture.article, fixture.taxonomy],
      );
      await manager.query(
        'INSERT INTO article_streams ("articleId","streamId","isPrimary") VALUES ($1,$2,true)',
        [fixture.article, streamId],
      );
      await manager.query(
        'INSERT INTO user_article_openings ("userId","articleId") VALUES ($1,$2)',
        [fixture.user, fixture.article],
      );
      await manager.query(
        `INSERT INTO personal_article_links ("userId","articleId",context,"firstOpenedAt") VALUES ($1,$2,'feed',now())`,
        [fixture.user, fixture.article],
      );
      await manager.query('INSERT INTO saved_articles ("userId","articleId") VALUES ($1,$2)', [
        fixture.user,
        fixture.article,
      ]);
      await manager.query(
        `INSERT INTO article_feedbacks ("userId","articleId",type) VALUES ($1,$2,'useful')`,
        [fixture.user, fixture.article],
      );
      await manager.query(
        'INSERT INTO user_technology_interests ("userId","technologyInterestId") VALUES ($1,$2)',
        [fixture.user, fixture.taxonomy],
      );
      await manager.query(
        'INSERT INTO user_technology_interests ("userId","technologyInterestId") VALUES ($1,$2)',
        [fixture.user, fixture.interest],
      );
      await manager.query(
        'INSERT INTO user_content_streams ("userId","contentStreamId") VALUES ($1,$2)',
        [fixture.user, streamId],
      );
      await manager.query(
        'INSERT INTO user_source_preferences ("userId","sourceId","openedCount","savedCount","usefulCount") VALUES ($1,$2,1,1,1)',
        [fixture.user, fixture.source],
      );
      await manager.query(
        `INSERT INTO digests (id,"userId",type,"periodKey","periodStart","periodEnd",subject,intro,"htmlBody","textBody",status,"deliveryMode","actualRecipientEmail","sentAt") VALUES ($1::uuid,$2,'daily',$1::text,now()-interval '1 day',now(),'Admin HTTP digest','Stored intro',$3,'Stored digest text','sent','admin_preview','admin-http@example.invalid',now())`,
        [
          fixture.digest,
          fixture.user,
          '<div><a href="https://example.invalid">1. Admin HTTP article</a><div>Source</div><p>Original LLM description &amp; detail</p></div>',
        ],
      );
      await manager.query(
        'INSERT INTO digest_items ("digestId","articleId",position,"scoreBreakdown") VALUES ($1,$2,1,$3)',
        [
          fixture.digest,
          fixture.article,
          JSON.stringify({
            technologyMatch: 100,
            interestMatch: 0,
            complexityMatch: 50,
            qualityScore: 75,
            recencyScore: 100,
            sourcePreferenceAdjustment: 0,
          }),
        ],
      );
    });
  });
  afterAll(async () => {
    if (!db?.isInitialized) return;
    await db.transaction(async (manager) => {
      await manager.query('DELETE FROM digests WHERE id=$1', [fixture.digest]);
      await manager.query('DELETE FROM users WHERE id=$1', [fixture.user]);
      await manager.query('DELETE FROM source_candidates WHERE id=$1', [fixture.candidate]);
      await manager.query('DELETE FROM sources WHERE id=$1', [fixture.source]);
      await manager.query('DELETE FROM technology_interests WHERE id=$1', [fixture.taxonomy]);
      await manager.query('DELETE FROM technology_interests WHERE id=$1', [fixture.interest]);
    });
    await db.destroy();
  });

  it('dashboard: requires administrator authentication and validates the period', async () => {
    expect((await get('/admin/dashboard/overview', false)).status).toBe(401);
    expect((await get('/admin/dashboard/overview?period=bad')).status).toBe(400);
  });

  it('dashboard: all periods reconcile source groups and received cohorts with PostgreSQL', async () => {
    for (const period of ['24h', '7d', '30d']) {
      const response = await get(`/admin/dashboard/overview?period=${period}`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        period: { from: string; to: string };
        content: { totalSources: number; receivedArticles: number };
        sourceTypes: Array<{
          group: string;
          total: number;
          lifecycle: { active: number; degraded: number; disabled: number };
        }>;
      };
      const [counts] = await db.query<Array<{ sources: number; received: number }>>(
        'SELECT (SELECT count(*)::int FROM sources WHERE "deletedAt" IS NULL) AS sources, (SELECT count(*)::int FROM articles WHERE "deletedAt" IS NULL AND "createdAt">=$1 AND "createdAt"<$2) AS received',
        [body.period.from, body.period.to],
      );
      expect(body.content.totalSources).toBe(counts.sources);
      expect(body.content.receivedArticles).toBe(counts.received);
      expect(body.sourceTypes.map((g) => g.group).sort()).toEqual([
        'feeds',
        'github_release',
        'web',
      ]);
      expect(body.sourceTypes.reduce((sum, g) => sum + g.total, 0)).toBe(counts.sources);
      for (const group of body.sourceTypes)
        expect(group.lifecycle.active + group.lifecycle.degraded + group.lifecycle.disabled).toBe(
          group.total,
        );
    }
  });

  it('sources: list filters and read-only detail reconcile with persisted source data', async () => {
    const [source] = await db.query<
      Array<{
        id: string;
        name: string;
        url: string;
        type: string;
        category: string;
        status: string;
        enabled: boolean;
        globalInteractionScore: string;
        globalOpenedCount: number;
        globalSavedCount: number;
        globalUsefulCount: number;
        globalNotUsefulCount: number;
      }>
    >('SELECT * FROM sources WHERE "deletedAt" IS NULL ORDER BY "createdAt" LIMIT 1');
    const params = new URLSearchParams({
      q: source.url,
      type: source.type,
      category: source.category,
      status: source.status,
      enabled: String(source.enabled),
      createdFrom: '2000-01-01',
      createdTo: '2100-01-01',
    });
    const response = await get(`/admin/sources?${params}`);
    expect(response.status).toBe(200);
    const list = (await response.json()) as {
      data: Array<{ id: string; interactionScore: number; globalOpenedCount?: number }>;
    };
    expect(list.data.some((row) => row.id === source.id)).toBe(true);
    expect(list.data[0].globalOpenedCount).toBeUndefined();
    const detail = await get(`/admin/sources/${source.id}?period=7d`);
    expect(detail.status).toBe(200);
    const body = (await detail.json()) as {
      interactionScore: number;
      signals: { total: number };
      recentAttempts: unknown[];
    };
    expect(body.interactionScore).toBe(Number(source.globalInteractionScore));
    expect(body.signals.total).toBe(
      source.globalOpenedCount +
        source.globalSavedCount +
        source.globalUsefulCount +
        source.globalNotUsefulCount,
    );
    expect(body.recentAttempts.length).toBeLessThanOrEqual(20);
    expect((await get(`/admin/sources/${source.id}`, false)).status).toBe(401);
    expect((await get('/admin/sources/not-a-uuid')).status).toBe(400);
    const duplicate = await fetch(`${base}/admin/sources`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: source.name,
        url: source.url,
        type: source.type,
        category: source.category,
      }),
    });
    expect(duplicate.status).toBe(409);
    const recipe = await fetch(`${base}/admin/sources/${source.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ webConfig: { entryUrls: [source.url] } }),
    });
    expect(recipe.status).toBe(400);
  });

  it('sources: candidate filters and source relationship filters match PostgreSQL', async () => {
    const [coverage] = await db.query<
      Array<{
        technologyInterestId: string;
        contentStreamId: string;
      }>
    >('SELECT * FROM source_coverages LIMIT 1');
    const response = await get(
      `/admin/sources?technologyInterestId=${coverage.technologyInterestId}&streamId=${coverage.contentStreamId}`,
    );
    expect(response.status).toBe(200);
    const rows = (await response.json()) as { meta: { total: number } };
    const [count] = await db.query<Array<{ total: number }>>(
      'SELECT count(DISTINCT s.id)::int AS total FROM sources s JOIN source_coverages c ON c."sourceId"=s.id WHERE s."deletedAt" IS NULL AND c."technologyInterestId"=$1 AND c."contentStreamId"=$2',
      [coverage.technologyInterestId, coverage.contentStreamId],
    );
    expect(rows.meta.total).toBe(count.total);
    expect(
      (
        await get(
          '/admin/source-candidates?status=pending&origin=technology&expectedSourceType=rss&detectedType=rss&createdFrom=2000-01-01&createdTo=2100-01-01',
        )
      ).status,
    ).toBe(200);
    expect((await get('/admin/source-candidates?expectedSourceType=invalid')).status).toBe(400);
  });

  it('sources: list includes article volume for its declared period', async () => {
    const response = await get(`/admin/sources?q=${fixture.source}&period=7d`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      period: { value: string; from: string; to: string };
      data: Array<{ id: string; periodArticleCount: number }>;
    };
    expect(body.period.value).toBe('7d');
    expect(new Date(body.period.to).getTime() - new Date(body.period.from).getTime()).toBe(
      7 * 86_400_000,
    );
    const source = body.data.find((row) => row.id === fixture.source);
    expect(source?.periodArticleCount).toBe(1);
    expect((await get('/admin/sources?period=invalid')).status).toBe(400);
  });

  it('source candidates: list and detail resolve technology and stream names', async () => {
    const response = await get(
      `/admin/source-candidates?technologyInterestId=${fixture.taxonomy}&streamId=${streamId}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: Array<{
        id: string;
        technologyInterestId: string | null;
        technologyInterestName: string | null;
        contentStreamId: string | null;
        contentStreamName: string | null;
      }>;
    };
    const candidate = body.data.find((row) => row.id === fixture.candidate);
    const [names] = await db.query<Array<{ taxonomyName: string; streamName: string }>>(
      'SELECT taxonomy.name AS "taxonomyName", stream.name AS "streamName" FROM technology_interests taxonomy CROSS JOIN content_streams stream WHERE taxonomy.id=$1 AND stream.id=$2',
      [fixture.taxonomy, streamId],
    );
    expect(candidate).toEqual(
      expect.objectContaining({
        technologyInterestId: fixture.taxonomy,
        technologyInterestName: names.taxonomyName,
        contentStreamId: streamId,
        contentStreamName: names.streamName,
      }),
    );
    const detail = await get(`/admin/source-candidates/${fixture.candidate}`);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toEqual(expect.objectContaining(candidate!));
  });

  it('articles: typed detail includes stored analysis, taxonomy, source and pipeline fields', async () => {
    const [article] = await db.query<Array<{ id: string }>>(
      'SELECT a.id FROM articles a JOIN article_analyses x ON x."articleId"=a.id WHERE a."deletedAt" IS NULL AND x."deletedAt" IS NULL LIMIT 1',
    );
    const response = await get(`/admin/articles/${article.id}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      id: string;
      source: { id: string; type: string };
      analysis: {
        preScreenIsRelevant: boolean | null;
        qualityScore: number | null;
        shouldIncludeInDailyDigest: boolean;
      };
      technologies: unknown[];
      interests: unknown[];
      streams: Array<{ id: string }>;
    };
    expect(body.id).toBe(article.id);
    expect(body.analysis).toHaveProperty('preScreenIsRelevant');
    expect(typeof body.analysis.shouldIncludeInDailyDigest).toBe('boolean');
    if (body.analysis.qualityScore !== null)
      expect(typeof body.analysis.qualityScore).toBe('number');
    const params = new URLSearchParams({
      sourceId: body.source.id,
      sourceType: body.source.type,
      receivedFrom: '2000-01-01',
      receivedTo: '2100-01-01',
    });
    if (body.streams[0]) params.set('streamId', body.streams[0].id);
    expect((await get(`/admin/articles?${params}`)).status).toBe(200);
    expect((await get(`/admin/articles/${article.id}`, false)).status).toBe(401);
    expect((await get('/admin/articles/not-a-uuid')).status).toBe(400);
  });

  it('articles: list exposes the primary stream and persisted scores', async () => {
    const response = await get(`/admin/articles?q=${fixture.article}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: Array<{
        id: string;
        primaryStream: { id: string; isPrimary: boolean } | null;
        qualityScore: number | null;
        finalScore: number | null;
      }>;
    };
    const article = body.data.find((row) => row.id === fixture.article);
    expect(article?.primaryStream?.id).toBe(streamId);
    expect(article?.primaryStream?.isPrimary).toBe(true);
    expect(article?.qualityScore).toBe(75);
    expect(article?.finalScore).toBe(80);
  });

  it('taxonomy: coverage contains only real relationships and exact lifecycle counts', async () => {
    const response = await get('/admin/source-coverage?limit=100&zeroActiveCoverage=false');
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: Array<{
        technologyInterestId: string;
        streamId: string;
        activeSources: number;
        degradedSources: number;
        disabledSources: number;
      }>;
      meta: { total: number };
    };
    const expected = await db.query<typeof body.data>(
      `SELECT c."technologyInterestId",c."contentStreamId" AS "streamId",count(*) FILTER (WHERE s.status='active')::int AS "activeSources",count(*) FILTER (WHERE s.status='degraded')::int AS "degradedSources",count(*) FILTER (WHERE s.status='disabled')::int AS "disabledSources" FROM source_coverages c JOIN sources s ON s.id=c."sourceId" AND s."deletedAt" IS NULL JOIN technology_interests t ON t.id=c."technologyInterestId" AND t."deletedAt" IS NULL GROUP BY c."technologyInterestId",c."contentStreamId"`,
    );
    expect(body.meta.total).toBe(expected.length);
    for (const row of expected) expect(body.data).toContainEqual(expect.objectContaining(row));
    expect(body.data.some((row) => row.activeSources > 0)).toBe(true);
    const zero = (await (
      await get('/admin/source-coverage?zeroActiveCoverage=true&limit=100')
    ).json()) as typeof body;
    expect(zero.data.every((row) => row.activeSources === 0)).toBe(true);
    const [taxonomy] = await db.query<Array<{ id: string; name: string; kind: string }>>(
      'SELECT id,name,kind FROM technology_interests WHERE "deletedAt" IS NULL LIMIT 1',
    );
    const search = (await (
      await get(
        `/admin/technology-interests?q=${encodeURIComponent(taxonomy.name)}&kind=${taxonomy.kind}`,
      )
    ).json()) as { data: Array<{ id: string }> };
    expect(search.data.some((row) => row.id === taxonomy.id)).toBe(true);
    const reused = await fetch(`${base}/admin/technology-interests`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: taxonomy.name, kind: taxonomy.kind }),
    });
    expect(reused.status).toBe(200);
    expect(((await reused.json()) as { created: boolean }).created).toBe(false);
    const streams = (await (await get('/admin/content-streams')).json()) as Array<{ id: string }>;
    const immutable = await fetch(`${base}/admin/content-streams/${streams[0].id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'changed' }),
    });
    expect(immutable.status).toBe(400);
  });

  it('taxonomy: list includes related streams and distinct-source coverage', async () => {
    const [second] = await db.query<Array<{ id: string }>>(
      'SELECT id FROM content_streams WHERE id<>$1 LIMIT 1',
      [streamId],
    );
    await db.query(
      `INSERT INTO source_coverages ("sourceId","technologyInterestId","contentStreamId",origin) VALUES ($1,$2,$3,'technology')`,
      [fixture.source, fixture.taxonomy, second.id],
    );
    try {
      const response = await get(`/admin/technology-interests?q=${fixture.taxonomy}`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: Array<{
          id: string;
          coverage: { active: number; degraded: number; disabled: number };
          relatedStreams: Array<{
            id: string;
            name: string;
            coverage: { active: number; degraded: number; disabled: number };
          }>;
        }>;
      };
      const entry = body.data.find((row) => row.id === fixture.taxonomy);
      expect(entry?.coverage).toEqual({ active: 1, degraded: 0, disabled: 0 });
      expect(entry?.relatedStreams).toHaveLength(2);
      for (const id of [streamId, second.id])
        expect(entry?.relatedStreams).toContainEqual(
          expect.objectContaining({
            id,
            coverage: { active: 1, degraded: 0, disabled: 0 },
          }),
        );
    } finally {
      await db.query(
        'DELETE FROM source_coverages WHERE "sourceId"=$1 AND "technologyInterestId"=$2 AND "contentStreamId"=$3',
        [fixture.source, fixture.taxonomy, second.id],
      );
    }
  });

  it('queues: real queue summaries, pagination, job details and delayed-only cancellation', async () => {
    const queue = new Queue('article-analysis', {
      connection: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT || 6379),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    });
    const id = `admin-e2e-${randomUUID()}`;
    const articleId = randomUUID();
    try {
      await queue.add(
        'analyze-article',
        { articleId, secret: 'must-not-be-exposed' },
        { jobId: id, delay: 3600000 },
      );
      const summaryResponse = await get('/admin/jobs/summary');
      expect(summaryResponse.status).toBe(200);
      const summary = (await summaryResponse.json()) as Array<{ queue: string; delayed: number }>;
      expect(summary).toHaveLength(5);
      expect(summary.find((row) => row.queue === 'article-analysis')!.delayed).toBeGreaterThan(0);
      const detail = (await (await get(`/admin/jobs/article-analysis/${id}`)).json()) as {
        state: string;
        reference: { type: string; id: string };
        data?: unknown;
      };
      expect(detail.state).toBe('delayed');
      expect(detail.reference).toEqual({ type: 'article', id: articleId });
      expect(detail.data).toBeUndefined();
      const list = (await (
        await get('/admin/jobs?queue=article-analysis&state=delayed&limit=1')
      ).json()) as { data: unknown[]; meta: { total: number; totalPages: number } };
      expect(list.data).toHaveLength(1);
      expect(list.meta.total).toBe(await queue.getDelayedCount());
      expect(list.meta.totalPages).toBe(list.meta.total);
      expect((await get('/admin/jobs?state=invalid')).status).toBe(400);
      expect((await get('/admin/jobs?queue=invalid')).status).toBe(400);
      expect((await get('/admin/jobs?limit=0')).status).toBe(400);
      expect((await get('/admin/jobs/article-analysis/absent')).status).toBe(404);
      const cancelled = await fetch(`${base}/admin/jobs/article-analysis/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(cancelled.status).toBe(200);
      expect(await queue.getJob(id)).toBeUndefined();
      const failed = (await queue.getFailed(0, 0))[0];
      if (failed)
        expect(
          (
            await fetch(`${base}/admin/jobs/article-analysis/${failed.id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            })
          ).status,
        ).toBe(409);
    } finally {
      const fixture = await queue.getJob(id);
      if (fixture) await fixture.remove();
      await queue.close();
    }
  });

  it('digests: filters, item counts, stored bodies and descriptions match persisted data', async () => {
    const fixtureDetail = (await (await get(`/admin/digests/${fixture.digest}`)).json()) as {
      items: Array<{ shortDescription: string; descriptionSource: string }>;
    };
    expect(fixtureDetail.items[0].shortDescription).toBe('Original LLM description & detail');
    expect(fixtureDetail.items[0].descriptionSource).toBe('stored_body');
    const response = await get(
      '/admin/digests?limit=100&createdFrom=2000-01-01&createdTo=2100-01-01',
    );
    expect(response.status).toBe(200);
    const list = (await response.json()) as {
      data: Array<{
        id: string;
        articleCount: number;
        status: string;
        type: string;
        deliveryMode: string;
        actualRecipientEmail: string | null;
        sentAt: string | null;
        streamPages: unknown[];
      }>;
    };
    expect(list.data.length).toBeGreaterThan(0);
    for (const digest of list.data.slice(0, 5)) {
      const [count] = await db.query<Array<{ total: number }>>(
        'SELECT count(*)::int AS total FROM digest_items WHERE "digestId"=$1 AND "deletedAt" IS NULL',
        [digest.id],
      );
      expect(digest.articleCount).toBe(count.total);
      const detailResponse = await get(`/admin/digests/${digest.id}`);
      expect(detailResponse.status).toBe(200);
      const detail = (await detailResponse.json()) as {
        htmlBody: string;
        textBody: string;
        items: Array<{
          shortDescription: string | null;
          descriptionSource: string;
          scoreBreakdown: unknown;
        }>;
      };
      const [stored] = await db.query<Array<{ htmlBody: string; textBody: string }>>(
        'SELECT "htmlBody","textBody" FROM digests WHERE id=$1',
        [digest.id],
      );
      expect(detail.htmlBody).toBe(stored.htmlBody);
      expect(detail.textBody).toBe(stored.textBody);
      expect(detail.items).toHaveLength(count.total);
      for (const item of detail.items) expect(item).toHaveProperty('shortDescription');
      expect(
        (
          await get(
            `/admin/digests?status=${digest.status}&type=${digest.type}&deliveryMode=${digest.deliveryMode}`,
          )
        ).status,
      ).toBe(200);
    }
    expect((await get('/admin/digests?deliveryMode=invalid')).status).toBe(400);
    expect((await get('/admin/digests', false)).status).toBe(401);
  });

  it('users: activity windows and per-user event/selection drill-downs reconcile', async () => {
    const response = await get('/admin/users/analytics?period=7d');
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      dau: number;
      wau: number;
      mau: number;
      activeUsers: number;
      period: { from: string; to: string };
      popularity: {
        technologies: Array<{ id: string; activeUsers: number; selectedUsers: number }>;
      };
    };
    expect(body.dau).toBeGreaterThanOrEqual(1);
    expect(body.wau).toBeGreaterThanOrEqual(body.dau);
    expect(body.mau).toBeGreaterThanOrEqual(body.wau);
    const activity = new URLSearchParams({
      activityFrom: body.period.from,
      activityTo: body.period.to,
    });
    const users = (await (await get(`/admin/users?${activity}`)).json()) as {
      meta: { total: number };
    };
    expect(users.meta.total).toBe(body.activeUsers);
    const events = new URLSearchParams({
      userId: fixture.user,
      occurredFrom: body.period.from,
      occurredTo: body.period.to,
      sourceId: fixture.source,
      technologyInterestId: fixture.taxonomy,
      streamId,
    });
    for (const path of ['/admin/opens', '/admin/saved-articles', '/admin/article-feedback']) {
      const eventResponse = await get(`${path}?${events}`);
      expect(eventResponse.status).toBe(200);
      const records = (await eventResponse.json()) as { meta: { total: number } };
      expect(records.meta.total).toBe(1);
    }
    for (const path of [
      `/admin/user-technology-interests?userId=${fixture.user}&technologyInterestId=${fixture.taxonomy}`,
      `/admin/user-content-streams?userId=${fixture.user}&streamId=${streamId}`,
      `/admin/user-source-preferences?userId=${fixture.user}&sourceId=${fixture.source}`,
    ]) {
      const records = (await (await get(path)).json()) as { meta: { total: number } };
      expect(records.meta.total).toBe(1);
    }
    expect(body.popularity.technologies).toContainEqual(
      expect.objectContaining({ id: fixture.taxonomy, activeUsers: 1, selectedUsers: 1 }),
    );
    const verified = await get(
      `/admin/users?email=${encodeURIComponent(`admin-http-${fixture.user}@example.invalid`)}&verified=true&onboardingCompleted=true&onboardingFrom=${encodeURIComponent(body.period.from)}&verifiedFrom=${encodeURIComponent(body.period.from)}`,
    );
    expect(verified.status).toBe(200);
    expect(((await verified.json()) as { meta: { total: number } }).meta.total).toBe(1);
    expect((await get('/admin/users?activityPeriod=invalid')).status).toBe(400);
    expect((await get('/admin/users/analytics', false)).status).toBe(401);
  });

  it('users: list includes current selections and meaningful activity in its exact window', async () => {
    const response = await get(`/admin/users?email=${fixture.user}&activityPeriod=7d`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      activityWindow: { from: string; to: string };
      data: Array<{
        id: string;
        periodActivity: {
          active: boolean;
          total: number;
          opens: number;
          saves: number;
          usefulFeedback: number;
          notUsefulFeedback: number;
        };
        selectedTechnologies: Array<{ id: string }>;
        selectedInterests: Array<{ id: string }>;
        selectedStreams: Array<{ id: string }>;
      }>;
    };
    const user = body.data.find((row) => row.id === fixture.user);
    expect(user?.periodActivity).toEqual({
      active: true,
      total: 3,
      opens: 1,
      saves: 1,
      usefulFeedback: 1,
      notUsefulFeedback: 0,
    });
    expect(user?.selectedTechnologies).toContainEqual(
      expect.objectContaining({ id: fixture.taxonomy }),
    );
    expect(user?.selectedInterests).toContainEqual(
      expect.objectContaining({ id: fixture.interest }),
    );
    expect(user?.selectedStreams).toContainEqual(expect.objectContaining({ id: streamId }));
    const exact = await get(
      `/admin/users?email=${fixture.user}&activityFrom=2000-01-01&activityTo=2100-01-01`,
    );
    expect(exact.status).toBe(200);
    const exactBody = (await exact.json()) as typeof body;
    expect(exactBody.activityWindow.from).toContain('2000-01-01');
    expect(exactBody.data[0].periodActivity.total).toBe(3);
  });

  it('articles: domain retry reuses stored analysis, completed work cannot be cancelled, deletion is soft', async () => {
    const id = randomUUID();
    const queue = new Queue('article-analysis', {
      connection: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT || 6379),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    });
    try {
      await db.query(
        `INSERT INTO articles (id,"sourceId",title,url,"urlHash","titleHash",status,"publishedAt") VALUES ($1::uuid,$2,'Retry fixture',$3,$1::text,$1::text,'failed',now())`,
        [id, fixture.source, `https://example.invalid/${id}`],
      );
      await db.query(
        `INSERT INTO article_analyses ("articleId","preScreenIsRelevant","fullAnalysisAt") VALUES ($1,true,now())`,
        [id],
      );
      const retry = await fetch(`${base}/admin/articles/${id}/retry-analysis`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(retry.status).toBe(201);
      for (let attempt = 0; attempt < 50; attempt++) {
        const job = await queue.getJob(`article-${id}`);
        if (job && (await job.getState()) === 'completed') break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const job = await queue.getJob(`article-${id}`);
      expect(await job?.getState()).toBe('completed');
      expect(
        (
          await fetch(`${base}/admin/jobs/article-analysis/article-${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          })
        ).status,
      ).toBe(409);
      const [article] = await db.query<
        Array<{
          status: string;
        }>
      >('SELECT status FROM articles WHERE id=$1', [id]);
      expect(article.status).toBe('analyzed');
      expect(
        (
          await fetch(`${base}/admin/articles/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          })
        ).status,
      ).toBe(204);
      const [deleted] = await db.query<Array<{ deletedAt: Date | null }>>(
        'SELECT "deletedAt" FROM articles WHERE id=$1',
        [id],
      );
      expect(deleted.deletedAt).not.toBeNull();
      expect((await get(`/admin/articles/${id}`)).status).toBe(404);
    } finally {
      const job = await queue.getJob(`article-${id}`);
      if (job && (await job.getState()) !== 'active') await job.remove();
      await queue.close();
      await db.query('DELETE FROM articles WHERE id=$1', [id]);
    }
  });

  it('administrators: creation, listing, own password change, login and logout remain intact', async () => {
    const email = `admin-regression-${randomUUID()}@example.invalid`;
    const password = randomUUID();
    const newPassword = randomUUID();
    let id: string | undefined;
    let jti: string | undefined;
    try {
      const created = await fetch(`${base}/admin/admins`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      expect(created.status).toBe(201);
      id = ((await created.json()) as { id: string }).id;
      const list = (await (
        await get(`/admin/admins?email=${encodeURIComponent(email)}`)
      ).json()) as { items: Array<{ id: string; passwordHash?: string }> };
      expect(list.items).toHaveLength(1);
      expect(list.items[0].passwordHash).toBeUndefined();
      const login = async (value: string) =>
        fetch(`${base}/admin/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: value }),
        });
      const first = (await (await login(password)).json()) as { accessToken: string };
      const changed = await fetch(`${base}/admin/auth/password`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${first.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ currentPassword: password, newPassword }),
      });
      expect(changed.status).toBe(200);
      expect(
        (
          await fetch(`${base}/admin/admins`, {
            headers: { Authorization: `Bearer ${first.accessToken}` },
          })
        ).status,
      ).toBe(401);
      expect((await login(password)).status).toBe(401);
      const freshResponse = await login(newPassword);
      expect(freshResponse.status).toBe(200);
      const fresh = (await freshResponse.json()) as { accessToken: string };
      jti = (
        JSON.parse(Buffer.from(fresh.accessToken.split('.')[1], 'base64url').toString()) as {
          jti: string;
        }
      ).jti;
      expect(
        (
          await fetch(`${base}/admin/auth/logout`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${fresh.accessToken}` },
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await fetch(`${base}/admin/admins`, {
            headers: { Authorization: `Bearer ${fresh.accessToken}` },
          })
        ).status,
      ).toBe(401);
    } finally {
      if (jti) await db.query('DELETE FROM administrator_revoked_tokens WHERE jti=$1', [jti]);
      if (id) await db.query('DELETE FROM administrators WHERE id=$1', [id]);
    }
  });

  it('contract: live OpenAPI declares administrator security and concrete response schemas', async () => {
    type ResponseSchema = { content?: Record<string, { schema: { $ref?: string } }> };
    type Operation = { security: unknown[]; responses: Record<string, ResponseSchema> };
    const doc = (await (await fetch(`${base}/docs-json`)).json()) as {
      paths: Record<string, { get: Operation }>;
      components: { schemas: Record<string, { properties: Record<string, unknown> }> };
    };
    for (const path of [
      '/admin/dashboard/overview',
      '/admin/sources',
      '/admin/sources/{id}',
      '/admin/source-candidates',
      '/admin/articles',
      '/admin/articles/{id}',
      '/admin/jobs',
      '/admin/jobs/{queue}/{jobId}',
      '/admin/digests',
      '/admin/users',
      '/admin/users/analytics',
    ]) {
      expect(doc.paths[path].get.security).toContainEqual({ 'administrator-bearer': [] });
      expect(
        doc.paths[path].get.responses['200'].content?.['application/json'].schema.$ref,
      ).toBeDefined();
    }
    expect(doc.components.schemas.AdminArticleAnalysisResponseDto.properties).toHaveProperty(
      'preScreenReason',
    );
    expect(doc.components.schemas.AdminArticleAnalysisResponseDto.properties).toHaveProperty(
      'shouldIncludeInWeeklyDigest',
    );
    for (const [schema, fields] of Object.entries({
      PaginatedAdminSourceResponseDto: ['period'],
      AdminSourceResponseDto: ['periodArticleCount'],
      AdminArticleListItemDto: ['primaryStream', 'qualityScore', 'finalScore'],
      AdminTechnologyInterestListItemDto: ['relatedStreams', 'coverage'],
      PaginatedUserResponseDto: ['activityWindow'],
      AdminUserListItemDto: [
        'periodActivity',
        'selectedTechnologies',
        'selectedInterests',
        'selectedStreams',
      ],
      SourceCandidateResponseDto: ['technologyInterestName', 'contentStreamName'],
    })) {
      for (const field of fields)
        expect(doc.components.schemas[schema].properties).toHaveProperty(field);
    }
    for (const path of [
      '/admin/dashboard/overview',
      '/admin/sources',
      '/admin/articles',
      '/admin/jobs',
      '/admin/digests',
      '/admin/users/analytics',
    ]) {
      expect(
        (await fetch(`${base}${path}`, { headers: { 'X-API-KEY': local.API_KEY } })).status,
      ).toBe(401);
    }
  });

  it('sources: create preserves validation, defaults, duplicates and default Web discovery entry', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/rss+xml' });
      response.end(
        '<rss version="2.0"><channel><title>Local fixture</title><link>https://example.invalid</link><description>Fixture</description><item><title>Fixture article</title><link>https://example.invalid/article</link><description>Fixture content</description></item></channel></rss>',
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Fixture server failed to bind');
    const ids: string[] = [];
    const post = (body: unknown) =>
      fetch(`${base}/admin/sources`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    try {
      for (const type of ['rss', 'web']) {
        const url = `http://127.0.0.1:${address.port}/${type}`;
        const body = {
          name: 'Local source fixture',
          url,
          type,
          category: 'engineering_deep_dives',
        };
        const response = await post(body);
        expect(response.status).toBe(201);
        const source = (await response.json()) as {
          id: string;
          enabled: boolean;
          trustScore: number;
          webConfig?: { entryUrls: string[] };
        };
        ids.push(source.id);
        expect(source.enabled).toBe(true);
        expect(Number(source.trustScore)).toBe(50);
        if (type === 'web') expect(source.webConfig?.entryUrls).toEqual([url]);
        expect((await post(body)).status).toBe(409);
        expect((await post({ ...body, email: 'not-a-source-field@example.invalid' })).status).toBe(
          400,
        );
      }
    } finally {
      for (const id of ids) await db.query('DELETE FROM sources WHERE id=$1', [id]);
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
