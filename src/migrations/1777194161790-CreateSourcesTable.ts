import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSourcesTable1777194161790 implements MigrationInterface {
  name = 'CreateSourcesTable1777194161790';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."sources_type_enum" AS ENUM('rss', 'atom', 'github_release')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."sources_category_enum" AS ENUM('backend_architecture_infra', 'engineering_deep_dives', 'node_typescript_nestjs', 'ai_engineering')`,
    );
    await queryRunner.query(
      `CREATE TABLE "sources" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "url" character varying NOT NULL, "type" "public"."sources_type_enum" NOT NULL, "category" "public"."sources_category_enum" NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "trustScore" numeric(5,2) NOT NULL DEFAULT '50', "lastCheckedAt" TIMESTAMP, "deletedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_f3669d5c21ec3b27789e801d125" UNIQUE ("url"), CONSTRAINT "PK_85523beafe5a2a6b90b02096443" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."articles_status_enum" AS ENUM('new', 'duplicate', 'pending_analysis', 'analyzed', 'rejected', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "articles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sourceId" uuid NOT NULL, "title" character varying NOT NULL, "url" character varying NOT NULL, "urlHash" character varying NOT NULL, "titleHash" character varying NOT NULL, "author" text, "publishedAt" TIMESTAMP, "summaryFromFeed" text, "rawContent" text, "status" "public"."articles_status_enum" NOT NULL DEFAULT 'new', "deletedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_532b2585a1a144ea12ef02dc6ec" UNIQUE ("urlHash"), CONSTRAINT "PK_0a6e2c450d83e0b6052c2793334" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "digest_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "digestId" uuid NOT NULL, "articleId" uuid NOT NULL, "position" integer NOT NULL, "deletedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f85763d8b12d80ae3d5e6dc95a4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE TYPE "public"."digests_type_enum" AS ENUM('daily', 'weekly')`);
    await queryRunner.query(
      `CREATE TYPE "public"."digests_status_enum" AS ENUM('draft', 'sent', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "digests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" "public"."digests_type_enum" NOT NULL DEFAULT 'daily', "periodStart" TIMESTAMP NOT NULL, "periodEnd" TIMESTAMP NOT NULL, "subject" character varying NOT NULL, "intro" text NOT NULL, "htmlBody" text NOT NULL, "textBody" text NOT NULL, "status" "public"."digests_status_enum" NOT NULL DEFAULT 'draft', "sentAt" TIMESTAMP, "deletedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3849fbafde59a8a4abf182ad18c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "article_analyses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "articleId" uuid NOT NULL, "shortSummary" text NOT NULL, "whyItMatters" text NOT NULL, "practicalValue" text NOT NULL, "tags" text NOT NULL, "relevanceScore" numeric(5,2) NOT NULL, "qualityScore" numeric(5,2) NOT NULL, "finalScore" numeric(5,2) NOT NULL, "shouldIncludeInDailyDigest" boolean NOT NULL DEFAULT false, "deletedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_ac2b2b1a2d8bfe786e06a3d214f" UNIQUE ("articleId"), CONSTRAINT "REL_ac2b2b1a2d8bfe786e06a3d214" UNIQUE ("articleId"), CONSTRAINT "PK_786b6dc5fcf4135ff071935245d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "articles" ADD CONSTRAINT "FK_050682951b2bc5f2d4742147f6a" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "digest_items" ADD CONSTRAINT "FK_4badb6b61684dbe6333f74d2c0e" FOREIGN KEY ("digestId") REFERENCES "digests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "digest_items" ADD CONSTRAINT "FK_d47deb553e74db2a53ab8456211" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ADD CONSTRAINT "FK_ac2b2b1a2d8bfe786e06a3d214f" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "article_analyses" DROP CONSTRAINT "FK_ac2b2b1a2d8bfe786e06a3d214f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "digest_items" DROP CONSTRAINT "FK_d47deb553e74db2a53ab8456211"`,
    );
    await queryRunner.query(
      `ALTER TABLE "digest_items" DROP CONSTRAINT "FK_4badb6b61684dbe6333f74d2c0e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "articles" DROP CONSTRAINT "FK_050682951b2bc5f2d4742147f6a"`,
    );
    await queryRunner.query(`DROP TABLE "article_analyses"`);
    await queryRunner.query(`DROP TABLE "digests"`);
    await queryRunner.query(`DROP TYPE "public"."digests_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."digests_type_enum"`);
    await queryRunner.query(`DROP TABLE "digest_items"`);
    await queryRunner.query(`DROP TABLE "articles"`);
    await queryRunner.query(`DROP TYPE "public"."articles_status_enum"`);
    await queryRunner.query(`DROP TABLE "sources"`);
    await queryRunner.query(`DROP TYPE "public"."sources_category_enum"`);
    await queryRunner.query(`DROP TYPE "public"."sources_type_enum"`);
  }
}
