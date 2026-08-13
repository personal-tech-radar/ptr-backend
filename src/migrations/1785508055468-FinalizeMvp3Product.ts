import { MigrationInterface, QueryRunner } from 'typeorm';

export class FinalizeMvp3Product1785508055468 implements MigrationInterface {
  name = 'FinalizeMvp3Product1785508055468';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "source_candidates" DROP CONSTRAINT "FK_9fad6964ad7df21bffb981bdf67"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."permanent_article_actions_type_enum" AS ENUM('save', 'useful', 'not_useful')`,
    );
    await queryRunner.query(
      `CREATE TABLE "permanent_article_actions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "articleId" uuid NOT NULL, "type" "public"."permanent_article_actions_type_enum" NOT NULL, "lastUsedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_35f2abb7f83921c6964c1e825da" UNIQUE ("userId", "articleId", "type"), CONSTRAINT "PK_246f5cb42508ce1536937459fc7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "source_ingestion_attempts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sourceId" uuid NOT NULL, "streamIds" jsonb NOT NULL DEFAULT '[]', "startedAt" TIMESTAMP NOT NULL, "completedAt" TIMESTAMP, "succeeded" boolean, "publicationsProcessed" integer NOT NULL DEFAULT '0', "error" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3ede3f701fd4ec6ef409805a1e8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d36c3b9f78e270c76e3dc41033" ON "source_ingestion_attempts" ("sourceId", "startedAt") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."source_coverages_origin_enum" AS ENUM('user_submission', 'technology', 'interest', 'seed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "source_coverages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sourceId" uuid NOT NULL, "technologyInterestId" uuid NOT NULL, "contentStreamId" uuid NOT NULL, "origin" "public"."source_coverages_origin_enum" NOT NULL, "discoveredAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_45639ddabaaecff95e657d99cb6" UNIQUE ("sourceId", "technologyInterestId", "contentStreamId"), CONSTRAINT "PK_7d43f8f303ada27231845d8e46d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."discovery_quota_records_operationtype_enum" AS ENUM('technology', 'interest', 'source_url')`,
    );
    await queryRunner.query(
      `CREATE TABLE "discovery_quota_records" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "operationType" "public"."discovery_quota_records_operationtype_enum" NOT NULL, "idempotencyKey" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_107506002a00a8b7c0973cd83e2" UNIQUE ("userId", "idempotencyKey"), CONSTRAINT "PK_4b5dd71812496a0c9ca4169dee1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7690dee81479994a1406526809" ON "discovery_quota_records" ("userId", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "digest_stream_pages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "digestId" uuid NOT NULL, "streamId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_c30481f14f294a9064afd75368a" UNIQUE ("digestId", "streamId"), CONSTRAINT "PK_5836404eb7e504746f7a54c8246" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "source_candidates" DROP COLUMN "discoveredFromArticleId"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."sources_status_enum" AS ENUM('active', 'degraded', 'disabled')`,
    );
    await queryRunner.query(
      `ALTER TABLE "sources" ADD "status" "public"."sources_status_enum" NOT NULL DEFAULT 'active'`,
    );
    await queryRunner.query(
      `ALTER TABLE "sources" ADD "consecutiveFailures" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(`ALTER TABLE "sources" ADD "lastSuccessfulFetchAt" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "sources" ADD "lastAttemptAt" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "sources" ADD "lastError" text`);
    await queryRunner.query(
      `ALTER TABLE "sources" ADD "processedArticleCount" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(`ALTER TABLE "sources" ADD "canonicalUrl" character varying`);
    await queryRunner.query(`ALTER TABLE "sources" ADD "feedUrl" character varying`);
    await queryRunner.query(`ALTER TABLE "sources" ADD "repositoryOwner" character varying`);
    await queryRunner.query(`ALTER TABLE "sources" ADD "repositoryName" character varying`);
    await queryRunner.query(
      `ALTER TABLE "sources" ADD "globalUsefulCount" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "sources" ADD "globalNotUsefulCount" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "sources" ADD "globalSavedCount" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "sources" ADD "globalOpenedCount" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "sources" ADD "globalInteractionScore" numeric(6,2) NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_source_preferences" ADD "savedCount" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_source_preferences" ADD "openedCount" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."source_candidates_origin_enum" AS ENUM('user_submission', 'technology', 'interest', 'seed')`,
    );
    await queryRunner.query(
      `ALTER TABLE "source_candidates" ADD "origin" "public"."source_candidates_origin_enum" NOT NULL DEFAULT 'seed'`,
    );
    await queryRunner.query(`ALTER TABLE "source_candidates" ADD "submittedByUserId" uuid`);
    await queryRunner.query(`ALTER TABLE "source_candidates" ADD "technologyInterestId" uuid`);
    await queryRunner.query(`ALTER TABLE "source_candidates" ADD "contentStreamId" uuid`);
    await queryRunner.query(`ALTER TABLE "source_candidates" ADD "proposedName" character varying`);
    await queryRunner.query(
      `CREATE TYPE "public"."source_candidates_expectedsourcetype_enum" AS ENUM('rss', 'atom', 'github_release', 'web')`,
    );
    await queryRunner.query(
      `ALTER TABLE "source_candidates" ADD "expectedSourceType" "public"."source_candidates_expectedsourcetype_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "source_candidates" ADD "relevanceReason" text`);
    await queryRunner.query(
      `CREATE TYPE "public"."source_candidates_rejectioncode_enum" AS ENUM('invalid_url', 'inaccessible', 'unsupported_type', 'no_publications', 'extraction_failed', 'taxonomy_mismatch', 'stream_mismatch', 'duplicate', 'processing_failed')`,
    );
    await queryRunner.query(
      `ALTER TABLE "source_candidates" ADD "rejectionCode" "public"."source_candidates_rejectioncode_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "source_candidates" ADD "activatedSourceId" uuid`);
    await queryRunner.query(`ALTER TABLE "digests" ADD "periodKey" character varying`);
    await queryRunner.query(
      `UPDATE "digests" SET "periodKey" = 'legacy:' || "id"::text WHERE "periodKey" IS NULL`,
    );
    await queryRunner.query(`ALTER TABLE "digests" ALTER COLUMN "periodKey" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "digests" ADD "statisticsSnapshot" jsonb`);
    await queryRunner.query(
      `ALTER TABLE "personal_article_links" DROP CONSTRAINT "UQ_960e78d5abc9a2f48784bf6802c"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."personal_article_links_context_enum" RENAME TO "personal_article_links_context_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."personal_article_links_context_enum" AS ENUM('feed', 'daily_digest', 'weekly_digest', 'digest_stream_page')`,
    );
    await queryRunner.query(
      `ALTER TABLE "personal_article_links" ALTER COLUMN "context" TYPE "public"."personal_article_links_context_enum" USING "context"::"text"::"public"."personal_article_links_context_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."personal_article_links_context_enum_old"`);
    await queryRunner.query(
      `ALTER TABLE "taxonomy_source_discovery_requests" ALTER COLUMN "requestedAt" SET DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."taxonomy_source_discovery_requests_status_enum" RENAME TO "taxonomy_source_discovery_requests_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."taxonomy_source_discovery_requests_status_enum" AS ENUM('queued', 'completed', 'failed')`,
    );
    await queryRunner.query(
      `ALTER TABLE "taxonomy_source_discovery_requests" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "taxonomy_source_discovery_requests" ALTER COLUMN "status" TYPE "public"."taxonomy_source_discovery_requests_status_enum" USING (CASE WHEN "status"::text = 'pending_manual_review' THEN 'queued' ELSE "status"::text END)::"public"."taxonomy_source_discovery_requests_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "taxonomy_source_discovery_requests" ALTER COLUMN "status" SET DEFAULT 'queued'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."taxonomy_source_discovery_requests_status_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."source_candidates_status_enum" RENAME TO "source_candidates_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."source_candidates_status_enum" AS ENUM('pending', 'rejected', 'active')`,
    );
    await queryRunner.query(`ALTER TABLE "source_candidates" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "source_candidates" ALTER COLUMN "status" TYPE "public"."source_candidates_status_enum" USING (CASE WHEN "status"::text IN ('validated', 'promoted') THEN 'active' WHEN "status"::text = 'needs_review' THEN 'rejected' ELSE "status"::text END)::"public"."source_candidates_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "source_candidates" ALTER COLUMN "status" SET DEFAULT 'pending'`,
    );
    await queryRunner.query(`DROP TYPE "public"."source_candidates_status_enum_old"`);
    await queryRunner.query(
      `ALTER TYPE "public"."digests_status_enum" RENAME TO "digests_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."digests_status_enum" AS ENUM('draft', 'sent', 'failed', 'skipped_empty')`,
    );
    await queryRunner.query(`ALTER TABLE "digests" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "digests" ALTER COLUMN "status" TYPE "public"."digests_status_enum" USING "status"::"text"::"public"."digests_status_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "digests" ALTER COLUMN "status" SET DEFAULT 'draft'`);
    await queryRunner.query(`DROP TYPE "public"."digests_status_enum_old"`);
    await queryRunner.query(
      `ALTER TYPE "public"."article_analyses_complexitylevel_enum" RENAME TO "article_analyses_complexitylevel_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."article_analyses_complexitylevel_enum" AS ENUM('beginner', 'intermediate', 'advanced')`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ALTER COLUMN "complexityLevel" TYPE "public"."article_analyses_complexitylevel_enum" USING (CASE WHEN "complexityLevel"::text = 'architect' THEN 'advanced' ELSE "complexityLevel"::text END)::"public"."article_analyses_complexitylevel_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."article_analyses_complexitylevel_enum_old"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b31cd939738c3e740fef454a8e" ON "digests" ("userId", "type", "periodKey") `,
    );
    await queryRunner.query(
      `ALTER TABLE "personal_article_links" ADD CONSTRAINT "UQ_960e78d5abc9a2f48784bf6802c" UNIQUE ("userId", "articleId", "context")`,
    );
    await queryRunner.query(
      `ALTER TABLE "permanent_article_actions" ADD CONSTRAINT "FK_7e97f2b0493af64df092762d876" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "permanent_article_actions" ADD CONSTRAINT "FK_f23835e82f1ff54405314cd7421" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "source_ingestion_attempts" ADD CONSTRAINT "FK_522bb888642f800f178308f9f32" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "source_candidates" ADD CONSTRAINT "FK_c604ac977b77489dff176e3ba25" FOREIGN KEY ("submittedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "source_candidates" ADD CONSTRAINT "FK_b792bcf7793cea10088b5f480d2" FOREIGN KEY ("technologyInterestId") REFERENCES "technology_interests"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "source_candidates" ADD CONSTRAINT "FK_277d71a69fe3067976bfec9fa37" FOREIGN KEY ("contentStreamId") REFERENCES "content_streams"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "source_candidates" ADD CONSTRAINT "FK_554c8a24ebdfe4ff7ee5e515719" FOREIGN KEY ("activatedSourceId") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "source_coverages" ADD CONSTRAINT "FK_1a34992e978df1ff20d4394d48d" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "source_coverages" ADD CONSTRAINT "FK_bf7a70ef251fb0d5387bf8bf270" FOREIGN KEY ("technologyInterestId") REFERENCES "technology_interests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "source_coverages" ADD CONSTRAINT "FK_3a1aa7fe2627dbb6ea9022ec610" FOREIGN KEY ("contentStreamId") REFERENCES "content_streams"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "discovery_quota_records" ADD CONSTRAINT "FK_098cfff14f1cdddd2a923ba63f3" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "digest_stream_pages" ADD CONSTRAINT "FK_e7d2adb0923cf189c72205d1ba5" FOREIGN KEY ("digestId") REFERENCES "digests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "digest_stream_pages" ADD CONSTRAINT "FK_90a835c0bc9925f21a17781287a" FOREIGN KEY ("streamId") REFERENCES "content_streams"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "digest_stream_pages" DROP CONSTRAINT "FK_90a835c0bc9925f21a17781287a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "digest_stream_pages" DROP CONSTRAINT "FK_e7d2adb0923cf189c72205d1ba5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "discovery_quota_records" DROP CONSTRAINT "FK_098cfff14f1cdddd2a923ba63f3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "source_coverages" DROP CONSTRAINT "FK_3a1aa7fe2627dbb6ea9022ec610"`,
    );
    await queryRunner.query(
      `ALTER TABLE "source_coverages" DROP CONSTRAINT "FK_bf7a70ef251fb0d5387bf8bf270"`,
    );
    await queryRunner.query(
      `ALTER TABLE "source_coverages" DROP CONSTRAINT "FK_1a34992e978df1ff20d4394d48d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "source_candidates" DROP CONSTRAINT "FK_554c8a24ebdfe4ff7ee5e515719"`,
    );
    await queryRunner.query(
      `ALTER TABLE "source_candidates" DROP CONSTRAINT "FK_277d71a69fe3067976bfec9fa37"`,
    );
    await queryRunner.query(
      `ALTER TABLE "source_candidates" DROP CONSTRAINT "FK_b792bcf7793cea10088b5f480d2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "source_candidates" DROP CONSTRAINT "FK_c604ac977b77489dff176e3ba25"`,
    );
    await queryRunner.query(
      `ALTER TABLE "source_ingestion_attempts" DROP CONSTRAINT "FK_522bb888642f800f178308f9f32"`,
    );
    await queryRunner.query(
      `ALTER TABLE "permanent_article_actions" DROP CONSTRAINT "FK_f23835e82f1ff54405314cd7421"`,
    );
    await queryRunner.query(
      `ALTER TABLE "permanent_article_actions" DROP CONSTRAINT "FK_7e97f2b0493af64df092762d876"`,
    );
    await queryRunner.query(
      `ALTER TABLE "personal_article_links" DROP CONSTRAINT "UQ_960e78d5abc9a2f48784bf6802c"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_b31cd939738c3e740fef454a8e"`);
    await queryRunner.query(
      `CREATE TYPE "public"."article_analyses_complexitylevel_enum_old" AS ENUM('beginner', 'intermediate', 'advanced', 'architect')`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ALTER COLUMN "complexityLevel" TYPE "public"."article_analyses_complexitylevel_enum_old" USING "complexityLevel"::"text"::"public"."article_analyses_complexitylevel_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."article_analyses_complexitylevel_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."article_analyses_complexitylevel_enum_old" RENAME TO "article_analyses_complexitylevel_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."digests_status_enum_old" AS ENUM('draft', 'sent', 'failed')`,
    );
    await queryRunner.query(`ALTER TABLE "digests" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "digests" ALTER COLUMN "status" TYPE "public"."digests_status_enum_old" USING (CASE WHEN "status"::text = 'skipped_empty' THEN 'failed' ELSE "status"::text END)::"public"."digests_status_enum_old"`,
    );
    await queryRunner.query(`ALTER TABLE "digests" ALTER COLUMN "status" SET DEFAULT 'draft'`);
    await queryRunner.query(`DROP TYPE "public"."digests_status_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."digests_status_enum_old" RENAME TO "digests_status_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."source_candidates_status_enum_old" AS ENUM('pending', 'validated', 'rejected', 'promoted', 'needs_review')`,
    );
    await queryRunner.query(`ALTER TABLE "source_candidates" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "source_candidates" ALTER COLUMN "status" TYPE "public"."source_candidates_status_enum_old" USING (CASE WHEN "status"::text = 'active' THEN 'promoted' ELSE "status"::text END)::"public"."source_candidates_status_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "source_candidates" ALTER COLUMN "status" SET DEFAULT 'pending'`,
    );
    await queryRunner.query(`DROP TYPE "public"."source_candidates_status_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."source_candidates_status_enum_old" RENAME TO "source_candidates_status_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."taxonomy_source_discovery_requests_status_enum_old" AS ENUM('pending_manual_review')`,
    );
    await queryRunner.query(
      `ALTER TABLE "taxonomy_source_discovery_requests" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "taxonomy_source_discovery_requests" ALTER COLUMN "status" TYPE "public"."taxonomy_source_discovery_requests_status_enum_old" USING 'pending_manual_review'::"public"."taxonomy_source_discovery_requests_status_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "taxonomy_source_discovery_requests" ALTER COLUMN "status" SET DEFAULT 'pending_manual_review'`,
    );
    await queryRunner.query(`DROP TYPE "public"."taxonomy_source_discovery_requests_status_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."taxonomy_source_discovery_requests_status_enum_old" RENAME TO "taxonomy_source_discovery_requests_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "taxonomy_source_discovery_requests" ALTER COLUMN "requestedAt" DROP DEFAULT`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."personal_article_links_context_enum_old" AS ENUM('feed', 'daily_digest', 'weekly_digest')`,
    );
    await queryRunner.query(
      `ALTER TABLE "personal_article_links" ALTER COLUMN "context" TYPE "public"."personal_article_links_context_enum_old" USING "context"::"text"::"public"."personal_article_links_context_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."personal_article_links_context_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."personal_article_links_context_enum_old" RENAME TO "personal_article_links_context_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "personal_article_links" ADD CONSTRAINT "UQ_960e78d5abc9a2f48784bf6802c" UNIQUE ("userId", "articleId", "context")`,
    );
    await queryRunner.query(`ALTER TABLE "digests" DROP COLUMN "statisticsSnapshot"`);
    await queryRunner.query(`ALTER TABLE "digests" DROP COLUMN "periodKey"`);
    await queryRunner.query(`ALTER TABLE "source_candidates" DROP COLUMN "activatedSourceId"`);
    await queryRunner.query(`ALTER TABLE "source_candidates" DROP COLUMN "rejectionCode"`);
    await queryRunner.query(`DROP TYPE "public"."source_candidates_rejectioncode_enum"`);
    await queryRunner.query(`ALTER TABLE "source_candidates" DROP COLUMN "relevanceReason"`);
    await queryRunner.query(`ALTER TABLE "source_candidates" DROP COLUMN "expectedSourceType"`);
    await queryRunner.query(`DROP TYPE "public"."source_candidates_expectedsourcetype_enum"`);
    await queryRunner.query(`ALTER TABLE "source_candidates" DROP COLUMN "proposedName"`);
    await queryRunner.query(`ALTER TABLE "source_candidates" DROP COLUMN "contentStreamId"`);
    await queryRunner.query(`ALTER TABLE "source_candidates" DROP COLUMN "technologyInterestId"`);
    await queryRunner.query(`ALTER TABLE "source_candidates" DROP COLUMN "submittedByUserId"`);
    await queryRunner.query(`ALTER TABLE "source_candidates" DROP COLUMN "origin"`);
    await queryRunner.query(`DROP TYPE "public"."source_candidates_origin_enum"`);
    await queryRunner.query(`ALTER TABLE "user_source_preferences" DROP COLUMN "openedCount"`);
    await queryRunner.query(`ALTER TABLE "user_source_preferences" DROP COLUMN "savedCount"`);
    await queryRunner.query(`ALTER TABLE "sources" DROP COLUMN "globalInteractionScore"`);
    await queryRunner.query(`ALTER TABLE "sources" DROP COLUMN "globalOpenedCount"`);
    await queryRunner.query(`ALTER TABLE "sources" DROP COLUMN "globalSavedCount"`);
    await queryRunner.query(`ALTER TABLE "sources" DROP COLUMN "globalNotUsefulCount"`);
    await queryRunner.query(`ALTER TABLE "sources" DROP COLUMN "globalUsefulCount"`);
    await queryRunner.query(`ALTER TABLE "sources" DROP COLUMN "repositoryName"`);
    await queryRunner.query(`ALTER TABLE "sources" DROP COLUMN "repositoryOwner"`);
    await queryRunner.query(`ALTER TABLE "sources" DROP COLUMN "feedUrl"`);
    await queryRunner.query(`ALTER TABLE "sources" DROP COLUMN "canonicalUrl"`);
    await queryRunner.query(`ALTER TABLE "sources" DROP COLUMN "processedArticleCount"`);
    await queryRunner.query(`ALTER TABLE "sources" DROP COLUMN "lastError"`);
    await queryRunner.query(`ALTER TABLE "sources" DROP COLUMN "lastAttemptAt"`);
    await queryRunner.query(`ALTER TABLE "sources" DROP COLUMN "lastSuccessfulFetchAt"`);
    await queryRunner.query(`ALTER TABLE "sources" DROP COLUMN "consecutiveFailures"`);
    await queryRunner.query(`ALTER TABLE "sources" DROP COLUMN "status"`);
    await queryRunner.query(`DROP TYPE "public"."sources_status_enum"`);
    await queryRunner.query(`ALTER TABLE "source_candidates" ADD "discoveredFromArticleId" uuid`);
    await queryRunner.query(`DROP TABLE "digest_stream_pages"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7690dee81479994a1406526809"`);
    await queryRunner.query(`DROP TABLE "discovery_quota_records"`);
    await queryRunner.query(`DROP TYPE "public"."discovery_quota_records_operationtype_enum"`);
    await queryRunner.query(`DROP TABLE "source_coverages"`);
    await queryRunner.query(`DROP TYPE "public"."source_coverages_origin_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d36c3b9f78e270c76e3dc41033"`);
    await queryRunner.query(`DROP TABLE "source_ingestion_attempts"`);
    await queryRunner.query(`DROP TABLE "permanent_article_actions"`);
    await queryRunner.query(`DROP TYPE "public"."permanent_article_actions_type_enum"`);
    await queryRunner.query(
      `ALTER TABLE "source_candidates" ADD CONSTRAINT "FK_9fad6964ad7df21bffb981bdf67" FOREIGN KEY ("discoveredFromArticleId") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }
}
