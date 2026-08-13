import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSourceCandidates1783336137141 implements MigrationInterface {
  name = 'CreateSourceCandidates1783336137141';

  // NOTE: the raw CLI diff also emitted DROP/ADD lines for `article_relevances`
  // FK/UNIQUE constraints (renaming hand-written constraint names to TypeORM's
  // auto-generated hash names). That table is untouched by this migration and
  // is not part of this change, so those lines were stripped. This is expected
  // drift from 1777400000000-AddArticleRelevanceTable.ts using friendly
  // constraint names instead of TypeORM's naming convention.
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."source_candidates_status_enum" AS ENUM('pending', 'validated', 'rejected', 'promoted', 'needs_review')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."source_candidates_detectedtype_enum" AS ENUM('rss', 'atom', 'web')`,
    );
    await queryRunner.query(
      `CREATE TABLE "source_candidates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "normalizedUrl" character varying NOT NULL, "domain" character varying NOT NULL, "discoveredFromArticleId" uuid, "seedKey" character varying, "status" "public"."source_candidates_status_enum" NOT NULL DEFAULT 'pending', "detectedType" "public"."source_candidates_detectedtype_enum", "proposedConfig" jsonb, "validationError" text, "lastValidatedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_4faff72d77419c3d378e0f70402" UNIQUE ("normalizedUrl"), CONSTRAINT "PK_113527c8702d238d82599303b5d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "source_candidates" ADD CONSTRAINT "FK_9fad6964ad7df21bffb981bdf67" FOREIGN KEY ("discoveredFromArticleId") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "source_candidates" DROP CONSTRAINT "FK_9fad6964ad7df21bffb981bdf67"`,
    );
    await queryRunner.query(`DROP TABLE "source_candidates"`);
    await queryRunner.query(`DROP TYPE "public"."source_candidates_detectedtype_enum"`);
    await queryRunner.query(`DROP TYPE "public"."source_candidates_status_enum"`);
  }
}
