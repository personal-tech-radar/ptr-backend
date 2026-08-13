import { MigrationInterface, QueryRunner } from 'typeorm';

// Hand-augmented beyond the raw CLI diff, per MVP3 Phase 10's spec (mirrors
// GlobalArticleAnalysisRework's precedent for documenting hand-added, non-diffable content):
//
// - The two DELETE statements at the top of up() are fully hand-written — schema diffing never
//   produces data DELETEs. Postgres also rejects narrowing an enum type while any row still holds
//   a value being dropped from it, so these MUST run before the enum-narrowing ALTER COLUMN...
//   USING casts below them:
//     1. `personal_article_links` rows with context = 'deep_dive_weekly_digest' are deleted first.
//     2. ALL `digests` rows are hard-deleted (not just deep_dive_weekly ones — an explicit product
//        decision for this phase, since Digest gains a new required-going-forward `userId`
//        dimension that no pre-existing row has). `digest_items.digestId` is ON DELETE CASCADE
//        (see CreateSourcesTable), so this alone also clears every digest_items row — no separate
//        DELETE FROM digest_items is needed.
// - Both narrowing sequences (digests_type_enum, personal_article_links_context_enum) use the
//   standard rename-old/create-new/cast/drop-old technique, reordered from the raw CLI output into
//   the sequence documented above so the enum narrowing never runs before its corresponding DELETE.
// - The raw CLI diff also included two unrelated, non-functional index churns that were stripped:
//   `IDX_technology_interests_normalizedName_trgm` (TypeORM's differ doesn't understand the
//   gin_trgm_ops operator class on that index, so it always looks changed even though it isn't —
//   same known issue documented in CreateTaxonomyTables/GlobalArticleAnalysisRework) and
//   `IDX_article_streams_primary_per_article` (a partial-index WHERE-clause formatting difference
//   Postgres reports back with added parens; not a real schema change).
// - down() is schema-only, per this project's existing migration convention — it does NOT restore
//   the deleted digest/digest-item/deep-dive-link history, and does not restore
//   article_analyses.deepDiveScore/shouldIncludeInDeepDiveDigest data (columns are recreated
//   empty). This is a lossy rollback, consistent with every other destructive migration in this
//   project (see GlobalArticleAnalysisRework's article_relevances drop).
export class AddPersonalDigestDelivery1785424903310 implements MigrationInterface {
  name = 'AddPersonalDigestDelivery1785424903310';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Hand-added: drop deep_dive_weekly_digest link rows before narrowing the enum they use.
    await queryRunner.query(
      `DELETE FROM "personal_article_links" WHERE "context" = 'deep_dive_weekly_digest'`,
    );

    // 2. Hand-added: hard-delete ALL pre-existing digest history before narrowing digests_type_enum
    // (decision #1 — not scoped to deep_dive_weekly only). Cascades to digest_items via its
    // ON DELETE CASCADE FK.
    await queryRunner.query(`DELETE FROM "digests"`);

    await queryRunner.query(
      `ALTER TABLE "article_analyses" DROP COLUMN "shouldIncludeInDeepDiveDigest"`,
    );
    await queryRunner.query(`ALTER TABLE "article_analyses" DROP COLUMN "deepDiveScore"`);

    await queryRunner.query(`ALTER TABLE "digests" ADD "userId" uuid`);

    // 3. Narrow digests_type_enum: 'daily' | 'weekly' | 'deep_dive_weekly' -> 'daily' | 'weekly'.
    await queryRunner.query(
      `ALTER TYPE "public"."digests_type_enum" RENAME TO "digests_type_enum_old"`,
    );
    await queryRunner.query(`CREATE TYPE "public"."digests_type_enum" AS ENUM('daily', 'weekly')`);
    await queryRunner.query(`ALTER TABLE "digests" ALTER COLUMN "type" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "digests" ALTER COLUMN "type" TYPE "public"."digests_type_enum" USING "type"::"text"::"public"."digests_type_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "digests" ALTER COLUMN "type" SET DEFAULT 'daily'`);
    await queryRunner.query(`DROP TYPE "public"."digests_type_enum_old"`);

    // 4. Narrow personal_article_links_context_enum: drop 'deep_dive_weekly_digest'.
    await queryRunner.query(
      `ALTER TABLE "personal_article_links" DROP CONSTRAINT "UQ_960e78d5abc9a2f48784bf6802c"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."personal_article_links_context_enum" RENAME TO "personal_article_links_context_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."personal_article_links_context_enum" AS ENUM('feed', 'daily_digest', 'weekly_digest')`,
    );
    await queryRunner.query(
      `ALTER TABLE "personal_article_links" ALTER COLUMN "context" TYPE "public"."personal_article_links_context_enum" USING "context"::"text"::"public"."personal_article_links_context_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."personal_article_links_context_enum_old"`);
    await queryRunner.query(
      `ALTER TABLE "personal_article_links" ADD CONSTRAINT "UQ_960e78d5abc9a2f48784bf6802c" UNIQUE ("userId", "articleId", "context")`,
    );

    // 5. digests.userId FK + composite (userId, type, createdAt) index.
    await queryRunner.query(
      `CREATE INDEX "IDX_15cdabb0bbeae184a404645b63" ON "digests" ("userId", "type", "createdAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "digests" ADD CONSTRAINT "FK_879d9ebb76e1172dec3eb5addce" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "digests" DROP CONSTRAINT "FK_879d9ebb76e1172dec3eb5addce"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_15cdabb0bbeae184a404645b63"`);
    await queryRunner.query(`ALTER TABLE "digests" DROP COLUMN "userId"`);

    await queryRunner.query(
      `ALTER TABLE "personal_article_links" DROP CONSTRAINT "UQ_960e78d5abc9a2f48784bf6802c"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."personal_article_links_context_enum_old" AS ENUM('feed', 'daily_digest', 'weekly_digest', 'deep_dive_weekly_digest')`,
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

    await queryRunner.query(
      `CREATE TYPE "public"."digests_type_enum_old" AS ENUM('daily', 'weekly', 'deep_dive_weekly')`,
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

    await queryRunner.query(`ALTER TABLE "article_analyses" ADD "deepDiveScore" numeric(5,2)`);
    await queryRunner.query(
      `ALTER TABLE "article_analyses" ADD "shouldIncludeInDeepDiveDigest" boolean NOT NULL DEFAULT false`,
    );

    // Note: deleted digest/digest-item/deep-dive-link rows are NOT restored — see class-level
    // comment. This down() only reverses the schema shape.
  }
}
