import { DataSource, QueryRunner } from 'typeorm';
import { ConvertInfoPageFullTextToJsonb1791527453072 } from '../src/migrations/1791527453072-ConvertInfoPageFullTextToJsonb';
import { SeedDefaultInfoPages1786002000000 } from '../src/migrations/1786002000000-SeedDefaultInfoPages';

const queryRows = async <T>(runner: QueryRunner, query: string): Promise<T[]> => {
  const result: unknown = await runner.query(query);
  if (!Array.isArray(result)) throw new Error('Expected a row set from database');
  return result as T[];
};

type ConvertedRow = {
  id: string;
  fullText: { blocks: Array<{ type: string; data: { text: string; level?: number } }> };
  type: string;
};

describe('info-page JSONB conversion migration (e2e)', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;

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
    runner = dataSource.createQueryRunner();
    await runner.connect();
  });

  afterAll(async () => {
    if (runner?.isReleased === false) await runner.release();
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('converts legacy text, preserves content, and rolls back to recoverable JSON text', async () => {
    await runner.startTransaction();
    try {
      await runner.query(`
        CREATE TEMP TABLE "info_pages" (
          "id" uuid PRIMARY KEY,
          "fullText" text NOT NULL
        ) ON COMMIT DROP
      `);
      await runner.query(
        `INSERT INTO "info_pages" ("id", "fullText") VALUES
          ($1, $2), ($3, $4), ($5, $6), ($7, $8)`,
        [
          '00000000-0000-4000-8000-000000000001',
          JSON.stringify({
            systemKey: 'legacy-seed',
            version: 1,
            blocks: [
              { type: 'heading', data: { level: 1, text: 'Title' } },
              {
                type: 'paragraph',
                data: { text: '<a href="https://example.com">safe link</a>' },
              },
            ],
          }),
          '00000000-0000-4000-8000-000000000002',
          'plain text',
          '00000000-0000-4000-8000-000000000003',
          '{"blocks":[',
          '00000000-0000-4000-8000-000000000004',
          JSON.stringify({
            blocks: [
              {
                type: 'paragraph',
                data: { text: '<a href="javascript:alert(1)">unsafe link</a>' },
              },
            ],
          }),
        ],
      );

      const migration = new ConvertInfoPageFullTextToJsonb1791527453072();
      await migration.up(runner);
      const converted = await queryRows<ConvertedRow>(
        runner,
        `SELECT "id", "fullText", pg_typeof("fullText")::text AS type
         FROM "info_pages" ORDER BY "id"`,
      );

      expect(converted).toHaveLength(4);
      expect(converted.every((row) => row.type === 'jsonb')).toBe(true);
      expect(converted[0].fullText.blocks[0]).toEqual({
        type: 'header',
        data: { level: 2, text: 'Title' },
      });
      expect(converted[0].fullText.blocks[1].data.text).toBe(
        '<a href="https://example.com">safe link</a>',
      );
      expect(converted[1].fullText.blocks[0].data.text).toBe('plain text');
      expect(converted[2].fullText.blocks[0].data.text).toBe('{"blocks":[');
      expect(converted[3].fullText.blocks[0].data.text).toContain('&lt;a href=');

      await migration.down(runner);
      const rolledBack = await queryRows<{ fullText: string; type: string }>(
        runner,
        `SELECT "fullText", pg_typeof("fullText")::text AS type
         FROM "info_pages" ORDER BY "id"`,
      );
      expect(rolledBack.every((row) => row.type === 'text')).toBe(true);
      const rolledBackDocument = JSON.parse(rolledBack[0].fullText) as {
        blocks: Array<{ type: string }>;
      };
      expect(rolledBackDocument.blocks[0].type).toBe('header');
      await runner.rollbackTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    }
  });

  it('keeps seed rollback limited to unchanged legacy or converted examples', async () => {
    await runner.startTransaction();
    try {
      await runner.query(`
        CREATE TEMP TABLE "info_pages" (
          "id" integer PRIMARY KEY,
          "title" varchar(255) NOT NULL,
          "fullText" text NOT NULL,
          "deletedAt" timestamp
        ) ON COMMIT DROP
      `);
      await runner.query(
        `INSERT INTO "info_pages" ("id", "title", "fullText") VALUES
          (1, 'Legal Notice', $1),
          (2, 'Privacy Policy', $2),
          (3, 'Cookies Policy', $3)`,
        [
          JSON.stringify({ systemKey: 'legal-notice-default', blocks: [] }),
          JSON.stringify({
            blocks: [
              { type: 'header', data: { level: 2, text: 'Privacy Policy' } },
              {
                type: 'paragraph',
                data: {
                  text: 'Personal Tech Radar stores account details, profile selections, saved articles, feedback, and delivery preferences needed to provide personalized feeds and digests.',
                },
              },
              {
                type: 'paragraph',
                data: {
                  text: 'The service uses this information to authenticate users, personalize content, deliver requested emails, and maintain operational security. It does not sell personal information.',
                },
              },
              {
                type: 'paragraph',
                data: {
                  text: 'Configure the contact and retention details for your deployment before publishing this page as a final legal policy.',
                },
              },
            ],
            version: '2.x',
          }),
          JSON.stringify({ blocks: [{ type: 'paragraph', data: { text: 'Administrator edit' } }] }),
        ],
      );

      await new SeedDefaultInfoPages1786002000000().down(runner);
      const remaining = await queryRows<{ title: string }>(
        runner,
        `SELECT "title" FROM "info_pages" ORDER BY "id"`,
      );
      expect(remaining).toEqual([{ title: 'Cookies Policy' }]);
      await runner.rollbackTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    }
  });
});
