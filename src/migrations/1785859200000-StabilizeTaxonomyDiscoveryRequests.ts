import { MigrationInterface, QueryRunner } from 'typeorm';

export class StabilizeTaxonomyDiscoveryRequests1785859200000 implements MigrationInterface {
  name = 'StabilizeTaxonomyDiscoveryRequests1785859200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."taxonomy_source_discovery_requests_status_enum" RENAME TO "taxonomy_source_discovery_requests_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."taxonomy_source_discovery_requests_status_enum" AS ENUM('queued', 'running', 'completed', 'failed')`,
    );
    await queryRunner.query(
      `ALTER TABLE "taxonomy_source_discovery_requests" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "taxonomy_source_discovery_requests" ALTER COLUMN "status" TYPE "public"."taxonomy_source_discovery_requests_status_enum" USING "status"::text::"public"."taxonomy_source_discovery_requests_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "taxonomy_source_discovery_requests" ALTER COLUMN "status" SET DEFAULT 'queued'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."taxonomy_source_discovery_requests_status_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "taxonomy_source_discovery_requests" ADD "attemptCount" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "taxonomy_source_discovery_requests" ADD "retryCount" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "taxonomy_source_discovery_requests" ADD "lastAttemptAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "taxonomy_source_discovery_requests" ADD "completedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "taxonomy_source_discovery_requests" ADD "failedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "taxonomy_source_discovery_requests" ADD "lastError" text`,
    );
    // Retain the oldest logical request ID/timestamp and fold historical retry rows into its
    // attempt count before enforcing one row per taxonomy.
    await queryRunner.query(`
      WITH grouped AS (
        SELECT "technologyInterestId", MIN("createdAt") AS first_created, COUNT(*)::int AS attempts
        FROM "taxonomy_source_discovery_requests"
        GROUP BY "technologyInterestId"
      ), keeper AS (
        SELECT DISTINCT ON (r."technologyInterestId") r.id, r."technologyInterestId"
        FROM "taxonomy_source_discovery_requests" r
        ORDER BY r."technologyInterestId", r."createdAt", r.id
      )
      UPDATE "taxonomy_source_discovery_requests" r
      SET "attemptCount" = grouped.attempts
      FROM grouped, keeper
      WHERE r.id = keeper.id AND keeper."technologyInterestId" = grouped."technologyInterestId"
    `);
    await queryRunner.query(`
      DELETE FROM "taxonomy_source_discovery_requests" r
      USING (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY "technologyInterestId" ORDER BY "createdAt", id
        ) AS row_number
        FROM "taxonomy_source_discovery_requests"
      ) ranked
      WHERE r.id = ranked.id AND ranked.row_number > 1
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_taxonomy_discovery_request_taxonomy" ON "taxonomy_source_discovery_requests" ("technologyInterestId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UQ_taxonomy_discovery_request_taxonomy"`);
    await queryRunner.query(
      `ALTER TABLE "taxonomy_source_discovery_requests" DROP COLUMN "lastError"`,
    );
    await queryRunner.query(
      `ALTER TABLE "taxonomy_source_discovery_requests" DROP COLUMN "failedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "taxonomy_source_discovery_requests" DROP COLUMN "completedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "taxonomy_source_discovery_requests" DROP COLUMN "lastAttemptAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "taxonomy_source_discovery_requests" DROP COLUMN "retryCount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "taxonomy_source_discovery_requests" DROP COLUMN "attemptCount"`,
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
      `ALTER TABLE "taxonomy_source_discovery_requests" ALTER COLUMN "status" TYPE "public"."taxonomy_source_discovery_requests_status_enum" USING (CASE WHEN "status"::text = 'running' THEN 'queued' ELSE "status"::text END)::"public"."taxonomy_source_discovery_requests_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "taxonomy_source_discovery_requests" ALTER COLUMN "status" SET DEFAULT 'queued'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."taxonomy_source_discovery_requests_status_enum_old"`,
    );
  }
}
