import { MigrationInterface, QueryRunner } from 'typeorm';

// Hand-augmented beyond the raw CLI diff, per this phase's spec (mirrors CreateTaxonomyTables'
// precedent for documenting hand-added, non-diffable content):
//
// - The `complexityLevel` column is migrated via an add-new-column / backfill / drop-old /
//   rename sequence instead of the CLI's default drop-then-recreate, specifically so the old
//   varchar values are still readable at backfill time (a plain DROP COLUMN would destroy them
//   before the mapping could run).
// - The backfill UPDATE for `preScreenIsRelevant`/`preScreenReason`/`preScreenAt`/
//   `fullAnalysisAt` on every pre-existing `article_analyses` row — every such row necessarily
//   passed the old pre-analysis gate, since under the pre-phase-3 pipeline a row could only be
//   created after `ArticleRelevance.preAnalysisIsRelevant = true`.
// - The partial unique index enforcing at most one primary stream per article
//   (`IDX_article_streams_primary_per_article`) — no entity field maps to a partial index
//   predicate, so `migration:generate` cannot produce this on its own.
// - Dropping `article_relevances` (table + its two FK constraints) — the CLI diff does not
//   proactively drop tables with no corresponding entity, so this is fully hand-written, using
//   the exact constraint names from `AddArticleRelevanceTable`.
// - The unrelated `IDX_technology_interests_normalizedName_trgm` drop/recreate the raw CLI diff
//   included (TypeORM's schema diff doesn't understand the `gin_trgm_ops` operator class on that
//   index, so it looks changed even though it isn't) was stripped, same as the precedent noted in
//   `CreateTaxonomyTables`.
export class GlobalArticleAnalysisRework1785067502893 implements MigrationInterface {
  name = 'GlobalArticleAnalysisRework1785067502893';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "article_technology_interests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "articleId" uuid NOT NULL, "technologyInterestId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_99225aba32d1b47673733025f31" UNIQUE ("articleId", "technologyInterestId"), CONSTRAINT "PK_7dc9f1ebb7134dd179f90e2c5bc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "article_streams" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "articleId" uuid NOT NULL, "streamId" uuid NOT NULL, "isPrimary" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_d1201ca5fbfc25e93712d30f8ae" UNIQUE ("articleId", "streamId"), CONSTRAINT "PK_9cd2a79433f8c397e127b7a2836" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(`ALTER TABLE "article_analyses" DROP COLUMN "matchedInterests"`);
    await queryRunner.query(`ALTER TABLE "article_analyses" ADD "preScreenIsRelevant" boolean`);
    await queryRunner.query(`ALTER TABLE "article_analyses" ADD "preScreenReason" text`);
    await queryRunner.query(`ALTER TABLE "article_analyses" ADD "preScreenAt" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "article_analyses" ADD "fullAnalysisAt" TIMESTAMP`);
    await queryRunner.query(
      `CREATE TYPE "public"."article_analyses_materialtype_enum" AS ENUM('article', 'tutorial', 'release_notes', 'announcement', 'opinion', 'case_study', 'reference')`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ADD "materialType" "public"."article_analyses_materialtype_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "article_analyses" ADD "urgencyScore" numeric(5,2)`);
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ADD "evergreen" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ADD "breakingChanges" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(`ALTER TABLE "article_analyses" ADD "releaseData" jsonb`);
    await queryRunner.query(`ALTER TABLE "article_analyses" ADD "securityData" jsonb`);
    await queryRunner.query(`ALTER TABLE "article_analyses" ADD "mainStreamId" uuid`);

    await queryRunner.query(
      `ALTER TABLE "article_analyses" ALTER COLUMN "shortSummary" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ALTER COLUMN "whyItMatters" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ALTER COLUMN "practicalValue" DROP NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "article_analyses" ALTER COLUMN "tags" DROP NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ALTER COLUMN "relevanceScore" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ALTER COLUMN "qualityScore" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ALTER COLUMN "finalScore" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ALTER COLUMN "deepDiveScore" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ALTER COLUMN "deepDiveScore" DROP DEFAULT`,
    );

    // complexityLevel: varchar -> enum, preserving existing values via an
    // add-new-column/backfill/drop-old/rename sequence (see the class-level comment above).
    await queryRunner.query(
      `CREATE TYPE "public"."article_analyses_complexitylevel_enum" AS ENUM('beginner', 'intermediate', 'advanced', 'architect')`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ADD "complexityLevelNew" "public"."article_analyses_complexitylevel_enum"`,
    );
    await queryRunner.query(`
      UPDATE "article_analyses" SET "complexityLevelNew" = CASE
        WHEN "complexityLevel" = 'basic' THEN 'beginner'
        WHEN "complexityLevel" IN ('intermediate', 'advanced', 'architect') THEN "complexityLevel"
        ELSE 'intermediate'
      END::"public"."article_analyses_complexitylevel_enum"
    `);
    await queryRunner.query(`ALTER TABLE "article_analyses" DROP COLUMN "complexityLevel"`);
    await queryRunner.query(
      `ALTER TABLE "article_analyses" RENAME COLUMN "complexityLevelNew" TO "complexityLevel"`,
    );

    await queryRunner.query(
      `ALTER TABLE "article_analyses" DROP CONSTRAINT "FK_ac2b2b1a2d8bfe786e06a3d214f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ADD CONSTRAINT "FK_ac2b2b1a2d8bfe786e06a3d214f" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ADD CONSTRAINT "FK_47f6745efe92447ec614b885679" FOREIGN KEY ("mainStreamId") REFERENCES "content_streams"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_technology_interests" ADD CONSTRAINT "FK_4e7ee6bb483cd9fd57b46984c7e" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_technology_interests" ADD CONSTRAINT "FK_74c0384891599685fb066ab7301" FOREIGN KEY ("technologyInterestId") REFERENCES "technology_interests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_streams" ADD CONSTRAINT "FK_bf949682def25b63381730946f9" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_streams" ADD CONSTRAINT "FK_0fecd7ebd0811a27f58173845ed" FOREIGN KEY ("streamId") REFERENCES "content_streams"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // Hand-added: at most one primary stream per article — no entity field maps to a partial
    // index predicate, so migration:generate cannot produce this.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_article_streams_primary_per_article" ON "article_streams" ("articleId") WHERE "isPrimary" = true`,
    );

    // Hand-added backfill: every pre-existing article_analyses row necessarily passed the old
    // pre-analysis gate (a row could only be created after ArticleRelevance.preAnalysisIsRelevant
    // = true under the pre-phase-3 pipeline), so it is safe to mark all of them pre-screened and
    // fully analyzed using their original createdAt/updatedAt as the corresponding timestamps.
    await queryRunner.query(`
      UPDATE "article_analyses"
      SET "preScreenIsRelevant" = true,
          "preScreenReason" = 'backfilled: pre-existing full analysis',
          "preScreenAt" = "createdAt",
          "fullAnalysisAt" = "updatedAt"
      WHERE "preScreenIsRelevant" IS NULL
    `);

    // Hand-added: article_relevances (the per-user pre-screen gate) is fully removed — replaced
    // by ArticleAnalysis's own preScreen*/fullAnalysisAt columns. Nothing else references this
    // table (fullAnalysisId pointed FROM it TO article_analyses, never the reverse).
    await queryRunner.query(
      `ALTER TABLE "article_relevances" DROP CONSTRAINT "FK_article_relevances_analysis"`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_relevances" DROP CONSTRAINT "FK_article_relevances_article"`,
    );
    await queryRunner.query(`DROP TABLE "article_relevances"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Schema-only rollback (matches this project's existing migration down() conventions) — not
    // a data-preserving restore. Recreates an empty article_relevances table structure.
    await queryRunner.query(`
      CREATE TABLE "article_relevances" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "articleId" uuid NOT NULL,
        "userId" character varying NOT NULL,
        "preAnalysisIsRelevant" boolean NOT NULL,
        "preAnalysisReason" text NOT NULL,
        "preAnalysisAt" TIMESTAMP NOT NULL,
        "fullAnalysisId" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_article_relevances" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_article_relevances_article_user" UNIQUE ("articleId", "userId")
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "article_relevances" ADD CONSTRAINT "FK_article_relevances_article" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_relevances" ADD CONSTRAINT "FK_article_relevances_analysis" FOREIGN KEY ("fullAnalysisId") REFERENCES "article_analyses"("id") ON DELETE SET NULL`,
    );

    await queryRunner.query(`DROP INDEX "public"."IDX_article_streams_primary_per_article"`);

    await queryRunner.query(
      `ALTER TABLE "article_streams" DROP CONSTRAINT "FK_0fecd7ebd0811a27f58173845ed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_streams" DROP CONSTRAINT "FK_bf949682def25b63381730946f9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_technology_interests" DROP CONSTRAINT "FK_74c0384891599685fb066ab7301"`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_technology_interests" DROP CONSTRAINT "FK_4e7ee6bb483cd9fd57b46984c7e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" DROP CONSTRAINT "FK_47f6745efe92447ec614b885679"`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" DROP CONSTRAINT "FK_ac2b2b1a2d8bfe786e06a3d214f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ADD CONSTRAINT "FK_ac2b2b1a2d8bfe786e06a3d214f" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    // Note: this reversal stores the current enum value as literal text rather than re-mapping it
    // back to the pre-migration 'basic' vocabulary — a value like 'beginner' will read back as
    // 'intermediate' after a down-then-up cycle, not its original value. This is intentional
    // (schema-only rollback, not a data-preserving restore) but worth knowing if down() is ever
    // exercised against real data.
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ADD "complexityLevelOld" character varying`,
    );
    await queryRunner.query(`
      UPDATE "article_analyses" SET "complexityLevelOld" = COALESCE("complexityLevel"::text, 'basic')
    `);
    await queryRunner.query(`ALTER TABLE "article_analyses" DROP COLUMN "complexityLevel"`);
    await queryRunner.query(`DROP TYPE "public"."article_analyses_complexitylevel_enum"`);
    await queryRunner.query(
      `ALTER TABLE "article_analyses" RENAME COLUMN "complexityLevelOld" TO "complexityLevel"`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ALTER COLUMN "complexityLevel" SET DEFAULT 'basic'`,
    );
    await queryRunner.query(
      `UPDATE "article_analyses" SET "complexityLevel" = 'basic' WHERE "complexityLevel" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ALTER COLUMN "complexityLevel" SET NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "article_analyses" ALTER COLUMN "deepDiveScore" SET DEFAULT '0'`,
    );
    await queryRunner.query(
      `UPDATE "article_analyses" SET "deepDiveScore" = 0 WHERE "deepDiveScore" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ALTER COLUMN "deepDiveScore" SET NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "article_analyses" SET "finalScore" = 0 WHERE "finalScore" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ALTER COLUMN "finalScore" SET NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "article_analyses" SET "qualityScore" = 0 WHERE "qualityScore" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ALTER COLUMN "qualityScore" SET NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "article_analyses" SET "relevanceScore" = 0 WHERE "relevanceScore" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ALTER COLUMN "relevanceScore" SET NOT NULL`,
    );
    await queryRunner.query(`UPDATE "article_analyses" SET "tags" = '' WHERE "tags" IS NULL`);
    await queryRunner.query(`ALTER TABLE "article_analyses" ALTER COLUMN "tags" SET NOT NULL`);
    await queryRunner.query(
      `UPDATE "article_analyses" SET "practicalValue" = '' WHERE "practicalValue" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ALTER COLUMN "practicalValue" SET NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "article_analyses" SET "whyItMatters" = '' WHERE "whyItMatters" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ALTER COLUMN "whyItMatters" SET NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "article_analyses" SET "shortSummary" = '' WHERE "shortSummary" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ALTER COLUMN "shortSummary" SET NOT NULL`,
    );

    await queryRunner.query(`ALTER TABLE "article_analyses" DROP COLUMN "mainStreamId"`);
    await queryRunner.query(`ALTER TABLE "article_analyses" DROP COLUMN "securityData"`);
    await queryRunner.query(`ALTER TABLE "article_analyses" DROP COLUMN "releaseData"`);
    await queryRunner.query(`ALTER TABLE "article_analyses" DROP COLUMN "breakingChanges"`);
    await queryRunner.query(`ALTER TABLE "article_analyses" DROP COLUMN "evergreen"`);
    await queryRunner.query(`ALTER TABLE "article_analyses" DROP COLUMN "urgencyScore"`);
    await queryRunner.query(`ALTER TABLE "article_analyses" DROP COLUMN "materialType"`);
    await queryRunner.query(`DROP TYPE "public"."article_analyses_materialtype_enum"`);
    await queryRunner.query(`ALTER TABLE "article_analyses" DROP COLUMN "fullAnalysisAt"`);
    await queryRunner.query(`ALTER TABLE "article_analyses" DROP COLUMN "preScreenAt"`);
    await queryRunner.query(`ALTER TABLE "article_analyses" DROP COLUMN "preScreenReason"`);
    await queryRunner.query(`ALTER TABLE "article_analyses" DROP COLUMN "preScreenIsRelevant"`);
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ADD "matchedInterests" text NOT NULL DEFAULT ''`,
    );

    await queryRunner.query(`DROP TABLE "article_streams"`);
    await queryRunner.query(`DROP TABLE "article_technology_interests"`);
  }
}
