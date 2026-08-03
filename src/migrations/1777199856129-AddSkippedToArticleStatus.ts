import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSkippedToArticleStatus1777199856129 implements MigrationInterface {
  name = 'AddSkippedToArticleStatus1777199856129';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ADD "shouldIncludeInWeeklyDigest" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ADD "shouldIncludeInDeepDiveDigest" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ADD "deepDiveScore" numeric(5,2) NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ADD "complexityLevel" character varying NOT NULL DEFAULT 'basic'`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ADD "matchedInterests" text NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."articles_status_enum" RENAME TO "articles_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."articles_status_enum" AS ENUM('new', 'duplicate', 'pending_analysis', 'analyzed', 'rejected', 'failed', 'skipped')`,
    );
    await queryRunner.query(`ALTER TABLE "articles" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "articles" ALTER COLUMN "status" TYPE "public"."articles_status_enum" USING "status"::"text"::"public"."articles_status_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "articles" ALTER COLUMN "status" SET DEFAULT 'new'`);
    await queryRunner.query(`DROP TYPE "public"."articles_status_enum_old"`);
    await queryRunner.query(
      `ALTER TYPE "public"."digests_type_enum" RENAME TO "digests_type_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."digests_type_enum" AS ENUM('daily', 'weekly', 'deep_dive_weekly')`,
    );
    await queryRunner.query(`ALTER TABLE "digests" ALTER COLUMN "type" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "digests" ALTER COLUMN "type" TYPE "public"."digests_type_enum" USING "type"::"text"::"public"."digests_type_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "digests" ALTER COLUMN "type" SET DEFAULT 'daily'`);
    await queryRunner.query(`DROP TYPE "public"."digests_type_enum_old"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."digests_type_enum_old" AS ENUM('daily', 'weekly')`,
    );
    await queryRunner.query(`ALTER TABLE "digests" ALTER COLUMN "type" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "digests" ALTER COLUMN "type" TYPE "public"."digests_type_enum_old" USING "type"::"text"::"public"."digests_type_enum_old"`,
    );
    await queryRunner.query(`ALTER TABLE "digests" ALTER COLUMN "type" SET DEFAULT 'daily'`);
    await queryRunner.query(`DROP TYPE "public"."digests_type_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."digests_type_enum_old" RENAME TO "digests_type_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."articles_status_enum_old" AS ENUM('new', 'duplicate', 'pending_analysis', 'analyzed', 'rejected', 'failed')`,
    );
    await queryRunner.query(`ALTER TABLE "articles" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "articles" ALTER COLUMN "status" TYPE "public"."articles_status_enum_old" USING "status"::"text"::"public"."articles_status_enum_old"`,
    );
    await queryRunner.query(`ALTER TABLE "articles" ALTER COLUMN "status" SET DEFAULT 'new'`);
    await queryRunner.query(`DROP TYPE "public"."articles_status_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."articles_status_enum_old" RENAME TO "articles_status_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "article_analyses" DROP COLUMN "matchedInterests"`);
    await queryRunner.query(`ALTER TABLE "article_analyses" DROP COLUMN "complexityLevel"`);
    await queryRunner.query(`ALTER TABLE "article_analyses" DROP COLUMN "deepDiveScore"`);
    await queryRunner.query(
      `ALTER TABLE "article_analyses" DROP COLUMN "shouldIncludeInDeepDiveDigest"`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" DROP COLUMN "shouldIncludeInWeeklyDigest"`,
    );
  }
}
