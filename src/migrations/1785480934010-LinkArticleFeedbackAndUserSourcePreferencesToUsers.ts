import { MigrationInterface, QueryRunner } from 'typeorm';

// DEPLOYMENT ORDERING (MVP3 Phase 11): this migration will FAIL LOUDLY — "invalid input syntax
// for type uuid" — if any article_feedbacks/user_source_preferences row still holds the legacy
// literal string 'default_user' in its userId column. Run `npm run seed:legacy-user:sync` (or
// `seed:legacy-user:sync:prod`) FIRST — it retags every such row onto the real legacy user's uuid
// before this migration ever runs. That retag is ordinary idempotent application code, not part
// of this migration, since it's a pure data change with no accompanying entity diff.
//
// Deliberately hand-adjusted from the raw `migration:generate` output (see typeorm-migration-
// workflow skill — normally never done): TypeORM's CLI cannot produce a `USING` cast for an
// incompatible column type change (varchar -> uuid); its generated diff for this exact entity
// change was a destructive `DROP COLUMN` + `ADD COLUMN ... NOT NULL` with no cast, which both
// discards every row's existing userId value and fails outright on any non-empty table regardless
// of whether the retag already ran — defeating the whole point of the ordering requirement above.
// `ALTER COLUMN TYPE uuid USING "userId"::uuid` instead converts each row's already-correct uuid
// string in place, preserving data, while still failing loudly pre-retag exactly as intended.
//
// Also excludes unrelated schema drift the raw CLI diff picked up (dropping/recreating
// technology_interests' pg_trgm GIN index and article_streams' partial unique index — both
// created via hand-written SQL with no matching entity decorator, the same class of diff noise
// already stripped out in CreateTaxonomyTables/CreateUsersAuth's own migrations).
export class LinkArticleFeedbackAndUserSourcePreferencesToUsers1785480934010 implements MigrationInterface {
  name = 'LinkArticleFeedbackAndUserSourcePreferencesToUsers1785480934010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_source_preferences" ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_feedbacks" ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_source_preferences" ADD CONSTRAINT "FK_6999e1034e530bbc084638df632" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_feedbacks" ADD CONSTRAINT "FK_b6b675ef4956bf750a92161a437" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "article_feedbacks" DROP CONSTRAINT "FK_b6b675ef4956bf750a92161a437"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_source_preferences" DROP CONSTRAINT "FK_6999e1034e530bbc084638df632"`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_feedbacks" ALTER COLUMN "userId" TYPE character varying USING "userId"::character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_source_preferences" ALTER COLUMN "userId" TYPE character varying USING "userId"::character varying`,
    );
  }
}
