import { MigrationInterface, QueryRunner } from 'typeorm';

// Hand-stripped beyond the raw CLI diff, per the precedent documented in CreateTaxonomyTables and
// GlobalArticleAnalysisRework:
// - `IDX_technology_interests_normalizedName_trgm` drop/recreate — TypeORM's schema diff doesn't
//   understand the `gin_trgm_ops` operator class on that index, so it always looks changed even
//   though it isn't.
// - `IDX_article_streams_primary_per_article` drop/recreate — no entity field maps to this
//   partial unique index predicate, so the CLI misreads it as drift on every diff.
// - `taxonomy_source_discovery_requests.requestedAt` DEFAULT toggle — pre-existing dev-DB/entity
//   drift unrelated to this phase (the column's DB default doesn't match its migration's DDL on
//   this local database); not this migration's job to reconcile.
// This migration is otherwise purely additive: two new tables (`saved_articles`,
// `personal_article_links`), one new enum type, standard cascading FKs.
export class CreateUserActionsTables1785095822073 implements MigrationInterface {
  name = 'CreateUserActionsTables1785095822073';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "saved_articles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "articleId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_6d67f2b5b42256ab12b720bc9bc" UNIQUE ("userId", "articleId"), CONSTRAINT "PK_1edaf3649797c3efb661395449c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."personal_article_links_context_enum" AS ENUM('feed', 'daily_digest', 'weekly_digest', 'deep_dive_weekly_digest')`,
    );
    await queryRunner.query(
      `CREATE TABLE "personal_article_links" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "articleId" uuid NOT NULL, "context" "public"."personal_article_links_context_enum" NOT NULL, "firstOpenedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_960e78d5abc9a2f48784bf6802c" UNIQUE ("userId", "articleId", "context"), CONSTRAINT "PK_6fdfc7ed6ab77f3592f7dbb0b42" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_articles" ADD CONSTRAINT "FK_ce24632b9d3082702f4fb6a852c" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_articles" ADD CONSTRAINT "FK_0c7ca20a26a8e616b12b1fdc408" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "personal_article_links" ADD CONSTRAINT "FK_0f44ae1d0a59558aac5a7d1cf0c" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "personal_article_links" ADD CONSTRAINT "FK_3c8e6dbc5d7d25ed5b271498507" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "personal_article_links" DROP CONSTRAINT "FK_3c8e6dbc5d7d25ed5b271498507"`,
    );
    await queryRunner.query(
      `ALTER TABLE "personal_article_links" DROP CONSTRAINT "FK_0f44ae1d0a59558aac5a7d1cf0c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_articles" DROP CONSTRAINT "FK_0c7ca20a26a8e616b12b1fdc408"`,
    );
    await queryRunner.query(
      `ALTER TABLE "saved_articles" DROP CONSTRAINT "FK_ce24632b9d3082702f4fb6a852c"`,
    );
    await queryRunner.query(`DROP TABLE "personal_article_links"`);
    await queryRunner.query(`DROP TYPE "public"."personal_article_links_context_enum"`);
    await queryRunner.query(`DROP TABLE "saved_articles"`);
  }
}
