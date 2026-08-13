import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContentExtractionFieldsToArticles1783192888805 implements MigrationInterface {
  name = 'AddContentExtractionFieldsToArticles1783192888805';

  // NOTE: the raw CLI diff also emitted DROP/ADD lines for `article_relevances`
  // FK/UNIQUE constraints (renaming hand-written constraint names to TypeORM's
  // auto-generated hash names). That table is untouched by this migration and
  // is not part of this change, so those lines were stripped. This is expected
  // drift from 1777400000000-AddArticleRelevanceTable.ts using friendly
  // constraint names instead of TypeORM's naming convention.
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."articles_contentextractionmethod_enum" AS ENUM('rss', 'readability', 'cheerio_selector', 'playwright')`,
    );
    await queryRunner.query(
      `ALTER TABLE "articles" ADD "contentExtractionMethod" "public"."articles_contentextractionmethod_enum" NOT NULL DEFAULT 'rss'`,
    );
    await queryRunner.query(`ALTER TABLE "articles" ADD "contentExtractionConfig" jsonb`);
    await queryRunner.query(`ALTER TABLE "articles" ADD "contentFetchedAt" TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "articles" DROP COLUMN "contentFetchedAt"`);
    await queryRunner.query(`ALTER TABLE "articles" DROP COLUMN "contentExtractionConfig"`);
    await queryRunner.query(`ALTER TABLE "articles" DROP COLUMN "contentExtractionMethod"`);
    await queryRunner.query(`DROP TYPE "public"."articles_contentextractionmethod_enum"`);
  }
}
