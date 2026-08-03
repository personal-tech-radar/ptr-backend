import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeparateAdministratorsAndPublicRedirects1785686400000 implements MigrationInterface {
  name = 'SeparateAdministratorsAndPublicRedirects1785686400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "administrators" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" varchar NOT NULL, "passwordHash" varchar NOT NULL, "tokenVersion" integer NOT NULL DEFAULT 0, "lastLoginAt" TIMESTAMP, "createdByAdminId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_administrators_email" UNIQUE ("email"), CONSTRAINT "PK_administrators" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "administrators" ADD CONSTRAINT "FK_f751b40449881aecb41b6e73d98" FOREIGN KEY ("createdByAdminId") REFERENCES "administrators"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "administrator_revoked_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "jti" varchar NOT NULL, "expiresAt" TIMESTAMP NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_administrator_revoked_tokens_jti" UNIQUE ("jti"), CONSTRAINT "PK_administrator_revoked_tokens" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `INSERT INTO "administrators" ("email", "passwordHash", "tokenVersion") SELECT LOWER("email"), "passwordHash", 0 FROM "users" WHERE LOWER("email") = 'miter.sidorov.ps@gmail.com' ON CONFLICT ("email") DO NOTHING`,
    );
    await queryRunner.query(
      `DELETE FROM "users" WHERE LOWER("email") = 'miter.sidorov.ps@gmail.com'`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "role"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."users_role_enum"`);

    await queryRunner.query(
      `ALTER TABLE "articles" ADD "publicClickCount" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "articles" ADD "personalTrackedOpenCount" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `CREATE TABLE "user_article_openings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "articleId" uuid NOT NULL, "openedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_user_article_opening" UNIQUE ("userId", "articleId"), CONSTRAINT "PK_user_article_openings" PRIMARY KEY ("id"), CONSTRAINT "FK_48abed1d79d7be1aa56ee65529d" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE, CONSTRAINT "FK_a4e143efae2585b9b3cac409e4d" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE)`,
    );
    await queryRunner.query(
      `INSERT INTO "user_article_openings" ("userId", "articleId", "openedAt") SELECT DISTINCT ON ("userId", "articleId") "userId", "articleId", "firstOpenedAt" FROM "personal_article_links" WHERE "firstOpenedAt" IS NOT NULL ORDER BY "userId", "articleId", "firstOpenedAt" ASC ON CONFLICT DO NOTHING`,
    );
    await queryRunner.query(
      `UPDATE "articles" article SET "personalTrackedOpenCount" = opening.count FROM (SELECT "articleId", COUNT(*)::integer AS count FROM "user_article_openings" GROUP BY "articleId") opening WHERE article.id = opening."articleId"`,
    );
    await queryRunner.query(`ALTER TABLE "personal_article_links" ADD "digestId" uuid`);
    await queryRunner.query(`ALTER TABLE "personal_article_links" ADD "originalUrl" text`);
    await queryRunner.query(
      `UPDATE "personal_article_links" link SET "originalUrl" = article.url FROM "articles" article WHERE article.id = link."articleId"`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."digests_deliverymode_enum" AS ENUM('scheduled', 'admin_preview')`,
    );
    await queryRunner.query(
      `ALTER TABLE "digests" ADD "deliveryMode" "public"."digests_deliverymode_enum" NOT NULL DEFAULT 'scheduled'`,
    );
    await queryRunner.query(`ALTER TABLE "digests" ADD "triggeringAdministratorId" uuid`);
    await queryRunner.query(`ALTER TABLE "digests" ADD "actualRecipientEmail" varchar`);
    await queryRunner.query(
      `ALTER TABLE "digests" ADD CONSTRAINT "FK_1bbcccf408a7d603ae8ee922adb" FOREIGN KEY ("triggeringAdministratorId") REFERENCES "administrators"("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "digests" DROP CONSTRAINT IF EXISTS "FK_1bbcccf408a7d603ae8ee922adb"`,
    );
    await queryRunner.query(`ALTER TABLE "digests" DROP COLUMN "actualRecipientEmail"`);
    await queryRunner.query(`ALTER TABLE "digests" DROP COLUMN "triggeringAdministratorId"`);
    await queryRunner.query(`ALTER TABLE "digests" DROP COLUMN "deliveryMode"`);
    await queryRunner.query(`DROP TYPE "public"."digests_deliverymode_enum"`);
    await queryRunner.query(`ALTER TABLE "personal_article_links" DROP COLUMN "originalUrl"`);
    await queryRunner.query(`ALTER TABLE "personal_article_links" DROP COLUMN "digestId"`);
    await queryRunner.query(`DROP TABLE "user_article_openings"`);
    await queryRunner.query(`ALTER TABLE "articles" DROP COLUMN "personalTrackedOpenCount"`);
    await queryRunner.query(`ALTER TABLE "articles" DROP COLUMN "publicClickCount"`);
    await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('user', 'admin')`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD "role" "public"."users_role_enum" NOT NULL DEFAULT 'user'`,
    );
    await queryRunner.query(`DROP TABLE "administrator_revoked_tokens"`);
    await queryRunner.query(`DROP TABLE "administrators"`);
  }
}
