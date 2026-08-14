import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLongSummaryToArticleAnalyses1786100000000 implements MigrationInterface {
  name = 'AddLongSummaryToArticleAnalyses1786100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "article_analyses" ADD "longSummary" text`);
    await queryRunner.query(
      `UPDATE "article_analyses" SET "longSummary" = "shortSummary" WHERE "shortSummary" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "article_analyses" DROP COLUMN "longSummary"`);
  }
}
