import { MigrationInterface, QueryRunner } from 'typeorm';

// Retag the historical default_user sentinel before converting both columns to UUID.
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
    const [legacyRows] = (await queryRunner.query(
      `SELECT EXISTS (
        SELECT 1 FROM "user_source_preferences" WHERE "userId" = 'default_user'
        UNION ALL
        SELECT 1 FROM "article_feedbacks" WHERE "userId" = 'default_user'
      ) AS "exists"`,
    )) as { exists: boolean | string }[];

    if (legacyRows?.exists === true || legacyRows?.exists === 'true') {
      const [existingUser] = (await queryRunner.query(
        `SELECT "id" FROM "users" WHERE lower("email") = 'miter.sidorov@gmail.com' LIMIT 1`,
      )) as { id: string }[];

      let legacyUserId = existingUser?.id;
      if (!legacyUserId) {
        const [createdUser] = (await queryRunner.query(
          `INSERT INTO "users" (
            "email", "passwordHash", "displayName", "timezone", "role",
            "dailyDigestEnabled", "weeklyDigestEnabled"
          ) VALUES ('miter.sidorov@gmail.com', '!password-setup-required!', 'Miter Sidorov', 'UTC', 'user', false, false)
          RETURNING "id"`,
        )) as { id: string }[];
        legacyUserId = createdUser.id;
      }

      await queryRunner.query(
        `UPDATE "user_source_preferences" SET "userId" = $1 WHERE "userId" = 'default_user'`,
        [legacyUserId],
      );
      await queryRunner.query(
        `UPDATE "article_feedbacks" SET "userId" = $1 WHERE "userId" = 'default_user'`,
        [legacyUserId],
      );
    }

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
