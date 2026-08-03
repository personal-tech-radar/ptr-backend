import { readFileSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { BootstrapLegacyProductCatalog1785945600000 } from '../src/migrations/1785945600000-BootstrapLegacyProductCatalog';

describe('Legacy product catalog bootstrap migration (e2e)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'ptr',
    });
    await dataSource.initialize();
  });

  afterAll(async () => dataSource.destroy());

  it('is idempotent and preserves established user-controlled fields', async () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), 'config', 'sources.manifest.json'), 'utf8'),
    ) as { sources: { seedUrl: string }[] };
    const urls = manifest.sources.map((source) => source.seedUrl);
    const migration = new BootstrapLegacyProductCatalog1785945600000();
    const runner = dataSource.createQueryRunner();
    await runner.connect();

    const [beforeUser] = await runner.query(
      'SELECT timezone, "githubUrl", "passwordHash" FROM users WHERE lower(email)=$1',
      ['miter.sidorov@gmail.com'],
    );
    const [{ count: beforeCandidateCount }] = await runner.query(
      'SELECT count(*)::int count FROM source_candidates',
    );
    const [{ count: beforeQuotaCount }] = await runner.query(
      'SELECT count(*)::int count FROM discovery_quota_records',
    );

    await runner.startTransaction();
    try {
      await migration.up(runner);
      await migration.up(runner);
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    }

    const [{ count: sourceCount, uniqueCount }] = await runner.query(
      'SELECT count(*)::int count, count(DISTINCT url)::int "uniqueCount" FROM sources WHERE url=ANY($1)',
      [urls],
    );
    const [afterUser] = await runner.query(
      'SELECT timezone, "githubUrl", "passwordHash" FROM users WHERE lower(email)=$1',
      ['miter.sidorov@gmail.com'],
    );
    const [{ count: afterCandidateCount }] = await runner.query(
      'SELECT count(*)::int count FROM source_candidates',
    );
    const [{ count: afterQuotaCount }] = await runner.query(
      'SELECT count(*)::int count FROM discovery_quota_records',
    );

    expect(sourceCount).toBe(urls.length);
    expect(uniqueCount).toBe(urls.length);
    expect(afterUser).toEqual(beforeUser);
    expect(afterCandidateCount).toBe(beforeCandidateCount);
    expect(afterQuotaCount).toBe(beforeQuotaCount);
    await runner.release();
  });
});
