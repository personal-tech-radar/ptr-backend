import { MigrationInterface, QueryRunner } from 'typeorm';
import { convertLegacyInfoPageDocument } from '../info-pages/utils/legacy-info-page-document.util';

export class ConvertInfoPageFullTextToJsonb1791527453072 implements MigrationInterface {
  name = 'ConvertInfoPageFullTextToJsonb1791527453072';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const result: unknown = await queryRunner.query(
      `SELECT "id", "fullText" FROM "info_pages" ORDER BY "id"`,
    );
    if (!Array.isArray(result)) throw new Error('Unable to read existing info-page content');
    const rows = result as Array<{ id: string; fullText: string }>;

    for (const row of rows) {
      const document = convertLegacyInfoPageDocument(row.fullText);
      await queryRunner.query(`UPDATE "info_pages" SET "fullText" = $1 WHERE "id" = $2`, [
        JSON.stringify(document),
        row.id,
      ]);
    }

    await queryRunner.query(
      `ALTER TABLE "info_pages" ALTER COLUMN "fullText" TYPE jsonb USING "fullText"::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "info_pages" ALTER COLUMN "fullText" TYPE text USING "fullText"::text`,
    );
  }
}
