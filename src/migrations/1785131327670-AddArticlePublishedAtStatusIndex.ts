import { MigrationInterface, QueryRunner } from 'typeorm';

// Hand-stripped beyond the raw CLI diff, per the precedent documented in CreateTaxonomyTables,
// GlobalArticleAnalysisRework, and CreateUserActionsTables: the raw diff also included a
// drop/recreate of `IDX_technology_interests_normalizedName_trgm` (CLI doesn't understand the
// `gin_trgm_ops` operator class), a drop/recreate of `IDX_article_streams_primary_per_article`
// (no entity field maps to this partial unique index predicate), and a DEFAULT toggle on
// `taxonomy_source_discovery_requests.requestedAt` (pre-existing dev-DB/entity drift, unrelated
// to this phase) — all three are permanent no-op false positives on every CLI diff, not real
// schema changes. This migration is otherwise purely additive: one new composite index on
// `articles` (publishedAt, status).
export class AddArticlePublishedAtStatusIndex1785131327670 implements MigrationInterface {
  name = 'AddArticlePublishedAtStatusIndex1785131327670';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_e5ee5ab998b67e8a23cc36c9fe" ON "articles" ("publishedAt", "status") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_e5ee5ab998b67e8a23cc36c9fe"`);
  }
}
